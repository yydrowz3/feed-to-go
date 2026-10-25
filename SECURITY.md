# Security Policy

## Supported Versions

Security fixes are developed against the latest code on the repository's default
branch. Older commits, historical frontend versions, and forks do not have a
separate security maintenance commitment. Backports are not guaranteed.

When reporting a vulnerability, include the exact commit and, where relevant,
the frontend version. A frontend version alone does not identify the backend
revision. If possible, confirm whether the issue also affects the latest code
using an isolated test environment.

## Reporting a Vulnerability

Please report suspected vulnerabilities privately to the project maintainer at
[yydrowz3@gmail.com](mailto:yydrowz3@gmail.com), the contact listed in the frontend
package metadata. Use a subject such as `Feed to Go security report: <brief summary>`.

Do not disclose vulnerabilities through public issues, discussions, pull requests,
or comments before coordinated disclosure. For ordinary bugs without a security
impact, follow [CONTRIBUTING.md](CONTRIBUTING.md).

Include as much of the following as you can:

- A short description of the vulnerability and its potential impact.
- The affected commit, component, endpoint, and relevant runtime versions.
- Required configuration, authentication, permissions, or other preconditions.
- Reproduction steps or a minimal proof of concept using test accounts and data.
- Expected and observed behavior, with sanitized logs, requests, or screenshots.
- Any known workaround or suggested fix.
- Your preferred contact method and whether you would like public credit.

An incomplete report is still welcome. Do not include real passwords, access or
refresh tokens, JWT signing keys, connection strings, private media, or personal
data. If sensitive evidence is necessary, describe it first so a suitable way to
share it can be agreed upon. Ordinary email should not be treated as an encrypted
channel for secrets.

## Review and Disclosure

The maintainer will review the report, seek clarification when needed, assess
impact, and coordinate a fix or mitigation when the issue is confirmed. Updates
will use the private reporting thread. This project does not guarantee a fixed
response or remediation timeline; timing depends on severity, complexity, and
maintainer availability. If you have not received a response, follow up in the
same thread.

Please coordinate the timing and content of public disclosure with the maintainer
so affected users can apply a fix or mitigation. Credit can be included with the
reporter's consent. Details shared publicly should avoid exposing credentials,
personal information, or unnecessary exploit material.

## Scope and Responsible Testing

Relevant reports include vulnerabilities in the Go API, background workers,
React frontend, shared contracts, and repository tooling. Examples include
authentication or authorization bypasses, account takeover, injection, cross-site
scripting, unauthorized access to messages or media, unsafe uploads, credential
exposure, and reproducible denial-of-service vulnerabilities.

Dependency reports should identify an affected version and explain the impact
on Feed to Go when possible. A scanner result without a reproduction or impact
analysis can still be submitted, but may require further investigation.

Test only systems you own or have explicit permission to assess. Prefer an
isolated local environment with dedicated database, Redis, RabbitMQ, accounts,
and media. Avoid accessing other people's data, disrupting shared services,
sending unsolicited messages, or running destructive or high-volume tests.
If you encounter sensitive data, stop testing and report the minimum information
needed to explain the issue.

## Deployment Security

Deployment operators are responsible for protecting their infrastructure and
applying fixes. In particular:

- Set `APP_ENV=production` and configure `WEB_URL` to the intended frontend
  origin. `APP_ENV=dev` allows any CORS origin and is intended for local
  development. CORS configuration does not replace authentication or authorization.
- Set a strong, stable `JWT_SECRET` and keep database, Redis, and RabbitMQ
  credentials outside source control. If credentials are exposed, rotate them
  and address affected sessions or access as appropriate.
- Use HTTPS for public frontend, API, and media traffic, and configure transport
  security for backend services as required by your environment.
- Treat `VITE_*` variables as public frontend build configuration. Never place
  secrets in `VITE_API_BASE` or other frontend environment variables.
- Keep databases, caches, brokers, and profiling endpoints restricted to trusted
  networks. Do not expose pprof as a public health-check endpoint.
- Use a dedicated development database: application startup can perform schema
  migrations. Keep private `.env` files, test credentials, runtime artifacts,
  and user media out of commits and shared diagnostic reports.

See [backend configuration and lifecycle](docs/backend-render.md),
[CORS configuration](docs/backend-cors.md), and the
[frontend README](apps/web/README.md) for project-specific setup details.
