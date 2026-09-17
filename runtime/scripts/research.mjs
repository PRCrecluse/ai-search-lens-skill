#!/usr/bin/env node
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, join } from "node:path";
import { analyzeResponse } from "../lib/analyze.mjs";
import { collectResponse } from "../lib/provider.mjs";
import { standaloneHtml, markdownReport } from "../lib/export.mjs";

const args = process.argv.slice(2),
  options = {};
const flags = new Set(["demo", "help"]);
for (let i = 0; i < args.length; i++) {
  const name = args[i].replace(/^--/, "");
  if (
    ![
      "demo",
      "help",
      "query",
      "model",
      "brand",
      "domain",
      "aliases",
      "competitors",
      "input",
      "config",
      "out",
    ].includes(name)
  )
    throw new Error(`Unknown option: ${args[i]}`);
  if (flags.has(name)) options[name] = true;
  else {
    if (!args[i + 1] || args[i + 1].startsWith("--"))
      throw new Error(`Missing value: ${args[i]}`);
    options[name] = args[++i];
  }
}
if (options.help || !args.length) {
  console.log(
    `AI Search Lens (Node.js 22+)\n\nDemo (no API key):\n  npm run report -- --demo --out ./reports/demo\n\nLive research (uses OPENAI_API_KEY, incurs API costs):\n  npm run report -- --query "best image generator" --brand Freebeat --domain freebeat.ai --out ./reports/music\n\nImport an existing Responses API JSON:\n  npm run report -- --input response.json --query "original question" --config brands.json --out ./reports/imported\n\nOptions:\n  --model MODEL         Override OPENAI_MODEL\n  --aliases A,B         Target brand aliases\n  --competitors A,B     Competitor names (use --config for domains and aliases)\n  --config FILE         JSON { query?, model?, brands: [{ name, target?, domains?, aliases? }] }\n  --out DIRECTORY       Output directory; existing report files are replaced\n\nProduces report.html, report.json, answer.md, response.json and config.json.\n`
  );
  process.exit(0);
}
try {
  let config = options.config
    ? JSON.parse(await readFile(resolve(options.config), "utf8"))
    : {};
  let raw;
  if (options.demo) {
    [raw, config] = await Promise.all(
      ["demo-response", "demo-config"].map(f =>
        readFile(
          new URL(`../examples/${f}.json`, import.meta.url),
          "utf8"
        ).then(JSON.parse)
      )
    );
  } else {
    config = {
      ...config,
      query: options.query || config.query,
      model: options.model || config.model,
    };
    if (!config.query)
      throw new Error("请通过 --query 或 --config 提供原始问题。");
    config.brands = config.brands || [];
    const split = s =>
      (s || "")
        .split(",")
        .map(s => s.trim())
        .filter(Boolean);
    if (options.brand)
      config.brands.push({
        name: options.brand,
        domains: split(options.domain),
        aliases: split(options.aliases),
        target: true,
      });
    for (const name of split(options.competitors)) config.brands.push({ name });
    raw = options.input
      ? JSON.parse(await readFile(resolve(options.input), "utf8"))
      : await collectResponse(config);
  }
  const report = analyzeResponse(raw, config),
    out = resolve(options.out || `reports/${report.id}`);
  await mkdir(out, { recursive: true, mode: 0o700 });
  for (const [name, content] of [
    ["response.json", JSON.stringify(raw, null, 2)],
    ["config.json", JSON.stringify(config, null, 2)],
    ["report.json", JSON.stringify(report, null, 2)],
    ["answer.md", markdownReport(report)],
    ["report.html", await standaloneHtml(report)],
  ])
    await writeFile(join(out, name), content, { mode: 0o600 });
  console.log(
    `Saved ${report.demo ? "synthetic demo" : "research"} report: ${join(out, "report.html")}\n${report.summary.queryCount} visible queries · ${report.summary.sourceCount} source URLs · ${report.summary.citedUrls} cited URLs`
  );
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
