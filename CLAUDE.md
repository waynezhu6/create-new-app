# app-template

<!-- stack:summary -->
Starter for a service on Wayne's VPS: React + Vite frontend, Express + Postgres backend in TypeScript, deployed by `.github/workflows/deploy.yml`. Server-side details (Caddy, Postgres, registration, secrets) live in the [infrastructure](https://github.com/waynezhu6/infrastructure) repo, not here.
<!-- /stack:summary -->
<!-- template-only -->

`scripts/init.mjs` can swap the backend for Python (FastAPI); see below.
<!-- /template-only -->

<!-- template-only -->
## Creating a new app from this template

When asked to start a new service from this template:

1. Create the new repo from this template (GitHub "Use this template"), named with lowercase letters, digits and dashes. The repo name is the app name everywhere; nothing in the files needs renaming.
2. Register it in the infrastructure repo in the same go: on a branch there, run `scripts/register-app.sh <name>` and open a PR with the new `apps/<name>.caddy`. Tell the user to merge it. The app can then deploy and is live at `waynezhu.dev/apps/<name>/`; there's no DNS step.
3. Pick the backend's language and run `node scripts/init.mjs --lang ts|python` in the new repo, then commit everything it changed. `ts` (the default) is Express; `python` is FastAPI with uv, for data work (pandas, numpy, models). Ask if the user didn't say. The script swaps in that language's `backend/`, fills in its parts of this file and the README, and removes the other language and itself, so the new repo holds one language only. The deployer doesn't know or care which: both build the same kind of image.
4. The new repo needs no secrets: it deploys through infrastructure's deployer with a GitHub OIDC token. App-specific secrets (API keys) go in the repo's Actions secrets, listed by name under `env` in the Deploy step of `deploy.yml` (never `toJSON(secrets)`, which GitHub holds as possibly malicious); never in the repo's files.
5. Then build the app in the new repo.

## Working on this template

The TypeScript backend lives in `backend/`, so the template works as is. Other languages live in `stacks/<lang>/`: a `backend/` that replaces the TypeScript one, and `CLAUDE.backend.md` and `README.backend.md`, which replace the blocks between `<!-- stack:backend -->` markers here and in the README. Everything outside those is shared, so a fix to the frontend, `deploy.yml` or `infra.yml` lands once. `scripts/init.mjs` does the swap; `.github/workflows/template-check.yml` builds each language's image and checks its health route, migrations and SIGTERM exit. A change to one language's backend should usually be mirrored in the others (auth, paths, migrations on startup).
<!-- /template-only -->

## The deployer's contract

Whatever the language, the deployer runs one image `ghcr.io/<owner>/<name>-backend` (built from `backend/Dockerfile` with `--build-arg APP=<name>`) that:

- serves the backend on port 3001, with routes under `/api/*` and a `/api/health` route that must stay;
- holds the built frontend at `/app/frontend/dist`;
- runs its migrations on startup before it listens, and exits cleanly on SIGTERM, finishing its requests. During a deploy the new version migrates while the old one is still serving, so a migration must not break the code before it: add freely, drop or rename only in a later deploy. Never edit a migration that has shipped.

The server gives it `NODE_ENV=production` (for every language), `PORT=3001`, `DATABASE_URL` when `infra.yml` has `postgres: true`, and the repo's Actions secrets listed in `deploy.yml`.

## Conventions

- The app lives under a path prefix: frontend at `/apps/<name>/`, backend at `/api/<name>/` (Caddy strips it, so the backend still sees `/api/...`). Never hardcode `/` or `/api` URLs: the frontend calls the backend via `api()`/`apiUrl()` in `frontend/src/api.ts`, and the backend uses its `API_BASE`/`APP_BASE` for redirects, links and cookie paths. Cookies use `path: API_BASE`, because all apps share one domain.
- Sign-in comes from the shared auth service, never an app's own: the backend's auth module asks it who the request's cookie or API key belongs to (key data on `user.id`), and the frontend uses `loginUrl()` in `frontend/src/api.ts` on a 401. Locally `AUTH_DEV_USER` stands in.
- Database config comes from `DATABASE_URL` only.
- What the app needs from the server is declared in `infra.yml` (`postgres: true` gives it its database and `DATABASE_URL`). The deployer provisions it on each deploy; settings are listed in infrastructure's README. Don't provision anything by hand.
- Local dev: `docker compose -f docker-compose.dev.yml up -d`, `cp backend/.env.example backend/.env`, `npm run dev`, then open `http://localhost:5173/apps/<folder-name>/`.
- After adding or upgrading a frontend package, commit the updated root `package-lock.json`; CI and the Docker build use `npm ci`.

<!-- stack:backend -->
## Backend (TypeScript)

- ESM TypeScript in `backend/src`, Express; imports end in `.js`.
- `API_BASE`/`APP_BASE` come from `backend/src/paths.ts`.
- Sign-in: `requireUser`/`currentUser` in `backend/src/auth.ts` (`res.locals.user`).
- Schema changes are migrations: `cd backend && npm run migrate:create -- <name>` (ES modules in `backend/migrations`, run by `node-pg-migrate` on startup). Keep the SIGTERM handler in `backend/src/index.ts`, which lets the old version finish its requests.
- Database access goes through the pool in `backend/src/db.ts`.
<!-- /stack:backend -->

## Don't change without a reason

- The `deploy.yml` workflow and `backend/Dockerfile`. They carry the contract above with the infrastructure repo's deployer. How the container runs (name, networks, environment) is defined in infrastructure, not here.
- Don't add server details (hostnames, Caddy config, DB credentials) to this repo; they belong in infrastructure.
