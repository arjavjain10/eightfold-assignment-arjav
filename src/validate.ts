import { z } from "zod";
import type { OutputConfig } from "./project.js";

export const ProvenanceSchema = z.object({
  field: z.string(),
  source: z.string(),
  method: z.string(),
});

export const SkillSchema = z.object({
  name: z.string(),
  confidence: z.number().min(0).max(1),
  sources: z.array(z.string()),
});

export const ExperienceSchema = z.object({
  company: z.string(),
  title: z.string().nullable(),
  start: z.string().nullable(),
  end: z.string().nullable(),
  summary: z.string().nullable(),
  source: z.string().optional(),
});

export const EducationSchema = z.object({
  institution: z.string(),
  degree: z.string().nullable(),
  field: z.string().nullable(),
  end_year: z.number().nullable(),
  source: z.string().optional(),
});

export const CanonicalProfileSchema = z.object({
  candidate_id: z.string(),
  full_name: z.string().nullable(),
  emails: z.array(z.string()),
  phones: z.array(z.string()),
  location: z.object({ city: z.string().nullable(), region: z.string().nullable(), country: z.string().nullable() }),
  links: z.object({
    linkedin: z.string().nullable(),
    github: z.string().nullable(),
    portfolio: z.string().nullable(),
    other: z.array(z.string()),
  }),
  headline: z.string().nullable(),
  years_experience: z.number().nullable(),
  skills: z.array(SkillSchema),
  experience: z.array(ExperienceSchema),
  education: z.array(EducationSchema),
  provenance: z.array(ProvenanceSchema),
  overall_confidence: z.number().min(0).max(1),
});

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export function validateDefaultSchema(profile: unknown): ValidationResult {
  const result = CanonicalProfileSchema.safeParse(profile);
  if (result.success) return { valid: true, errors: [] };
  return { valid: false, errors: result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) };
}

export function validateAgainstConfig(output: Record<string, any>, config: OutputConfig): ValidationResult {
  const errors: string[] = [];
  for (const field of config.fields) {
    if (!field.required) continue;
    const parts = field.path.split(".");
    let cur: any = output;
    let present = true;
    for (const p of parts) {
      if (cur === undefined || cur === null || !(p in cur)) { present = false; break; }
      cur = cur[p];
    }
    if (!present) {
      if (config.on_missing === "omit") continue;
      errors.push(`Required field "${field.path}" is missing from output`);
    } else if (cur === null && config.on_missing === "error") {
      errors.push(`Required field "${field.path}" resolved to null under on_missing="error"`);
    }
  }
  return { valid: errors.length === 0, errors };
}
