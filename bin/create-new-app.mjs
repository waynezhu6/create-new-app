#!/usr/bin/env node
// Creates a new app for waynezhu.dev: one backend and one or more frontends.
//
//   create-new-app notes                                   # ts backend, web frontend
//   create-new-app notes --backend python
//   create-new-app habits --frontend web --frontend ios     # web and iPhone, one backend
//
// It writes the app into ./<name>, makes it a git repo, creates the GitHub repo
// with gh and pushes it, then starts the infrastructure repo's Register app
// workflow, which opens the PR that puts the app online. Nothing on the server
// depends on the choices: every combination builds the same kind of image.
//
// How the app is put together, from template/:
//   base/                 always: deploy workflow, infra.yml, docs, ...
//   backend/<ts|python>/  becomes backend/
//   frontend/web/         becomes frontend/
//   frontend/ios/         becomes ios/
// In every file, lines like `# if web` / `<!-- if python -->` up to `# else` and
// `# end` (or the <!-- --> forms, also inline) keep their text only for those
// choices; `if web,ios` means either, `if !web` means without. __APP__ becomes the
// name and __APP_TYPE__ a Swift type name made from it, in contents and paths.
//
// Needs node and, unless --no-github, git, gh (signed in) and npm.
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { parseArgs } from "node:util";

const root = resolve(import.meta.dirname, "..");
const template = join(root, "template");
const BACKENDS = readdirSync(join(template, "backend")).sort();
const FRONTENDS = readdirSync(join(template, "frontend")).sort();
// Where each part goes in the app.
const PARTS_DEST = { web: "frontend", ios: "ios" };

const usage = `usage: create-new-app <name> [--backend ${BACKENDS.join("|")}] [--frontend ${FRONTENDS.join("|")} ...] [options]

  --backend <lang>     the one backend (default ts)
  --frontend <kind>    a frontend; repeat it or use commas for several (default web)
  --dir <path>         where to write it (default ./<name>)
  --owner <login>      GitHub owner (default: the account gh is signed in as)
  --private            make the repo private (public repos get free arm64 runners)
  --no-github          only write the folder: no git repo, no GitHub, no registration
  --no-register        create and push the repo, but don't start the registration PR`;

let parsed;
try {
  parsed = parseArgs({
    allowPositionals: true,
    options: {
      backend: { type: "string", default: "ts" },
      frontend: { type: "string", multiple: true },
      dir: { type: "string" },
      owner: { type: "string" },
      private: { type: "boolean", default: false },
      "no-github": { type: "boolean", default: false },
      "no-register": { type: "boolean", default: false },
      help: { type: "boolean", short: "h" },
    },
  });
} catch (err) {
  fail(`${err.message}\n\n${usage}`);
}
const { values: opts, positionals } = parsed;
if (opts.help) {
  console.log(usage);
  process.exit(0);
}

const [name] = positionals;
if (!name || positionals.length > 1) fail(usage);
// The name is the app's path, container, image and database name on the server.
if (!/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/.test(name)) fail(`"${name}" isn't a valid app name: lowercase letters, digits and single dashes, starting with a letter.`);
if (["auth", "deploy"].includes(name)) fail(`"${name}" is taken by the server itself.`);
const backend = opts.backend;
if (!BACKENDS.includes(backend)) fail(`Unknown backend "${backend}". Choose one of: ${BACKENDS.join(", ")}.`);
const frontends = [...new Set((opts.frontend ?? ["web"]).flatMap((f) => f.split(",")).map((f) => f.trim()).filter(Boolean))].sort();
for (const f of frontends) if (!FRONTENDS.includes(f)) fail(`Unknown frontend "${f}". Choose from: ${FRONTENDS.join(", ")}.`);
if (!frontends.length) fail("Pick at least one frontend.");
const chosen = new Set([backend, ...frontends]);
const web = chosen.has("web");
// A Swift type name: "my-notes" -> "MyNotes".
const typeName = name.split("-").map((w) => w[0].toUpperCase() + w.slice(1)).join("");
const dest = resolve(opts.dir ?? name);
if (existsSync(dest) && readdirSync(dest).length) fail(`${dest} already exists and isn't empty.`);

