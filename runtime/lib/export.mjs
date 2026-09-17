import { readFile } from "node:fs/promises";
const web = new URL("../web/", import.meta.url);
export async function standaloneHtml(report) {
  const [template, css, js] = await Promise.all(
    ["index.html", "style.css", "app.js"].map(file =>
      readFile(new URL(file, web), "utf8")
    )
  );
  // Escaping '<' prevents imported answers from terminating a script element.
  const data = JSON.stringify(report)
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
  return template
    .replace(/<link rel="icon"[^>]*>/, "")
    .replace(
      /<link rel="stylesheet" href="\/style.css"\s*\/?>/,
      `<style>${css}</style>`
    )
    .replace(
      '<script type="module" src="/app.js"></script>',
      `<script>window.__REPORT__=${data};</script><script type="module">${js.replace(/<\/script/gi, "<\\/script")}</script>`
    );
}
export function markdownReport(report) {
  const s = report.summary;
  return `# ${report.query}\n\n${report.demo ? "> SYNTHETIC DEMO — not a live measurement.\n\n" : ""}Model: ${report.model}\n\nCaptured: ${report.createdAt}\n\n## Overview\n\n${s.queryCount} visible queries · ${s.searchCalls} searches · ${s.sourceCount} source URLs · ${s.citedUrls} cited URLs\n\n## Query fan-out\n\n${report.queries.map(q => `- Call ${q.callNumber}: ${q.text}`).join("\n")}\n\n## Brand evidence\n\n${report.brands.map(b => `- ${b.name}: ${b.mentions} mentions; ${b.citedUrls} cited brand URLs`).join("\n")}\n\n## Answer snapshot\n\n${report.answers.map(a => a.text).join("\n\n")}\n\n## Sources\n\n${report.sources.map(s => `- ${s.title}: ${s.url} (${s.citations} citations; calls: ${s.callIds.join(", ") || "not returned"})`).join("\n")}\n\n## Methodology\n\n${report.notes.map(n => `- ${n}`).join("\n")}\n\nRaw response SHA-256: ${report.rawSha256}\n`;
}
