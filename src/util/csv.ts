// Minimal CSV parser.
// Supports delimiter detection ("," or ";" or "\t") and quoted fields.

export type CsvParseResult = {
  headers: string[];
  rows: Record<string, string>[];
};

function detectDelimiter(sampleLine: string): string {
  const candidates = [",", ";", "\t"];
  let best = ",";
  let bestCount = -1;
  for (const c of candidates) {
    const count = sampleLine.split(c).length - 1;
    if (count > bestCount) {
      bestCount = count;
      best = c;
    }
  }
  return best;
}

function parseLine(line: string, delimiter: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else {
      if (ch === '"') inQuotes = true;
      else if (ch === delimiter) {
        out.push(cur.trim());
        cur = "";
      } else cur += ch;
    }
  }
  out.push(cur.trim());
  return out;
}

export function parseCsv(text: string, opts?: { delimiter?: string }): CsvParseResult {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length === 0) return { headers: [], rows: [] };

  const delimiter = opts?.delimiter ?? detectDelimiter(lines[0]);
  const headers = parseLine(lines[0], delimiter).map((h) => h.replace(/^﻿/, "").trim());
  const rows: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = parseLine(lines[i], delimiter);
    const row: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = (cols[j] ?? "").trim();
    }
    rows.push(row);
  }

  return { headers, rows };
}

