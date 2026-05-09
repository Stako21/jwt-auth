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
