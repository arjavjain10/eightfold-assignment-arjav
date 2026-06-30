# Eightfold Multi-Source Candidate Data Transformer

Turns messy, multi-source candidate data (recruiter CSV, ATS JSON, resumes, recruiter
notes) into one clean, traceable canonical profile per candidate — and into any custom
JSON shape a runtime config asks for, without code changes.

See `<YourFullName>_<YourEmail>_Eightfold.pdf` for the one-page design doc (pipeline
breakdown, schema, merge/conflict policy, edge cases, and what was deliberately
descoped).

## Sources implemented

- **Structured:** Recruiter CSV export, ATS JSON blob (both implemented — only one was required)
- **Unstructured:** Resume (PDF/DOCX), Recruiter notes (.txt) (both implemented — only one was required)

GitHub/LinkedIn were intentionally skipped to keep the pipeline deterministic and
runnable offline with no auth/rate-limit dependencies — noted as descoped in the design doc.

## Requirements

- Node.js 20+

## Install

```bash
npm install
```

## Run — CLI (primary surface)

```bash
# Default schema only
npm run cli -- --csv sample-input/recruiter.csv --ats sample-input/ats.json \
  --resume sample-input/resume.pdf --notes sample-input/notes.txt

# Default schema + a custom runtime config
npm run cli -- --csv sample-input/recruiter.csv --ats sample-input/ats.json \
  --resume sample-input/resume.pdf --notes sample-input/notes.txt \
  --config configs/example.json
```

Output is written to `output/default-output.json` (and `output/custom-output.json` if
`--config` is passed). Any input flag (`--csv`, `--ats`, `--resume`, `--notes`) can be
omitted or repeated with multiple files. The CLI prints a per-candidate summary,
validation results, and any warnings (malformed rows, unparseable fields, skipped
sources) to the console — it never crashes on a bad/missing file.

Flags:
```
--csv <files...>        Recruiter CSV export file(s)
--ats <files...>        ATS JSON blob file(s)
--resume <files...>     Resume file(s) - PDF or DOCX
--notes <files...>      Recruiter notes .txt file(s)
--config <file>         Custom runtime output config (JSON)
--out <file>            Default-schema output path (default: output/default-output.json)
--out-custom <file>     Custom-schema output path (default: output/custom-output.json)
```

## Run — minimal web UI

```bash
npm run server
```

Then open http://localhost:3300 — upload sources, optionally paste a config JSON
(see `configs/example.json`), and run the pipeline. This is a thin viewer on top of
the same pipeline the CLI uses; per the assignment, it's intentionally low-effort.

## Run tests

```bash
npm test
```

8 tests covering normalization (phone/date/skill/email), cross-source conflict
resolution with confidence scoring, graceful degradation on a missing source, and the
runtime-config projection layer (`omit` vs `error` on missing required fields).

## Runtime output config

See `configs/example.json` for a working example. A config can:
- select a subset of canonical fields (`fields: [...]`)
- rename/remap a field from a canonical path via `from` (supports `emails[0]`,
  `experience[0].company`, and map-projections like `skills[].name`)
- set per-field normalization (`E164`, `iso_date`, `canonical`)
- toggle `include_confidence` / `include_provenance`
- choose `on_missing`: `"null"` (write null), `"omit"` (drop the key), or `"error"`
  (throw if a `required: true` field can't be resolved)

The projection layer never mutates the canonical record — it builds a fresh object
each time, so the internal record stays the single source of truth.

## Design summary (see the one-pager for full detail)

**Pipeline:** detect → extract → merge → confidence → project → validate. Normalization
happens inside each extractor (phones → E.164, dates → YYYY-MM, skills → canonical
names via an alias table) so every extractor hands the merge step already-clean data.

**Matching/merge:** records are clustered by exact email match, then exact phone match,
then (only as a last resort, and only when a record has no email/phone at all)
normalized-name match. Within a cluster, conflicting scalar fields are resolved by
source priority (`recruiter_csv > ats_json > linkedin > github > resume >
recruiter_notes`), with the winning value's provenance recorded and a confidence
penalty applied when sources disagree — agreement boosts confidence, conflict lowers
it. Skills/experience/education are unioned and deduplicated, not overwritten.

**Confidence:** a weighted blend of (a) the average base trust of the sources present,
(b) a corroboration bonus when independent sources agree, and (c) a completeness bonus
for having core fields populated — clamped to [0.05, 0.99]. Nothing ever reaches 1.0,
and a single low-trust source (recruiter notes alone) caps out well below a
multi-source-corroborated profile.

## Known edge cases handled

1. Malformed/garbage CSV row (no usable name or email) → dropped with a warning, not
   merged in as a ghost profile.
2. ATS JSON blob with unrecognized field names entirely → skipped with a warning.
3. Conflicting full name across a structured and an unstructured source → the
   structured source wins; provenance shows the source; confidence dips. (See
   `tests/pipeline.test.ts`.)
4. Missing/unreadable resume file → pipeline continues with a lower-confidence,
   schema-valid profile rather than crashing.
5. Title known but company unknown → no experience entry is invented; a warning notes
   the field was dropped rather than guessed.
6. Skill name collisions across sources/casing (`"python"` vs `"Python"`, `"graphql"` vs
   `"GraphQL"`) → canonicalized through one alias table so they merge into a single
   skill entry instead of duplicating.

## What was deliberately left out / descoped

- GitHub and LinkedIn extractors (no network/auth dependency, by design — see above).
- Resume parsing is regex/keyword-based, not NLP/LLM-based. It reliably extracts
  contact info and a flat skills list; multi-job experience history from a free-form
  resume body is not reconstructed (CSV/ATS are treated as the source of truth for
  structured experience; resumes contribute education + skills + contact info).
- Address/location is only populated when a structured source provides it — no city/
  region/country inference from free text.
- Fuzzy/typo-tolerant name matching (e.g. "Jon Smith" vs "John Smith") is not
  implemented; matching relies on exact email/phone, falling back to exact normalized
  name. This is intentionally conservative — a wrong merge is worse than a missed one.
