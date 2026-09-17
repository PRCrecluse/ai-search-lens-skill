import { mkdir, readFile, writeFile, readdir, rename } from "node:fs/promises";
import { resolve, join } from "node:path";
import { randomUUID } from "node:crypto";
export const dataDir = () => resolve(process.env.DATA_DIR || "./data");
export async function saveReport(report, raw) {
  await mkdir(dataDir(), { recursive: true, mode: 0o700 });
  const target = join(dataDir(), `${report.id}.json`),
    temp = target + `.${randomUUID()}.tmp`;
  await writeFile(temp, JSON.stringify({ report, raw }, null, 2), {
    mode: 0o600,
  });
  await rename(temp, target);
}
export async function getReport(id) {
  if (!/^[a-zA-Z0-9_-]{1,80}$/.test(id)) throw new Error("无效报告 ID");
  return JSON.parse(await readFile(join(dataDir(), `${id}.json`), "utf8"));
}
export async function listReports() {
  await mkdir(dataDir(), { recursive: true, mode: 0o700 });
  const names = (await readdir(dataDir())).filter(n => n.endsWith(".json"));
  const items = await Promise.all(
    names.map(async n => {
      try {
        const { report: r } = JSON.parse(
          await readFile(join(dataDir(), n), "utf8")
        );
        return {
          id: r.id,
          query: r.query,
          createdAt: r.createdAt,
          demo: r.demo,
        };
      } catch {
        return null;
      }
    })
  );
  return items
    .filter(Boolean)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
