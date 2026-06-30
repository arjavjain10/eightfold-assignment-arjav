import { readFileSync } from "fs";
import type { ExtractedRecord, ProvenanceEntry } from "../types.js";
import { normalizeEmail, normalizePhone, canonicalizeSkill } from "../normalize.js";

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const PHONE_RE = /(\+?\d[\d\s().-]{8,}\d)/g;

export function extractRecruiterNotes(filePath: string): ExtractedRecord[] {
  let text: string;
  try {
    text = readFileSync(filePath, "utf-8");
  } catch {
    return [
      { source: "recruiter_notes", matchKeys: { emails: [], phones: [], nameNormalized: null }, profile: {}, provenance: [], raw_warnings: ["recruiter notes file missing"] },
    ];
  }
  if (!text.trim()) {
    return [
      { source: "recruiter_notes", matchKeys: { emails: [], phones: [], nameNormalized: null }, profile: {}, provenance: [], raw_warnings: ["recruiter notes file empty"] },
    ];
  }

  const provenance: ProvenanceEntry[] = [];
  const warnings: string[] = [];

  const emails = [...new Set((text.match(EMAIL_RE) ?? []).map((e) => normalizeEmail(e)).filter(Boolean) as string[])];
  if (emails.length) provenance.push({ field: "emails[0]", source: "recruiter_notes", method: "regex_extract" });

  const phones = [...new Set((text.match(PHONE_RE) ?? []).map((p) => normalizePhone(p)).filter(Boolean) as string[])];
  if (phones.length) provenance.push({ field: "phones[0]", source: "recruiter_notes", method: "e164" });

  const nameMatch = text.match(/(?:candidate|name)\s*[:\-]\s*([A-Za-z .'-]{2,50})/i);
  const name = nameMatch ? nameMatch[1].trim() : null;
  if (name) provenance.push({ field: "full_name", source: "recruiter_notes", method: "regex_extract" });
  else warnings.push("no explicit 'Candidate:'/'Name:' line found in notes");

  const skillsFound = new Set<string>();
  const skillPhraseRe = /(?:strong in|knows?|experience with|skilled in|familiar with)\s+([A-Za-z0-9+#./\- ]{2,30})/gi;
  let m: RegExpExecArray | null;
  while ((m = skillPhraseRe.exec(text)) !== null) {
    const candidate = m[1].split(/[,.;]|\s+\band\b|\s+\bwell\b/i)[0].trim();
    if (candidate) skillsFound.add(canonicalizeSkill(candidate));
  }
  const skills = [...skillsFound].map((name) => ({ name, confidence: 0.35, sources: ["recruiter_notes" as const] }));
  if (skills.length) provenance.push({ field: "skills", source: "recruiter_notes", method: "regex_extract" });

  return [
    {
      source: "recruiter_notes",
      matchKeys: { emails, phones, nameNormalized: name ? name.toLowerCase().replace(/\s+/g, " ").trim() : null },
      profile: { full_name: name, emails, phones, skills },
      provenance,
      raw_warnings: warnings,
    },
  ];
}
