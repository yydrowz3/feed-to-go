# Contributing to Feed to Go

Thank you for contributing! Bug reports, documentation improvements, tests, and
code contributions are welcome. Please follow our [Code of Conduct](CODE_OF_CONDUCT.md)
in all project interactions.

## Before You Start

- Search existing issues and pull requests before opening a new one.
- For substantial features or architectural changes, open an issue to discuss
  the problem, proposed approach, and compatibility implications first.
- Keep each contribution focused on one problem and avoid unrelated refactoring,
  dependency upgrades, or formatting changes.
- Read the documentation for the area you are changing and any applicable
  `AGENTS.md` files present in your checkout.

Bug reports should include reproduction steps, expected and actual behavior,
the affected revision, relevant runtime versions, and sanitized logs or
screenshots. Feature requests should explain the use case and desired outcome.
Report security vulnerabilities privately to a maintainer using a published
contact method; avoid disclosing exploit details or credentials in public issues.

## Repository Layout

| Path | Purpose |
| --- | --- |
| `apps/api/` | Go API, background workers, and backend tests |
| `apps/api/cmd/` | Combined application, API server, and worker entry points |
| `apps/api/internal/` | Application setup, configuration, HTTP routing, and services |
| `apps/api/pkg/` | Backend support packages |
| `apps/web/` | React, TypeScript, and Vite frontend |
| `shared/` | Shared API error-code definitions |
| `scripts/` | Code generation and integration utilities |
| `docs/` | Architecture, configuration, task records, and project conventions |

## Development Requirements

- Go matching the version declared in [go.mod](apps/api/go.mod), currently 1.27.2.
- Node.js 24 or later and pnpm 12 or later, as declared in
  [package.json](apps/web/package.json).
- PostgreSQL, Redis, and RabbitMQ for the complete application and real-service
  integration checks.

Use the checked-in dependency manifests and lockfiles as the source of truth.
Frontend package commands run from `apps/web`; Go commands run from `apps/api`.
There is no root-level package installation step.

## Local Setup

Fork the repository if needed, clone your fork, and create a descriptive branch
from the target branch. The examples below use PowerShell and start at the
repository root.

### Backend

```powershell
cd apps/api
go mod download
if (!(Test-Path .env)) { Copy-Item .env.example .env }
```

Edit your local `.env` to configure a dedicated development PostgreSQL database,
Redis instance or database number, RabbitMQ vhost, and a random `JWT_SECRET`.
Use the `DB_*`, `REDIS_*`, and `AMQP_*` settings from
[.env.example](apps/api/.env.example); `AMQP_URL` can supply the full broker URI.
The application does not read `DATABASE_URL` or `REDIS_URL`.

The API defaults to port `8095`. Set `WEB_URL=http://localhost:5173` to match the
frontend origin. `APP_ENV=dev` allows any CORS origin for local development;
other values restrict access to `WEB_URL`. Existing process environment variables
take precedence over `.env`. See [CORS configuration](docs/backend-cors.md).

Start the complete application from `apps/api`:

```powershell
go run ./cmd/app
```

The combined entry point requires PostgreSQL, Redis, and RabbitMQ and runs the
HTTP API and all consumers in one process. Startup performs database migrations,
so use a development database. `/healthz` checks HTTP availability; `/readyz`
checks readiness of the combined application.

For separate processes, `go run ./cmd/server` starts the API and its associated
background tasks, and `go run ./cmd/worker` starts the business consumers. See
[backend entry points](docs/backend-render.md) for dependency requirements and
lifecycle behavior. Avoid running the separate worker alongside the combined
entry point during normal development.

### Frontend

Open another terminal at the repository root:

```powershell
cd apps/web
pnpm install --frozen-lockfile
if (!(Test-Path .env)) { Copy-Item .env.example .env }
```

Set the following value in `apps/web/.env`:

```dotenv
VITE_API_BASE=http://localhost:8095
```

Then start Vite:

```powershell
pnpm dev --host 127.0.0.1 --port 5173 --strictPort
```

Open `http://localhost:5173`. If you use a different host or port, update the
backend's `WEB_URL` accordingly and restart the backend. `localhost` and
`127.0.0.1` are different origins.

The frontend calls the backend and media URLs directly. `VITE_API_BASE` must be
an absolute HTTP(S) URL and does not implicitly add `/api`. Vite variables are
public build-time configuration; never put secrets in them. See the
[frontend README](apps/web/README.md) for further setup and behavior details.

## Making Changes

- Follow the structure and style of the surrounding code. Format changed Go
  files with `gofmt`; use the frontend's Oxfmt and Oxlint tooling for web changes.
