# create-new-app

Makes a new app for my VPS at `waynezhu.dev`: one backend and one or more frontends, in a new GitHub repo that deploys on push.

```bash
create-new-app notes                                     # TypeScript backend, web frontend
create-new-app lab --backend python                       # Python backend (FastAPI + uv), for data work
create-new-app habits --frontend web --frontend ios       # web and iPhone apps sharing one backend
```

| Choice | Options | Becomes |
|---|---|---|
| `--backend` (one) | `ts` (default): Express, TypeScript, `node-pg-migrate`<br>`python`: FastAPI, Python 3.13 with uv, psycopg 3, SQL migrations | `backend/` |
| `--frontend` (one or more) | `web` (default): React 19 + Vite<br>`ios`: SwiftUI, iOS 17+ | `frontend/`, `ios/` |

Every combination deploys the same way, so nothing on the server depends on the choices.

## Setup, once

Needs Node 20+, git and the [GitHub CLI](https://cli.github.com) signed in (`gh auth login`).

```bash
git clone https://github.com/waynezhu6/create-new-app ~/Projects/create-new-app
cd ~/Projects/create-new-app && npm link      # puts create-new-app on your PATH
```

It warns if the clone is behind GitHub; `git pull` in it to update.

## What it does

1. Writes the app into `./<name>` (or `--dir`). The name is the app's name everywhere: repo, `waynezhu.dev/apps/<name>/`, `/api/<name>/`, its container and its database. Use lowercase letters, digits and dashes.
2. Makes it a git repo, creates `github.com/<you>/<name>` (public unless `--private`; public repos get free arm64 runners) and pushes `main`.
3. Starts infrastructure's Register app workflow, which opens the PR that registers the app. **Merge that PR**, then deploy with `gh workflow run deploy.yml -R <you>/<name>`. The first Deploy, from the initial push, fails until then.

`--no-github` only writes the folder, to look at what it makes. `--no-register` skips step 3. The app's own README and `CLAUDE.md` describe how to develop and deploy it.

## How it's put together

```
bin/create-new-app.mjs     the command (plain Node, no dependencies)
template/base/             in every app: deploy workflow, infra.yml, dev Postgres, README, CLAUDE.md
template/backend/ts/       → backend/
template/backend/python/   → backend/
template/frontend/web/     → frontend/
template/frontend/ios/     → ios/
```

Files that differ by choice say so inline, and the command keeps only the parts that apply:

```dockerfile
# if web
COPY --from=frontend /app/frontend/dist frontend/dist
# else
RUN mkdir -p frontend/dist && ... placeholder page ...
# end
```

`<!-- if python -->` … `<!-- end -->` does the same in Markdown, also inline. `if web,ios` means either; `if !web` means without. `__APP__` is replaced by the app's name and `__APP_TYPE__` by a Swift type name made from it (`my-notes` → `MyNotes`), in file contents and paths.

The root `package.json` makes `template/frontend/web` and `template/backend/ts` npm workspaces, so `npm install` here gives you both to work on, and every new app's `package-lock.json` comes from the one here. The `Check` workflow makes an app for several combinations and checks each image against the deployer's contract (port 3001, `/api/health`, `/app/frontend/dist`, migrations on startup, exit on SIGTERM), and builds the iPhone starter on macOS.
