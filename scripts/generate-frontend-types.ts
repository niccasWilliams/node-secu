#!/usr/bin/env tsx
/**
 * Auto-generate standalone frontend types from database schema
 * Dynamically extracts types from schema.ts and individual-schema.ts
 * Run with: npm run types:generate
 */

import fs from 'fs';
import path from 'path';

const OUTPUT_FILE = path.join(process.cwd(), 'frontend-types.ts');
const OUTPUT_FILE_GENERATED = path.join(process.cwd(), 'generated', 'frontend-types.ts');
const SETUP_CONFIG_PATH = path.join(process.cwd(), '.setup-config.json');

const GENERATED_AT_REGEX = /^\/\/ Generated at: .*$/m;

function stripTimestamp(content: string): string {
  return content.replace(GENERATED_AT_REGEX, '// Generated at: <stripped>');
}

function writeIfChanged(filePath: string, content: string): boolean {
  if (fs.existsSync(filePath)) {
    const existing = fs.readFileSync(filePath, 'utf-8');
    if (stripTimestamp(existing) === stripTimestamp(content)) {
      return false;
    }
  }
  fs.writeFileSync(filePath, content, 'utf-8');
  return true;
}

type SetupConfig = {
  appName?: string;
  appNamePascal?: string;
};

const TYPE_PREFIX_TARGETS = new Set(['User', 'UserId', 'UserActivity', 'UserActivityId']);
const TYPE_REFERENCE_TARGETS = ['AppPermissions', 'AppPermissionValue'];

function readSetupConfig(): SetupConfig | null {
  if (!fs.existsSync(SETUP_CONFIG_PATH)) {
    return null;
  }

  try {
    return JSON.parse(fs.readFileSync(SETUP_CONFIG_PATH, 'utf-8'));
  } catch (error) {
    console.warn('⚠️  Could not parse .setup-config.json. Falling back to default prefix.');
    console.warn(error);
    return null;
  }
}

function toPascalCase(input: string): string {
  return input
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join('');
}

function getAppPrefix(): string {
  const config = readSetupConfig();
  if (!config) {
    return 'App';
  }

  if (config.appName) {
    const prefix = toPascalCase(config.appName);
    if (prefix) return prefix;
  }

  if (config.appNamePascal) {
    const prefix = toPascalCase(config.appNamePascal);
    if (prefix) return prefix;
  }

  return 'App';
}

function applyPrefix(prefix: string, typeName: string): string {
  if (!prefix) return typeName;
  return typeName.startsWith(prefix) ? typeName : `${prefix}${typeName}`;
}

function applyReferencePrefixes(text: string, prefix: string): string {
  if (!text) return text;
  return TYPE_REFERENCE_TARGETS.reduce((result, target) => {
    const prefixed = applyPrefix(prefix, target);
    if (prefixed === target) return result;
    const regex = new RegExp(`\\b${target}\\b`, 'g');
    return result.replace(regex, prefixed);
  }, text);
}
type TypeRenameFn = (typeName: string) => string;

function createBaseTypeRenamer(prefix: string): TypeRenameFn {
  return (typeName) => {
    if (TYPE_PREFIX_TARGETS.has(typeName)) {
      return applyPrefix(prefix, typeName);
    }
    return typeName;
  };
}

// Map Drizzle column types to TypeScript types
function mapDrizzleTypeToTS(drizzleType: string, enumMap?: Map<string, string>): string {
  const base = drizzleType.replace(/\(\)$/, '');

  if (base === 'serial' || base === 'integer' || base === 'int' || base === 'bigint') return 'number';
  if (base === 'numeric') return 'string';
  if (base === 'text' || base === 'varchar') return 'string';
  if (base === 'boolean') return 'boolean';
  if (base === 'timestamp') return 'Date';
  if (base === 'date') return 'string';
  if (base === 'jsonb' || base === 'json') return 'any';

  // Enum-Feld: z.B. inventoryTransactionType("type") -> InventoryTransactionType
  if (enumMap && enumMap.has(base)) {
    return enumMap.get(base)!;
  }

  return 'any';
}

