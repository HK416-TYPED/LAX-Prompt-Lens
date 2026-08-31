// Opt-in live check; key comes only from the caller's process environment.
import { readFile, writeFile } from "node:fs/promises";
import { analyzeImage } from "../analysis.js";
const [imagePath, outputPath] = process.argv.slice(2);
if (!imagePath || !outputPath || !process.env.LENS_TEST_API_KEY) throw new Error("Supply image path, report path and LENS_TEST_API_KEY environment variable.");
const bytes = await readFile(imagePath);
const mime = /\.jpe?g$/i.test(imagePath) ? "image/jpeg" : "image/png";
const started = Date.now();
try {
  const result = await analyzeImage({ providerPreset: "jarless", apiMode: "responses", endpoint: "https://jarlessapi.com", model: "gpt-5.5", reasoningEffort: "xhigh", disableStorage: true, apiKey: process.env.LENS_TEST_API_KEY }, `data:${mime};base64,${bytes.toString("base64")}`);
  const report = { model: "gpt-5.5", protocol: "responses", reasoning: "xhigh", store: false, elapsedSeconds: (Date.now() - started) / 1000, imageBytes: bytes.length, complete: result.complete, naturalWords: result.natural.split(/\s+/).filter(Boolean).length, result };
  await writeFile(outputPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ...report, result: { complete: result.complete, visibleText: result.visibleText, negative: result.negative } }, null, 2));
  if (!result.complete) process.exitCode = 1;
} catch (error) {
  console.error(String(error.message).split(process.env.LENS_TEST_API_KEY).join("[REDACTED]"));
  process.exitCode = 1;
}
