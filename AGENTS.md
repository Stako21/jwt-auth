# AGENTS.md

## Project Overview

This repository contains a JWT-authenticated business web application with:

- `api/`: Express backend, MySQL access, JWT auth, reports, documents, import jobs, scheduler, PDF generation.
- `client/`: React + Vite frontend with Bulma styling.
- root `package.json`: currently only declares the `xlsx` dependency and has no scripts.

Current active work is on branch `branches-config`. The ongoing goal is to make the application configurable for branches/cities instead of hardcoding city routes and file names.

## Run Commands

Run backend:

```bash
cd api
npm run dev
```

Run frontend:

```bash
cd client
npm run dev
```

Build frontend:

```bash
cd client
npm run build
```

Run frontend lint:

```bash
cd client
npm run lint
```

Run database migrations:

```bash
cd api
npm run migrate
```

Important: migrations alter the configured MySQL database. Do not run them casually against production or an unknown database.

## Tests And Checks

- `api/package.json` has `npm test`, but it is only the placeholder command and exits with an error.
- `client/package.json` has no test script.
- Use `client` build and lint as the available frontend checks.
- For backend syntax checks, use `node --check` on project files only. Do not traverse `api/node_modules`.

## Project Structure

Backend:

- `api/server.js`: Express app setup and top-level routes.
- `api/routers/Auth.js`: auth-root routes and nested reports/documents/directories routes.
- `api/routes/`: route modules.
- `api/controllers/`: HTTP controllers.
- `api/services/`: business logic, imports, scheduler, notifications.
- `api/repositories/`: DB query wrappers for users/reports/sessions.
- `api/migrations/`: JS migrations for schema/config changes.
- `api/scripts/migrate.js`: simple migration runner.
- `api/pdf/`: PDF templates and stamp assets.

Frontend:

- `client/src/App.jsx`: routes and main app composition.
- `client/src/context/`: auth/config contexts.
- `client/src/services/`: frontend API clients.
- `client/src/components/`: shared UI and domain components.
- `client/src/pages/`: page-level components.
- `client/src/modals/`: document/item modals.
- `client/src/utils/`: roles, unit labels, helpers.

## Current Configuration Direction

Already visible in code:

- `branches`, `cities`, `balance_pages`, `report_definitions`, `import_sources`, `scheduler_tasks` are introduced by migration.
- Frontend app config is loaded via `client/src/context/AppConfigContext.jsx`.
- Dynamic balance pages now use `/balance/:slug` routes.
- Balance XLSX files are served by authenticated backend route `GET /api/balances/:slug/file`.
- `IMPORT_DIR` is the intended backend source directory for import/report/balance files, with a legacy fallback to `client/public/Sorce`.
- Document number prefixes are being moved from hardcoded maps to `cities.document_prefix`.
- Scheduler active/interval settings are being moved to DB table `scheduler_tasks`.

## Rules For Future AI Work

- Continue the started branch/config approach; do not reintroduce hardcoded `/zp`, `/dp`, `/kr` route logic.
- Treat `branch_id` as the isolation boundary for future multi-branch support.
- Any query that reads business data in a multi-branch table should be checked for branch scoping.
- Keep city data in `cities`; do not duplicate city lists in frontend components.
- Keep balance page metadata in `balance_pages`; do not hardcode balance file names in routes.
- Keep document prefixes in `cities.document_prefix`; do not restore `prefixMap`.
- Use existing backend layering: routes -> controllers -> services/repositories.
- Use existing frontend API-service style and contexts instead of embedding fetch logic throughout components.
- Do not run migrations unless the target database is known and approved.
- Avoid modifying generated `client/dist` output unless explicitly requested.

## Critical Areas Not To Break

- JWT login/refresh flow in `api/services/Auth.js`, `api/services/Token.js`, `client/src/context/AuthContext.jsx`.
- Role IDs in `api/utils/roles.js` and `client/src/utils/roles.js`.
- Document workflow/status transitions in `api/services/DocumentService.js`.
- Sales report visibility rules in `api/repositories/Reports.js`.
- Import jobs in `api/services/load*.js`.
- Notification retry and PDF generation paths.