- Keep backend HTTP handlers, business services, and persistence responsibilities
  consistent with the existing service modules.
- Reuse the frontend's API client, query patterns, form components, and session
  handling rather than adding parallel implementations.
- Keep user-facing frontend text in `apps/web/src/i18n/`. Update English,
  Simplified Chinese, and Japanese resources together, preserve translation keys,
  and check both light and dark themes for UI changes.
- Add or update focused tests when behavior changes. Update documentation for
  changes to configuration, API contracts, setup, or user-visible behavior.
- For frontend implementation changes, follow the version-update convention in
  [commit conventions](docs/commit-conventions.md): update the application version
  once per implementation unit and record the old and new values. The
  `pnpm version:bump` script performs a patch bump without a commit or tag; review
  the resulting manifest and lockfile changes together.
- Do not commit secrets, local `.env` files, private test credentials, uploaded
  media, build output, or local runtime artifacts.

### Shared API Error Codes

Edit `shared/error-codes.json` when changing registered API error codes. From
`apps/web`, regenerate and check the Go and TypeScript outputs:

```powershell
pnpm errors:generate
pnpm errors:check
```

Commit the shared definition and both generated files together. Do not edit
`codes.gen.go` or `error-codes.gen.ts` directly. Likewise, update route sources
rather than manually editing the generated frontend route tree. Explain changes
to HTTP status codes or compatibility in the pull request. See the
[API error-code contract](docs/api-error-codes.md).

## Validation

Run the checks relevant to your change and report their results. Documentation-only
changes generally need a review of wording, links, and examples rather than an
application build.

For backend changes, run from `apps/api`:

```powershell
go test ./...
go vet ./...
go build ./cmd/app ./cmd/server ./cmd/worker
```

For concurrency or application lifecycle changes, also run the relevant race
checks where your platform and C toolchain support them. The existing lifecycle
verification command is:

```powershell
go test -race ./internal/app ./internal/worker ./internal/api ./pkg/mq ./pkg/cache
```

For frontend changes, run from `apps/web`:

```powershell
pnpm test
pnpm lint
pnpm fmt:check
pnpm errors:check
pnpm build
```

`pnpm test` uses Node's test runner and fixtures without requiring a live backend.
`pnpm build` includes TypeScript checking and production bundling. If formatting
needs adjustment, use `pnpm exec oxfmt <changed-file>` to keep edits focused.

For browser regression, build the frontend and start the opt-in harness from
`apps/web`:

```powershell
pnpm test:browser --media C:/path/to/test.mp4
```

Supply a local test video, open the printed `http://127.0.0.1:5186/__checks` URL,
and click **Run checks**. Review the JSON results or `/__report`, then stop the
server with Ctrl+C. `BROWSER_TEST_PORT` overrides the port. The media argument is
optional, but valid video decoding is only checked when suitable media is supplied.
Starting the harness alone does not run or pass its checks.

The harness uses isolated API fixtures. Verify real-service flows separately
when your change affects authentication, uploads, media playback, CORS, messaging,
or asynchronous consumers. Use a dedicated database or schema, Redis instance or
database number, RabbitMQ vhost, accounts, and media. Clearly distinguish fixture
results from real-service results and disclose any checks you could not run.

## Commits and Pull Requests

Follow [commit message conventions](docs/commit-conventions.md). Every commit
message needs an emoji-prefixed Conventional Commits title and a nonempty body,
separated by a blank line. Use an English imperative description with a lowercase
first letter and no final period; aim for a title of at most 72 characters.

```text
🐛 fix(auth): preserve session state after token refresh

Explain the failure that triggered the change and how it is resolved.
Describe the affected behavior and the validation performed.
```

Use the appropriate type, such as `feat`, `fix`, `docs`, `test`, `refactor`,
`chore`, `style`, `perf`, `build`, `ci`, or `revert`. Describe breaking changes
with a `BREAKING CHANGE:` footer and explain the migration required.

Before submitting a pull request:

- Keep the diff focused and inspect it for accidental files or sensitive data.
- Explain the problem, resulting behavior, and any relevant tradeoffs.
- Link related issues and include reproduction steps for bug fixes.
- List the checks you ran, their results, and any remaining limitations.
- Include screenshots or recordings for visible UI changes, with relevant
  languages, themes, and viewport sizes.
- Describe compatibility, configuration, deployment-order, or migration changes.

Respond to review feedback and rerun affected checks after revisions. If your
change depends on external services or setup that reviewers cannot reproduce,
document those requirements in the pull request.