// Split by top-level commas (respecting nested structures)
function splitFields(fieldsBlock: string): string[] {
  const fields: string[] = [];
  let current = '';
  let depth = 0;
  let inString = false;
  let stringChar = '';
  let inLineComment = false;
  let inBlockComment = false;

  for (let i = 0; i < fieldsBlock.length; i++) {
    const char = fieldsBlock[i];
    const prevChar = i > 0 ? fieldsBlock[i - 1] : '';
    const nextChar = i + 1 < fieldsBlock.length ? fieldsBlock[i + 1] : '';

    // Handle comments (only when not inside a string)
    if (!inString) {
      if (inLineComment) {
        if (char === '\n') {
          inLineComment = false;
        }
        current += char;
        continue;
      }

      if (inBlockComment) {
        if (char === '*' && nextChar === '/') {
          inBlockComment = false;
          current += '*/';
          i++; // skip '/'
          continue;
        }
        current += char;
        continue;
      }

      // Start of line/block comment
      if (char === '/' && nextChar === '/') {
        inLineComment = true;
        current += '//';
        i++; // skip second '/'
        continue;
      }
      if (char === '/' && nextChar === '*') {
        inBlockComment = true;
        current += '/*';
        i++; // skip '*'
        continue;
      }
    }

    // Handle strings
    if ((char === '"' || char === "'") && prevChar !== '\\') {
      if (!inString) {
        inString = true;
        stringChar = char;
      } else if (char === stringChar) {
        inString = false;
      }
    }

    if (!inString && !inLineComment && !inBlockComment) {
      if (char === '(' || char === '{' || char === '[') depth++;
      if (char === ')' || char === '}' || char === ']') depth--;

      if (char === ',' && depth === 0) {
        if (current.trim()) fields.push(current.trim());
        current = '';
        continue;
      }
    }

    current += char;
  }

  if (current.trim()) fields.push(current.trim());
  return fields;
}

