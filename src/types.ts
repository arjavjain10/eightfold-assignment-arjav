export type SourceType =
  | "recruiter_csv"
  | "ats_json"
  | "github"
  | "linkedin"
  | "resume"
  | "recruiter_notes";

export type NormalizeMethod =
  | "raw"
  | "regex_extract"
  | "e164"
  | "iso_date"
  | "iso_country"
  | "canonical_skill"
  | "field_map";

export interface ProvenanceEntry {
  field: string;
  source: SourceType;
  method: NormalizeMethod;
}

export interface SkillEntry {
  name: string;
  confidence: number;
  sources: SourceType[];
}

export interface ExperienceEntry {
  company: string;
  title: string | null;
  start: string | null;
  end: string | null;
  summary: string | null;
  source: SourceType;
}

export interface EducationEntry {
  institution: string;
  degree: string | null;
  field: string | null;
  end_year: number | null;
  source: SourceType;
}

export interface CanonicalProfile {
  candidate_id: string;
  full_name: string | null;
  emails: string[];
  phones: string[];
  location: { city: string | null; region: string | null; country: string | null };
  links: { linkedin: string | null; github: string | null; portfolio: string | null; other: string[] };
  headline: string | null;
  years_experience: number | null;
  skills: SkillEntry[];
  experience: ExperienceEntry[];
  education: EducationEntry[];
  provenance: ProvenanceEntry[];
  overall_confidence: number;
}

export interface ExtractedRecord {
  source: SourceType;
  matchKeys: { emails: string[]; phones: string[]; nameNormalized: string | null };
  profile: Partial<CanonicalProfile>;
  provenance: ProvenanceEntry[];
  raw_warnings: string[];
}
