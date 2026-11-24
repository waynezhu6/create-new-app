#!/usr/bin/env node
// Turns a fresh copy of app-template into an app in one backend language:
//
//   node scripts/init.mjs --lang python   # or --lang ts (the default)
//
// TypeScript is what's in backend/ already. Another language's files are in
// stacks/<lang>/: its backend/ replaces this one, and for each block
// <!-- stack:NAME --> ... <!-- /stack:NAME --> in a Markdown file FILE.md, its
// FILE.NAME.md replaces the block's contents. <!-- template-only --> blocks,
// stacks/, the template's own check workflow and this script are then removed,
// so the app holds one language and nothing left to choose. Commit the result.
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";

const root = resolve(import.meta.dirname, "..");
const stacks = join(root, "stacks");
const langs = ["ts", ...(existsSync(stacks) ? readdirSync(stacks) : [])].sort();

const { values } = parseArgs({ options: { lang: { type: "string", default: "ts" }, help: { type: "boolean", short: "h" } } });
if (values.help) {
  console.log(`usage: node scripts/init.mjs [--lang ${langs.join("|")}]`);
  process.exit(0);
}
const lang = values.lang;
if (!existsSync(stacks)) fail("This repo is already initialized (there's no stacks/ folder).");
if (!langs.includes(lang)) fail(`Unknown language "${lang}". Choose one of: ${langs.join(", ")}.`);
const overlay = join(stacks, lang);

const docs = ["README.md", "CLAUDE.md"];
for (const doc of docs) {
  const path = join(root, doc);
  let text = readFileSync(path, "utf8");
  // A language's own text for each stack block; TypeScript keeps what's there.
  text = text.replace(/<!-- stack:([\w-]+) -->\n([\s\S]*?)<!-- \/stack:\1 -->\n/g, (_, name, body) => {
    if (lang === "ts") return body;
    const part = join(overlay, `${doc.replace(/\.md$/, "")}.${name}.md`);
    if (!existsSync(part)) fail(`stacks/${lang} has no ${doc.replace(/\.md$/, "")}.${name}.md for the "${name}" block in ${doc}.`);
    return readFileSync(part, "utf8").replace(/\n*$/, "\n");
  });
  text = text.replace(/<!-- template-only -->\n[\s\S]*?<!-- \/template-only -->\n\n?/g, "");
  writeFileSync(path, text);
}

if (lang !== "ts") {
  rmSync(join(root, "backend"), { recursive: true, force: true });
  cpSync(join(overlay, "backend"), join(root, "backend"), { recursive: true });

  // npm now only manages the frontend; the backend has its own tooling.
  const pkgPath = join(root, "package.json");
  const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
  const extra = JSON.parse(readFileSync(join(overlay, "package.json"), "utf8"));
  pkg.workspaces = pkg.workspaces.filter((w) => w !== "backend");
  pkg.scripts = { ...pkg.scripts, ...extra.scripts };
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");
  console.log("Updating package-lock.json for the frontend alone…");
  execFileSync("npm", ["install", "--package-lock-only", "--ignore-scripts", "--no-audit", "--no-fund"], { cwd: root, stdio: "inherit" });
  // npm keeps the old workspace as an "extraneous" entry; it's gone for good.
  const lockPath = join(root, "package-lock.json");
  const lock = JSON.parse(readFileSync(lockPath, "utf8"));
  delete lock.packages.backend;
  writeFileSync(lockPath, JSON.stringify(lock, null, 2) + "\n");
}

for (const path of ["stacks", ".github/workflows/template-check.yml", "scripts/init.mjs"]) {
  rmSync(join(root, path), { recursive: true, force: true });
}
const scripts = join(root, "scripts");
if (existsSync(scripts) && readdirSync(scripts).length === 0) rmSync(scripts, { recursive: true });

console.log(`\nInitialized as a ${lang === "ts" ? "TypeScript" : lang} app. Review and commit:\n  git add -A && git commit -m "Initialize as a ${lang} app"`);

function fail(message) {
  console.error(message);
  process.exit(1);
}
