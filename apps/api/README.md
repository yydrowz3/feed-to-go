# Feed to Go API

The Go backend for [Feed to Go](../../README.md), a short-video sharing application.
It provides HTTP APIs, media uploads, authentication, social interactions, private
messages, and background processing for feeds and notifications.

## Features

- Account registration, login, token refresh, password changes, and profiles.
- Video publishing, cover images, and resumable uploads with chunk checksums.
- Latest, following, most-liked, popularity, and tag-based feeds.
- Likes, comments, follows, and private messages.
- Notification storage and Server-Sent Events (SSE).
- Redis caching and rate limiting, RabbitMQ consumers, and outbox processing.
- Combined or separate API and worker processes with graceful shutdown.

Some backend capabilities are not exposed by the current frontend. See the
[frontend guide](../web/README.md) for its supported flows and limitations.

## Technology and Requirements

| Area | Tools |
| --- | --- |
| Language | Go 1.27.2, as declared in `go.mod` |
| HTTP | Gin |
| Persistence | PostgreSQL, GORM, pgx |
| Cache | Redis, go-redis |
| Messaging | RabbitMQ, amqp091-go |
| Authentication | JWT, bcrypt |
| Configuration and logging | Environment variables, godotenv, YAML, Zap |
| Testing | Go test runner, miniredis, injected dependencies |

Use [go.mod](go.mod) and [go.sum](go.sum) as the source of truth for dependencies.
Use Go 1.27.2 or a compatible newer toolchain. PostgreSQL, Redis, and RabbitMQ
are required for the complete application. Node.js is needed only when running
the repository's shared error-code generator or frontend tooling.

## Project Structure

```text
apps/api/
  cmd/
    app/              # Combined API and business consumers
    server/           # API and associated background tasks
    worker/           # Business consumers
  configs/            # YAML profiling configuration
  internal/
    api/              # Router, CORS, and API runtime
    app/              # Startup, connections, readiness, and shutdown
    auth/             # JWT handling and authentication middleware
    config/           # Configuration loading
    services/         # Account, video, feed, social, and messaging services
    util/             # Shared internal helpers
    worker/           # Consumers, outbox, and notification hub
  pkg/
    apierror/         # Shared API error responses and generated codes
    cache/            # Redis support
    logging/          # Zap initialization
    mq/               # RabbitMQ connections, topology, and publishers
    observability/    # pprof server
    persistence/      # Database connection and schema migration
    ratelimit/        # Request rate limiting
  .env.example        # Environment variable template
  go.mod
  go.sum
```

## Local Setup

The following examples use PowerShell and start at the repository root.
Install PostgreSQL, Redis, and RabbitMQ separately; these commands do not
provision the backing services.

```powershell
cd apps/api
go mod download
if (!(Test-Path .env)) { Copy-Item .env.example .env }
```

Create a dedicated development database and a database user with permission to
manage its schema. Configure `.env` for your local services. Replace the user,
password, database name, broker URI, and JWT secret in this example:

```dotenv
APP_ENV=dev
PORT=8095
WEB_URL=http://localhost:5173

DB_HOST=127.0.0.1
DB_PORT=5432
DB_USER=feed_to_go
DB_PASSWORD=replace-with-your-local-password
DB_NAME=feed_to_go
DB_SSLMODE=disable

REDIS_HOST=127.0.0.1
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_DB=0
REDIS_TLS=false

AMQP_URL=amqp://guest:guest@127.0.0.1:5672/
JWT_SECRET=replace-with-a-long-random-secret
```

These settings are for local development. Use a dedicated Redis instance or
database number and RabbitMQ vhost for tests. Never commit real credentials or
local `.env` files.

Start the complete application from `apps/api`:

```powershell
go run ./cmd/app
```

The combined entry point requires all three backing services. Startup performs
GORM schema migrations, declares messaging topology, and starts background tasks
before accepting HTTP requests. It does not create the PostgreSQL database itself.

## Entry Points

| Command | Responsibilities | Dependencies |
| --- | --- | --- |
| `go run ./cmd/app` | API and all consumers in one process | PostgreSQL, Redis, and RabbitMQ required |
| `go run ./cmd/server` | API, outbox, timeline, and notification tasks | PostgreSQL required; Redis and RabbitMQ can be unavailable with reduced functionality |
| `go run ./cmd/worker` | Follow, like, comment, and popularity consumers | PostgreSQL and RabbitMQ required; Redis optional |

For separate processes, run the server and worker in separate terminals. The
API and combined modes perform migrations; worker mode does not. Initialize the
schema through the API or combined mode before starting workers on a new database.

The combined entry point needs neither `ENABLE_WORKER` nor an additional worker
process. Do not normally run the standalone worker alongside it. Missing Redis
disables Redis-dependent processing, and chunk uploads require Redis even when
the API can start in a degraded mode.

## Configuration

Run commands from `apps/api`: `.env`, the default YAML path, and upload paths are
resolved relative to the working directory. Existing process environment
variables take precedence over `.env`.

