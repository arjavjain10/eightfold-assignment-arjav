import { readFileSync } from "fs";
import type { ExtractedRecord, ProvenanceEntry } from "../types.js";
import { normalizeEmail, normalizePhone } from "../normalize.js";

function parseCsv(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
  if (lines.length === 0) return [];
  const splitLine = (line: string): string[] => {
    const out: string[] = [];
    let cur = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (inQuotes) {
        if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
        else if (c === '"') inQuotes = false;
        else cur += c;
      } else {
        if (c === '"') inQuotes = true;
        else if (c === ",") { out.push(cur); cur = ""; }
        else cur += c;
      }
    }
    out.push(cur);
    return out;
  };
  const header = splitLine(lines[0]).map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const cells = splitLine(line);
    const row: Record<string, string> = {};
    header.forEach((h, i) => (row[h] = (cells[i] ?? "").trim()));
    return row;
  });
}

export function extractCsv(filePath: string): ExtractedRecord[] {
  let text: string;
  try {
    text = readFileSync(filePath, "utf-8");
  } catch {
    return [];
  }
  if (!text.trim()) return [];

  let rows: Record<string, string>[];
  try {
    rows = parseCsv(text);
  } catch {
    return [];
  }

  const records: ExtractedRecord[] = [];
  for (const row of rows) {
    const warnings: string[] = [];
    const provenance: ProvenanceEntry[] = [];

    const get = (...keys: string[]): string | undefined => {
      for (const k of Object.keys(row)) {
        if (keys.includes(k.toLowerCase())) return row[k];
      }
      return undefined;
    };

    const name = get("name", "full_name")?.trim() || null;
    const emailRaw = get("email")?.trim();
    const phoneRaw = get("phone")?.trim();
    const company = get("current_company", "company")?.trim() || null;
    const title = get("title", "job_title")?.trim() || null;

    const normalizedEmailPreview = emailRaw ? normalizeEmail(emailRaw) : null;
    if (!name && !normalizedEmailPreview) {
      warnings.push(`row has neither a usable name nor a valid email - skipped (raw email field: "${emailRaw ?? ""}")`);
      continue;
    }

    const emails: string[] = [];
    if (emailRaw) {
      const e = normalizeEmail(emailRaw);
      if (e) { emails.push(e); provenance.push({ field: "emails[0]", source: "recruiter_csv", method: "field_map" }); }
      else warnings.push(`unparseable email in CSV row: "${emailRaw}"`);
    }

    const phones: string[] = [];
    if (phoneRaw) {
      const p = normalizePhone(phoneRaw);
      if (p) { phones.push(p); provenance.push({ field: "phones[0]", source: "recruiter_csv", method: "e164" }); }
      else warnings.push(`unparseable phone in CSV row: "${phoneRaw}"`);
    }

    if (name) provenance.push({ field: "full_name", source: "recruiter_csv", method: "field_map" });

    const experience = company
      ? [{ company, title, start: null, end: null, summary: null, source: "recruiter_csv" as const }]
      : [];
    if (!company && title) warnings.push(`title "${title}" present without a company - experience entry skipped rather than guessed`);
    if (experience.length) provenance.push({ field: "experience[0]", source: "recruiter_csv", method: "field_map" });

    records.push({
      source: "recruiter_csv",
      matchKeys: { emails, phones, nameNormalized: name ? name.toLowerCase().replace(/\s+/g, " ").trim() : null },
      profile: { full_name: name, emails, phones, experience },
      provenance,
      raw_warnings: warnings,
    });
  }
  return records;
}
