# Feed to Go Web

The React and TypeScript frontend for [Feed to Go](../../README.md), a short-video
sharing application with a Go backend. It provides video feeds, account pages,
resumable publishing, social interactions, and private conversations.

## Features

- Latest, following, and most-liked feeds, plus a dedicated popularity ranking.
- Video playback, seeking, keyboard controls, and public video detail pages.
- Registration, sign-in, token refresh, password changes, and user profiles.
- MP4 publishing with chunk checksums, upload recovery, and cover images.
- Likes, comments, follow lists, and private messages.
- English, Simplified Chinese, and Japanese interfaces.
- Light and dark themes with saved preferences.

## Technology

| Area | Tools |
| --- | --- |
| Application | React, TypeScript, Vite, React Compiler |
| Routing and server state | TanStack Router, TanStack Query |
| Forms and validation | TanStack Form, Zod |
| Client state | Zustand |
| Styling | Tailwind CSS, daisyUI |
| Icons and notifications | Lucide, Sonner |
| Localization | i18next, react-i18next |
| File hashing | hash-wasm |
| Checks | Node test runner, Oxlint, Oxfmt |

Use [package.json](package.json) and [pnpm-lock.yaml](pnpm-lock.yaml) as the source
of truth for the application version, dependency versions, and available scripts.

## Requirements

- Node.js **24 or later**.
- pnpm **12 or later**.
- The Go backend and its backing services for real application use. See the
  [project setup](../../README.md) and [backend guide](../../docs/backend-render.md).
- A browser that supports the codecs used in your MP4 files.

Frontend unit tests use fixtures and do not require a running backend.

## Local Development

The examples below use PowerShell. From the repository root:

```powershell
cd apps/web
pnpm install --frozen-lockfile
if (!(Test-Path .env)) { Copy-Item .env.example .env }
```

Set the API URL in your local `.env`:

```dotenv
VITE_API_BASE=http://localhost:8095
```

Start the development server:

```powershell
pnpm dev --host 127.0.0.1 --port 5173 --strictPort
```

Open **http://localhost:5173**. Start the backend separately and register a test
account to try publishing and authenticated features.

### API Configuration and CORS

`VITE_API_BASE` is required. It must be an absolute HTTP(S) URL without embedded
credentials, a query string, or a fragment. Trailing slashes are removed, and
`/api` is not appended automatically. Missing or invalid configuration displays
a configuration error page.

This value is public build-time configuration. Never store secrets in frontend
environment variables. API URL changes require restarting the development server
or rebuilding the production assets.

The frontend accesses the API and media directly; the Vite configuration does
not proxy these requests. Authenticated API requests use bearer tokens rather
than cross-origin cookie credentials. Relative `/static/...` media paths are
resolved against the configured backend origin.

For backend environments other than `APP_ENV=dev`, set `WEB_URL` to the exact
frontend origin, such as `http://localhost:5173`, and restart the backend.
`localhost` and `127.0.0.1` are different origins. `APP_ENV=dev` allows any CORS
origin and is intended for local development.

The backend must allow the relevant preflight requests and return CORS headers
on both successful and error responses. Media access also needs GET, HEAD, and
Range support. See [backend CORS configuration](../../docs/backend-cors.md) for
verification commands. A successful command-line request does not replace
checking login, refresh, uploads, and playback in the browser.

## Project Structure

```text
apps/web/
  src/
    api/              # HTTP client, normalization, and generated error codes
    assets/           # Bundled assets
    components/       # Shared layouts, controls, dialogs, and state displays
    features/         # Account, feed, video, publishing, and social features
    i18n/             # Translations, localized errors, and formatting helpers
    lib/              # Runtime, configuration, auth helpers, hashing, and theme
    routes/           # TanStack file-based routes
    stores/           # Authentication and theme stores
    routeTree.gen.ts  # Generated route tree
  tests/              # Node-based tests
  scripts/            # Opt-in browser regression harness
```

Edit route source files rather than the generated route tree. The TanStack
Router Vite plugin generates the tree during development and builds.

### Main Routes

| Route | Purpose |
| --- | --- |
| `/` | Latest, following, and most-liked feeds |
| `/feed` | Compatibility redirect to the home feed |
| `/hot` | Popularity ranking |
| `/video` | Publish a video; sign-in required |
| `/video/{id}` | Public video details |
| `/account` | Sign-in or current account page |
| `/account/register` | Registration |
| `/account/change-password` | Password change |
| `/u/{id}` | User profile |
| `/messages` | Private conversations; sign-in required |
| `/messages/{peerId}` | Conversation with another user; sign-in required |
| `/settings` | Settings |

## Languages and Themes

### Localization

The initial interface language is English. The language selector switches between
English, Simplified Chinese, and Japanese for both guests and signed-in users.
The preference is stored under `feed-to-go.locale` and survives sign-out.
When browser storage is unavailable, switching still works for the current session.

UI text, validation, errors, notifications, dates, and counts use the selected
language. Usernames, video titles, comments, messages, filenames, and resource
IDs retain their original content. Language changes do not change the URL or
device timezone, or reset forms, selected files, upload progress, or playback.

Translation resources are in `src/i18n/en.ts`, `src/i18n/zh-CN.ts`, and
`src/i18n/ja.ts`. Use `useAppTranslation()` with typed semantic keys and update
all three resources together. Keep error and validation keys in application
state, then translate at display time rather than storing translated strings
in query caches or business state.

### Themes

On startup, the page applies the saved theme before its first paint. Without a
saved preference, it reads the system color preference, falling back to light.
The theme button is available to guests, signed-in users, and on configuration
error pages. The daisyUI themes are `light` and `night`.

