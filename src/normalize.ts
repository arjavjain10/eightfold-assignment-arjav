import { parsePhoneNumberFromString } from "libphonenumber-js";

export function normalizePhone(raw: string, defaultRegion: string = "US"): string | null {
  if (!raw) return null;
  const cleaned = raw.trim();
  try {
    const parsed = parsePhoneNumberFromString(cleaned, defaultRegion as any);
    if (parsed && parsed.isValid()) return parsed.number;
  } catch {
  }
  return null;
}

const MONTHS: Record<string, string> = {
  jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
  jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
};

export function normalizeDateToYearMonth(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = raw.trim();
  if (/^present$/i.test(s) || /^current$/i.test(s)) return null;

  let m = s.match(/^(\d{4})-(\d{2})(-\d{2})?$/);
  if (m) return `${m[1]}-${m[2]}`;

  m = s.match(/^(\d{1,2})\/(\d{4})$/);
  if (m) return `${m[2]}-${m[1].padStart(2, "0")}`;
  m = s.match(/^(\d{4})\/(\d{1,2})$/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}`;

  m = s.match(/^([A-Za-z]{3,9})\.?\s+(\d{4})$/);
  if (m) {
    const key = m[1].slice(0, 3).toLowerCase();
    if (MONTHS[key]) return `${m[2]}-${MONTHS[key]}`;
  }

  m = s.match(/^(\d{4})$/);
  if (m) return `${m[1]}-01`;

  return null;
}

const COUNTRY_MAP: Record<string, string> = {
  "united states": "US", "united states of america": "US", usa: "US", us: "US",
  "united kingdom": "GB", uk: "GB", england: "GB",
  india: "IN", canada: "CA", germany: "DE", france: "FR", australia: "AU",
  singapore: "SG", "new zealand": "NZ", ireland: "IE", netherlands: "NL",
};

export function normalizeCountry(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const key = raw.trim().toLowerCase();
  if (COUNTRY_MAP[key]) return COUNTRY_MAP[key];
  if (/^[A-Za-z]{2}$/.test(raw.trim())) return raw.trim().toUpperCase();
  return null;
}

const SKILL_ALIASES: Record<string, string> = {
  js: "JavaScript", javascript: "JavaScript",
  ts: "TypeScript", typescript: "TypeScript",
  py: "Python", python: "Python", python3: "Python",
  "node": "Node.js", nodejs: "Node.js", "node.js": "Node.js",
  reactjs: "React", react: "React", "react.js": "React",
  golang: "Go", go: "Go",
  postgres: "PostgreSQL", postgresql: "PostgreSQL",
  k8s: "Kubernetes", kubernetes: "Kubernetes",
  ml: "Machine Learning", "machine learning": "Machine Learning",
  ai: "Artificial Intelligence",
  aws: "AWS", "amazon web services": "AWS",
  gcp: "GCP", "google cloud": "GCP", "google cloud platform": "GCP",
  sql: "SQL", nosql: "NoSQL",
  csharp: "C#", "c#": "C#", cpp: "C++", "c++": "C++",
  graphql: "GraphQL", rest: "REST", restapi: "REST",
  ci: "CI/CD", cicd: "CI/CD", "ci/cd": "CI/CD",
};

export function canonicalizeSkill(raw: string): string {
  const key = raw.trim().toLowerCase();
  if (SKILL_ALIASES[key]) return SKILL_ALIASES[key];
  return raw
    .trim()
    .split(/\s+/)
    .map((w) => (w.length <= 3 && w === w.toUpperCase() ? w : w[0]?.toUpperCase() + w.slice(1)))
    .join(" ");
}

export function normalizeEmail(raw: string): string | null {
  const s = raw.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) ? s : null;
}
