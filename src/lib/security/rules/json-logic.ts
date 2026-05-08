// Minimaler JSON-Logic-Evaluator — genug für Phase-2.5-Conditions, ohne externe
// Dependency. Sehr bewusst restriktiv: keine `eval`, keine `Function`, keine
// User-Code-Execution. Unbekannte Operatoren werfen → Audit zeigt es als
// `condition_eval_failed`.
//
// Unterstützte Ops:
//   { "==": [a, b] } | { "!=": [a, b] } | { "<": ... } | { ">": ... } | { "<=": ... } | { ">=": ... }
//   { "and": [...] } | { "or": [...] } | { "not": x } | { "!": x }
//   { "in": [needle, [haystack...] ] } | { "in": [needle, "string"] }
//   { "contains": [haystack, needle] }   // alias für leichtere Schreibweise
//   { "var": "path" } | { "var": ["path", default] }
//   { "missing": ["path", ...] }         // liefert Liste fehlender Pfade
//   { "if": [cond, then, else] }
//   { "starts_with": [str, prefix] } | { "ends_with": [str, suffix] }
//   { "match": [str, regex] }            // RegExp wird mit `i`-Flag kompiliert
//
// Operands die selber wieder Logic-Ausdrücke sind, werden rekursiv evaluiert.
// Strings/Numbers/Booleans/Arrays von Primitives werden direkt zurückgegeben.
//
// Die Spec (https://jsonlogic.com) ist deutlich größer; wir können später
// erweitern, ohne Migration — `condition` ist jsonb.

export type JsonLogic =
    | string
    | number
    | boolean
    | null
    | JsonLogic[]
    | { [op: string]: JsonLogic };

export interface JsonLogicData {
    [key: string]: unknown;
}

export class JsonLogicError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "JsonLogicError";
    }
}

export function evaluateJsonLogic(logic: JsonLogic | undefined | null, data: JsonLogicData): unknown {
    if (logic === null || logic === undefined) return true;
    if (Array.isArray(logic)) return logic.map((item) => evaluateJsonLogic(item, data));
    if (typeof logic !== "object") return logic;

    const keys = Object.keys(logic);
    if (keys.length !== 1) {
        throw new JsonLogicError(`expected exactly one operator, got ${keys.length}: ${keys.join(",")}`);
    }
    const op = keys[0];
    const args = (logic as Record<string, JsonLogic>)[op];
    const argList = Array.isArray(args) ? args : [args];

    switch (op) {
        case "==": return eq(evalArg(argList[0], data), evalArg(argList[1], data));
        case "!=": return !eq(evalArg(argList[0], data), evalArg(argList[1], data));
        case "<": return num(evalArg(argList[0], data)) < num(evalArg(argList[1], data));
        case ">": return num(evalArg(argList[0], data)) > num(evalArg(argList[1], data));
        case "<=": return num(evalArg(argList[0], data)) <= num(evalArg(argList[1], data));
        case ">=": return num(evalArg(argList[0], data)) >= num(evalArg(argList[1], data));
        case "and": return argList.every((a) => truthy(evalArg(a, data)));
        case "or": return argList.some((a) => truthy(evalArg(a, data)));
        case "not":
        case "!": return !truthy(evalArg(argList[0], data));
        case "in": {
            const needle = evalArg(argList[0], data);
            const haystack = evalArg(argList[1], data);
            if (Array.isArray(haystack)) return haystack.some((item) => eq(item, needle));
            if (typeof haystack === "string" && typeof needle === "string") return haystack.includes(needle);
            return false;
        }
        case "contains": {
            const haystack = evalArg(argList[0], data);
            const needle = evalArg(argList[1], data);
            if (Array.isArray(haystack)) return haystack.some((item) => eq(item, needle));
            if (typeof haystack === "string" && typeof needle === "string") return haystack.includes(needle);
            return false;
        }
        case "var": {
            const pathRaw = evalArg(argList[0], data);
            const fallback = argList.length > 1 ? evalArg(argList[1], data) : null;
            if (pathRaw === "" || pathRaw === null || pathRaw === undefined) return data;
            const path = String(pathRaw);
            const out = readPath(data, path);
            return out === undefined ? fallback : out;
        }
        case "missing": {
            const missing: string[] = [];
            for (const p of argList) {
                const path = String(evalArg(p, data));
                if (readPath(data, path) === undefined) missing.push(path);
            }
            return missing;
        }
        case "if": {
            // if-elif-else chain: cond, then, cond, then, …, else
            for (let i = 0; i + 1 < argList.length; i += 2) {
                if (truthy(evalArg(argList[i], data))) return evalArg(argList[i + 1], data);
            }
            return argList.length % 2 === 1 ? evalArg(argList[argList.length - 1], data) : null;
        }
        case "starts_with": {
            const s = String(evalArg(argList[0], data) ?? "");
            const p = String(evalArg(argList[1], data) ?? "");
            return s.startsWith(p);
        }
        case "ends_with": {
            const s = String(evalArg(argList[0], data) ?? "");
            const p = String(evalArg(argList[1], data) ?? "");
            return s.endsWith(p);
        }
        case "match": {
            const s = String(evalArg(argList[0], data) ?? "");
            const re = String(evalArg(argList[1], data) ?? "");
            try {
                return new RegExp(re, "i").test(s);
            } catch (err) {
                throw new JsonLogicError(`invalid regex: ${re} (${(err as Error).message})`);
            }
        }
        default:
            throw new JsonLogicError(`unsupported operator: ${op}`);
    }
}

function evalArg(arg: JsonLogic, data: JsonLogicData): unknown {
    if (arg && typeof arg === "object" && !Array.isArray(arg)) return evaluateJsonLogic(arg, data);
    return arg;
}

function readPath(data: JsonLogicData, path: string): unknown {
    if (!path) return data;
    const parts = path.split(".");
    let node: unknown = data;
    for (const part of parts) {
        if (node === null || node === undefined) return undefined;
        if (typeof node !== "object") return undefined;
        node = (node as Record<string, unknown>)[part];
    }
    return node;
}

function truthy(v: unknown): boolean {
    if (Array.isArray(v)) return v.length > 0;
    return Boolean(v);
}

function eq(a: unknown, b: unknown): boolean {
    if (a === b) return true;
    if (a === null || b === null || a === undefined || b === undefined) return false;
    // Light type-coercion analog zu JsonLogic-Spec: "1" == 1
    if (typeof a !== typeof b) return String(a) === String(b);
    return false;
}

function num(v: unknown): number {
    if (typeof v === "number") return v;
    if (typeof v === "string") return Number(v);
    if (typeof v === "boolean") return v ? 1 : 0;
    return Number.NaN;
}
