## Sign-in

Apps share one passkey sign-in, the [auth](https://github.com/waynezhu6/auth) service at `/apps/auth/`. Its session cookie reaches every app's backend, and `backend/app/auth.py` asks the service who it belongs to:

```python
from .auth import CurrentUser

@app.get("/api/notes")
async def notes(user: CurrentUser):
    ...  # key data on user.id
```

A route with a `CurrentUser` parameter answers 401 when nobody is signed in. On a 401 the frontend sends the browser to the sign-in page, which returns it here afterwards:

```ts
import { api, loginUrl } from './api'

const res = await api('/notes')
if (res.status === 401) location.assign(loginUrl())
```

`MaybeUser` gives the user or `None`, for routes that work either way. Locally there's no auth service: `AUTH_DEV_USER` in `backend/.env` signs you in as that name, and removing it signs you out. Accounts are invite-only; see auth's README.

Callers that can't sign in, like a script or an iOS Shortcut, use an API key: make one for this app on auth's admin page and send it as `Authorization: Bearer wz_…`. `CurrentUser` accepts it the same way, and `user.key` holds the key's name (it's `None` for a signed-in browser). A key made for another app is refused.

## Python backend

Dependencies are managed with [uv](https://docs.astral.sh/uv/): `cd backend && uv add pandas`, then commit `pyproject.toml` and `uv.lock`. `npm run dev` runs the backend with `uv run`, which installs them on first use.

## Database

```python
from .db import pool

async with pool.connection() as conn:
    rows = await (await conn.execute("select * from notes where owner = %s", (user.id,))).fetchall()
```

Migrations are plain SQL files in `backend/migrations`, applied in name order:

```bash
cd backend
uv run python -m app.migrate create add-notes             # makes migrations/<timestamp>_add-notes.sql
uv run --env-file=.env python -m app.migrate up           # apply by hand; startup does it too
```

Migrations run automatically on backend startup, before it takes requests, each in its own transaction. If one fails the backend exits, so the deploy fails its health check and the previous version keeps serving. There are no down migrations; undo a change with a new one.

Deploys don't stop the app: the new version starts and migrates while the old one still serves, then takes over. So a migration must leave the schema usable by the previous version: add tables and columns freely, but drop or rename one only in a later deploy, once no shipped code uses it.
