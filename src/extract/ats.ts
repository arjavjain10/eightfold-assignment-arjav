import { readFileSync } from "fs";
import type { ExtractedRecord, ProvenanceEntry } from "../types.js";
import { normalizeEmail, normalizePhone, canonicalizeSkill } from "../normalize.js";

const NAME_KEYS = ["candidate_name", "applicant_name", "name", "full_name"];
const EMAIL_KEYS = ["email_address", "contact_email", "email"];
const PHONE_KEYS = ["mobile", "phone_number", "phone", "contact_phone"];
const TITLE_KEYS = ["job_title", "applied_title", "title", "role"];
const COMPANY_KEYS = ["employer", "current_employer", "company"];
const SKILLS_KEYS = ["skill_tags", "skills", "tags"];

function pick(obj: any, keys: string[]): any {
  for (const k of keys) if (obj && obj[k] !== undefined && obj[k] !== null && obj[k] !== "") return obj[k];
  return undefined;
}

export function extractAtsJson(filePath: string): ExtractedRecord[] {
  let raw: string;
  try {
    raw = readFileSync(filePath, "utf-8");
  } catch {
    return [];
  }
  if (!raw.trim()) return [];

  let data: any;
  try {
    data = JSON.parse(raw);
  } catch {
    return [];
  }

  const blobs: any[] = Array.isArray(data) ? data : data.candidates ?? [data];
  const records: ExtractedRecord[] = [];

  for (const blob of blobs) {
    if (!blob || typeof blob !== "object") continue;
    const warnings: string[] = [];
    const provenance: ProvenanceEntry[] = [];

    const name = pick(blob, NAME_KEYS) ? String(pick(blob, NAME_KEYS)).trim() : null;
    const emailRaw = pick(blob, EMAIL_KEYS);
    const phoneRaw = pick(blob, PHONE_KEYS);
    const title = pick(blob, TITLE_KEYS) ?? null;
    const company = pick(blob, COMPANY_KEYS) ?? null;
    const skillsRaw = pick(blob, SKILLS_KEYS);

    const normalizedEmailPreview = emailRaw ? normalizeEmail(String(emailRaw)) : null;
    if (!name && !normalizedEmailPreview) {
      warnings.push("ATS blob has no recognizable name or valid email field");
      continue;
    }

    const emails: string[] = [];
    if (emailRaw) {
      const e = normalizeEmail(String(emailRaw));
      if (e) { emails.push(e); provenance.push({ field: "emails[0]", source: "ats_json", method: "field_map" }); }
      else warnings.push(`unparseable ATS email: "${emailRaw}"`);
    }

    const phones: string[] = [];
    if (phoneRaw) {
      const p = normalizePhone(String(phoneRaw));
      if (p) { phones.push(p); provenance.push({ field: "phones[0]", source: "ats_json", method: "e164" }); }
      else warnings.push(`unparseable ATS phone: "${phoneRaw}"`);
    }

    if (name) provenance.push({ field: "full_name", source: "ats_json", method: "field_map" });

    const experience = company
      ? [{ company, title: title ?? null, start: null, end: null, summary: null, source: "ats_json" as const }]
      : [];
    if (!company && title) warnings.push(`ATS title "${title}" present without a company - experience entry skipped rather than guessed`);

    const skills = Array.isArray(skillsRaw)
      ? skillsRaw.filter((s) => typeof s === "string").map((s: string) => ({ name: canonicalizeSkill(s), confidence: 0.6, sources: ["ats_json" as const] }))
      : [];
    if (skills.length) provenance.push({ field: "skills", source: "ats_json", method: "field_map" });

    records.push({
      source: "ats_json",
      matchKeys: { emails, phones, nameNormalized: name ? name.toLowerCase().replace(/\s+/g, " ").trim() : null },
      profile: { full_name: name, emails, phones, experience, skills },
      provenance,
      raw_warnings: warnings,
    });
  }
  return records;
}
