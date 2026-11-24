# __APP__

An app on Wayne's VPS at `waynezhu.dev`, made with [create-new-app](https://github.com/waynezhu6/create-new-app). Server-side details (Caddy, Postgres, registration, secrets) live in the [infrastructure](https://github.com/waynezhu6/infrastructure) repo, not here.

## Layout

<!-- if ts -->
- `backend/`: the API in TypeScript (Express + Postgres), served at `waynezhu.dev/api/__APP__/`.
<!-- end -->
<!-- if python -->
- `backend/`: the API in Python (FastAPI + Postgres, uv), served at `waynezhu.dev/api/__APP__/`.
<!-- end -->
<!-- if web -->
- `frontend/`: the web app (React + Vite), served at `waynezhu.dev/apps/__APP__/`.
<!-- end -->
<!-- if ios -->
- `ios/`: the SwiftUI iPhone app, calling the same backend. Pushes that only touch `ios/` don't deploy.
<!-- end -->

`backend/`<!-- if web --> and `frontend/`<!-- end --> keep these names: the Dockerfile and infrastructure's deployer depend on them.

## The deployer's contract

The deployer runs one image `ghcr.io/<owner>/<name>-backend` (built from `backend/Dockerfile` with `--build-arg APP=<name>`) that:

- serves the backend on port 3001, with routes under `/api/*` and a `/api/health` route that must stay;
- holds the built web frontend at `/app/frontend/dist`<!-- if !web --> (this app has none, so the Dockerfile puts a placeholder page there; keep it)<!-- end -->;
- runs its migrations on startup before it listens, and exits cleanly on SIGTERM, finishing its requests. During a deploy the new version migrates while the old one is still serving, so a migration must not break the code before it: add freely, drop or rename only in a later deploy. Never edit a migration that has shipped.

The server gives it `NODE_ENV=production` (whatever the language), `PORT=3001`, `DATABASE_URL` when `infra.yml` has `postgres: true`, and the repo's Actions secrets listed under `env` in the Deploy step of `deploy.yml` (by name, never `toJSON(secrets)`); never put secrets in the repo's files.

## Conventions

- The app lives under a path prefix: <!-- if web -->frontend at `/apps/<name>/`, <!-- end -->backend at `/api/<name>/` (Caddy strips it, so the backend still sees `/api/...`). Never hardcode `/` or `/api` URLs: <!-- if web -->the frontend calls the backend via `api()`/`apiUrl()` in `frontend/src/api.ts`, and <!-- end -->the backend uses its `API_BASE`/`APP_BASE` for redirects, links and cookie paths. Cookies use `path: API_BASE`, because all apps share one domain.
- Sign-in comes from the shared auth service, never an app's own: the backend asks it who the request's cookie or API key belongs to (key data on `user.id`)<!-- if web -->, and the web frontend uses `loginUrl()` in `frontend/src/api.ts` on a 401<!-- end -->. Locally `AUTH_DEV_USER` stands in.
- Database config comes from `DATABASE_URL` only.
- What the app needs from the server is declared in `infra.yml` (`postgres: true` gives it its database and `DATABASE_URL`). The deployer provisions it on each deploy; settings are listed in infrastructure's README. Don't provision anything by hand.
- Local dev: `docker compose -f docker-compose.dev.yml up -d`, `cp backend/.env.example backend/.env`, `npm run dev`<!-- if web -->, then open `http://localhost:5173/apps/<folder-name>/`<!-- end -->.
<!-- if web,ts -->
- After adding or upgrading an npm package, commit the updated root `package-lock.json`; CI and the Docker build use `npm ci`.
<!-- end -->

<!-- if ts -->
## Backend (TypeScript)

- ESM TypeScript in `backend/src`, Express; imports end in `.js`.
- `API_BASE`/`APP_BASE` come from `backend/src/paths.ts`.
- Sign-in: `requireUser`/`currentUser` in `backend/src/auth.ts` (`res.locals.user`).
- Schema changes are migrations: `cd backend && npm run migrate:create -- <name>` (ES modules in `backend/migrations`, run by `node-pg-migrate` on startup). Keep the SIGTERM handler in `backend/src/index.ts`, which lets the old version finish its requests.
- Database access goes through the pool in `backend/src/db.ts`.
<!-- end -->
<!-- if python -->
## Backend (Python)

- Python 3.13, FastAPI, dependencies managed with uv (`backend/pyproject.toml`, `backend/uv.lock`). Add one with `cd backend && uv add <package>` and commit `uv.lock`; the Docker build uses `uv sync --locked`. The image is Debian slim, so packages like numpy and pandas install from wheels.
- Code is in `backend/app`; `python -m app` (`__main__.py`) runs uvicorn on `PORT`, which finishes its requests on SIGTERM. Keep it that way.
- `API_BASE`/`APP_BASE` come from `backend/app/paths.py`.
- Sign-in: a route parameter typed `CurrentUser` (or `MaybeUser`) from `backend/app/auth.py` gets the signed-in user or answers 401.
- Schema changes are plain SQL migrations: `cd backend && uv run python -m app.migrate create <name>` makes `backend/migrations/<timestamp>_<name>.sql`. `app/migrate.py` applies new ones on startup, each in its own transaction; there are no down migrations.
- Database access goes through the pool in `backend/app/db.py` (psycopg 3, async).
<!-- end -->
<!-- if ios -->
## iPhone app

- SwiftUI, iOS 17+, Swift 6, in `ios/__APP_TYPE__/`. The project uses a synchronized folder, so new files there are in the app without editing `project.pbxproj`.
- All backend calls go through `API` in `ios/__APP_TYPE__/API.swift`, which targets `https://waynezhu.dev/api/__APP__` (or `localhost:3001/api` from Debug's Settings switch). Add routes to the backend first, then call them from there; the web frontend and the app share them.
- The app signs in with an API key for this app (pasted into Settings, kept in the Keychain), sent as `Authorization: Bearer`. The backend treats it like a signed-in user. Don't add another way in.
<!-- end -->

## Don't change without a reason

- The `deploy.yml` workflow and `backend/Dockerfile`. They carry the contract above with the infrastructure repo's deployer. How the container runs (name, networks, environment) is defined in infrastructure, not here.
- Don't add server details (hostnames, Caddy config, DB credentials) to this repo; they belong in infrastructure.
