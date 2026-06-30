import { readFileSync } from "fs";
import type { ExtractedRecord, ProvenanceEntry, SkillEntry } from "../types.js";
import { normalizeEmail, normalizePhone, canonicalizeSkill, normalizeDateToYearMonth } from "../normalize.js";

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const PHONE_RE = /(\+?\d[\d\s().-]{8,}\d)/g;

const SKILL_KEYWORDS = [
  "javascript", "typescript", "python", "java", "go", "golang", "react", "node", "node.js",
  "sql", "nosql", "postgresql", "mongodb", "aws", "gcp", "azure", "docker", "kubernetes", "k8s",
  "machine learning", "ml", "ai", "c++", "c#", "rust", "graphql", "rest", "kafka", "spark",
];

export async function extractTextFromResumeFile(filePath: string): Promise<string | null> {
  const lower = filePath.toLowerCase();
  try {
    if (lower.endsWith(".pdf")) {
      const buffer = readFileSync(filePath);
      const pdfParse = (await import("pdf-parse")).default as any;
      const data = await pdfParse(buffer);
      return data.text as string;
    }
    if (lower.endsWith(".docx")) {
      const mammoth = await import("mammoth");
      const buffer = readFileSync(filePath);
      const result = await mammoth.extractRawText({ buffer });
      return result.value;
    }
    return readFileSync(filePath, "utf-8");
  } catch {
    return null;
  }
}

export async function extractResume(filePath: string): Promise<ExtractedRecord[]> {
  const text = await extractTextFromResumeFile(filePath);
  const warnings: string[] = [];
  if (!text || !text.trim()) {
    return [
      {
        source: "resume",
        matchKeys: { emails: [], phones: [], nameNormalized: null },
        profile: {},
        provenance: [],
        raw_warnings: ["resume file missing, unreadable, or empty - skipped"],
      },
    ];
  }

  const provenance: ProvenanceEntry[] = [];

  const emailMatches = [...new Set((text.match(EMAIL_RE) ?? []).map((e) => normalizeEmail(e)).filter(Boolean) as string[])];
  if (emailMatches.length) provenance.push({ field: "emails[0]", source: "resume", method: "regex_extract" });

  const phoneCandidates = text.match(PHONE_RE) ?? [];
  const phones = [...new Set(phoneCandidates.map((p) => normalizePhone(p)).filter(Boolean) as string[])];
  if (phones.length) provenance.push({ field: "phones[0]", source: "resume", method: "e164" });

  const firstLines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).slice(0, 5);
  let name: string | null = null;
  for (const line of firstLines) {
    if (EMAIL_RE.test(line) || /https?:\/\//.test(line) || /\d{3}/.test(line)) continue;
    if (line.length > 1 && line.length < 60 && /^[A-Za-z][A-Za-z.\-' ]+$/.test(line)) {
      name = line;
      break;
    }
  }
  EMAIL_RE.lastIndex = 0;
  if (name) provenance.push({ field: "full_name", source: "resume", method: "regex_extract" });
  else warnings.push("could not confidently extract a name from resume text");

  const skillsFound = new Set<string>();
  const lowerText = text.toLowerCase();
  for (const kw of SKILL_KEYWORDS) {
    const re = new RegExp(`(^|[^a-z])${kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z]|$)`, "i");
    if (re.test(lowerText)) skillsFound.add(canonicalizeSkill(kw));
  }
  const skillsLineMatch = text.match(/skills?\s*[:\-]\s*(.+)/i);
  if (skillsLineMatch) {
    skillsLineMatch[1].split(/[,|•]/).map((s) => s.trim()).filter(Boolean).forEach((s) => {
      if (s.length < 40) skillsFound.add(canonicalizeSkill(s));
    });
  }
  const skills: SkillEntry[] = [...skillsFound].map((name) => ({ name, confidence: 0.55, sources: ["resume" as const] }));
  if (skills.length) provenance.push({ field: "skills", source: "resume", method: "regex_extract" });

  const education: { institution: string; degree: string | null; field: string | null; end_year: number | null; source: "resume" }[] = [];
  const degreeWordRe = /\b(Bachelor(?:'s)?|Master(?:'s)?|MBA|Ph\.?D\.?|BS|MS)\b/i;
  const institutionRe = /((?:[A-Za-z][A-Za-z.&'-]*\s+){0,4}(?:University|College|Institute)(?:\s+of\s+[A-Za-z][A-Za-z .&'-]*)?)/i;
  const fieldRe = /\b(?:in|of)\s+([A-Za-z][A-Za-z &'-]{2,40}?)(?=,|\s+(?:from|at|in|of)\b|$)/gi;
  const yearRe = /\b(19|20)\d{2}\b/;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || !degreeWordRe.test(line)) continue;
    const degreeMatch = line.match(degreeWordRe);
    const institutionMatch = line.match(institutionRe);
    const yearMatch = line.match(yearRe);

    const beforeComma = line.split(",")[0];
    const fieldMatches = [...beforeComma.matchAll(fieldRe)];
    const field = fieldMatches.length ? fieldMatches[fieldMatches.length - 1][1].trim() : null;

    if (!institutionMatch && !field) continue;
    education.push({
      institution: institutionMatch ? institutionMatch[1].trim().replace(/[,.]$/, "") : "Unknown",
      degree: degreeMatch ? degreeMatch[1].trim() : null,
      field,
      end_year: yearMatch ? parseInt(yearMatch[0], 10) : null,
      source: "resume",
    });
  }
  if (education.length) provenance.push({ field: "education", source: "resume", method: "regex_extract" });

  let years_experience: number | null = null;
  const yoeMatch = text.match(/(\d{1,2})\+?\s*years?\s+(?:of\s+)?experience/i);
  if (yoeMatch) {
    years_experience = parseInt(yoeMatch[1], 10);
    provenance.push({ field: "years_experience", source: "resume", method: "regex_extract" });
  }

  return [
    {
      source: "resume",
      matchKeys: { emails: emailMatches, phones, nameNormalized: name ? name.toLowerCase().replace(/\s+/g, " ").trim() : null },
      profile: { full_name: name, emails: emailMatches, phones, skills, education, years_experience },
      provenance,
      raw_warnings: warnings,
    },
  ];
}
