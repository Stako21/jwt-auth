# AGENTS.md

## Project Overview

This repository contains a JWT-authenticated business web application with:

- `api/`: Express backend, MySQL access, JWT auth, reports, documents, import jobs, scheduler, PDF generation.
- `client/`: React + Vite frontend with Bulma styling.
- root `package.json`: currently only declares the `xlsx` dependency and has no scripts.

Current active work is on branch `branches-config`.

The branch/config foundation is already largely implemented. The repository has moved far beyond the initial "replace hardcoded city routes" phase and now supports branch-aware configuration for:

- branches and cities
- balance pages
- static report definitions
- document prefixes
- import sources
- scheduler task settings
- branch/city access boundaries

The ongoing goal remains the same: keep pushing the app toward configurable branch/city support without reintroducing hardcoded city-specific logic.

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
- For backend/runtime readiness work, prefer the existing bootstrap/doctor scripts instead of improvising destructive DB checks.

## Project Structure

Backend:

- `api/server.js`: Express app setup and top-level routes.
- `api/routers/Auth.js`: auth-root routes and branch/user auth endpoints.
- `api/routes/`: route modules.
- `api/controllers/`: HTTP controllers.
- `api/services/`: business logic, imports, scheduler, notifications, app config, user hierarchy.
- `api/repositories/`: DB query wrappers for users/reports/sessions.
- `api/migrations/`: JS migrations for schema/config changes.
- `api/scripts/`: migration, rollout, diagnostics, and seed helpers.
- `api/config/bootstrapBranchConfig.js`: bootstrap branch/city/balance/report seed source.
- `api/pdf/`: PDF templates and stamp assets.

Frontend:

- `client/src/App.jsx`: routes and main app composition.
- `client/src/context/`: auth/config contexts.
- `client/src/services/`: frontend API clients built on a shared authenticated client pattern.
- `client/src/components/`: shared UI and domain components.
- `client/src/pages/`: page-level components.
- `client/src/modals/`: document/item modals.
- `client/src/utils/`: roles, unit labels, helpers, report registry/parser helpers.

## Current State

Already visible in code and considered current baseline:

- Branch/config migration exists:
  - `api/migrations/001_branch_configuration.js`
  - `api/migrations/002_scheduler_last_run.js`
- Frontend app config is loaded via `client/src/context/AppConfigContext.jsx`.
- Dynamic balance pages use `/balance/:slug` routes.
- Balance XLSX files are served by authenticated backend route `GET /api/balances/:slug/file`.
- Static reports are config-driven through `report_definitions` plus frontend report registry wiring.
- Static report role visibility is configured in `report_definitions.allowed_roles`; Admin always has access, while `NULL` means all non-admin roles and `[]` means admin-only.
- `ReportRomashka` and `DebetReport` load through authenticated backend report routes, not public `/Sorce`.
- Header menus for balances/reports are driven from config instead of hardcoded city/report lists.
- Branch switching is implemented:
  - `/api/auth/branches`
  - `/api/auth/switch-branch`
  - frontend support in `AuthContext` and header UI
- Branch CRUD/configuration is implemented in admin UI:
  - `BranchConfig.jsx`
  - `CitiesConfig.jsx`
  - `BalancePagesConfig.jsx`
  - `ReportsConfig.jsx`
  - `ImportSourcesConfig.jsx`
  - `SchedulerConfig.jsx`
- User access tables are part of the live design:
  - `user_branch_access`
  - `user_city_access`
- Admin-only user creation is enforced:
  - public self-service signup remains disabled in UI
  - protected `POST /api/auth/sign-up` is the intended create-user flow
- Document number prefixes use `cities.document_prefix` instead of a hardcoded prefix map.
- Reports repository/controller already include branch-aware filtering for sales report queries.
- Main sales report `/sales-report` uses a date range (`dateFrom`/`dateTo`) with both dates defaulting to tomorrow; rows are filtered by `sales_reports.report_date`, aggregated in the existing hierarchy, and PDF export uses the same period. `loadSalesReports` keeps/imports a 35-day rolling window.
- `region_notifications` and several document/report access paths were hardened for `branch_id` scope.
- Import services use `IMPORT_DIR` through `getImportDir()` with legacy fallback to `client/public/Sorce`.
- Import source filenames support branch placeholders such as `{branchSlug}`, `{branchId}`, `{branchShortName}`.
- Import path resolution is constrained to stay inside `IMPORT_DIR`.
- Scheduler task settings live in `scheduler_tasks`, including persisted `lastRun`.
- Branch-bound scheduler tasks declare `requiresSystemBranch` and may be blocked until runtime branch config is valid.
- Scheduler UI shows blocked state, resolved runtime branch, refresh status, and recent run outcomes.
- DB connection config is environment-driven via `api/db.cjs`.
- Protected top-level route mounts in `api/server.js` are the current norm for `/api/config`, `/api/balances`, `/api/documents`, `/api/directories`, `/api/reports`, and `/api/region-notifications`.
- Frontend API clients share the normalized authenticated retry/refresh flow from `client/src/services/createAuthenticatedApi.js`.
- Balance parser and balance UI were recently refined for better search/filter UX and mobile density.
- Balance XLSX parsing now supports a separate price column; product rows can show price in a click/tap popover, and `balance_pages.price_multiplier_percent` can optionally adjust displayed price by percent.
- Debet static report was recently added and refined with a grouping switch:
  - collector view: TA -> contractor/trade point -> documents
  - contractor view: contractor/trade point -> TA -> documents
  - trade point address is displayed under the contractor/trade point header in both grouping modes.
  - document rows include boolean markers for `Ф2` and `Факт` from the static report JSON.
  - all roles with access to the active report route now see the full Debet JSON for the current branch.
