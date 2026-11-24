## Backend (Python)

- Python 3.13, FastAPI, dependencies managed with uv (`backend/pyproject.toml`, `backend/uv.lock`). Add one with `cd backend && uv add <package>` and commit `uv.lock`; the Docker build uses `uv sync --locked`. The image is Debian slim, so packages like numpy and pandas install from wheels.
- Code is in `backend/app`; `python -m app` (`__main__.py`) runs uvicorn on `PORT`, which finishes its requests on SIGTERM. Keep it that way.
- `API_BASE`/`APP_BASE` come from `backend/app/paths.py`.
- Sign-in: a route parameter typed `CurrentUser` (or `MaybeUser`) from `backend/app/auth.py` gets the signed-in user or answers 401.
- Schema changes are plain SQL migrations: `cd backend && uv run python -m app.migrate create <name>` makes `backend/migrations/<timestamp>_<name>.sql`. `app/migrate.py` applies new ones on startup, each in its own transaction; there are no down migrations.
- Database access goes through the pool in `backend/app/db.py` (psycopg 3, async).