Manual selection is saved under `feed-to-go.theme`, takes precedence over the
system preference, and survives refresh and sign-out. The application does not
track system theme changes after startup or provide a separate system-following
mode. Switching still works in the current session when storage is unavailable.
Theme changes preserve forms, uploads, and player state.

## Commands and Checks

Run these commands from `apps/web`:

| Command | Purpose |
| --- | --- |
| `pnpm dev` | Start Vite development mode |
| `pnpm test` | Run Node tests with fixtures and injected transports |
| `pnpm lint` | Run Oxlint |
| `pnpm fmt:check` | Check formatting with Oxfmt |
| `pnpm fmt` | Format files with Oxfmt |
| `pnpm build` | Run TypeScript checks and build production assets into `dist` |
| `pnpm preview` | Serve the production build for local verification |
| `pnpm test:browser` | Start the browser regression harness; run checks in its UI |
| `pnpm errors:generate` | Generate shared Go and TypeScript error-code outputs |
| `pnpm errors:check` | Check generated error-code outputs for staleness |
| `pnpm version:bump` | Bump the patch version without creating a commit or tag |

Before submitting frontend implementation changes, run the relevant checks:

```powershell
pnpm test
pnpm lint
pnpm fmt:check
pnpm errors:check
pnpm build
```

Use `pnpm exec oxfmt <changed-file>` when only specific files need formatting.
Follow the version-update and commit rules in the
[contribution guide](../../CONTRIBUTING.md) and
[commit conventions](../../docs/commit-conventions.md).

### Shared API Error Codes

Edit `shared/error-codes.json` at the repository root, then run
`pnpm errors:generate` and `pnpm errors:check` from this directory. Commit the
shared definition and both generated files together. Do not edit generated
Go or TypeScript error-code files directly.

The client uses recognized error codes for translated messages and falls back
to HTTP status and operation context for older or unknown responses. Backend
status-code changes can affect behavior and must be documented. See the
[API error-code contract](../../docs/api-error-codes.md) for compatibility and
backend-first deployment requirements.

### Browser Regression

Build the frontend and supply a local test video:

```powershell
pnpm build
pnpm test:browser --media C:/path/to/test.mp4
```

Open the printed `http://127.0.0.1:5186/__checks` URL and click **Run checks**.
Results are shown as JSON and are also available at `/__report`. The server
binds locally; use `BROWSER_TEST_PORT` to change its port and Ctrl+C to stop it.
Starting the server alone does not execute the checks.

The `--media` argument supplies a local playback fixture. Without it, the harness
can still check failure recovery and resource cleanup, but cannot verify successful
video decoding. It exercises the production build using isolated API fixtures
and does not forward API writes to a real backend.

Verify real registration, publishing, two-account interactions, CORS, and media
delivery separately in a dedicated integration environment. Check UI changes
in all three languages, both themes, and desktop and mobile viewport sizes.

## Production Build and Hosting

Set `VITE_API_BASE` to the public HTTPS backend URL in the build environment,
then run `pnpm build`. Host the entire `dist` directory with client-side route
fallback to `index.html`. For example, on a dedicated Nginx frontend host:

```nginx
location / {
    try_files $uri $uri/ /index.html;
}
```

Configure the backend's `WEB_URL` to match the deployed frontend origin and
ensure returned media URLs are browser-accessible. Changing a runtime `.env`
does not change an existing frontend build.

To verify a production build locally:

```powershell
pnpm preview --host 127.0.0.1 --port 5173 --strictPort
```

Stop the development server first if it uses that port. This explicit port keeps
the same CORS origin as the development example; Vite preview otherwise defaults
to port 4173. Preview is for local verification, not production hosting.

## Upload Behavior and Current Limitations

- Search filters only loaded feed titles and authors; it does not search the
  entire database.
- Videos must be nonempty MP4 files up to **200 MiB**. Covers support
  JPG/JPEG/PNG/WebP up to **10 MiB**. Browser playback depends on the MP4 codecs.
- Whole-file MD5 hashing reads **2 MiB** blocks. Uploads use sequential **5 MiB**
  chunks with individual checksums. Chunk network and server failures receive
  bounded retries of up to three attempts.
- Pending uploads can resume after reselecting the same file while the backend
  session remains valid, typically **24 hours**. The browser does not persist
  the selected `File` across reloads.
- Successfully merged video and uploaded cover checkpoints are kept in the
  current page session. A failed cover upload can reuse the merged video;
  leaving the page discards these checkpoints. An uncertain publish result
  should be checked against the account's videos before retrying.
- Private conversations load the latest **50 messages** on entry or manual
  refresh and update after sending. The frontend does not poll, receive live
  message updates, or paginate older messages. An uncertain send is not
  automatically retried.
- Queue-backed likes and comments can take time to appear in reads. A successful
  write does not mean every list is already synchronized.
- Upload recovery depends on Redis; media delivery requires a writable backend
  upload directory and accessible static files. See the backend guide for
  deployment and storage considerations.

## Related Documentation

- [Project overview and backend setup](../../README.md)
- [Backend deployment and lifecycle](../../docs/backend-render.md)
- [CORS configuration](../../docs/backend-cors.md)
- [API error-code contract](../../docs/api-error-codes.md)
- [Frontend migration verification](../../docs/tasks/migrations/react-migration-verification.md)
- [Integration verification](../../docs/tasks/integration/integration-test-verification.md)
- [Localization verification](../../docs/tasks/i18n/frontend-i18n-verification.md)
- [Contributing](../../CONTRIBUTING.md)
- [Code of Conduct](../../CODE_OF_CONDUCT.md)
- [Security policy](../../SECURITY.md)

Verification records describe the checks performed for their recorded revisions;
they do not replace running checks for subsequent changes. Some detailed records
are currently written in Chinese.

## License

Licensed under the project's [MIT License](../../LICENSE).