const github = !opts["no-github"];
let owner;
if (github) {
  for (const tool of ["git", "gh"]) if (!succeeds(tool, ["--version"])) fail(`${tool} isn't installed; it's needed to create the repo (or pass --no-github).`);
  try {
    owner = opts.owner ?? out("gh", ["api", "user", "--jq", ".login"]);
  } catch {
    fail("gh isn't signed in. Run `gh auth login` first.");
  }
  if (succeeds("gh", ["repo", "view", `${owner}/${name}`])) fail(`github.com/${owner}/${name} already exists.`);
}
warnIfStale();

// 1. The files.
console.log(`==> Writing ${name} (backend: ${backend}; frontends: ${frontends.join(", ")}) to ${relative(process.cwd(), dest) || "."}`);
copyPart("base", "");
copyPart(`backend/${backend}`, "backend");
for (const f of frontends) copyPart(`frontend/${f}`, PARTS_DEST[f] ?? f);
writePackageFiles();

if (!github) {
  console.log(`\nWrote ${dest}. Nothing was created on GitHub.`);
  process.exit(0);
}

// 2. The repo. Its first push runs Deploy, which fails until the app is registered.
console.log(`==> Creating github.com/${owner}/${name} and pushing`);
const git = (...args) => execFileSync("git", args, { cwd: dest, stdio: ["ignore", "ignore", "inherit"] });
git("init", "-q", "-b", "main");
git("add", "-A");
git("commit", "-q", "-m", `Create ${name} with create-new-app\n\nBackend: ${backend}. Frontends: ${frontends.join(", ")}.`);
execFileSync("gh", ["repo", "create", `${owner}/${name}`, opts.private ? "--private" : "--public", "--source", dest, "--remote", "origin", "--push"], {
  stdio: "inherit",
});

// 3. The registration PR in infrastructure, which puts the app online.
let registered = false;
if (!opts["no-register"]) {
  console.log(`==> Starting ${owner}/infrastructure's Register app workflow for ${name}`);
  registered = succeeds("gh", ["workflow", "run", "register-app.yml", "-R", `${owner}/infrastructure`, "-f", `name=${name}`], "inherit");
  if (!registered) console.warn(`    Couldn't start it. Run Actions → Register app in ${owner}/infrastructure with "${name}".`);
}

