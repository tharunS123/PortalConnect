# PortalConnect

Role-based user and customer management portal.

**Angular 22** (standalone, zoneless, signals) on the front end, **Express 5 + TypeScript** on the back end, with real authentication: bcrypt password hashing, short-lived JWT access tokens, rotating httpOnly refresh cookies, and a permission matrix enforced on every endpoint.

---

## Quick start

Requires **Node.js 24.15+** (`.nvmrc` pins 24.20.0 — run `nvm use`).

```bash
npm install
cp .env.example .env
npm run db:seed
npm run dev
```

- Web app: <http://localhost:4200> (proxies `/api` to the API)
- API: <http://localhost:3000>

`db:seed` creates the `admin` account. Set `SEED_ADMIN_PASSWORD` in `.env` first, or leave it
blank and the seed generates a random password and prints it once — it is stored only as a
bcrypt hash, so capture it from that line.

---

## Layout

```
.
├── src/                        Angular application
│   ├── app/
│   │   ├── core/               Models, services, guards, HTTP interceptors
│   │   ├── shared/             Reusable presentational components
│   │   ├── layout/             App shell (navigation, toolbar, theme)
│   │   └── features/           Lazily loaded routes
│   └── environments/           Build-time configuration
├── server/                     Express API (npm workspace)
│   └── src/
│       ├── config/             Environment parsing and validation
│       ├── db/                 Connection, SQL migrations, seed
│       ├── lib/                Errors, logging, password and token helpers
│       ├── middleware/         Auth, RBAC, validation, error handling
│       └── modules/            auth · users · customers · roles
└── .github/workflows/          CI and Azure deployment
```

Each module keeps its routes, validation schemas and data access together, so a
change to customers rarely touches anything else.

---

## Scripts

| Command              | What it does                                                 |
| -------------------- | ------------------------------------------------------------ |
| `npm run dev`        | Web and API together with hot reload                         |
| `npm start`          | Angular dev server only                                      |
| `npm run start:api`  | API only, watching for changes                               |
| `npm run build`      | Production web build → `dist/portal-connect`                 |
| `npm run build:api`  | Compile the API → `server/dist`                              |
| `npm run build:all`  | Both                                                         |
| `npm test`           | Angular unit tests (Vitest)                                  |
| `npm run test:api`   | API unit and integration tests                               |
| `npm run lint`       | ESLint across web and API                                    |
| `npm run format`     | Prettier write                                               |
| `npm run typecheck`  | Type-check both projects                                     |
| `npm run verify`     | Format, lint, typecheck and every test — what CI runs        |
| `npm run db:migrate` | Apply pending migrations                                     |
| `npm run db:seed`    | Apply migrations, then seed roles, permissions and demo data |
| `npm run serve:prod` | Run the compiled API, which also serves the built web app    |

---

## Configuration

All API configuration comes from environment variables, validated at startup by
`server/src/config/env.ts`. The process refuses to boot on invalid config rather
than failing later in a confusing way. See [`.env.example`](.env.example) for the
full list.

In production `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` are **required**, must
differ from one another, must be at least 32 characters, and must not still look
like the shipped placeholders. Generate them with:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

---

## Security model

| Concern               | How it is handled                                                                                                                                 |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Password storage      | bcrypt, cost 12. Plaintext is never stored, logged or returned.                                                                                   |
| Login                 | Verified server-side. Unknown users burn an equivalent bcrypt comparison so response timing does not reveal which usernames exist.                |
| Access tokens         | JWT, 15-minute lifetime, held **in memory only** — never in `localStorage` or `sessionStorage`.                                                   |
| Refresh tokens        | Opaque random values, stored only as SHA-256 digests, delivered as `httpOnly; Secure; SameSite=Strict` cookies scoped to `/api/auth`.             |
| Token rotation        | Every refresh issues a new token and revokes the old one. Replaying a consumed token is treated as theft and revokes every session for that user. |
| Authorisation         | A role/menu permission matrix checked by middleware on every request. The UI reads the same matrix, but only to decide what to render.            |
| Revocation            | Deactivating or re-roling an account invalidates its sessions immediately; each request re-reads the user, so a still-valid token grants nothing. |
| Input validation      | Zod schemas on body, query and params. Unknown keys are stripped, so a client cannot smuggle `role` or `isActive` into a profile update.          |
| Transport and headers | Helmet with a strict CSP, HSTS in production, `x-powered-by` disabled.                                                                            |
| Rate limiting         | 300 requests/minute per IP across the API; 10 per 15 minutes on credential endpoints.                                                             |
| Audit                 | Logins, failed logins, refresh-reuse detection, and privileged changes are recorded in `audit_log`.                                               |

