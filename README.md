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
- installation/return TRO documents with an imported branch-scoped TRO directory, multi-position name/quantity rows, TA/SV/NTO approval rules, accountant planning/completion fields, status notifications, and document history
- Admin-only TRO correction before UP processing and explicit cancellation at any stage, including completed/UP-linked requests, with a required reason, confirmation, branch checks and audit history; cancellation preserves integration/accounting data
- Admin `Дії з документами` for bulk TRO cancellation, restricted revision, and additive registration for another UP status check; requires migration 033
- notification recipient settings with two document groups, seven independent TRO events, and test sending of unsaved email/Rocket.Chat destinations (requires migration 032)
- separate return/exchange and TRO document workspaces with dedicated menu entries, routes, server-filtered tables, creation actions, and status filter sets
- a dedicated Full HD warehouse ranking dashboard for the current 08:00–08:00 shift, with isolated screen accounts, many-to-many warehouse access, automatic refresh, and invoice/row/weight totals without earnings data

## Administrative document actions

The full application release also includes TRO execution-document details and cancellation warnings, administrative actions inside the TRO modal, city/document filters, notification group/event settings and Debet date/overdue improvements. On 2026-11-01 the user confirmed the status-processing EPF is already updated in 1C; its editable source is `ИнтеграцияСтатусовТРОСПорталом_МодульОбъекта_v2.txt`. Production installation was not independently tested during this local release preparation. See [the PM2 deployment procedure](documentation/update-pm2-production.md): apply pending migrations 031/032/033 against the approved target DB before starting the new API, and rebuild the frontend on the server. Business-data snapshots are not part of the code update.

`Адмін -> Дії з документами` lists TRO requests within the administrator's visible branches, with server-side date/status/search filters and 1000-row pages/selections. Select documents on the current page, choose an action, review the document numbers and enter a reason. Each document reports its own result; a denied or concurrently changed document does not block the rest. Revision retains the existing UP/accounting restrictions. Cancellation preserves signatures, accounting fields and integration snapshots.

The nested `Зареєстровані на синхронізацію` tab lists the complete pending queue and initially has no date boundaries. Administrators can select manual registrations and remove them with a reason. `unsync` clears only the manual timestamp and records `ADMIN_SYNC_UNREGISTER`; automatic polling continues where required. The action checks both expected Portal status and the exact registration timestamp, so an old page cannot remove a newer registration. Automatic-only rows remain visible and cannot be selected for removal. No new migration is required beyond 033. Both ordinary document workspaces now open with expanded filters and both period boundaries unbounded, including after filter reset.

`Реєстрація на синхронізацію` adds selected UP-linked requests to the existing `status-pending` queue without resetting either workflow or altering documents already pending. This permits another check of UP-completed requests. Registration survives API restarts and is consumed only by an accepted full execution snapshot observed at or after registration; GETs, omitted snapshots and failed callbacks keep it pending. If the refreshed state remains naturally pending, ordinary synchronization continues. Portal-COMPLETED requests are still never cancelled automatically; use explicit administrative cancellation when needed. Physical deletion of the parent in UP still produces a synchronization error in the existing EPF.

Apply `api/migrations/033_tro_status_sync_requests.js` through the existing migration runner against an approved target database **before deploying this API version**. It adds one nullable timestamp column and does not register or change existing documents. Applied with user approval on 2026-10-31 to local DEV `auth` at `Stako_PC` (`localhost:3306`); all 102 existing TRO detail rows retained their previous fields and received an empty registration timestamp. Other deployments must apply it separately to their approved database. The existing v2 status-processing source already sends full snapshots; no EPF change is required.

## Notification settings

`Адмін -> Сповіщення` supports `Повернення/Обмін` and `ТРО`, plus separate TRO events for creation, signature, revision, Portal rejection, UP creation/planning, UP rejection, and accounting completion. Return/exchange notifications retain their signed PDFs; TRO events are text messages.

Apply `api/migrations/032_notification_event_settings.js` through the existing migration runner only after confirming the target database. It adds JSON policy columns to `region_notifications`, preserves both groups and the six existing events for current recipients, and leaves the new Portal-creation event off for them. New settings default to both groups and all seven events. The migration was applied and verified on local DEV `auth` at `Stako_PC` on 2026-10-18 with user approval. Other deployments must apply it separately to their confirmed target database.

`Надіслати тест` uses the current city/email/channel fields without saving the form. It reports each channel independently, uses the server's SMTP/Rocket.Chat environment settings, and creates no document/history/retry entries. Tests are limited to one request per 30 seconds per initiator/branch in the current API process. SMTP/Rocket.Chat integration testing with real recipients remains an operator action; automated checks use substitute transports.

Failed working deliveries keep their original recipients and message snapshots for retry even when recipient settings change. Deploying the API before migration 032 preserves legacy delivery; the new settings screen requires that migration and reports it explicitly if missing.

## Production updates

For routine updates of the configured servers, use the [Docker quick update](documentation/quick-update-docker.md) or [PM2 quick update](documentation/quick-update-pm2.md). Both include preparation before downtime, migration checks, backups, frontend publication, rollback and the exact diagnostic output to send on failure. Select the same full release SHA for both servers.

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

Backend integration tests:

```bash
cd api
npm test
```

The current suite covers the portal side of the TRO/1C integration.

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
- TRO/1C integration uses separate technical accounts managed by an administrator.
  They authenticate through `POST /api/1c/auth/sign-in`, have explicit request/status
  capabilities and one or more city scopes, and cannot use ordinary portal APIs.
  See `docs/1c-tro-integration.md` for the protocol.
- Important deployment limitation: the repository still does not contain a full migration history for the legacy schema. `bootstrap:env` can create the DB, run current branch-config migrations, and seed the admin user, but a truly clean production bootstrap still requires either:
  - importing the legacy base schema first
  - or continuing the project until all remaining legacy tables are migrated into code

## Picker And Warehouse Earnings

- Migration `015_picker_warehouse_earnings.js` adds Picker users, warehouse GUID storage, automatic warehouse discovery, effective-dated row/kg rates, retroactive-change audit, and Picker earnings analytics. Apply it only after confirming the configured database target.
- Role `Picker` (`8`) is restricted to its own `report-bill-of-lading` rows by matching `users.user_guid` to imported `pickerGUID` in the active branch.
- Admin and Director manage effective-dated rates under `Налаштування -> Налаштування складу`. A backdated change that affects imported rows requires explicit confirmation and is audited.
- Collected-bills retention is configured on `report-bill-of-lading`, cannot be below 180 days, and is shared by the Picker earnings analytics dataset.
- Migration `016_bill_of_lading_query_performance.js` indexes the latest-import check. The operational report requests only the selected DB date range and defaults to today's 08:00–08:00 report day.

## Warehouse Ranking Dashboard

- Role `WarehouseDashboard` (`9`) is an isolated television-screen account. After ordinary portal login it is redirected directly to `/warehouse-dashboard` and cannot use ordinary business APIs.
- Admin manages these accounts and their allowed warehouses in `Адмін -> Складські екрани`.
- Migration `029_warehouse_dashboard_accounts.js` adds `user_warehouse_access`; it has been applied to the configured development database.
- The dashboard ranks workers primarily by collected invoices for the current Kyiv 08:00–08:00 shift. Equal invoice totals share the same rank; rows and weight only order equal-rank workers and remain visible as supporting metrics.
- The dashboard endpoint intentionally returns no rate, amount, or earnings fields. Data refreshes every minute and becomes visibly stale after ten minutes without an import update.