| Variables | Purpose |
| --- | --- |
| `APP_ENV` | `dev` allows all CORS origins; `production` or `prod` selects production Zap logging |
| `PORT` | HTTP port; defaults to `8095` when unset |
| `WEB_URL` | Allowed frontend origin outside dev; defaults to `http://localhost:5173` |
| `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` | PostgreSQL connection settings |
| `DB_SSLMODE`, `DB_CHANNEL_BINDING` | PostgreSQL transport and channel-binding settings |
| `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`, `REDIS_DB` | Native Redis connection settings |
| `REDIS_TLS` | Enables TLS for Redis when `true` |
| `AMQP_URL` | Full `amqp://` or `amqps://` connection URI; takes precedence over separate broker fields |
| `AMQP_HOST`, `AMQP_PORT`, `AMQP_USER`, `AMQP_PASSWORD`, `AMQP_VHOST`, `AMQP_TLS` | Alternative RabbitMQ connection settings |
| `JWT_SECRET` | Stable JWT signing secret |
| `CONFIG_PATH` | YAML file path; defaults to `configs/config.yaml` |

See [.env.example](.env.example) for all connection fields and accepted TLS
options. The application does not read `DATABASE_URL` or `REDIS_URL`. Redis
configuration expects a native Redis connection, not a REST endpoint.

Set a strong, stable `JWT_SECRET`. When it is unset, the process normally generates
a random signing key, invalidating existing tokens after restart. Separate API
processes must use the same signing secret for consistent token validation.

### Profiling and Logging

YAML currently configures observability; server and service connection settings
come from environment variables. The checked-in
[configs/config.yaml](configs/config.yaml) enables pprof on `localhost:6060` for
API/combined mode and `localhost:6061` for worker mode. If the YAML file is missing,
the local fallback also enables these profiling defaults. Malformed YAML fails
configuration loading.

Disable profiling when it is not needed by setting `observability.pprof.enabled`
to `false` in the YAML configuration, or restrict access to a trusted interface.
pprof is separate from the HTTP API and is not a public health-check endpoint.

Zap uses production logging for `APP_ENV=production` or `APP_ENV=prod`; other
values use development logging.

### Frontend Access and CORS

For environments other than `APP_ENV=dev`, set `WEB_URL` to one exact frontend
origin, including scheme and port, without a path or trailing slash. For example:

```dotenv
APP_ENV=production
WEB_URL=http://localhost:5173
```

`localhost` and `127.0.0.1` are different origins. Restart the backend after
configuration changes. Allowed preflight methods are GET, HEAD, POST, and OPTIONS;
allowed headers include Authorization, Content-Type, and Range. Cross-origin
cookie credentials are not enabled. See [CORS configuration](../../docs/backend-cors.md).

The frontend separately uses `VITE_API_BASE=http://localhost:8095`. `WEB_URL`
identifies the frontend origin; it is not the API base URL.

## Health and Lifecycle

Check the combined application from another terminal:

```powershell
Invoke-RestMethod http://localhost:8095/healthz
Invoke-RestMethod http://localhost:8095/readyz
```

- `GET /healthz` returns `200 {"status":"ok"}` when the HTTP server is available.
- `GET /readyz` is registered only in combined mode. It checks PostgreSQL, Redis,
  broker connection state, background readiness, and shutdown state. It returns
  `200 {"status":"ok"}` or `503 {"status":"not_ready"}`.
- Standalone worker mode does not expose an HTTP health endpoint.

Combined mode starts four business consumers, one timeline consumer, three
notification consumers, and an outbox loop. Consumer channel failures trigger
registration retries; a lost RabbitMQ connection terminates the process so a
supervisor can restart it. Existing queue declaration conflicts fail startup;
the application does not delete queues automatically.

SIGINT or SIGTERM marks the application unready, ends SSE streams, drains HTTP
requests, stops background work, and closes shared connections. Shutdown budgets
are up to 10 seconds for HTTP, 10 seconds for background tasks, and 5 seconds for
connection cleanup. Normal signal shutdown exits successfully; runtime failures
and shutdown timeouts produce a nonzero exit status.

Queue-backed changes can be eventually consistent. Delivery retries are bounded,
and processing does not guarantee exactly-once delivery. See the
[lifecycle guide](../../docs/backend-render.md) for recovery and shutdown details.

## HTTP API Overview

Business endpoints generally use POST with JSON bodies; file uploads use
multipart form data. Routes are registered directly at the server root, without
an implicit `/api` prefix. Protected business routes expect:

```http
Authorization: Bearer <access-token>
```

