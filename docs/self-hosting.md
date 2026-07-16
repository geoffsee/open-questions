# Self-hosting Open Questions

The root Docker image runs one Muxox-supervised container with three endpoints:

- action API and cron scheduler on port `3030`
- pre-rendered client UI on port `3031`
- Muxox Web UI on port `3032`
- application API on port `3040`

The API stores run history and cron claims in SQLite under `/data`. Workflows
and local actions are loaded from the fixed `/workspace/.github` mount.

## Requirements

- Docker Engine or Docker Desktop
- Ports `3030`, `3031`, `3032`, and `3040`, or alternative host port mappings

## Run with Compose

From the repository root:

```bash
docker compose up --build -d
```

Open the client at <http://localhost:3031> and Muxox at
<http://localhost:3032>. Check the API at <http://localhost:3030/health>.

The root `compose.yml` mounts `.github` read-only and stores SQLite data in
the named `open-questions_action-data` volume. Place secrets and workflow
environment values in the ignored optional `.env.actions` file.

## Run with Docker

```bash
docker pull ghcr.io/geoffsee/open-questions
docker run --detach \
  --name open-questions-actions \
  --publish 3030:3030 \
  --publish 3031:3031 \
  --publish 3032:3032 \
  --publish 3040:3040 \
  --env-file .env.actions \
  --volume "$PWD/.github:/workspace/.github:ro" \
  --volume open-questions-action-data:/data \
  --restart unless-stopped \
  ghcr.io/geoffsee/open-questions
```

Omit `--env-file .env.actions` when the file is not needed.

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3030` | Action API port |
| `PAGES_ORIGIN` | `http://localhost:3031` | Client origin allowed for OAuth redirects |
| `GITHUB_CLIENT_ID` | unset | Optional GitHub OAuth client ID |
| `GITHUB_CLIENT_SECRET` | unset | Optional GitHub OAuth client secret |
| `REPOSITORY_ROOT` | `/workspace` | Repository root containing `.github` |
| `DATABASE_URL` | `sqlite:///data/local-action.sqlite` | Run and cron state |
| `API_TOKEN` | unset | Optional bearer token protecting API routes except health |

The application API is available at `http://localhost:3040`. Its user-facing
OAuth and API-key endpoints are under `/auth`; the action API remains at
`http://localhost:3030`.

`API_TOKEN` protects the local action API only. The application API uses GitHub
OAuth to identify users and issue per-user `up_live_...` API keys. Configure
`GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, and `PAGES_ORIGIN` in
`.env.actions` for self-hosted OAuth. If OAuth is unavailable, users cannot
log in or create contribution API keys; the application API remains available
for public, read-only data.

## Operations

```bash
docker compose ps
docker compose logs --follow
curl --fail http://localhost:3030/health
docker compose down
```

The named data volume remains after `docker compose down`. Use
`docker compose down --volumes` only when the stored action history and cron
claims should be deleted.
