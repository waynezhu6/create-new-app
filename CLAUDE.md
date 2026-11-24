# create-new-app

The command that makes new apps for Wayne's VPS at `waynezhu.dev` (see README.md). It used to be the `app-template` GitHub template. Server-side details (Caddy, Postgres, registration, secrets) live in the [infrastructure](https://github.com/waynezhu6/infrastructure) repo, not here.

## Creating a new app

When asked to start a new service:

1. Pick the choices, asking if the user didn't say: the backend (`ts`, Express, the default; or `python`, FastAPI with uv, for data work like pandas, numpy or models) and the frontends (`web`, `ios`, or both).
2. Run `create-new-app <name> --backend … --frontend …` where `gh` is signed in as Wayne: on his Mac (Remote Control), since this cloud environment can't create GitHub repos. Name: lowercase letters, digits and dashes. It creates and pushes the repo and starts infrastructure's Register app workflow, which opens the registration PR. Tell the user to merge that PR, then run `gh workflow run deploy.yml -R waynezhu6/<name>`; the app is live at `waynezhu.dev/apps/<name>/`, with no DNS step.
3. The new repo needs no deploy secrets. App-specific secrets (API keys) go in its Actions secrets, listed by name under `env` in the Deploy step of `deploy.yml` (never `toJSON(secrets)`); never in its files.
4. Add the new repo to the session, then build the app there, following its own `CLAUDE.md`.

## Working on this repo

- `template/base` is in every app; `template/backend/<lang>` becomes `backend/`; `template/frontend/web` becomes `frontend/` and `template/frontend/ios` becomes `ios/`. Text that depends on the choices sits between `# if <choice>` / `# else` / `# end` lines (`<!-- if … -->` in Markdown, also inline). `__APP__` and `__APP_TYPE__` are filled in. `bin/create-new-app.mjs` does all of it; keep it dependency-free.
- Write template files as the app's own files: the app's `README.md` and `CLAUDE.md` are in `template/base`, so a convention change goes there.
- A change to one backend should usually be mirrored in the other (auth, paths, `/api/me`, migrations on startup, SIGTERM). Both must keep the deployer's contract: one image `ghcr.io/<owner>/<name>-backend` built from `backend/Dockerfile` with `--build-arg APP=<name>`, serving port 3001 with `/api/health`, with a page at `/app/frontend/dist` (a placeholder when there's no web frontend), running migrations before it listens and exiting cleanly on SIGTERM. `template/base/.github/workflows/deploy.yml` carries the other half; don't change it without a reason.
- The iPhone starter signs in with a per-app API key from the auth service, sent as `Authorization: Bearer`; the backends accept it as they do a signed-in browser.
- After changing an npm dependency in `template/`, run `npm install` at the root and commit `package-lock.json`: new apps get their lockfile from it. Python dependencies: `cd template/backend/python && uv lock`.
- Try a change with `node bin/create-new-app.mjs demo --backend … --frontend … --no-github --dir /tmp/demo`. The `Check` workflow builds and checks several combinations on every PR.
- Don't add server details (hostnames, Caddy config, DB credentials); they belong in infrastructure.