Structured logs redact `authorization`, `cookie`, `set-cookie` and any
password-shaped field.

---

## API

Errors always take the shape `{ "error": { "code", "message", "details?", "requestId" } }`.
Branch on `code`, not on the message text.

### Auth — `/api/auth`

| Method | Path               | Access         | Purpose                                                     |
| ------ | ------------------ | -------------- | ----------------------------------------------------------- |
| `POST` | `/register`        | Public         | Create an account (inactive until an admin activates it)    |
| `POST` | `/login`           | Public         | Exchange credentials for an access token and refresh cookie |
| `POST` | `/refresh`         | Refresh cookie | Rotate the session                                          |
| `POST` | `/logout`          | Refresh cookie | Revoke the current session                                  |
| `POST` | `/logout-all`      | Authenticated  | Revoke every session for the caller                         |
| `GET`  | `/me`              | Authenticated  | Current user and permission matrix                          |
| `POST` | `/change-password` | Authenticated  | Change password; revokes all sessions                       |

### Users — `/api/users`

| Method   | Path     | Access         | Purpose                             |
| -------- | -------- | -------------- | ----------------------------------- |
| `GET`    | `/me`    | Authenticated  | Own profile                         |
| `PATCH`  | `/me`    | Authenticated  | Update own name, email, gender      |
| `GET`    | `/roles` | Authenticated  | Assignable roles                    |
| `GET`    | `/`      | `users:view`   | Paged, filtered, sorted list        |
| `GET`    | `/:id`   | `users:view`   | One user                            |
| `PATCH`  | `/:id`   | `users:edit`   | Update role, activation and details |
| `DELETE` | `/:id`   | `users:delete` | Delete an account                   |

### Customers — `/api/customers`

| Method   | Path     | Access             |
| -------- | -------- | ------------------ |
| `GET`    | `/`      | `customers:view`   |
| `GET`    | `/stats` | `customers:view`   |
| `GET`    | `/:id`   | `customers:view`   |
| `POST`   | `/`      | `customers:create` |
| `PATCH`  | `/:id`   | `customers:edit`   |
| `DELETE` | `/:id`   | `customers:delete` |

`GET /api/health` and `GET /api/menus` are public.

### Default roles

| Role      | Dashboard | Users | Customers          |
| --------- | --------- | ----- | ------------------ |
| `admin`   | view      | full  | full               |
| `manager` | view      | —     | full               |
| `tech`    | view      | —     | view               |
| `user`    | view      | —     | view, create, edit |

The last active administrator cannot be demoted, deactivated or deleted.

---

## Database

SQLite via `better-sqlite3`, with WAL journaling and foreign keys enforced.
Migrations are plain `.sql` files in `server/src/db/migrations`, applied in
filename order and recorded in `schema_migrations` so each runs once. The API
applies pending migrations on boot, which keeps a deploy to a single step.

To add one, create `002_your_change.sql` alongside the others.

The schema is a small relational model — `users`, `roles`, `menus`,
`role_permissions`, `refresh_tokens`, `customers`, `audit_log` — with
case-insensitive unique indexes on username and email.

---

## Deployment

### Docker

```bash
JWT_ACCESS_SECRET=... JWT_REFRESH_SECRET=... docker compose up --build
```

The image is multi-stage: the runtime carries no toolchain or source, runs as a
non-root user, keeps the database on a named volume, and has a healthcheck.

### Azure App Service

`.github/workflows/main_portalconnect.yml` builds, tests and deploys on every
push to `main`. It ships only the compiled output plus production manifests, not
the whole source tree.

Set these in **Configuration → Application settings**:

```
NODE_ENV=production
JWT_ACCESS_SECRET=<generated>
JWT_REFRESH_SECRET=<generated>
DATABASE_PATH=/home/data/portalconnect.db
STATIC_DIR=/home/site/wwwroot/dist/portal-connect/browser
CORS_ORIGINS=https://<your-domain>
```

`/home` is the persistent mount on App Service — a database written anywhere
else is lost on restart.

### Any Node host

```bash
npm ci && npm run build:all && npm run serve:prod
```

One process serves both the API and the built frontend, with an SPA fallback so
deep links work on refresh.

---

## Testing

```bash
npm run verify
```

- **API** — Supertest integration tests against a fresh in-memory database per
  test, covering registration, login, refresh rotation, refresh-reuse detection,
  session revocation, privilege escalation attempts and the permission matrix.
- **Web** — Vitest unit tests for the auth store and API error handling,
  including an assertion that no token reaches browser storage.

---

## License

MIT.
