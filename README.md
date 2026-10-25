<a name="readme-top"></a>

<p align="center">
  <a href="https://feed-to-go.onrender.com">
  <img src="./static/logo/feed-to-go-logo.png" alt="Feed-To-Go" width="280" />
  </a>
</p>

<div align="center">

**Feed To Go** brings short videos and people together.

Watch, share, and connect in one continuous feed.

Your next favorite moment is just a scroll away.

**English** · [Chinese](./README.zh-CN.md) · [Japanese](./README.ja.md) · [Official Site](https://feed-to-go.onrender.com) · [Feedback](https://github.com/yydrowz3/feed-to-go/issues)

</div>

<p align="center">
  <a href="https://feed-to-go.onrender.com">
  <img src="./static/banner/feed-to-go.png" alt="Feed-To-Go" />
  </a>
</p>

<p align="center">

A short-video sharing application with a **Go** backend and a **React** frontend. Browse video feeds, publish videos with resumable chunk uploads, and interact
through likes, comments, follows, and private messages.

</p>

<p align="center">
  <a href="https://feed-to-go.onrender.com">
  <img alt="live-demo-badge" src="https://img.shields.io/badge/Live Demo-Render-000000?logo=render" />
  </a>
</p>

<p align="center">
<img alt="Golang" src="https://img.shields.io/badge/-Go-00ADD8?style=flat-square&logo=go&logoColor=white" />
<img alt="React" src="https://img.shields.io/badge/-React-45b8d8?style=flat-square&logo=react&logoColor=white" />
<img alt="Gin" src="https://img.shields.io/badge/-Gin-008ECF?style=flat-square&logo=gin&logoColor=white" />
<img alt="PostgreSQL" src="https://img.shields.io/badge/-PostgreSQL-4169E1?style=flat-square&logo=postgresql&logoColor=white" />
<img alt="Redis" src="https://img.shields.io/badge/-Redis-FF4438?style=flat-square&logo=redis&logoColor=white" />
<img alt="RabbitMQ" src="https://img.shields.io/badge/-RabbitMQ-FF6600?style=flat-square&logo=rabbitmq&logoColor=white" />
<img alt="TypeScript" src="https://img.shields.io/badge/-TypeScript-3178c6?style=flat-square&logo=typescript&logoColor=white" />
<img alt="TailwindCSS" src="https://img.shields.io/badge/-Tailwind CSS-06b6d4?style=flat-square&logo=tailwindcss&logoColor=white" />
<img alt="Node.js" src="https://img.shields.io/badge/-Node.js-5fa04e?style=flat-square&logo=node.js&logoColor=white" />
</p>

<p align="center">
<img alt="Upstash" src="https://img.shields.io/badge/-Upstash-00E9A3?style=flat-square&logo=upstsh&logoColor=white" />
<img alt="DaisyUI" src="https://img.shields.io/badge/-DaisyUI-FFC63A?style=flat-square&logo=daisyui&logoColor=white" />
<img alt="Vite" src="https://img.shields.io/badge/-Vite-646CFF?style=flat-square&logo=Vite&logoColor=white" />
<img alt="Neon" src="https://img.shields.io/badge/-Neon-34D59A?style=flat-square&logo=neon&logoColor=white" />
<img alt="Oxc" src="https://img.shields.io/badge/-Oxc-00F7F1?style=flat-square&logo=oxc&logoColor=white" />
</p>

<p align="center">
<sup>Now, You are "Feed" to Go!</sup>
</p>

## ✨ Features

- Latest, following, and most-liked feeds, plus a dedicated popularity ranking.
- Video playback, seeking, keyboard controls, and public video detail pages.
- Account registration, sign-in, token refresh, password changes, and profiles.
- MP4 publishing with chunk checksums, upload recovery, and cover images.
- Likes, comments, following lists, and private conversations.
- English, Simplified Chinese, and Japanese interfaces with saved preferences.
- Light and dark themes, saved independently of account sessions.
- Background consumers for social actions, popularity, timelines, and notifications.

## 🛠️ Tech stack

| Layer                    | Technologies                                            |
| ------------------------ | ------------------------------------------------------- |
| Backend                  | Go, Gin, GORM, PostgreSQL, JWT, Zap                     |
| Background processing    | RabbitMQ, Redis, transactional outbox                   |
| Frontend                 | React, TypeScript, Vite, TanStack Router / Query / Form |
| State and validation     | Zustand, Zod                                            |
| Interface                | Tailwind CSS, daisyUI, Lucide, Sonner                   |
| Localization and uploads | i18next, react-i18next, hash-wasm                       |

## 📁 Repository layout

```text
feed-to-go/
  apps/
    api/
      cmd/server/    # API entry point with associated background tasks
      cmd/worker/    # Business consumer entry point
      configs/       # Profiling configuration
      internal/      # Application, HTTP API, services, and workers
      pkg/           # Backend support packages
    web/
      src/           # Frontend routes, features, components, and translations
      tests/         # Node-based frontend tests
      scripts/       # Browser regression harness
  shared/            # Shared error-code definitions
  scripts/           # Code generation and integration utilities
  docs/              # Configuration, conventions, and implementation records
```

## ⌨️ Development

### Requirements

- Go **1.27.2**, as declared in [go.mod](apps/api/go.mod), or a compatible newer toolchain.
- Node.js **24+** and pnpm **12+**, as declared in [package.json](apps/web/package.json).
- PostgreSQL, Redis, and RabbitMQ for the complete application.
- A browser that supports the codecs in your test MP4 files.

Dependency manifests and lockfiles are the source of truth. Install and configure
the backing services before starting the application; the commands below do not
provision them.

### `A` Clone the repository

```shell
git clone https://github.com/yydrowz3/feed-to-go.git
cd feed-to-go
```

### `B` Configure and start the backend

```shell
cd apps/api
go mod download
```

Create a dedicated development database and configure `apps/api/.env`. The
following example assumes locally running services; replace the database user,
password, database name, broker URI, and JWT secret with your own values:

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

These are local-development settings. Use a dedicated Redis instance and
RabbitMQ vhost for testing. The full set of available fields is in
[apps/api/.env.example](apps/api/.env.example). `AMQP_URL` overrides the separate
broker fields; the application does not read `DATABASE_URL` or `REDIS_URL`.
Process environment variables take precedence over `.env`.

### `C` Start the combined application:

```
go run ./cmd/app
```

This starts the API and all consumers in one process and requires all three
backing services. Startup performs database schema migrations, so use a
development database. Configuration is loaded relative to `apps/api`.

<details>

<summary>Health Check</summary>

In another terminal, check HTTP availability and combined-application readiness:

```powershell
Invoke-RestMethod http://localhost:8095/healthz
Invoke-RestMethod http://localhost:8095/readyz
```

For separate processes, use `go run ./cmd/server` and `go run ./cmd/worker` in
separate terminals instead of the combined entry point. Dependency and lifecycle
details are documented in [backend deployment](docs/backend-render.md).

</details>

### `D` Configure and start the frontend

Open another terminal at the repository root:

```shell
cd apps/web
pnpm install
```

Set `apps/web/.env` to:

```dotenv
VITE_API_BASE=http://localhost:8095
```

Run:

```shell
pnpm dev
```

Open **http://localhost:5173**. Register an account, then publish a test video.

### `E` Check origins and media access

The frontend connects directly to the API and media URLs. `VITE_API_BASE` must be
an absolute HTTP(S) URL; `/api` is not appended automatically. Its value is public
build-time configuration and must contain no secrets.

`APP_ENV=dev` allows any CORS origin. For other environments, set `WEB_URL` to the
exact frontend origin, including its scheme and port, without a path or trailing
slash. `localhost` and `127.0.0.1` are different origins. Restart the backend after
changing its configuration. See [CORS configuration](docs/backend-cors.md).

Uploaded files are stored under `apps/api/.run/uploads` and served through
`/static`. The API process needs write access, and the media URLs returned by
the backend must be reachable from the browser.

## 🧪 Validation

Backend checks, from `apps/api`:

```shell
go test ./...
go vet ./...
go build ./cmd/app ./cmd/server ./cmd/worker
```

Frontend checks, from `apps/web`:

```shell
pnpm test
pnpm lint
pnpm fmt:check
pnpm errors:check
pnpm build
```

The frontend tests use fixtures and do not require a live backend. The build
includes TypeScript checking. For API error-code changes, edit
`shared/error-codes.json`, then run `pnpm errors:generate` from `apps/web` and
commit both generated outputs. See the [error-code contract](docs/api-error-codes.md).

For an optional browser regression after building the frontend:

```shell
pnpm test:browser --media C:/path/to/test.mp4
```

Open the printed `http://127.0.0.1:5186/__checks` URL and click **Run checks**.
Results are available in the page and at `/__report`. Stop the harness with
Ctrl+C; use `BROWSER_TEST_PORT` to change its port. Omitting `--media` skips
validation of successful video decoding. The harness uses isolated API fixtures;
real-service integration checks require a separate test environment.

- **Backend:** From `apps/api`, run `go build -o app ./cmd/app` and run the produced
  executable with the required environment variables and access to its
  configuration files. The combined entry point exposes `/readyz` for readiness.
- **Frontend:** Set `VITE_API_BASE` to the public HTTPS API URL before running
  `pnpm build` in `apps/web`. Serve `apps/web/dist` with a static host that falls
  back to `index.html` for client-side routes. API URL changes require a rebuild.
- **Operations:** Use `APP_ENV=production`, configure `WEB_URL`, keep credentials
  private, restrict profiling endpoints, and provide persistent storage and
  backups for uploaded media. Files on ephemeral hosting can disappear when an
  instance is replaced. Vite preview is intended for local build verification.

## 👀 Limitations

- Search filters loaded feed titles and authors; it does not search the entire database.
- Private conversations load the latest 50 messages on entry or manual refresh;
  the frontend does not provide polling, live message updates, or history pagination.
- Videos must be nonempty MP4 files up to **200 MiB**. Covers support
  JPG/JPEG/PNG/WebP up to **10 MiB**. Playback depends on browser codec support.
- Pending chunk uploads can resume after reselecting the same file while the
  server-side upload session remains valid, typically **24 hours**. Completed
  media checkpoints are held only in the current page session.
- Queue-backed actions can take time to appear in read results. If publishing
  or message delivery returns an uncertain result, check the outcome before retrying.

## 📚 Documentation

| Document                                         | Contents                                             |
| ------------------------------------------------ | ---------------------------------------------------- |
| [Frontend guide](apps/web/README.md)             | Frontend setup, behavior, and browser checks         |
| [Backend guide](docs/backend-render.md)          | Entry points, dependencies, deployment, and shutdown |
| [CORS configuration](docs/backend-cors.md)       | Allowed origins and verification                     |
| [API error codes](docs/api-error-codes.md)       | Shared error contract and generation                 |
| [Contributing](CONTRIBUTING.md)                  | Development workflow, checks, and pull requests      |
| [Commit conventions](docs/commit-conventions.md) | Emoji-prefixed Conventional Commits                  |
| [Code of Conduct](CODE_OF_CONDUCT.md)            | Community expectations                               |
| [Security policy](SECURITY.md)                   | Private vulnerability reporting                      |

Some detailed implementation documents are currently available in Chinese.
Report ordinary bugs through [GitHub Issues](https://github.com/yydrowz3/feed-to-go/issues).
Report suspected vulnerabilities privately as described in [SECURITY.md](SECURITY.md).

## 🤝 Contributing

Contributions of all types are more than welcome; if you are interested in contributing code, feel free to check out our GitHub [Issues](https://github.com/yydrowz3/feed-to-go/issues) link to.

> \[!TIP]
>
> We are creating a technology-driven forum, fostering knowledge interaction and the exchange of ideas that may culminate in mutual inspiration and collaborative innovation.
>
> Help us make better. Welcome to provide product design feedback, user experience discussions directly to us.
>
> **Principal Maintainers:** [@yydrowz3](https://github.com/yydrowz3)

## ❤️ Sponsor

Every bit counts and your one-time donation sparkles in our galaxy of support! You're a shooting star, making a swift and bright impact on our journey. Thank you for believing in us – your generosity guides us toward our mission, one brilliant flash at a time.

## 📄 License

This Project is licensed as `MIT License`, refer to `LICENSE.md` for more information.

Copyright © 2026 [Feed To Go](https://github.com/yydrowz3/feed-to-go).

<div align="right">

[![](https://img.shields.io/badge/-BACK_TO_TOP-151515?style=flat-square)](#readme-top)

</div>
