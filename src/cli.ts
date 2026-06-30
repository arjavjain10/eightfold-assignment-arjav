#!/usr/bin/env node
import { Command } from "commander";
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { dirname } from "path";
import { runPipeline } from "./pipeline.js";
import type { OutputConfig } from "./project.js";

const program = new Command();

program
  .name("candidate-transformer")
  .description("Eightfold multi-source candidate data transformer")
  .option("--csv <files...>", "Recruiter CSV export file(s)")
  .option("--ats <files...>", "ATS JSON blob file(s)")
  .option("--resume <files...>", "Resume file(s) - PDF or DOCX")
  .option("--notes <files...>", "Recruiter notes .txt file(s)")
  .option("--config <file>", "Custom runtime output config (JSON) - see configs/example.json")
  .option("--out <file>", "Write default-schema JSON output here", "output/default-output.json")
  .option("--out-custom <file>", "Write custom-schema JSON output here (requires --config)", "output/custom-output.json")
  .option("--pretty", "Pretty-print JSON output", true)
  .parse(process.argv);

const opts = program.opts();

async function main() {
  if (!opts.csv && !opts.ats && !opts.resume && !opts.notes) {
    console.error("Error: provide at least one input source (--csv, --ats, --resume, and/or --notes).");
    console.error("Example: npm run cli -- --csv sample-input/recruiter.csv --resume sample-input/resume.pdf --notes sample-input/notes.txt");
    process.exit(1);
  }

  let customConfig: OutputConfig | undefined;
  if (opts.config) {
    try {
      customConfig = JSON.parse(readFileSync(opts.config, "utf-8"));
    } catch (err: any) {
      console.error(`Error: could not read/parse config file "${opts.config}": ${err.message}`);
      process.exit(1);
    }
  }

  const result = await runPipeline(
    { csv: opts.csv, ats: opts.ats, resumes: opts.resume, notes: opts.notes },
    customConfig,
  );

  const spacing = opts.pretty ? 2 : 0;

  mkdirSync(dirname(opts.out), { recursive: true });
  writeFileSync(opts.out, JSON.stringify(result.defaultOutput, null, spacing));
  console.log(`✓ Default-schema output written to ${opts.out} (${result.defaultOutput.length} profile(s))`);

  if (customConfig && result.customOutput) {
    mkdirSync(dirname(opts.outCustom), { recursive: true });
    writeFileSync(opts.outCustom, JSON.stringify(result.customOutput, null, spacing));
    console.log(`✓ Custom-schema output written to ${opts.outCustom}`);
  }

  if (result.warnings.length) {
    console.log(`\n⚠ ${result.warnings.length} warning(s):`);
    for (const w of result.warnings) console.log(`  - ${w}`);
  }

  const invalidDefault = result.validation.default.filter((v) => !v.valid);
  if (invalidDefault.length) {
    console.log(`\n✗ ${invalidDefault.length} profile(s) failed default-schema validation:`);
    invalidDefault.forEach((v) => v.errors.forEach((e) => console.log(`  - ${e}`)));
  } else {
    console.log("✓ All profiles passed default-schema validation");
  }

  if (result.validation.custom) {
    const invalidCustom = result.validation.custom.filter((v) => !v.valid);
    if (invalidCustom.length) {
      console.log(`\n✗ ${invalidCustom.length} profile(s) failed custom-schema validation:`);
      invalidCustom.forEach((v) => v.errors.forEach((e) => console.log(`  - ${e}`)));
    } else {
      console.log("✓ All profiles passed custom-schema validation");
    }
  }

  console.log(`\nCandidates produced: ${result.profiles.length}`);
  for (const p of result.profiles) {
    console.log(`  - ${p.candidate_id}: ${p.full_name ?? "(name unknown)"} | confidence ${p.overall_confidence}`);
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
