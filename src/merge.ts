import type {
  CanonicalProfile, ExtractedRecord, ProvenanceEntry, SkillEntry,
  ExperienceEntry, EducationEntry, SourceType,
} from "./types.js";

const SOURCE_PRIORITY: Record<SourceType, number> = {
  recruiter_csv: 100,
  ats_json: 95,
  linkedin: 85,
  github: 80,
  resume: 60,
  recruiter_notes: 30,
};

const SOURCE_BASE_CONFIDENCE: Record<SourceType, number> = {
  recruiter_csv: 0.95,
  ats_json: 0.9,
  linkedin: 0.85,
  github: 0.8,
  resume: 0.6,
  recruiter_notes: 0.4,
};

function normName(n: string | null | undefined): string | null {
  return n ? n.toLowerCase().replace(/\s+/g, " ").trim() : null;
}

export function clusterRecords(records: ExtractedRecord[]): ExtractedRecord[][] {
  const clusters: ExtractedRecord[][] = [];

  const findCluster = (r: ExtractedRecord): number => {
    for (let i = 0; i < clusters.length; i++) {
      const cluster = clusters[i];
      for (const existing of cluster) {
        const emailHit = r.matchKeys.emails.some((e: string) => existing.matchKeys.emails.includes(e));
        const phoneHit = r.matchKeys.phones.some((p: string) => existing.matchKeys.phones.includes(p));
        if (emailHit || phoneHit) return i;
      }
    }
    if (r.matchKeys.emails.length === 0 && r.matchKeys.phones.length === 0 && r.matchKeys.nameNormalized) {
      for (let i = 0; i < clusters.length; i++) {
        if (clusters[i].some((e) => e.matchKeys.nameNormalized === r.matchKeys.nameNormalized)) return i;
      }
    }
    return -1;
  };

  for (const r of records) {
    const idx = findCluster(r);
    if (idx >= 0) clusters[idx].push(r);
    else clusters.push([r]);
  }
  return clusters;
}

function pickScalar<T>(
  field: string,
  candidates: { value: T; source: SourceType; method: ProvenanceEntry["method"] }[],
  provenance: ProvenanceEntry[],
): { value: T | null; agreementBonus: number } {
  const present = candidates.filter((c) => c.value !== null && c.value !== undefined && c.value !== "");
  if (present.length === 0) return { value: null, agreementBonus: 0 };

  const groups = new Map<string, typeof present>();
  for (const c of present) {
    const key = JSON.stringify(c.value);
    groups.set(key, [...(groups.get(key) ?? []), c]);
  }

  let winnerKey = "";
  let winnerScore = -1;
  for (const [key, group] of groups) {
    const topPriority = Math.max(...group.map((g) => SOURCE_PRIORITY[g.source]));
    const score = topPriority + group.length * 0.01;
    if (score > winnerScore) { winnerScore = score; winnerKey = key; }
  }
  const winningGroup = groups.get(winnerKey)!;
  const best = winningGroup.sort((a, b) => SOURCE_PRIORITY[b.source] - SOURCE_PRIORITY[a.source])[0];
  provenance.push({ field, source: best.source, method: best.method });

  const conflicted = groups.size > 1;
  const agreementBonus = conflicted ? -0.15 : winningGroup.length > 1 ? 0.05 : 0;
  return { value: best.value, agreementBonus };
}

function mergeSkills(records: ExtractedRecord[]): SkillEntry[] {
  const byName = new Map<string, SkillEntry>();
  for (const r of records) {
    for (const s of r.profile.skills ?? []) {
      const existing = byName.get(s.name);
      if (existing) {
        existing.confidence = Math.min(0.97, existing.confidence + s.confidence * 0.35);
        for (const src of s.sources) if (!existing.sources.includes(src)) existing.sources.push(src);
      } else {
        byName.set(s.name, { name: s.name, confidence: s.confidence, sources: [...s.sources] });
      }
    }
  }
  return [...byName.values()].sort((a, b) => b.confidence - a.confidence);
}

