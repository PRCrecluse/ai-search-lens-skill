#!/usr/bin/env node
import { access, cp, mkdir, realpath } from "node:fs/promises";
import { resolve, join, relative, isAbsolute } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";

const source = fileURLToPath(new URL("..", import.meta.url));
const args = process.argv.slice(2);
let agent = "codex", destination, force = false;
try {
  for (let i = 0; i < args.length; i++) {
    const flag = args[i];
    if (flag === "--help") {
      console.log("Install AI Search Lens (Node.js 22.9+)\n\nnode scripts/install.mjs [--agent codex|claude-code] [--target DIRECTORY] [--force]\n\nDefaults: Codex -> $CODEX_HOME/skills/ai-search-lens or ~/.codex/skills/ai-search-lens\n          Claude Code -> ~/.claude/skills/ai-search-lens\n--target chooses a project-local or custom installation directory.\n--force updates packaged files while preserving local .env and reports.");
      process.exit(0);
    }
    if (flag === "--force") { force = true; continue; }
    if (!["--agent", "--target"].includes(flag)) throw new Error(`Unknown option: ${flag}`);
    const value = args[++i];
    if (!value || value.startsWith("--")) throw new Error(`Missing value: ${flag}`);
    if (flag === "--agent") agent = value;
    else destination = value;
  }
  if (!["codex", "claude-code"].includes(agent)) throw new Error(`Unsupported agent: ${agent}`);
  const target = resolve(destination || join(
    agent === "codex" ? process.env.CODEX_HOME || join(homedir(), ".codex") : join(homedir(), ".claude"),
    "skills", "ai-search-lens"
  ));
  let existing = false;
  try { await access(target); existing = true; } catch (error) { if (error.code !== "ENOENT") throw error; }
  const actualTarget = existing ? await realpath(target) : target;
  const nested = relative(await realpath(source), actualTarget);
  if (!nested || (!nested.startsWith("..") && !isAbsolute(nested)))
    throw new Error("Choose an installation directory outside this source repository.");
  if (existing && !force) throw new Error(`Already exists: ${target}. Use --force to update.`);
  await mkdir(target, { recursive: true });
  for (const name of ["SKILL.md", "agents", "references", "LICENSE"])
    await cp(join(source, name), join(target, name), { recursive: true });
  // Explicit allowlist excludes local credentials, reports, data and caches.
  for (const name of ["lib", "web", "examples", "scripts", "server.mjs", "package.json", ".env.example"])
    await cp(join(source, "runtime", name), join(target, "runtime", name), { recursive: true });
  console.log(`Installed AI Search Lens: ${target}\nStart a new agent session, then invoke $ai-search-lens.\nVerify without an API key:\n  node "${join(target, "runtime/scripts/research.mjs")}" --demo --out ./reports/demo`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