console.log(`
Created https://github.com/${owner}/${name} in ${dest}.
${registered ? `The registration PR opens in a minute at https://github.com/${owner}/infrastructure/pulls.` : `Register it: Actions → Register app in ${owner}/infrastructure.`}
The first Deploy fails until that PR is merged. Then deploy with
  gh workflow run deploy.yml -R ${owner}/${name}
and it's live at https://waynezhu.dev/apps/${name}/ (API at /api/${name}/).`);

// Copies template/<from> into the app at <to>, filling in the choices and the name.
function copyPart(from, to) {
  const src = join(template, from);
  for (const file of listFiles(src)) {
    const target = join(dest, to, fill(file));
    mkdirSync(dirname(target), { recursive: true });
    const bytes = readFileSync(join(src, file));
    if (bytes.includes(0)) {
      writeFileSync(target, bytes); // binary: as is
      continue;
    }
    const text = fill(choose(bytes.toString("utf8"), `${from}/${file}`));
    // A file that's only conditional text for other choices isn't written.
    if (text.trim() || !bytes.toString("utf8").trim()) writeFileSync(target, text, { mode: statSync(join(src, file)).mode });
  }
}

function fill(text) {
  return text.replaceAll("__APP_TYPE__", typeName).replaceAll("__APP__", name);
}

// Keeps the text inside `if` blocks that match the choices, and drops the markers.
function choose(text, where) {
  const marker = /^[ \t]*(?:#|<!--) (if [\w!,]+|else|end)(?: -->)?[ \t]*\r?\n|<!-- (if [\w!,]+|else|end) -->/gm;
  const stack = [];
  let result = "";
  let last = 0;
  const keeping = () => stack.every((s) => s.keep);
  for (const m of text.matchAll(marker)) {
    if (keeping()) result += text.slice(last, m.index);
    last = m.index + m[0].length;
    const word = m[1] ?? m[2];
    if (word.startsWith("if ")) {
      const keep = word.slice(3).split(",").some((c) => (c.startsWith("!") ? !chosen.has(c.slice(1)) : chosen.has(c)));
      stack.push({ keep, else: false });
    } else if (!stack.length) {
      fail(`${where}: "${word}" without an "if"`);
    } else if (word === "else") {
      const top = stack.at(-1);
      if (top.else) fail(`${where}: two "else"s in one "if"`);
      top.keep = !top.keep;
      top.else = true;
    } else {
      stack.pop();
    }
  }
  if (stack.length) fail(`${where}: an "if" without an "end"`);
  if (keeping()) result += text.slice(last);
  return result;
}

// The root package.json, and package-lock.json for the npm parts. The lockfile
// comes from this repo's own (template/ is its workspaces), so every app starts
// from the versions the checks ran with.
function writePackageFiles() {
  const workspaces = [...(web ? ["frontend"] : []), ...(backend === "ts" ? ["backend"] : [])];
  const scripts = {
    ts: { "dev:backend": "npm run dev --workspace=backend" },
    python: { "dev:backend": "cd backend && uv run --env-file=.env python -m app --reload" },
  }[backend];
  const dev = ["npm run dev:backend", ...(web ? ["npm run dev --workspace=frontend"] : [])].join(" & ");
  const pkg = { name, version: "1.0.0", private: true, scripts: { dev, ...scripts }, ...(workspaces.length ? { workspaces } : {}) };
  writeFileSync(join(dest, "package.json"), JSON.stringify(pkg, null, 2) + "\n");
  if (!workspaces.length) {
    rmSync(join(dest, ".nvmrc")); // no Node code to pin
    return;
  }

  const lock = JSON.parse(readFileSync(join(root, "package-lock.json"), "utf8"));
  const moves = { "template/frontend/web": "frontend", "template/backend/ts": "backend" };
  const move = (path) => {
    for (const [from, to] of Object.entries(moves)) if (path === from || path.startsWith(from + "/")) return to + path.slice(from.length);
    return path;
  };
  const packages = {};
  for (const [path, entry] of Object.entries(lock.packages)) {
    if (path === "") continue;
    const moved = move(path);
    const workspace = Object.values(moves).find((w) => moved === w || moved.startsWith(w + "/") || moved === `node_modules/${w}`);
    if (workspace && !workspaces.includes(workspace)) continue;
    packages[moved] = entry.link ? { ...entry, resolved: move(entry.resolved) } : entry;
  }
  lock.name = name;
  lock.packages = { "": { name, version: "1.0.0", workspaces }, ...packages };
  writeFileSync(join(dest, "package-lock.json"), JSON.stringify(lock, null, 2) + "\n");
  if (workspaces.length < Object.keys(moves).length) {
    // Drop what only the left-out workspace needed. Versions already locked stay.
    console.log("==> Trimming package-lock.json");
    execFileSync("npm", ["install", "--package-lock-only", "--ignore-scripts", "--no-audit", "--no-fund", "--loglevel=error"], { cwd: dest, stdio: "inherit" });
  }
}

function listFiles(dir, prefix = "") {
  const skip = new Set(["node_modules", "dist", ".venv", "__pycache__", ".env", ".DS_Store", "xcuserdata", "DerivedData"]);
  return readdirSync(join(dir, prefix), { withFileTypes: true }).flatMap((e) => {
    if (skip.has(e.name)) return [];
    const rel = prefix ? `${prefix}/${e.name}` : e.name;
    return e.isDirectory() ? listFiles(dir, rel) : [rel];
  });
}

// A local checkout that's behind GitHub would make an app from old files.
function warnIfStale() {
  if (!existsSync(join(root, ".git"))) return;
  try {
    // A shallow clone (CI) has no history to compare.
    if (out("git", ["rev-parse", "--is-shallow-repository"], { cwd: root }) === "true") return;
    execFileSync("git", ["fetch", "-q", "origin", "main"], { cwd: root, stdio: "ignore", timeout: 15000 });
    const behind = out("git", ["rev-list", "--count", "HEAD..FETCH_HEAD"], { cwd: root });
    if (behind !== "0") console.warn(`warning: ${root} is ${behind} commit(s) behind GitHub's main; \`git -C ${root} pull\` for the latest.`);
  } catch {
    // Offline or no remote: use what's here.
  }
}

function out(cmd, args, options = {}) {
  return execFileSync(cmd, args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], ...options }).trim();
}
function succeeds(cmd, args, stderr = "ignore") {
  try {
    execFileSync(cmd, args, { stdio: ["ignore", "ignore", stderr] });
    return true;
  } catch {
    return false;
  }
}
function fail(message) {
  console.error(message);
  process.exit(1);
}
