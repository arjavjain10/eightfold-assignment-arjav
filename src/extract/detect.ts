import { readFileSync, existsSync } from "fs";
import type { SourceType } from "../types.js";

export function detectSourceType(filePath: string, hint?: "resume" | "notes"): SourceType | null {
  if (!existsSync(filePath)) return null;
  const lower = filePath.toLowerCase();

  if (lower.endsWith(".pdf") || lower.endsWith(".docx")) return "resume";
  if (lower.endsWith(".json")) return "ats_json";
  if (lower.endsWith(".csv")) return "recruiter_csv";

  if (lower.endsWith(".txt")) {
    if (hint === "resume") return "resume";
    return "notes" as any;
  }

  try {
    const head = readFileSync(filePath, "utf-8").slice(0, 200).trim();
    if (head.startsWith("{") || head.startsWith("[")) return "ats_json";
    if (head.split("\n")[0]?.includes(",")) return "recruiter_csv";
  } catch {
  }
  return null;
}
