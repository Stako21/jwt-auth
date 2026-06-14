# jwt-auth

JWT-authenticated React/Express application for stock balances, reports, user management, and return/exchange document workflows.

## Stack

- Frontend: React 18, Vite, Bulma, Sass, axios, `xlsx`
- Backend: Node.js, Express, MySQL via `mysql2`, JWT, cookie refresh sessions
- Reporting/PDF: Puppeteer and HTML templates
- Imports/background jobs: JSON/XLSX loaders plus scheduler tasks

## Current State

The active refactor moves the app from hardcoded city-specific behavior to configurable branch and city metadata.

Implemented in the current workspace:

- branch-aware configuration tables via `api/migrations`
- backend app-config, balances, and scheduler endpoints
- frontend `AppConfigContext` and Admin "Configuration" UI
- dynamic balance routes via `/balance/:slug`
- authenticated static balance/report file access through backend routes
- balance XLSX files can expose a `Price`/`Ціна` column; product rows show price on tap/click, and balance page config can apply an optional percent markup
- config-driven reports, including Debet, DB-backed order-upload-by-hour, DB-backed collected-bills, generic 1C XLSX views, and DB-backed Montblanc/Lacmi 1C XLSX sales reports with GUID-based TA matching, date-range aggregation, per-report retention, optional scheduler import, import-source/scheduler management, per-report role access, and Header report navigation collapsed into a select when multiple reports are active
- branch switching for eligible users
- user branch/city access management
- scheduler task settings and persisted `lastRun`
- import path resolution through `IMPORT_DIR` with legacy fallback to `client/public/Sorce`

## Run

Install dependencies in each package if needed:

```bash
cd api
npm install

cd ../client
npm install
```

Start backend:

```bash
cd api
npm run dev
```

Start frontend:

```bash
cd client
npm run dev
```

Run migrations:

```bash
cd api
npm run migrate
```

Seed missing primary access rows for existing users:

```bash
cd api
npm run seed:user-access
```

Review/bootstrap-sync the default branch config:

```bash
cd api
npm run sync:bootstrap-branch
```

Bootstrap a fresh environment:

```bash
cd api
npm run bootstrap:env
```

Run a pre-deploy / pre-start diagnostics pass:

```bash
cd api
npm run bootstrap:doctor
```

What `bootstrap:env` does today:

- creates the database from `DB_NAME` if it does not exist
- runs the current migration set
- creates a default admin user if the legacy `users` table already exists
- prints a warning when legacy runtime tables are still missing

What `bootstrap:doctor` checks today:

- required and recommended environment variables
- MySQL server connectivity
- target database existence
- pending migrations
- current branch-config table presence and key columns
- current legacy runtime table presence and key columns
- admin-user readiness
- branch runtime readiness, including whether `BRANCH_ID` / `BRANCH_SLUG` is required for scheduler

Default bootstrap admin credentials:

- login: `admin`
- password: `ChangeMe123!`

You can override them with:

- `BOOTSTRAP_ADMIN_LOGIN`
- `BOOTSTRAP_ADMIN_PASSWORD`
- `BOOTSTRAP_ADMIN_DISPLAY_NAME`
- `BOOTSTRAP_ADMIN_BRANCH_ID`

Migrations and sync scripts target the database configured by environment variables used in `api/db.cjs`. Confirm the target database before running them.

## Available Checks

Frontend build:

```bash
cd client
npm run build
```

Frontend lint:

```bash
cd client
npm run lint
```

Backend syntax checks:

```bash
node --check api/server.js
```

The backend `npm test` script is currently a placeholder and exits with an error.

## Structure

```text
api/
  config/          bootstrap branch config
  controllers/     HTTP controllers
  migrations/      database migrations
  repositories/    DB access helpers
  routes/          Express route modules
  routers/         auth root router
  scripts/         migration and rollout helpers
  services/        business logic, imports, scheduler, notifications

client/
  src/
    components/    reusable UI/domain components
    context/       auth/config contexts
    pages/         route-level pages
    services/      frontend API clients
    utils/         constants/helpers
```

## Notes

- The root `package.json` still has no project-level scripts.
- Some legacy routes/code still exist while the branch-config refactor is being finished.
- Do not assume migrations have been applied just because migration files exist.
- Important deployment limitation: the repository still does not contain a full migration history for the legacy schema. `bootstrap:env` can create the DB, run current branch-config migrations, and seed the admin user, but a truly clean production bootstrap still requires either:
  - importing the legacy base schema first
  - or continuing the project until all remaining legacy tables are migrated into code