| Area | Representative routes |
| --- | --- |
| Accounts | `POST /account/register`, `/account/login`, `/account/refresh`, `/account/getProfile` |
| Video | `POST /video/getDetail`, `/video/uploadCover`, `/video/publish` |
| Chunk uploads | `POST /video/chunk/init`, `/video/chunk/upload`, `/video/chunk/status`, `/video/chunk/complete` |
| Feeds | `POST /feed/listLatest`, `/feed/listLikesCount`, `/feed/listByPopularity`, `/feed/listByTag`, `/feed/listByFollowing` |
| Likes | `POST /like/like`, `/like/unlike`, `/like/isLiked`, `/like/listMyLikedVideos` |
| Comments | `POST /comment/listAll`, `/comment/publish`, `/comment/delete` |
| Follows | `POST /social/follow`, `/social/unfollow`, `/social/getAllFollowers`, `/social/getAllVloggers` |
| Private messages | `POST /message/send`, `/message/list` |
| Notifications | `GET /notification/stream`; `POST /notification/list`, `/notification/markRead`, `/notification/unreadCount` |
| Static media | `GET /static/...` and HEAD requests |

The method shown at the start of each group applies to its listed routes unless
another method is specified. Public, optional-authentication, and protected routes
are mixed across groups. Consult [router.go](internal/api/router.go), the service
request types, and [notification handlers](internal/worker/ssehub.go) for exact
authentication and payload requirements. Endpoint names and capitalization must
match the registered routes.

Endpoints covered by the shared error contract return errors such as:

```json
{
  "code": "AUTH_REQUIRED",
  "error": "authentication required"
}
```

Successful response shapes vary by endpoint. Some older and notification
endpoints retain their existing error formats. See the
[API error-code contract](../../docs/api-error-codes.md) for covered operations,
HTTP status codes, and compatibility requirements.

## Media Storage and Uploads

Uploaded media is stored under `.run/uploads` relative to the API working
directory and served through `/static`. The process needs write permission;
returned media URLs must be reachable from the browser. Provide persistent
storage and backups for deployments where local files can be replaced or lost.

The frontend upload flow accepts MP4 videos up to **200 MiB** and cover images
up to **10 MiB**. It uses **5 MiB** chunks with per-chunk and whole-file MD5
checksums. Chunk session state is stored in Redis with a **24-hour** TTL that
can be refreshed during resume. Resume requires both valid session metadata and
the corresponding uploaded chunks. See the
[chunk request types](internal/services/chunk/entity.go) and
[upload handlers](internal/services/chunk/handler.go) for the protocol.

## Development and Validation

Run backend checks from `apps/api`:

```powershell
go test ./...
go vet ./...
go build ./cmd/app ./cmd/server ./cmd/worker
```

Format changed Go files with `gofmt`. For concurrency or lifecycle changes,
run the relevant race checks on a supported platform with a working C toolchain:

```powershell
go test -race ./internal/app ./internal/worker ./internal/api ./pkg/mq ./pkg/cache
```

Default tests use injected dependencies, in-memory Redis, and temporary local
listeners; they do not start the command entry points or require your `.env`.
Real integration checks should use a dedicated PostgreSQL database or schema,
Redis instance or database number, RabbitMQ vhost, accounts, and media. Verify
authentication, uploads, Range requests, social actions, consumer recovery, and
graceful shutdown separately from fixture-based tests.

### Shared Error-Code Generation

Edit [shared/error-codes.json](../../shared/error-codes.json), then run from
`apps/api` with the repository's supported Node.js version:

```powershell
node ../../scripts/generate-error-codes.mjs
node ../../scripts/generate-error-codes.mjs --check
```

Commit the shared definition and both Go and TypeScript generated outputs.
Do not edit `pkg/apierror/codes.gen.go` directly. The generator needs no additional
Node dependencies. Frontend contributors can use the equivalent pnpm scripts.

## Build and Deployment

Build and run the combined application on Windows from `apps/api`:

```powershell
go build -o app.exe ./cmd/app
.\app.exe
```

On Linux, including the documented Render service configuration:

```sh
go build -o app ./cmd/app
./app
```

Keep `apps/api` as the working directory or provide the configuration and upload
paths appropriate to your packaged application. Supply environment variables for
all required services, use `APP_ENV=production`, set a stable `JWT_SECRET`,
configure `WEB_URL`, and use `/readyz` for combined-mode readiness checks.

The notification hub keeps connected clients in process memory. The documented
combined deployment uses one instance; do not assume notifications are broadcast
across independently running API instances. See the
[deployment guide](../../docs/backend-render.md) for service settings, switching
between combined and separate processes, and rollback instructions.

## Related Documentation

- [Project overview](../../README.md)
- [Frontend guide](../web/README.md)
- [Backend deployment and lifecycle](../../docs/backend-render.md)
- [CORS configuration](../../docs/backend-cors.md)
- [API error-code contract](../../docs/api-error-codes.md)
- [Integration verification](../../docs/tasks/integration/integration-test-verification.md)
- [Contributing](../../CONTRIBUTING.md)
- [Commit conventions](../../docs/commit-conventions.md)
- [Code of Conduct](../../CODE_OF_CONDUCT.md)
- [Security policy and private vulnerability reporting](../../SECURITY.md)

Some detailed implementation records are currently written in Chinese. Their
recorded validation results apply to their stated revisions.

## License

Licensed under the project's [MIT License](../../LICENSE).
