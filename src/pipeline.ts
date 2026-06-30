import type { CanonicalProfile, ExtractedRecord } from "./types.js";
import { extractCsv } from "./extract/csv.js";
import { extractAtsJson } from "./extract/ats.js";
import { extractResume } from "./extract/resume.js";
import { extractRecruiterNotes } from "./extract/notes.js";
import { mergeAll } from "./merge.js";
import { project, DEFAULT_CONFIG, type OutputConfig } from "./project.js";
import { validateDefaultSchema, validateAgainstConfig, type ValidationResult } from "./validate.js";

export interface PipelineInput {
  csv?: string[];
  ats?: string[];
  resumes?: string[];
  notes?: string[];
}

export interface PipelineRunResult {
  profiles: CanonicalProfile[];
  defaultOutput: Record<string, any>[];
  customOutput?: Record<string, any>[];
  warnings: string[];
  validation: { default: ValidationResult[]; custom?: ValidationResult[] };
}

export async function runPipeline(input: PipelineInput, customConfig?: OutputConfig): Promise<PipelineRunResult> {
  const records: ExtractedRecord[] = [];
  const warnings: string[] = [];

  for (const f of input.csv ?? []) {
    const recs = safeRun(() => extractCsv(f), warnings, `recruiter_csv:${f}`);
    records.push(...recs);
  }
  for (const f of input.ats ?? []) {
    const recs = safeRun(() => extractAtsJson(f), warnings, `ats_json:${f}`);
    records.push(...recs);
  }
  for (const f of input.resumes ?? []) {
    const recs = await safeRunAsync(() => extractResume(f), warnings, `resume:${f}`);
    records.push(...recs);
  }
  for (const f of input.notes ?? []) {
    const recs = safeRun(() => extractRecruiterNotes(f), warnings, `recruiter_notes:${f}`);
    records.push(...recs);
  }

  for (const r of records) for (const w of r.raw_warnings) warnings.push(`[${r.source}] ${w}`);

  const profiles = mergeAll(records);

  const defaultOutput = profiles.map((p) => project(p, DEFAULT_CONFIG));
  const defaultValidation = profiles.map((p) => validateDefaultSchema(p));

  const result: PipelineRunResult = {
    profiles,
    defaultOutput,
    warnings,
    validation: { default: defaultValidation },
  };

  if (customConfig) {
    const customOutput = profiles.map((p) => project(p, customConfig));
    const customValidation = customOutput.map((o) => validateAgainstConfig(o, customConfig));
    result.customOutput = customOutput;
    result.validation.custom = customValidation;
  }

  return result;
}

function safeRun<T>(fn: () => T[], warnings: string[], label: string): T[] {
  try {
    return fn();
  } catch (err: any) {
    warnings.push(`source failed and was skipped (${label}): ${err?.message ?? err}`);
    return [];
  }
}

async function safeRunAsync<T>(fn: () => Promise<T[]>, warnings: string[], label: string): Promise<T[]> {
  try {
    return await fn();
  } catch (err: any) {
    warnings.push(`source failed and was skipped (${label}): ${err?.message ?? err}`);
    return [];
  }
}