- `report-orders-by-time` is DB-backed through `orders_by_time_report_rows`; `OrderByTimet.json` is configured as import source `loadOrdersByTimeReport`, scheduler task `loadOrdersByTimeReport` can refresh it, rows are replaced by source day to avoid duplicates, and rows older than one month are pruned.
- `report-bill-of-lading` is DB-backed through `bill_of_lading_report_rows`; `BillOfLading.json` is configured as import source `loadBillOfLadingReport`, scheduler task `loadBillOfLadingReport` can refresh it, report days run 08:00-08:00, rows are replaced by source day, and retention is configured through the report definition with a 180-day minimum.
- Operational collected-bills requests use server-side `dateFrom` / `dateTo` filtering on `report_date`; both dates default to today, representing the 08:00-today through 08:00-tomorrow report day. Keep this range filter server-side rather than returning the full retention window to the browser.
- Picker/Комплектувальник is role ID 8. Picker users are linked to `BillOfLading.pickerGUID` through `users.user_guid`, can open only their own collected-bills report, and are server-side filtered by branch and GUID regardless of report-role settings.
- Imported `warehouseGUID` values automatically maintain the branch-scoped `warehouses` directory. Admin and Director can manage effective-dated row/kg rates under `Налаштування -> Налаштування складу`; retroactive changes require confirmation when stored report rows are affected and are recorded in `warehouse_rate_audit`.
- `report-picker-earnings` is a config-driven period analytics page. Admin has implicit access, Director is enabled by default, and additional full-report roles are controlled by `report_definitions.allowed_roles`.
- Generic `Звіти XLSX з 1С` are supported through `report_definitions.report_type = 'xlsx-1c'`; each report can configure display title, file name, optional Excel sheet name, header row, data start row, role visibility, route, active state, and sort order.
- DB-backed 1C sales XLSX reports are supported through `report_definitions.report_type = 'xlsx-1c-sales'`; Montblanc and Lacmi use separate report definitions, parse only XLSX TA rows whose first cell contains `name (1C guid)` into `xlsx_1c_sales_report_values`, aggregate by selected date range, resolve visible users through imported `sales_agents.current_agent_guid`, and take supervisors from `user_hierarchy`. These reports can opt into scheduler imports through `report_definitions.scheduled_import_enabled`.

## Partial Or Unfinished

- Background jobs still rely on one resolved system branch at runtime by design.
- Full multi-branch parallel scheduler execution is not implemented.
- Legacy backend leftovers may still exist and should be cleaned up carefully.
- Branch-scope review should still be treated as ongoing whenever touching older SQL/service logic.

## Rules For Future AI Work

