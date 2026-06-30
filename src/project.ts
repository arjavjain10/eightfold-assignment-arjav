import type { CanonicalProfile, ProvenanceEntry } from "./types.js";
import { normalizePhone, normalizeDateToYearMonth, canonicalizeSkill } from "./normalize.js";

export type FieldType = "string" | "number" | "boolean" | "string[]" | "object" | "object[]";
export type NormalizeOption = "E164" | "canonical" | "iso_date" | "none";
export type OnMissing = "null" | "omit" | "error";

export interface FieldConfig {
  path: string;
  from?: string;
  type: FieldType;
  required?: boolean;
  normalize?: NormalizeOption;
}

export interface OutputConfig {
  fields: FieldConfig[];
  include_confidence?: boolean;
  include_provenance?: boolean;
  on_missing?: OnMissing;
}

export class MissingRequiredFieldError extends Error {}

function getNested(obj: any, path: string): any {
  const tokens = path.match(/[^.[\]]+|\[\d*\]/g) ?? [];
  let cur = obj;
  for (const tok of tokens) {
    if (cur === undefined || cur === null) return undefined;
    if (/^\[\d+\]$/.test(tok)) cur = cur[parseInt(tok.slice(1, -1), 10)];
    else if (tok === "[]") return cur;
    else cur = cur[tok];
  }
  return cur;
}

export function resolvePath(profile: CanonicalProfile, path: string): any {
  const mapSplit = path.match(/^(.+?)\[\]\.(.+)$/);
  if (mapSplit) {
    const [, arrPath, rest] = mapSplit;
    const arr = getNested(profile, arrPath);
    if (!Array.isArray(arr)) return undefined;
    return arr.map((item) => getNested(item, rest));
  }
  return getNested(profile, path);
}

function applyNormalize(value: any, type: FieldType, normalize?: NormalizeOption): any {
  if (value === undefined || value === null) return value;
  if (!normalize || normalize === "none") return value;
  const norm1 = (v: any) => {
    if (normalize === "E164") return typeof v === "string" ? normalizePhone(v) ?? v : v;
    if (normalize === "iso_date") return typeof v === "string" ? normalizeDateToYearMonth(v) ?? v : v;
    if (normalize === "canonical") return typeof v === "string" ? canonicalizeSkill(v) : v;
    return v;
  };
  return Array.isArray(value) ? value.map(norm1) : norm1(value);
}

function setNested(target: any, dottedPath: string, value: any) {
  const parts = dottedPath.split(".");
  let cur = target;
  for (let i = 0; i < parts.length - 1; i++) {
    cur[parts[i]] = cur[parts[i]] ?? {};
    cur = cur[parts[i]];
  }
  cur[parts[parts.length - 1]] = value;
}

export function project(profile: CanonicalProfile, config: OutputConfig): Record<string, any> {
  const onMissing: OnMissing = config.on_missing ?? "null";
  const out: Record<string, any> = {};

  for (const field of config.fields) {
    const fromPath = field.from ?? field.path;
    let value = resolvePath(profile, fromPath);
    value = applyNormalize(value, field.type, field.normalize);

    const isEmpty =
      value === undefined || value === null || (Array.isArray(value) && value.length === 0);

    if (isEmpty) {
      if (field.required && onMissing === "error") {
        throw new MissingRequiredFieldError(`Required field "${field.path}" (from "${fromPath}") is missing`);
      }
      if (onMissing === "omit") continue;
      setNested(out, field.path, null);
      continue;
    }
    setNested(out, field.path, value);

    if (config.include_provenance) {
      const relevant = profile.provenance.filter((p: ProvenanceEntry) => p.field === fromPath || fromPath.startsWith(p.field.split("[")[0]));
      if (relevant.length) setNested(out, `${field.path}_provenance`, relevant);
    }
  }

  if (config.include_confidence ?? true) {
    out.overall_confidence = profile.overall_confidence;
  }
  out.candidate_id = out.candidate_id ?? profile.candidate_id;

  return out;
}

export const DEFAULT_CONFIG: OutputConfig = {
  fields: [
    { path: "candidate_id", type: "string", required: true },
    { path: "full_name", type: "string" },
    { path: "emails", type: "string[]" },
    { path: "phones", type: "string[]", normalize: "E164" },
    { path: "location", type: "object" },
    { path: "links", type: "object" },
    { path: "headline", type: "string" },
    { path: "years_experience", type: "number" },
    { path: "skills", type: "object[]", normalize: "canonical" },
    { path: "experience", type: "object[]" },
    { path: "education", type: "object[]" },
    { path: "provenance", type: "object[]" },
  ],
  include_confidence: true,
  include_provenance: false,
  on_missing: "null",
};