// Build enum map from content (enum const name -> TypeName)
function buildEnumMap(content: string): Map<string, string> {
  const enumMap = new Map<string, string>();
  const enumMatches = content.matchAll(/export const (\w+) = pgEnum\(/g);

  for (const match of enumMatches) {
    const enumConstName = match[1];
    let typeName = enumConstName.replace(/Enum$/, '');
    typeName = typeName.charAt(0).toUpperCase() + typeName.slice(1);
    enumMap.set(enumConstName, typeName);
  }

  return enumMap;
}

type ExtractTableTypeMode = "select" | "insert";
type ExtractTableTypeOptions = {
  mode?: ExtractTableTypeMode;
};

function formatJSDoc(comment: string, indent = "  "): string {
  const lines = comment
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return "";
  if (lines.length === 1) {
    return `${indent}/** ${lines[0]} */\n`;
  }
  return (
    `${indent}/**\n` +
    lines.map((l) => `${indent} * ${l}`).join("\n") +
    `\n${indent} */\n`
  );
}

function stripFieldComments(fieldStr: string): { clean: string; comment?: string } {
  const rawLines = fieldStr.split("\n");

  const commentLines: string[] = [];
  let i = 0;
  // leading // comment lines
  while (i < rawLines.length) {
    const t = rawLines[i].trim();
    if (t.startsWith("//")) {
      commentLines.push(t.replace(/^\/\/\s?/, "").trim());
      i++;
      continue;
    }
    // allow empty lines between leading comments and field
    if (t === "") {
      i++;
      continue;
    }
    break;
  }

  const lines = rawLines.slice(i).map((line) => {
    // inline // comment (best effort, ignoring string edge cases)
    const idx = line.indexOf("//");
    if (idx !== -1) {
      const before = line.slice(0, idx);
      const c = line.slice(idx + 2).trim();
      if (c) commentLines.push(c);
      return before;
    }
    return line;
  });

  const clean = lines.join("\n").trim();
  const comment = commentLines.map((c) => c.trim()).filter(Boolean).join("\n");
  return { clean, comment: comment || undefined };
}

// Extract table definition and convert to TypeScript type
function extractTableType(
  content: string,
  tableName: string,
  enumMap?: Map<string, string>,
  options: ExtractTableTypeOptions = {}
): string | null {
  const tableStart = content.indexOf(`export const ${tableName} = pgTable(`);
  if (tableStart === -1) return null;

  const fieldsStart = content.indexOf('{', tableStart + `export const ${tableName} = pgTable(`.length);
  if (fieldsStart === -1) return null;

  let depth = 1;
  let i = fieldsStart + 1;
  let inString = false;
  let stringChar = '';

  while (i < content.length && depth > 0) {
    const char = content[i];

    if (!inString) {
      // Handle line comments
      if (char === '/' && content[i + 1] === '/') {
        const nextNewLine = content.indexOf('\n', i);
        i = nextNewLine === -1 ? content.length : nextNewLine;
        continue;
      }
      // Handle block comments
      if (char === '/' && content[i + 1] === '*') {
        const closeComment = content.indexOf('*/', i + 2);
        i = closeComment === -1 ? content.length : closeComment + 2;
        continue;
      }
    }

    const prevChar = i > 0 ? content[i - 1] : '';

    if ((char === '"' || char === "'" || char === '`') && prevChar !== '\\') {
      if (!inString) {
        inString = true;
        stringChar = char;
      } else if (char === stringChar) {
        inString = false;
      }
    }

    if (!inString) {
      if (char === '{') depth++;
      if (char === '}') depth--;
    }

    i++;
  }

  if (depth !== 0) return null;

  let fieldsBlock = content.substring(fieldsStart + 1, i - 1);

  const fieldStrings = splitFields(fieldsBlock);

  let typeDefinition = '{\n';
  let fieldCount = 0;
  const mode: ExtractTableTypeMode = options.mode ?? "select";

  for (const fieldStr of fieldStrings) {
    if (!fieldStr.trim()) continue;

    const { clean, comment } = stripFieldComments(fieldStr);
    if (!clean) continue;

    const basicMatch = clean.match(/^(\w+):\s*(\w+)\(/);
    if (!basicMatch) {
      continue;
    }

    const fieldName = basicMatch[1];
    const drizzleType = basicMatch[2];

    // Find end of type(...)
    let depth = 1;
    let j = basicMatch[0].length;
    while (j < clean.length && depth > 0) {
      if (clean[j] === '(') depth++;
      if (clean[j] === ')') depth--;
      j++;
    }

    const modifiers = clean.substring(j).trim();
    fieldCount++;

    const tsType = mapDrizzleTypeToTS(drizzleType, enumMap);

    const hasDefault =
      modifiers.includes('.default(') ||
      modifiers.includes('.$default(') ||
      modifiers.includes('.defaultNow(');

    const isPrimaryKey = modifiers.includes('.primaryKey()');

    // Insert types: omit primary keys (esp. serial id) entirely
    if (mode === "insert" && (drizzleType === "serial" || isPrimaryKey)) {
      continue;
    }

    const isNotNull =
      modifiers.includes('.notNull()') ||
      isPrimaryKey ||
      hasDefault ||
      drizzleType === 'serial';

    const nullableSuffix = isNotNull ? '' : ' | null';

    // Insert: required only when notNull and no default; otherwise optional
    const isRequiredInsert = mode === "insert" && modifiers.includes(".notNull()") && !hasDefault;
    const optionalMark = mode === "insert" && !isRequiredInsert ? "?" : "";

    if (comment) {
      typeDefinition += formatJSDoc(comment, "  ");
    }
    typeDefinition += `  ${fieldName}${optionalMark}: ${tsType}${nullableSuffix};\n`;
  }

  if (fieldCount === 0) return null;

  typeDefinition += '}';
  return typeDefinition;
}

// Extract enum values from pgEnum definitions
function extractEnumTypes(content: string, existingTypeNames: Set<string> = new Set()): string {
  let enumTypes = '';

  const enumMatches = content.matchAll(/export const (\w+) = pgEnum\([^,]+,\s*\[([\s\S]*?)\]\s*\);?/g);

  for (const match of enumMatches) {
    const enumConstName = match[1];
    const valuesStr = match[2];

    const values = valuesStr.match(/["']([^"']+)["']/g)?.map(v => v.slice(1, -1)) || [];
    if (values.length === 0) continue;

    let typeName = enumConstName.replace(/Enum$/, '');
    typeName = typeName.charAt(0).toUpperCase() + typeName.slice(1);

    if (existingTypeNames.has(typeName)) continue;
    existingTypeNames.add(typeName);

    const unionType = values.map(v => `'${v}'`).join(' | ');
    enumTypes += `export type ${typeName} = ${unionType};\n`;
  }

  return enumTypes;
}

type ExtractSchemaOptions = {
  renameType?: TypeRenameFn;
};

// Extract types from schema file (base or individual)
function extractSchemaTypes(schemaPath: string, options: ExtractSchemaOptions = {}): string {
  const fullPath = path.join(process.cwd(), schemaPath);

  if (!fs.existsSync(fullPath)) {
    return '';
  }

  const content = fs.readFileSync(fullPath, 'utf-8');
  let types = '';
  const renameType = options.renameType ?? ((typeName: string) => typeName);

  const enumMap = buildEnumMap(content);

  const tableTypeCache = new Map<string, string | null>();
  const tableInsertTypeCache = new Map<string, string | null>();
  const handledTypeNames = new Set<string>();

  const getTableType = (tableName: string, mode: ExtractTableTypeMode = "select"): string | null => {
    const cache = mode === "insert" ? tableInsertTypeCache : tableTypeCache;
    if (cache.has(tableName)) return cache.get(tableName)!;
    const t = extractTableType(content, tableName, enumMap, { mode });
    cache.set(tableName, t);
    return t;
  };

  const getColumnType = (tableName: string, columnName: string): string | null => {
    const tableType = getTableType(tableName, "select");
    if (!tableType) return null;
    const propRegex = new RegExp(`\\b${columnName}\\s*:\\s*([^;]+);`);
    const match = tableType.match(propRegex);
    if (!match) return null;
    return match[1].trim();
  };

  const typeRegex = /export type (\w+)\s*=/g;
  let match: RegExpExecArray | null;

  while ((match = typeRegex.exec(content)) !== null) {
    const typeName = match[1];
    const outputTypeName = renameType(typeName);

    if (handledTypeNames.has(typeName)) {
      continue;
    }
    handledTypeNames.add(typeName);

    let i = typeRegex.lastIndex;
    let depthParen = 0;
    let depthCurly = 0;
    let depthBracket = 0;
    let depthAngle = 0;
    let inString = false;
    let stringChar = '';

    while (i < content.length) {
      const ch = content[i];

      if (!inString) {
        // Handle line comments
        if (ch === '/' && content[i + 1] === '/') {
          const nextNewLine = content.indexOf('\n', i);
          i = nextNewLine === -1 ? content.length : nextNewLine;
          continue;
        }
        // Handle block comments
        if (ch === '/' && content[i + 1] === '*') {
          const closeComment = content.indexOf('*/', i + 2);
          i = closeComment === -1 ? content.length : closeComment + 2;
          continue;
        }
      }

      const prev = i > 0 ? content[i - 1] : '';

      if (!inString && (ch === '"' || ch === "'" || ch === '`') && prev !== '\\') {
        inString = true;
        stringChar = ch;
        i++;
        continue;
      } else if (inString && ch === stringChar && prev !== '\\') {
        inString = false;
        i++;
        continue;
      }

      if (!inString) {
        if (ch === '(') depthParen++;
        else if (ch === ')') depthParen = Math.max(0, depthParen - 1);
        else if (ch === '{') depthCurly++;
        else if (ch === '}') depthCurly = Math.max(0, depthCurly - 1);
        else if (ch === '[') depthBracket++;
        else if (ch === ']') depthBracket = Math.max(0, depthBracket - 1);
        else if (ch === '<') depthAngle++;
        else if (ch === '>') depthAngle = Math.max(0, depthAngle - 1);

        if (ch === ';' && depthParen === 0 && depthCurly === 0 && depthBracket === 0 && depthAngle === 0) {
          break;
        }
      }

      i++;
    }

    const typeValue = content.slice(typeRegex.lastIndex, i).trim();

    // 1) Enum-Referenzen: typeof someEnum.enumValues[number]
    if (typeValue.includes('.enumValues')) {
      const enumRefMatch = typeValue.match(/typeof\s+(\w+)\.enumValues\s*\[\s*number\s*\]\s*$/);
      if (enumRefMatch) {
        const enumConstName = enumRefMatch[1];
        const unionTypeName = enumMap.get(enumConstName);
        if (unionTypeName && unionTypeName !== outputTypeName) {
          types += `export type ${outputTypeName} = ${unionTypeName};\n\n`;
        }
      }
      // Wenn unionTypeName == outputTypeName (AppSettingsType, AppLogLevel, WebhookStatus, …) -> nichts tun,
      // da der Union-Typ bereits über extractEnumTypes erzeugt wurde.
      continue;
    }

    // 2) ID-Typen: typeof table.$inferSelect['id'] / ["id"]
    const idMatch = typeValue.match(/typeof\s+(\w+)\.\$infer(?:Select|Insert)\s*\[\s*["'`](.+?)["'`]\s*\]/);
    if (idMatch) {
      const tableName = idMatch[1];
      const columnName = idMatch[2];
      const columnType = getColumnType(tableName, columnName) ?? 'number';
      types += `export type ${outputTypeName} = ${columnType};\n\n`;
      continue;
    }

    // 3) komplette Tabellen-Typen: typeof table.$inferSelect / $inferInsert
    const rowMatch = typeValue.match(/typeof\s+(\w+)\.\$(inferSelect|inferInsert)\b/);
    if (rowMatch && !typeValue.includes('[')) {
      const tableName = rowMatch[1];
      const mode = rowMatch[2] === "inferInsert" ? "insert" : "select";
      const tableType = getTableType(tableName, mode);
      if (tableType) {
        types += `export type ${outputTypeName} = ${tableType};\n\n`;
      } else {
        types += `// TODO: Manually expand ${outputTypeName} based on your table schema\n`;
        types += `// export type ${outputTypeName} = {\n//   id: number;\n//   // Add your fields here\n// };\n\n`;
      }
      continue;
    }

    // 4) import("...").Type aliases are not portable in generated standalone frontend-types.ts.
    //    Convert to local alias when possible or skip self-aliases that would collide with enums.
    const importTypeMatch = typeValue.match(/^import\([^)]*\)\.(\w+)$/);
    if (importTypeMatch) {
      const importedTypeName = importTypeMatch[1];
      if (importedTypeName !== outputTypeName) {
        types += `export type ${outputTypeName} = ${importedTypeName};\n\n`;
      }
      continue;
    }

    // 5) alles andere (z.B. Prettify/Omit-Konstrukte) 1:1 übernehmen
    types += `export type ${outputTypeName} = ${typeValue};\n\n`;
  }

  return types;
}

// Extract enum from TypeScript enum definition (works for both export and non-export)
function extractTSEnum(content: string, enumName: string, overrideName?: string): string | null {
  const enumRegex = new RegExp(`(?:export\\s+)?(?:const\\s+)?enum\\s+${enumName}\\s*\\{([\\s\\S]+?)\\}`);
  const match = content.match(enumRegex);

  if (!match) return null;

  const enumBody = match[1];
  const entries: string[] = [];

  const entryMatches = enumBody.matchAll(/(\w+)\s*=\s*["']([^"']+)["']/g);
  for (const entryMatch of entryMatches) {
    const key = entryMatch[1];
    const value = entryMatch[2];
    entries.push(`  ${key} = "${value}"`);
  }

  if (entries.length === 0) return null;

  const targetName = overrideName ?? enumName;
  return `export enum ${targetName} {\n${entries.join(',\n')}\n}`;
}

type TypeMapOptions = {
  typeName?: string;
  referenceEnumName?: string;
};

// Extract AppSettingsTypeMap from individual-settings.ts
function extractAppSettingsTypeMap(content: string, options: TypeMapOptions = {}): string | null {
  const typeMapRegex = /export type AppSettingsTypeMap\s*=\s*\{([\s\S]+?)\}/;
  const match = content.match(typeMapRegex);

  if (!match) return null;

  const targetName = options.typeName ?? 'AppSettingsTypeMap';
  let body = match[1];

  if (options.referenceEnumName) {
    body = body.replace(/AppSettingsKey/g, options.referenceEnumName);
  }

  return `export type ${targetName} = {${body}};`;
}

/**
 * Deduplicate `export type Name = ...;` declarations in the final output.
 * Behaltet immer die ERSTE Definition eines Typnamens, entfernt alle weiteren.
 */
function dedupeExportTypeAliases(source: string): string {
  const re = /export type (\w+)\s*=/g;
  const seen = new Set<string>();
  let result = '';
  let lastIndex = 0;

  let match: RegExpExecArray | null;

  while ((match = re.exec(source)) !== null) {
    const typeName = match[1];
    const start = match.index;

    // Finde Ende dieser Type-Definition (bis inkl. Semikolon auf Top-Level)
    let i = re.lastIndex;
    let depthParen = 0;
    let depthCurly = 0;
    let depthBracket = 0;
    let depthAngle = 0;
    let inString = false;
    let stringChar = '';

    while (i < source.length) {
      const ch = source[i];

      if (!inString) {
        // Handle line comments
        if (ch === '/' && source[i + 1] === '/') {
          const nextNewLine = source.indexOf('\n', i);
          i = nextNewLine === -1 ? source.length : nextNewLine;
          continue;
        }
        // Handle block comments
        if (ch === '/' && source[i + 1] === '*') {
          const closeComment = source.indexOf('*/', i + 2);
          i = closeComment === -1 ? source.length : closeComment + 2;
          continue;
        }
      }

      const prev = i > 0 ? source[i - 1] : '';

      if (!inString && (ch === '"' || ch === "'" || ch === '`') && prev !== '\\') {
        inString = true;
        stringChar = ch;
        i++;
        continue;
      } else if (inString && ch === stringChar && prev !== '\\') {
        inString = false;
        i++;
        continue;
      }

      if (!inString) {
        if (ch === '(') depthParen++;
        else if (ch === ')') depthParen = Math.max(0, depthParen - 1);
        else if (ch === '{') depthCurly++;
        else if (ch === '}') depthCurly = Math.max(0, depthCurly - 1);
        else if (ch === '[') depthBracket++;
        else if (ch === ']') depthBracket = Math.max(0, depthBracket - 1);
        else if (ch === '<') depthAngle++;
        else if (ch === '>') depthAngle = Math.max(0, depthAngle - 1);

        if (ch === ';' && depthParen === 0 && depthCurly === 0 && depthBracket === 0 && depthAngle === 0) {
          i++; // Semikolon mitnehmen
          break;
        }
      }

      i++;
    }

    if (!seen.has(typeName)) {
      // Erste Definition: alles von lastIndex bis i übernehmen
      result += source.slice(lastIndex, i);
    } else {
      // Duplicate: Teil bis zum Start übernehmen, Definition selbst überspringen
      result += source.slice(lastIndex, start);
    }

    seen.add(typeName);
    lastIndex = i;
  }

  // Rest anhängen
  result += source.slice(lastIndex);
  return result;
}

// Generate the complete types file
function generateTypes(appPrefix: string): string {
  console.log('📖 Reading schema files...');

  // Read base schema
  const baseSchemaPath = 'src/db/schema.ts';
  const baseSchemaContent = fs.readFileSync(path.join(process.cwd(), baseSchemaPath), 'utf-8');

  // ENUMS: Base + Individual, aber ohne Duplikate
  const enumTypeNames = new Set<string>();
  const enumTypes = extractEnumTypes(baseSchemaContent, enumTypeNames);

  // Individual enums
  const individualSchemaPath = 'src/db/individual/individual-schema.ts';
  let individualEnumTypes = '';
  if (fs.existsSync(path.join(process.cwd(), individualSchemaPath))) {
    const individualSchemaContent = fs.readFileSync(path.join(process.cwd(), individualSchemaPath), 'utf-8');
    individualEnumTypes = extractEnumTypes(individualSchemaContent, enumTypeNames);
  }

  // Base schema types
  const baseTypesRaw = extractSchemaTypes(baseSchemaPath, {
    renameType: createBaseTypeRenamer(appPrefix),
  });
  const baseTypes = applyReferencePrefixes(baseTypesRaw, appPrefix);

  // Individual schema types
  const individualTypesRaw = extractSchemaTypes('src/db/individual/individual-schema.ts');
  const individualTypes = applyReferencePrefixes(individualTypesRaw, appPrefix);

  // OAuth2 schema types
  const oauth2TypesRaw = extractSchemaTypes('src/routes/oauth2/oauth2-client.schema.ts');
  const oauth2Types = applyReferencePrefixes(oauth2TypesRaw, appPrefix);

  // OAuth2 scopes enum (needed by API contract type refs)
  let oauth2ScopeEnum = '';
  let oauth2ScopeValueType = '';
  const oauth2ScopesPath = 'src/routes/oauth2/oauth2-scopes.ts';
  if (fs.existsSync(path.join(process.cwd(), oauth2ScopesPath))) {
    const oauth2ScopesContent = fs.readFileSync(path.join(process.cwd(), oauth2ScopesPath), 'utf-8');
    const extractedOAuth2ScopeEnum = extractTSEnum(oauth2ScopesContent, 'OAuth2Scope');
    if (extractedOAuth2ScopeEnum) {
      oauth2ScopeEnum = extractedOAuth2ScopeEnum;
      oauth2ScopeValueType = 'export type OAuth2ScopeValue = `${OAuth2Scope}`;';
    }
  }

  // Extract permissions
  let permissionsEnum = '';
  const permissionServicePath = 'src/routes/auth/roles/permissions/permission.service.ts';
  if (fs.existsSync(path.join(process.cwd(), permissionServicePath))) {
    const permissionContent = fs.readFileSync(path.join(process.cwd(), permissionServicePath), 'utf-8');

    const basePermEnum = extractTSEnum(permissionContent, 'BaseAppPermissions');

    const individualPermPath = 'src/routes/auth/roles/permissions/individual-permissions.ts';
    let individualPermEnum = '';
    if (fs.existsSync(path.join(process.cwd(), individualPermPath))) {
      const individualPermContent = fs.readFileSync(path.join(process.cwd(), individualPermPath), 'utf-8');
      individualPermEnum = extractTSEnum(individualPermContent, 'IndividualAppPermissions') || '';
    }

    if (basePermEnum) {
      const baseEntries = basePermEnum.match(/(\w+\s*=\s*"[^"]+")(?:,|\n)/g) || [];
      const individualEntries = individualPermEnum ? (individualPermEnum.match(/(\w+\s*=\s*"[^"]+")(?:,|\n)/g) || []) : [];

      const allEntries = [
        ...baseEntries.map(e => e.replace(/,?\s*$/, '')),
        ...individualEntries.map(e => e.replace(/,?\s*$/, ''))
      ];

      if (allEntries.length > 0) {
        const permissionsEnumName = applyPrefix(appPrefix, 'AppPermissions');
        const permissionValueType = applyPrefix(appPrefix, 'AppPermissionValue');
        permissionsEnum =
          `export enum ${permissionsEnumName} {\n  ${allEntries.join(',\n  ')}\n}\n\n` +
          `export type ${permissionValueType} = (typeof ${permissionsEnumName})[keyof typeof ${permissionsEnumName}];`;
      }
    }
  }

  // Extract settings
  let settingsEnum = '';
  let settingsTypeMap = '';
  const individualSettingsPath = 'src/routes/settings/individual-settings.ts';
  if (fs.existsSync(path.join(process.cwd(), individualSettingsPath))) {
    const settingsContent = fs.readFileSync(path.join(process.cwd(), individualSettingsPath), 'utf-8');

    const settingsEnumName = applyPrefix(appPrefix, 'AppSettingsKey');
    const extracted = extractTSEnum(settingsContent, 'AppSettingsKey', settingsEnumName);
    if (extracted) {
      settingsEnum = extracted;
    }

    const typeMapName = applyPrefix(appPrefix, 'AppSettingsTypeMap');
    const typeMapExtracted = extractAppSettingsTypeMap(settingsContent, {
      typeName: typeMapName,
      referenceEnumName: settingsEnumName,
    });
    if (typeMapExtracted) {
      settingsTypeMap = typeMapExtracted;
    }
  }

  const raw = `// AUTO-GENERATED FILE - DO NOT EDIT MANUALLY
// Generated at: ${new Date().toISOString()}
// Run \`npm run types:generate\` to regenerate this file

// ============================================================================
// ENUMS & LITERAL TYPES
// ============================================================================

${enumTypes}${individualEnumTypes}
// ============================================================================
// BASE APP TYPES (schema.ts)
// ============================================================================

${baseTypes}
// ============================================================================
// APP PERMISSIONS
// ============================================================================

${permissionsEnum || '// No permissions defined'}

// ============================================================================
// APP SETTINGS
// ============================================================================

${settingsEnum || '// No settings defined'}

${settingsTypeMap || ''}

// ============================================================================
// SHARED UTILITY TYPES
// ============================================================================

export type Languages = "DE" | "EN";

export type Prettify<T> = {
  [K in keyof T]: T[K];
};

export type PaginatedResult<T> = {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
};

// ============================================================================
// FEATURE TYPES (individual schema)
// ============================================================================

${individualTypes}
// ============================================================================
// OAUTH2 TYPES
// ============================================================================

${oauth2ScopeEnum}

${oauth2ScopeValueType}

${oauth2Types}
`;

  // hier räumen wir doppelte `export type XYZ = ...;` auf
  return dedupeExportTypeAliases(raw);
}

try {
  console.log('🔧 Generating frontend types...');
  const appPrefix = getAppPrefix();
  const content = generateTypes(appPrefix);

  const wrote1 = writeIfChanged(OUTPUT_FILE, content);
  let wrote2 = false;
  try {
    fs.mkdirSync(path.dirname(OUTPUT_FILE_GENERATED), { recursive: true });
    wrote2 = writeIfChanged(OUTPUT_FILE_GENERATED, content);
  } catch (e) {
    // best-effort; keep original output stable
  }

  console.log('✅ Frontend types generated successfully!');
  console.log(`📄 File: ${OUTPUT_FILE} ${wrote1 ? '(updated)' : '(unchanged)'}`);
  console.log(`📄 File: ${OUTPUT_FILE_GENERATED} ${wrote2 ? '(updated)' : '(unchanged)'}`);
  console.log('');
  console.log('📋 Generated:');
  console.log('   ✓ Base schema types (User, Role, Permission, etc.)');
  console.log('   ✓ Individual schema types');
  console.log('   ✓ Enums & literal types');
  console.log('   ✓ Permissions & Settings');
  console.log('');
  console.log('💡 To add individual types:');
  console.log('   1. Define tables in src/db/individual/individual-schema.ts');
  console.log('   2. Export types (e.g., export type Article = { ... })');
  console.log('   3. Run npm run types:generate');
} catch (error) {
  console.error('❌ Error generating frontend types:', error);
  process.exit(1);
}