- After every completed project change, append a concise resume/checkpoint to `MEMORY.md`. When the change affects operating instructions, setup, runbooks, or current project capabilities, also update `AGENTS.md` and/or `README.md` in the same slice.
- Continue the branch/config approach; do not reintroduce hardcoded `/zp`, `/dp`, `/kr` route logic.
- Treat `branch_id` as the isolation boundary for future multi-branch support.
- Any query that reads business data in a multi-branch table should be checked for branch scoping.
- Keep city data in `cities`; do not duplicate city lists in frontend components.
- Keep balance page metadata in `balance_pages`; do not hardcode balance file names in routes.
- Keep balance price multiplier metadata in `balance_pages.price_multiplier_percent`; an empty value means display the source XLSX price without adjustment, while a numeric value is added as a percent markup.
- Keep static report metadata in `report_definitions`; do not hardcode one-off report routing/menu logic when config/registry should drive it.
- Keep static report role visibility in `report_definitions.allowed_roles`; do not restore hardcoded `allowedRoles` lists in frontend registry except for component mapping.
- Preserve the Picker exception: role 8 always receives only `report-bill-of-lading`, and backend filtering must use `users.user_guid = bill_of_lading_report_rows.picker_guid` within the active branch. `allowed_roles` controls full operational-report visibility for other roles.
- Keep warehouse rates effective-dated in `warehouse_rate_history`; do not replace them with mutable current-rate columns or silently bypass confirmation/audit for retroactive changes that affect imported rows.
- Keep generic 1C XLSX report pages config-driven via `report_definitions` metadata and `ReportXlsx1C`; do not create one-off React components for simple tabular XLSX reports unless the report needs custom business behavior.
- Keep DB-backed 1C sales XLSX reports config-driven via `report_definitions.report_type = 'xlsx-1c-sales'` and `ReportXlsx1CSales`; use `retention_days` for storage retention, `scheduled_import_enabled` to choose scheduler import versus sync-on-open, and preserve the rule that visible TA rows require an unambiguous DB match by imported `currentAgentGuid`.
- Treat phones and tablets as the primary app devices; report tables should be compact, adaptive, and touch-friendly by default.
- Keep document prefixes in `cities.document_prefix`; do not restore `prefixMap`.
- Keep branch/bootstrap seed values in `api/config/bootstrapBranchConfig.js`; do not duplicate them inline in migrations or services.
- Keep branch-bound import resolution inside `IMPORT_DIR`; do not add unsafe path resolution that can escape the configured import directory.
- Use existing backend layering: routes -> controllers -> services/repositories.
- Use existing frontend API-service style and contexts instead of embedding fetch logic throughout components.
- Prefer top-level `/api/reports` and `/api/region-notifications` flows; do not restore legacy duplicate auth-prefixed aliases unless explicitly required.
- Preserve the normalized authenticated API-client pattern in `client/src/services/createAuthenticatedApi.js`.
- Preserve admin-only user creation and the current protected branch-switch/access model.
- Preserve server-side hierarchy validation through the shared user-hierarchy service instead of scattering role/supervisor rules.
- Do not run migrations unless the target database is known and approved.
- Do not run rollout/seed scripts against a non-local DB unless that action is explicitly approved.
- Avoid modifying generated `client/dist` output unless explicitly requested.
- Avoid modifying `client/public/Sorce/*` business-data snapshots unless the task is explicitly about source assets or operational data refresh.
- Treat `AGENTS.md`, `MEMORY.md`, and `.github/instructions/*` as collaboration/docs material; do not mix them blindly into the main product-code commit.

## Critical Areas Not To Break

- JWT login/refresh flow in `api/services/Auth.js`, `api/services/Token.js`, `client/src/context/AuthContext.jsx`.
- Role IDs in `api/utils/roles.js` and `client/src/utils/roles.js`.
- User hierarchy and supervisor constraints in `api/services/userHierarchy.service.js`.
- Document workflow/status transitions in `api/services/DocumentService.js`.
- Sales report visibility rules in `api/repositories/Reports.js`.
- Static report loading/access behavior in backend reports controller plus frontend report registry; report access is role-gated by `report_definitions.allowed_roles`, and Debet visibility is intentionally full-report for roles that can open the active report route.
- Order-upload-by-hour report storage in `orders_by_time_report_rows`; keep replace-by-day import semantics and one-month retention.
- Collected-bills report storage in `bill_of_lading_report_rows`; keep 08:00-08:00 report-day grouping, replace-by-day import semantics, GUID-based Picker isolation, automatic warehouse discovery, and configured retention with a 180-day minimum.
- Collected-bills open-time import checks rely on the `(branch_id, updated_at)` index from migration `016_bill_of_lading_query_performance.js`; avoid restoring full-table `COUNT/MAX` checks.
- DB-backed 1C sales XLSX report storage in `xlsx_1c_sales_report_values`; keep per-report/per-day replace semantics, dynamic metric columns from XLSX headers, GUID-based TA row parsing, range aggregation, scheduler support via `loadScheduledXlsx1cSalesReports`, and exclusion reporting for unmatched/ambiguous TA GUIDs.
- Import jobs in `api/services/load*.js`.
- Scheduler runtime/branch-resolution behavior in `api/services/scheduler.js`.
- Notification retry and Rocket.Chat upload paths in `api/services/notificationRetry.service.js` and `api/services/notify.service.js`.
- PDF generation and Kyiv timezone formatting in `api/pdf/*`.

## Current Resume Point

If work resumes without fresh guidance, assume this branch is past the initial migration phase and is now in hardening/polish mode.

Most recent recorded product work in `MEMORY.md` focused on:

- sales report import cancellation behavior cleanup
- production-safe SQL cleanup helpers
- UTF-8/mojibake text cleanup
- balance search/filter/table UX refresh
- Debet static report rollout and iterative UX refinement, including the collector/contractor grouping switch, contractor address display, `Факт` marker column, and full-report visibility

Before starting a new slice, check whether the intended task belongs to:

1. legacy cleanup
2. branch-scope hardening
3. import/scheduler branch-runtime design
4. config-driven report/balance polish
5. deployment/diagnostics/readiness tooling