function mergeExperience(records: ExtractedRecord[]): ExperienceEntry[] {
  const out: ExperienceEntry[] = [];
  const seen = new Set<string>();
  for (const r of records) {
    for (const e of r.profile.experience ?? []) {
      const key = `${e.company.toLowerCase()}|${(e.title ?? "").toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(e);
    }
  }
  return out;
}

function mergeEducation(records: ExtractedRecord[]): EducationEntry[] {
  const out: EducationEntry[] = [];
  const seen = new Set<string>();
  for (const r of records) {
    for (const e of r.profile.education ?? []) {
      const key = `${e.institution.toLowerCase()}|${(e.degree ?? "").toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(e);
    }
  }
  return out;
}

let idCounter = 0;
function nextCandidateId(): string {
  idCounter += 1;
  return `cand_${String(idCounter).padStart(4, "0")}`;
}

export function mergeCluster(cluster: ExtractedRecord[]): CanonicalProfile {
  const provenance: ProvenanceEntry[] = [];
  let confidenceSignals: number[] = [];

  const nameCandidates = cluster
    .filter((r) => r.profile.full_name)
    .map((r) => ({ value: r.profile.full_name as string, source: r.source, method: "field_map" as const }));
  const { value: full_name, agreementBonus: nameBonus } = pickScalar("full_name", nameCandidates, provenance);

  const emails = [...new Set(cluster.flatMap((r) => r.profile.emails ?? []))];
  const phones = [...new Set(cluster.flatMap((r) => r.profile.phones ?? []))];

  const headlineCandidates = cluster
    .filter((r) => r.profile.headline)
    .map((r) => ({ value: r.profile.headline as string, source: r.source, method: "field_map" as const }));
  const { value: headline } = pickScalar("headline", headlineCandidates, provenance);

  const yoeCandidates = cluster
    .filter((r) => r.profile.years_experience !== undefined && r.profile.years_experience !== null)
    .map((r) => ({ value: r.profile.years_experience as number, source: r.source, method: "regex_extract" as const }));
  const { value: years_experience } = pickScalar("years_experience", yoeCandidates, provenance);

  const skills = mergeSkills(cluster);
  if (skills.length) provenance.push({ field: "skills", source: skills[0].sources[0], method: "canonical_skill" });

  const experience = mergeExperience(cluster);
  const education = mergeEducation(cluster);

  const locationSource = cluster.find((r) => r.profile.location);
  const location = locationSource?.profile.location ?? { city: null, region: null, country: null };

  const linksSource = cluster.find((r) => r.profile.links);
  const links = linksSource?.profile.links ?? { linkedin: null, github: null, portfolio: null, other: [] };

  for (const r of cluster) provenance.push(...r.provenance);

  const sourcesPresent = [...new Set(cluster.map((r) => r.source))];
  const avgBase = sourcesPresent.reduce((sum, s) => sum + SOURCE_BASE_CONFIDENCE[s], 0) / sourcesPresent.length;
  const corroboration = sourcesPresent.length > 1 ? Math.min(0.15, 0.05 * (sourcesPresent.length - 1)) : 0;
  const completeness =
    (full_name ? 0.1 : 0) + (emails.length ? 0.1 : 0) + (phones.length ? 0.05 : 0) +
    (skills.length ? 0.05 : 0) + (experience.length ? 0.05 : 0);
  let overall_confidence = avgBase + corroboration + completeness + nameBonus;
  overall_confidence = Math.max(0.05, Math.min(0.99, overall_confidence));

  return {
    candidate_id: nextCandidateId(),
    full_name: full_name ?? null,
    emails,
    phones,
    location,
    links,
    headline: headline ?? null,
    years_experience: years_experience ?? null,
    skills,
    experience,
    education,
    provenance,
    overall_confidence: Math.round(overall_confidence * 100) / 100,
  };
}

export function mergeAll(records: ExtractedRecord[]): CanonicalProfile[] {
  const clusters = clusterRecords(records.filter((r) => Object.keys(r.profile).length > 0));
  return clusters.map(mergeCluster);
}
