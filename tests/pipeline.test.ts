import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizePhone, normalizeDateToYearMonth, canonicalizeSkill, normalizeEmail } from "../src/normalize.js";
import { mergeAll } from "../src/merge.js";
import { project, DEFAULT_CONFIG } from "../src/project.js";
import { validateDefaultSchema } from "../src/validate.js";
import type { ExtractedRecord } from "../src/types.js";

test("normalizePhone produces E.164", () => {
  assert.equal(normalizePhone("(415) 555-0142"), "+14155550142");
  assert.equal(normalizePhone("+91 98765 43210"), "+919876543210");
  assert.equal(normalizePhone("not-a-phone"), null);
});

test("normalizeDateToYearMonth handles common formats", () => {
  assert.equal(normalizeDateToYearMonth("March 2021"), "2021-03");
  assert.equal(normalizeDateToYearMonth("2021-03-15"), "2021-03");
  assert.equal(normalizeDateToYearMonth("3/2021"), "2021-03");
  assert.equal(normalizeDateToYearMonth("Present"), null);
  assert.equal(normalizeDateToYearMonth("garbage"), null);
});

test("canonicalizeSkill collapses aliases and casing variants", () => {
  assert.equal(canonicalizeSkill("js"), "JavaScript");
  assert.equal(canonicalizeSkill("javascript"), "JavaScript");
  assert.equal(canonicalizeSkill("graphql"), "GraphQL");
  assert.equal(canonicalizeSkill("GraphQL"), "GraphQL");
});

test("normalizeEmail rejects malformed addresses", () => {
  assert.equal(normalizeEmail("Jane@Example.com"), "jane@example.com");
  assert.equal(normalizeEmail("broken-row-no-name-no-email"), null);
});

test("conflicting full_name across sources: structured source wins, confidence reflects conflict", () => {
  const records: ExtractedRecord[] = [
    {
      source: "recruiter_csv",
      matchKeys: { emails: ["jane.doe@example.com"], phones: [], nameNormalized: "jane doe" },
      profile: { full_name: "Jane Doe", emails: ["jane.doe@example.com"], phones: [] },
      provenance: [{ field: "full_name", source: "recruiter_csv", method: "field_map" }],
      raw_warnings: [],
    },
    {
      source: "recruiter_notes",
      matchKeys: { emails: ["jane.doe@example.com"], phones: [], nameNormalized: "jane do" },
      profile: { full_name: "Jane Do", emails: ["jane.doe@example.com"], phones: [] },
      provenance: [{ field: "full_name", source: "recruiter_notes", method: "regex_extract" }],
      raw_warnings: [],
    },
  ];

  const [merged] = mergeAll(records);
  assert.equal(merged.full_name, "Jane Doe", "structured CSV source should win the conflict");
  const nameProvenance = merged.provenance.find((p) => p.field === "full_name" && p.method === "field_map");
  assert.ok(nameProvenance, "winning value must be traceable to its source");
  assert.equal(nameProvenance!.source, "recruiter_csv");
  assert.ok(merged.overall_confidence < 0.95, "a name conflict should pull confidence down from a clean-agreement ceiling");
});

test("missing source never crashes and yields a schema-valid, lower-confidence profile", () => {
  const records: ExtractedRecord[] = [
    {
      source: "resume",
      matchKeys: { emails: [], phones: [], nameNormalized: null },
      profile: {},
      provenance: [],
      raw_warnings: ["resume file missing, unreadable, or empty - skipped"],
    },
    {
      source: "recruiter_csv",
      matchKeys: { emails: ["a@b.com"], phones: [], nameNormalized: "a b" },
      profile: { full_name: "A B", emails: ["a@b.com"], phones: [] },
      provenance: [{ field: "full_name", source: "recruiter_csv", method: "field_map" }],
      raw_warnings: [],
    },
  ];
  const merged = mergeAll(records);
  assert.equal(merged.length, 1);
  const validation = validateDefaultSchema(merged[0]);
  assert.ok(validation.valid, validation.errors.join(", "));
});

test("project() respects on_missing=omit and required+error", () => {
  const profile = {
    candidate_id: "cand_0099",
    full_name: "Test User",
    emails: [],
    phones: [],
    location: { city: null, region: null, country: null },
    links: { linkedin: null, github: null, portfolio: null, other: [] },
    headline: null,
    years_experience: null,
    skills: [],
    experience: [],
    education: [],
    provenance: [],
    overall_confidence: 0.5,
  };

  const omitOut = project(profile, { fields: [{ path: "primary_email", from: "emails[0]", type: "string" }], on_missing: "omit" });
  assert.ok(!("primary_email" in omitOut));

  assert.throws(() =>
    project(profile, { fields: [{ path: "primary_email", from: "emails[0]", type: "string", required: true }], on_missing: "error" }),
  );
});

test("default schema output always validates against the canonical zod schema", () => {
  const records: ExtractedRecord[] = [
    {
      source: "recruiter_csv",
      matchKeys: { emails: ["x@y.com"], phones: [], nameNormalized: "x y" },
      profile: { full_name: "X Y", emails: ["x@y.com"], phones: [] },
      provenance: [{ field: "full_name", source: "recruiter_csv", method: "field_map" }],
      raw_warnings: [],
    },
  ];
  const [profile] = mergeAll(records);
  const projected = project(profile, DEFAULT_CONFIG);
  assert.equal(projected.full_name, "X Y");
  assert.equal(typeof projected.overall_confidence, "number");
});
