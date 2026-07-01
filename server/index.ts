import express from "express";
import multer from "multer";
import { mkdirSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { runPipeline } from "../src/pipeline.js";
import type { OutputConfig } from "../src/project.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadDir = path.join(__dirname, "..", "tmp-uploads");
mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: uploadDir,
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${file.fieldname}-${Date.now()}-${Math.round(Math.random() * 1e6)}${ext}`);
  },
});
const upload = multer({ storage });
const app = express();
app.use(express.static(path.join(__dirname, "..", "public")));
app.use(express.json());

const fields = upload.fields([
  { name: "csv", maxCount: 5 },
  { name: "ats", maxCount: 5 },
  { name: "resume", maxCount: 5 },
  { name: "notes", maxCount: 5 },
]);

app.post("/api/run", fields, async (req, res) => {
  try {
    const files = req.files as Record<string, Express.Multer.File[]> | undefined;
    const toPaths = (key: string) => (files?.[key] ?? []).map((f) => f.path);

    let customConfig: OutputConfig | undefined;
    if (req.body?.config) {
      try {
        customConfig = JSON.parse(req.body.config);
      } catch {
        return res.status(400).json({ error: "Custom config is not valid JSON" });
      }
    }

    const result = await runPipeline(
      { csv: toPaths("csv"), ats: toPaths("ats"), resumes: toPaths("resume"), notes: toPaths("notes") },
      customConfig,
    );

    res.json({
      profileCount: result.profiles.length,
      defaultOutput: result.defaultOutput,
      customOutput: result.customOutput ?? null,
      warnings: result.warnings,
      validation: result.validation,
    });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? String(err) });
  }
});

const PORT = process.env.PORT ?? 3300;
app.listen(PORT, () => {
  console.log(`Eightfold candidate transformer UI running at http://localhost:${PORT}`);
});
