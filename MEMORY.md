# MEMORY.md

## 2026-08-05 - Documents period result completeness

- Removed the legacy default `LIMIT 20` / `OFFSET` from `getDocumentsService`.
- The Documents API now returns every branch/role-visible document matching the selected date boundaries; the frontend scroll container limits only the table height and no longer hides older matching documents.
- Verification:
  - `node --check api/services/DocumentService.js`

## 2026-08-05 - Documents table theme alignment

- Removed the forced light border and white sticky-header background from the Documents scroll container so the table inherits the active application theme.
- Verification:
  - `npm run lint` in `client`
  - `npm run build` in `client`

## 2026-08-05 - Document period and Picker warehouse filters

- Documents now default to the current calendar month, support independently disabling the lower/upper date boundary with `Без ограничения`, and keep the selected period during background refreshes and modal updates.
- The 20-row Documents table now uses a bounded vertical/horizontal scroll container with a sticky header.
- `report-picker-earnings` now returns the active branch warehouse options from the configured `warehouses` directory and provides a warehouse dropdown alongside the existing search.
- Preserved the pending branch-scoped NTO orphan-TA approval/signature fix and TA document-list author field in the same change set.
- Verification:
  - `node --check api/services/DocumentService.js`
  - `node --check api/services/billOfLadingReport.service.js`
  - `npm run lint` in `client`
  - `npm run build` in `client` (passed with existing Sass legacy API and chunk-size warnings)

## 2026-07-14 - NTO orphan-TA document approval checkpoint

- Fixed NTO document workflow for TA users without an assigned SV:
  - `prepareDocumentService` / `checkCanChangeStatus` now passes the active `branchId` into the shared NTO access helper.
  - NTO can now move visible orphan-TA return/exchange documents from `NEW` / `REVISION` to `PREPARED` (`Погоджено до підпису`) using the same branch-scoped rule already used for signing.
  - NTO revision/reject checks from `PREPARED` now also use the same branch-scoped orphan-TA access rule.
- Verification:
  - `node --check api/services/DocumentService.js`

## 2026-07-14 - TA document list editability checkpoint

- Fixed TA editing from the document list for own return/exchange documents in `NEW` and `REVISION` statuses.
- `getDocumentsService` now returns `author_user_id`, allowing the existing frontend row-click logic to recognize the current TA as the author and open the edit modal instead of read-only view.
- Backend `updateDocumentService` already enforced author-only editing for those statuses, so no workflow permission expansion was needed.
- Verification:
  - `node --check api/services/DocumentService.js`

## 2026-06-12 - Existing non-Docker server update runbook checkpoint

- Added `documentation/update-existing-non-docker-server-to-branches-config.md` for upgrading the current Ubuntu/PM2/Nginx production-style server from `resbr6` to `branches-config`.
- The runbook captures the observed server layout: `/var/www/apps/jwt-auth`, PM2 process `jwt-auth-api`, Nginx `client/dist` root, MySQL `auth`, and import directory `/var/www/data/excel`.
- It includes backup, root-owned worktree repair, token-safe Git remote cleanup, `.env` DB/branch/import settings, migration execution, existing-user access seeding, post-migration verification, PM2/Nginx restart checks, secret rotation, and rollback steps.
- No migrations or server commands were run from this workspace.

## 2026-06-14 - Two-production release runbook checkpoint

- Extended `documentation/update-existing-non-docker-server-to-branches-config.md` with an ongoing release procedure for keeping both production sites on the same stage:
  - Docker production `https://balance.sweetglobal.com.ua/`
  - PM2/Nginx production `https://balance.roshen.zp.ua/`
- Added a shared release flow around one `RELEASE_SHA`, backups on both servers, Docker update/rebuild/publish steps, PM2 update/build/restart steps, migration checks, final SHA/schema/health comparison, and an emergency note for split-stage production.
- No production commands were run from this workspace.

## 2026-06-14 - Balance price popover and multiplier checkpoint

- Added migration `api/migrations/014_balance_price_multiplier.js` for nullable `balance_pages.price_multiplier_percent`.
- Balance page config now reads/saves the optional price multiplier percent and exposes it through app config.
- Balance XLSX parsing now detects separate `Price`/`Ціна` and balance quantity columns when present, preserving old-file behavior when no price column exists.
- Product leaf rows with a parsed price now show a click/tap price popover; if a multiplier is configured, the displayed price includes that percent as markup.
- Deployment runbook was updated to reference migration `014`.
- Verification:
  - parser smoke on `client/public/Sorce/balanceCH.xlsx` confirmed quantity and price are separated
  - `node --check api/services/appConfig.service.js`
  - `node --check api/migrations/014_balance_price_multiplier.js`
  - `node --check api/scripts/bootstrapDoctor.js`
  - `npm run lint` in `client`
  - `npm run build` in `client` passed with known Sass legacy API and chunk-size warnings

## Purpose Of Current Work

The current branch `branches-config` is moving the application from hardcoded city-specific behavior toward configurable branch/city support.

Primary goal: support one or multiple branches, each with its own cities, balance pages, reports, document prefixes, imports, scheduler settings, and access boundaries, while preserving existing role hierarchy and document/report behavior.

## Current State

Completed in the current workspace:

- Branch/config migration exists:
  - `api/migrations/001_branch_configuration.js`
- Migration runner exists:
  - `api/scripts/migrate.js`
  - `api/package.json` has `npm run migrate`
- App config backend exists:
  - `api/services/appConfig.service.js`
  - `api/controllers/configController.js`
  - `api/routes/config.js`
  - `api/server.js` mounts `/api/config`
- Protected balance file backend exists:
  - `api/controllers/balancesController.js`
  - `api/routes/balances.js`
  - `api/server.js` mounts `/api/balances`
- Frontend app config loading exists:
  - `client/src/context/AppConfigContext.jsx`
  - `client/src/services/config.api.js`
- Balance file API client exists:
  - `client/src/services/balances.api.js`
- Dynamic balance routes are in place:
  - `client/src/App.jsx` uses `/balance/:slug`
  - `client/src/components/Header/Header.jsx` builds balance menu items from config
  - `client/src/components/ParseExcel/ParseExcel.jsx` loads balance files through backend by `balanceSlug`
- Frontend config/admin UI is already connected:
  - `client/src/pages/AdminPage.jsx` has the configuration tab
  - `client/src/components/Configuration/BranchConfig.jsx`
  - `client/src/components/Configuration/CitiesConfig.jsx`
  - `client/src/components/Configuration/BalancePagesConfig.jsx`
  - `client/src/components/Configuration/ReportsConfig.jsx`
  - `client/src/components/Configuration/ImportSourcesConfig.jsx`
  - `client/src/components/Configuration/SchedulerConfig.jsx`
- City-driven data is already used in several frontend areas:
  - `Sidebar.jsx`
  - `UsersList.jsx`
  - `RegionNotifications.jsx`
  - `SignUp.jsx`
- Document number prefixes now use `cities.document_prefix` instead of a hardcoded prefix map.
- Reports repository/controller already include branch-aware filtering for sales report queries.
- Scheduler settings are partially moved to DB through `scheduler_tasks`.
- Import services use `IMPORT_DIR` through `getImportDir()` with legacy fallback to `client/public/Sorce`.
- `ReportRomashka` now loads through authenticated backend report routes instead of public `/Sorce`.
- Branch switching is implemented:
  - `/api/auth/branches`
  - `/api/auth/switch-branch`
  - frontend support in `AuthContext` and header UI
- User access tables are wired into the app:
  - `user_branch_access`
  - `user_city_access`
- Admin-only user creation is enforced:
  - public self-service signup remains disabled in UI
  - `client/src/App.jsx` keeps the public `sign-up` route commented out
  - new users are created only by protected `POST /api/auth/sign-up`
- Auth payload bugs were fixed:
  - `api/services/Auth.js` `signIn` no longer returns an undefined `user`
  - `signUp` returns the created `user`
- Admin user creation flow is transactional:
  - user creation
  - `user_branch_access` / `user_city_access`
  - optional supervisor assignment
  - all in one DB transaction
- Admin create-user no longer creates refresh sessions or auth tokens for the newly created user.
- Signup validation now matches the actual admin payload in `api/validators/Auth.js`.
- Branch-scope audit completed for the most obvious backend leaks:
  - `region_notifications` CRUD is now scoped by `branch_id`
  - notification recipient loading in `notify.service.js` is now scoped by document branch
  - `document_sequences` update now includes `branch_id`
  - orphan-TA checks in document access flows now include branch scope
  - sales report repository subqueries now restrict user lookups to the report branch
  - debug hierarchy endpoint now reads users/documents only inside the current branch
- Import architecture is now branch-aware without a schema change:
  - `import_sources.file_name` supports `{branchSlug}`, `{branchId}`, `{branchShortName}`
  - import source resolution now tries branch-specific paths under `IMPORT_DIR` before the legacy root path
  - import path resolution is constrained to stay inside `IMPORT_DIR`
  - `loadAgents`, `loadReports`, `loadProducts`, `loadTradePoints` now reuse one resolved source/branch context instead of calling `getSystemBranch()` separately
  - `ImportSourcesConfig` now shows a UI hint for branch-aware file path patterns
- Scheduler/background jobs are now aligned with branch configuration:
  - branch-bound scheduler tasks declare `requiresSystemBranch`
  - scheduler preflights `getSystemBranch()` before scheduling or manual task runs
  - blocked tasks stay active in config but are not scheduled blindly
  - scheduler API returns `blockedReason` for branch misconfiguration
  - `SchedulerConfig.jsx` shows blocked state and prevents manual run while blocked
- DB connection config is now environment-driven:
  - `api/db.cjs` reads `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`
  - optional pool settings now come from env as well
  - `api/.env.example` documents the required DB variables
  - local `api/.env` now provides the runtime DB variables expected by `api/db.cjs`
- Route security hardening completed for remaining admin/user endpoints:
  - `GET /api/auth/debug/hierarchy/:userId` is now admin-only
  - protected route mounts in `api/server.js` now require `authMiddleware` at the mount level for `/api/config`, `/api/balances`, `/api/documents`, `/api/directories`
  - `/api/auth/reports` is now also guarded at the mount level in `api/routers/Auth.js`
- Branch management is now real CRUD instead of current-branch-only editing:
  - config API now supports listing, creating, editing, and activating/deactivating branches
  - branch creation automatically grants the creating admin access to the new branch
  - branch deactivation is blocked for the current branch and for the last active branch
  - `BranchConfig.jsx` now shows a branch list plus create/edit form
  - `AuthContext` exposes `reloadUserInfo`, so header branch info refreshes after branch config changes
- New branch creation can now bootstrap branch-scoped config:
  - `BranchConfig.jsx` offers cloning from the current branch on create
  - backend clones `cities`, `balance_pages`, and `report_definitions` in one transaction
  - `import_sources` and `scheduler_tasks` stay global and are not duplicated
- New branch creation UX is now guided:
  - `BranchConfig.jsx` shows a post-create notice for the new branch
  - admin can switch to the new branch immediately from the same panel
  - the next setup step is now explicit after create instead of being implicit in the header switcher
- Legacy route aliases for domain APIs were cleaned up:
  - client `reports` calls now use top-level `/api/reports`
  - client `region-notifications` calls now use top-level `/api/region-notifications`
  - `api/server.js` mounts top-level `reports` and `region-notifications`
  - duplicate `/api/auth/reports|documents|directories|region-notifications` mounts were removed from `api/routers/Auth.js`
- Frontend API clients are now normalized:
  - shared `client/src/services/createAuthenticatedApi.js` builds authenticated axios clients
  - `documents`, `directories`, `config`, `reports`, `region-notifications`, and `balances` now share one refresh/retry pattern
  - refresh retries are now consistent across services that previously behaved differently on `401`
  - concurrent refresh attempts now reuse one in-flight refresh request
- Legacy demo transport code was removed:
  - deleted unused `client/src/pages/Demo.jsx`
  - removed `ResourceClient`, `data`, and `handleFetchProtected` from `AuthContext`
  - removed unused backend `/resource/protected` route from `api/server.js`
- Scheduler now makes branch-bound runtime explicit:
  - branch-bound scheduler tasks now expose resolved `systemBranch`
  - `GET /api/auth/scheduler/tasks` refreshes branch resolution before returning task state
  - scheduler UI shows which branch a task will run against instead of only `Ready/Blocked`
- Loader runtime guards were hardened:
  - `loadProducts` now aborts safely when no valid groups or no valid products are resolved
  - `loadTradePoints` now aborts safely when no effective trade points/contractors were imported
  - deactivation sync no longer runs after effectively empty imports in these loaders
- Sales import loaders are now safer on partial failure:
  - `loadAgents` now pre-validates rows, resolves users in bulk, and writes agent/user-name sync in one transaction
  - `loadReports` now pre-validates rows before opening a transaction and rolls back the whole import on unexpected row failures
  - sales-agent and sales-report JSON sources are now kept when unresolved rows were skipped instead of being deleted blindly
- JSON import source retention is now consistent across loaders:
  - `loadProducts` now keeps the source file when rows/groups were skipped or failed instead of deleting after a partial import
  - `loadTradePoints` now keeps the source file when rows were skipped or failed instead of deleting after a partial import
- Scheduler/manual-run APIs now expose structured task outcomes:
  - import loaders and notification retry now return structured `status` / `message` / `details` summaries
  - scheduler stores in-memory `lastRun` state with trigger and timestamp for each task
  - scheduler run API now returns `runResult` plus the refreshed task snapshot
  - `SchedulerConfig.jsx` now shows last run status in the table and uses run-result severity in snackbars
- Scheduler `lastRun` now persists in `scheduler_tasks`:
  - added migration `api/migrations/002_scheduler_last_run.js`
  - scheduler loads persisted `lastRun` on startup when the new columns exist
  - scheduler saves `lastRun` after manual and scheduled runs
  - backend falls back safely to in-memory-only `lastRun` until the migration is applied
- Test DB rollout is now executed on the approved test database:
  - `001_branch_configuration.js` applied successfully on the restored test DB
  - `002_scheduler_last_run.js` applied successfully on the restored test DB
  - config tables now exist and are seeded (`branches`, `cities`, `balance_pages`, `report_definitions`, `import_sources`, `scheduler_tasks`)
  - branch backfill completed with `branch_id` populated on existing business tables and no remaining `NULL` branch ids in the checked tables
  - `user_branch_access` and `user_city_access` are still empty on the test DB, but current single-branch runtime remains functional because access checks include fallback to the user's own `branch_id` / `city`
- Test-DB smoke test completed against the live backend:
  - `/api/health`, `/api/auth/me`, `/api/auth/branches`, config endpoints, balances, reports, and documents responded successfully using an admin JWT for an existing test-DB user
  - static balance XLSX and static report JSON loaded successfully through authenticated backend routes
  - manual scheduler run for `loadSalesReports` completed safely with `source_missing`
  - backend restart was performed and persisted `scheduler_tasks.lastRun` was confirmed after restart
- Backend startup behavior is now safer on manual launch:
  - scheduler no longer auto-starts as a side effect of importing `api/services/scheduler.js`
  - `api/server.js` starts scheduler only after `app.listen` succeeds
  - `EADDRINUSE` now exits the process cleanly instead of leaving scheduler intervals running without an HTTP listener
  - `api/package.json` now includes an explicit `npm start` script
- Frontend local dev proxy is now environment-friendly:
  - `client/vite.config.js` no longer hardcodes `http://192.168.11.5:5000`
  - local dev proxy now defaults to `http://localhost:5000`
  - proxy target can be overridden with `VITE_API_PROXY_TARGET`
- User-access branch scope hardening completed:
  - user-access options now return only branches visible to the current admin instead of every active branch
  - backend branch-access writes are now restricted to the current admin's visible branch scope
  - out-of-scope branch grants are now rejected server-side during both user creation and user access updates
  - existing hidden branch-access rows are preserved during updates instead of being accidentally dropped by a narrower admin session
- Scheduler UI adaptive refresh completed:
  - `SchedulerConfig.jsx` now auto-refreshes task state while the scheduler panel is open
  - base polling runs every 30 seconds
  - fast polling runs every 3 seconds for 30 seconds after `Run now`
  - polling pauses while the browser tab is hidden and refreshes immediately when visibility returns
  - scheduler interval draft inputs are preserved during background refresh instead of being reset by polling
  - scheduler panel now shows refresh status, last updated time, and a manual `Refresh` button
- Existing-user access seed rollout is now prepared:
  - added `api/scripts/seedUserAccess.js` as a dry-run-first rollout helper
  - the script seeds only primary access rows, not inferred extra permissions
  - admin/director users get their own `branch_id` inserted into `user_branch_access` when missing
  - accountant/warehouse users get their own `city` inserted into `user_city_access` when missing
  - applying against a non-local DB host is blocked unless explicitly overridden with `--allow-non-local`
- Bootstrap branch config is now externalized for cutover review:
  - added `api/config/bootstrapBranchConfig.js` as the explicit input for initial branch/city/balance/report seed values
  - migration `001_branch_configuration.js` now reads bootstrap branch data from that config instead of duplicating the values inline
  - added `api/scripts/syncBootstrapBranchConfig.js` as a dry-run-first sync helper for branch `id=1`
  - bootstrap sync is blocked on non-local DB hosts unless explicitly overridden with `--allow-non-local`
- Final cleanup pass completed:
  - `client/src/App.jsx` was simplified into smaller route helpers without changing the branch-config route behavior
  - root-level temporary files from balance/smoke checks were removed (`tmp-balance*`, `tmp-smoke-server*.log`)
  - generated/source branch assets under `client/public/Sorce` and `client/dist/Sorce` were intentionally left in place for explicit later review instead of being deleted blindly
- Residual admin/user security follow-up completed:
  - added `api/services/userHierarchy.service.js` as the shared source of truth for user-role hierarchy checks
  - user update flow now validates role ids and rejects role changes that would leave incompatible supervisor/subordinate links behind
  - supervisor assignment is now enforced server-side as `SV -> TA` and `NTO -> SV` during both admin user creation and later supervisor edits
  - added `api/validators/User.js` so `updateUser`, `changePassword`, and `setSupervisor` validate params/body before reaching controller logic
- Generated-asset finalization review completed:
  - `client/public/Sorce/*.xlsx` and `client/public/Sorce/report_romashka.json` currently look like real source-data changes, not disposable generated noise
  - `client/dist/Sorce/*.xlsx` mirrors the `client/public/Sorce` balance assets and should be treated as generated build output unless the branch intentionally versions built artifacts
- Dist-asset scope cleanup completed:
  - restored mirrored `client/dist/Sorce/balance*.xlsx` files back to git state so they no longer pollute the branch diff
  - current asset diff is now limited to `client/public/Sorce/*.xlsx` and `client/public/Sorce/report_romashka.json`
- Source-asset diff review completed:
  - compared `client/public/Sorce/balance*.xlsx` and `client/public/Sorce/report_romashka.json` against `HEAD`
  - all five changes were plain business-data snapshot refreshes dated `2026-04-27` instead of structural or branch-config-related asset changes
  - restored all five source assets to `HEAD`, leaving no remaining `client/public/Sorce/*` or `client/dist/Sorce/*` diffs
- Commit-scope review completed:
  - remaining app diff is now concentrated in backend/frontend branch-config code, migrations, config scripts, and related UI/API changes
  - `README.md` was updated to match the current branch-config state instead of the earlier stale description
  - `AGENTS.md`, `MEMORY.md`, and `.github/instructions/*` should be treated as separate collaboration/docs material and not mixed blindly into the main product-code commit

## Partial Or Unfinished

- Background jobs still rely on one resolved system branch at runtime by design.
- Full multi-branch parallel scheduler execution is not implemented; current design requires explicit system branch selection for branch-bound jobs.
- Legacy backend leftovers still exist and should be cleaned up carefully:
  - legacy cleanup has started; verify no further dead auth/user files remain

## Roadmap

1. Legacy Cleanup
   - remove dead auth/user routes and controllers
   - keep only branch-config aware user/admin flows
2. Branch Scope Audit
   - inspect backend SQL and service logic for missing `branch_id` isolation
   - patch unsafe reads/writes before adding more multi-branch behavior
3. Import Architecture
   - define how `IMPORT_DIR` maps to branches and import sources
   - remove remaining implicit default-branch assumptions in loaders
4. Scheduler And Background Jobs
   - decide how jobs select a branch when more than one branch is active
   - align scheduler task config with the multi-branch import design
5. Environment And Release Readiness
   - move DB config to env
   - confirm migration procedure on non-production DB
   - keep `MEMORY.md` current after each completed slice

## Active Step

Initial roadmap is completed.

Recent completed slice on May 16, 2026:

- Sales report import logic was updated in `api/services/loadReports.js`:
  - imports now accept the whole allowed lower-bounded window `report_date >= today - 5 days`
  - future-dated rows are allowed and are not capped by an upper date bound
  - missing rows are no longer auto-marked `CANCELLED` just because they disappeared from the latest file
  - sales reports are now marked `CANCELLED` only when the incoming JSON row has `isDeleted: true`
  - `MOVED` behavior remains in place for same document number/login moved to another day
- Added SQL cleanup helpers under `api/scripts/sql/`:
  - `clear_products_catalog_safe.sql`
  - `clear_products_catalog_hard.sql`
  - `preview_return_exchange_documents_cleanup.sql`
  - `clear_return_exchange_documents_by_numbers.sql`
- UTF-8/mojibake cleanup completed in user-facing strings:
  - fixed broken Ukrainian text in `client/src/components/ParseExcel/ParseExcel.jsx`
  - fixed broken auth/user error messages in `api/services/Auth.js` and `api/controllers/User.js`
  - fixed broken comments in `api/services/notificationRetry.service.js`
- Balance pages UX refresh completed:
  - added free-text search before the existing VIP/OPT filter on the product balance pages
  - search now works through the parsed hierarchy and preserves matching parent groups
  - filter and search state are now controlled from `ParseExcel.jsx`
  - added polished control-panel styling for search, filter, and visible/total counts
  - refreshed balance table styling with labeled headers, improved spacing, better hierarchy presentation, and responsive card layout
- Return/exchange cleanup scripts were designed for production-safe targeted deletion by explicit `document_number` list:
  - preview script shows candidate `documents`, dependent row counts, and sequence impact
  - delete script removes dependent rows from `notification_log`, `document_history`, `document_items`, then deletes `documents`
  - delete script recalculates `document_sequences.last_number` for affected cities and removes empty sequence rows when no documents remain
- These changes were committed and pushed on branch `branches-config`:
  - commit `d002d52` `Update sales report cancellations and add cleanup SQL scripts`

Next concrete execution plan as of May 9, 2026:

1. Branch finalization and commit prep
   - review the remaining code/config diff for any other non-branch-config noise
   - split product code/config changes from optional docs/collaboration files before commit

Recommended commit grouping:

1. Backend branch-config foundation
   - intent: DB/config foundation, config endpoints, balances endpoints, scheduler persistence/runtime, rollout scripts
   - suggested files:
     - `api/constants.js`
     - `api/db.cjs`
     - `api/package.json`
     - `api/server.js`
     - `api/controllers/SchedulerController.js`
     - `api/controllers/balancesController.js`
     - `api/controllers/configController.js`
     - `api/routes/balances.js`
     - `api/routes/config.js`
     - `api/services/appConfig.service.js`
     - `api/services/scheduler.js`
     - `api/migrations/001_branch_configuration.js`
     - `api/migrations/002_scheduler_last_run.js`
     - `api/config/bootstrapBranchConfig.js`
     - `api/scripts/migrate.js`
     - `api/scripts/seedUserAccess.js`
     - `api/scripts/syncBootstrapBranchConfig.js`

2. Backend auth, branch-scope, and loader hardening
   - intent: branch-aware auth/user access, hierarchy validation, branch scoping, safer loaders, route cleanup
   - suggested files:
     - `api/controllers/Auth.js`
     - `api/controllers/DebugController.js`
     - `api/controllers/RegionNotificationsController.js`
     - `api/controllers/Reports.js`
     - `api/controllers/User.js`
     - `api/controllers/directoriesController.js`
     - `api/controllers/AuthController.js` (delete)
     - `api/repositories/Reports.js`
     - `api/repositories/User.js`
     - `api/routers/Auth.js`
     - `api/routes/reports.js`
     - `api/routes/users.js` (delete)
     - `api/services/Auth.js`
     - `api/services/DocumentService.js`
     - `api/services/documentAccess.service.js`
     - `api/services/loadAgents.js`
     - `api/services/loadProducts.js`
     - `api/services/loadReports.js`
     - `api/services/loadTradePoints.js`
     - `api/services/notify.retry.service.js`
     - `api/services/notify.service.js`
     - `api/services/userHierarchy.service.js`
     - `api/utils/Errors.js`
     - `api/validators/Auth.js`
     - `api/validators/User.js`

3. Frontend branch-config UI and API integration
   - intent: app config context, dynamic balance/report routes, admin configuration UI, auth/API normalization, scheduler UI
   - suggested files:
     - `client/src/App.jsx`
     - `client/src/components/Configuration/BalancePagesConfig.jsx`
     - `client/src/components/Configuration/BranchConfig.jsx`
     - `client/src/components/Configuration/CitiesConfig.jsx`
     - `client/src/components/Configuration/ImportSourcesConfig.jsx`
     - `client/src/components/Configuration/ReportsConfig.jsx`
     - `client/src/components/Configuration/SchedulerConfig.jsx`
     - `client/src/components/Documents/DocumentRowAction.jsx`
     - `client/src/components/Documents/DocumentsTable.jsx`
     - `client/src/components/Header/Header.jsx`
     - `client/src/components/Header/header.module.scss`
     - `client/src/components/ParseExcel/ParseExcel.jsx`
     - `client/src/components/RegionNotifications/RegionNotifications.jsx`
     - `client/src/components/Reports/ReportRomashka.jsx`
     - `client/src/components/SalesReport/SalesReport.jsx`
     - `client/src/components/Sidebar/Sidebar.jsx`
     - `client/src/components/UsersList/UsersList.jsx`
     - `client/src/config.js`
     - `client/src/context/AppConfigContext.jsx`
     - `client/src/context/AuthContext.jsx`
     - `client/src/pages/AdminPage.jsx`
     - `client/src/pages/Demo.jsx` (delete)
     - `client/src/pages/DocumentsPage.jsx`
     - `client/src/pages/SignUp.jsx`
     - `client/src/services/balances.api.js`
     - `client/src/services/config.api.js`
     - `client/src/services/createAuthenticatedApi.js`
     - `client/src/services/directories.api.js`
     - `client/src/services/documents.api.js`
     - `client/src/services/inMemoryJWT.js`
     - `client/src/services/regionNotifications.api.js`
     - `client/src/services/reports.api.js`
     - `client/src/services/scheduler.api.js`
     - `client/vite.config.js`

4. Optional docs and collaboration metadata
   - intent: repository documentation and AI/collaboration guidance
   - suggested files:
     - `README.md`
     - `AGENTS.md`
     - `MEMORY.md`
     - `.github/copilot-instructions.md`
     - `.github/instructions/backend.instructions.md`

Suggested staging commands:

```bash
git add api/constants.js api/db.cjs api/package.json api/server.js api/controllers/SchedulerController.js api/controllers/balancesController.js api/controllers/configController.js api/routes/balances.js api/routes/config.js api/services/appConfig.service.js api/services/scheduler.js api/migrations/001_branch_configuration.js api/migrations/002_scheduler_last_run.js api/config/bootstrapBranchConfig.js api/scripts/migrate.js api/scripts/seedUserAccess.js api/scripts/syncBootstrapBranchConfig.js

git add api/controllers/Auth.js api/controllers/DebugController.js api/controllers/RegionNotificationsController.js api/controllers/Reports.js api/controllers/User.js api/controllers/directoriesController.js api/controllers/AuthController.js api/repositories/Reports.js api/repositories/User.js api/routers/Auth.js api/routes/reports.js api/routes/users.js api/services/Auth.js api/services/DocumentService.js api/services/documentAccess.service.js api/services/loadAgents.js api/services/loadProducts.js api/services/loadReports.js api/services/loadTradePoints.js api/services/notify.retry.service.js api/services/notify.service.js api/services/userHierarchy.service.js api/utils/Errors.js api/validators/Auth.js api/validators/User.js

git add client/src/App.jsx client/src/components/Configuration/BalancePagesConfig.jsx client/src/components/Configuration/BranchConfig.jsx client/src/components/Configuration/CitiesConfig.jsx client/src/components/Configuration/ImportSourcesConfig.jsx client/src/components/Configuration/ReportsConfig.jsx client/src/components/Configuration/SchedulerConfig.jsx client/src/components/Documents/DocumentRowAction.jsx client/src/components/Documents/DocumentsTable.jsx client/src/components/Header/Header.jsx client/src/components/Header/header.module.scss client/src/components/ParseExcel/ParseExcel.jsx client/src/components/RegionNotifications/RegionNotifications.jsx client/src/components/Reports/ReportRomashka.jsx client/src/components/SalesReport/SalesReport.jsx client/src/components/Sidebar/Sidebar.jsx client/src/components/UsersList/UsersList.jsx client/src/config.js client/src/context/AppConfigContext.jsx client/src/context/AuthContext.jsx client/src/pages/AdminPage.jsx client/src/pages/Demo.jsx client/src/pages/DocumentsPage.jsx client/src/pages/SignUp.jsx client/src/services/balances.api.js client/src/services/config.api.js client/src/services/createAuthenticatedApi.js client/src/services/directories.api.js client/src/services/documents.api.js client/src/services/inMemoryJWT.js client/src/services/regionNotifications.api.js client/src/services/reports.api.js client/src/services/scheduler.api.js client/vite.config.js

git add README.md AGENTS.md MEMORY.md .github/copilot-instructions.md .github/instructions/backend.instructions.md
```

Definition of done for the next slice:

- asset noise is removed from the branch
- branch changes are ready to group into intentional commits
- `MEMORY.md` is updated again with outcomes and verification after each completed slice

## Files Related To Current Task

Backend:

- `api/migrations/001_branch_configuration.js`
- `api/scripts/migrate.js`
- `api/services/appConfig.service.js`
- `api/controllers/configController.js`
- `api/routes/config.js`
- `api/controllers/balancesController.js`
- `api/routes/balances.js`
- `api/services/DocumentService.js`
- `api/services/documentAccess.service.js`
- `api/repositories/Reports.js`
- `api/controllers/Reports.js`
- `api/routes/reports.js`
- `api/services/scheduler.js`
- `api/controllers/SchedulerController.js`
- `api/services/loadAgents.js`
- `api/services/loadReports.js`
- `api/services/loadProducts.js`
- `api/services/loadTradePoints.js`
- `api/services/Auth.js`
- `api/controllers/Auth.js`
- `api/routers/Auth.js`
- `api/server.js`

Frontend:

- `client/src/context/AppConfigContext.jsx`
- `client/src/services/config.api.js`
- `client/src/services/balances.api.js`
- `client/src/App.jsx`
- `client/src/components/Header/Header.jsx`
- `client/src/components/ParseExcel/ParseExcel.jsx`
- `client/src/components/Reports/ReportRomashka.jsx`
- `client/src/components/RegionNotifications/RegionNotifications.jsx`
- `client/src/components/Sidebar/Sidebar.jsx`
- `client/src/components/UsersList/UsersList.jsx`
- `client/src/context/AuthContext.jsx`
- `client/src/pages/AdminPage.jsx`

## Risks When Continuing

- Running migrations on the wrong DB can alter production-like schema.
- Missing `branch_id` filters can leak documents/reports across branches in a future shared DB.
- Admin config mutations must stay restricted to Admin role.
- Public signup must remain disabled; user creation should stay admin-only unless explicitly redesigned.
- Existing user/admin routes may still need authentication hardening before multi-branch use.
- File import behavior must preserve the current rule:
  - JSON files loaded into DB may be deleted after success
  - XLSX balance files must not be deleted
- `IMPORT_DIR` fallback to `client/public/Sorce` is useful for local compatibility but should not be treated as final deployment design.
- Frontend direct `/Sorce` usage must not be reintroduced.
- Role IDs and hierarchy are business-critical and should remain stable unless explicitly redesigned.

## Last Known Verification

- Legacy cleanup completed:
  - removed empty `GET /api/auth/adminPage` route from `api/routers/Auth.js`
  - removed unused `api/controllers/AuthController.js`
  - removed unused `api/routes/users.js`
- Branch-scope audit completed:
  - fixed branch leakage in `region_notifications`
  - fixed branch leakage in report subqueries and document orphan-TA checks
  - fixed `document_sequences` update to scope by branch
  - fixed debug hierarchy endpoint to stay inside current branch
- Import architecture update completed:
  - backend syntax check passed
  - `npm run lint` in `client` passed
  - `npm run build` in `client` passed
- Scheduler/background jobs update completed:
  - backend syntax check passed
  - `npm run lint` in `client` passed
  - `npm run build` in `client` passed
- Environment/release-readiness update completed:
  - DB config moved out of hardcoded `api/db.cjs` values into env variables
  - `api/.env.example` now documents required DB settings
  - backend syntax check passed
  - `npm run lint` in `client` passed
  - `npm run build` in `client` passed
- Route security hardening update completed:
  - admin-only protection added to debug hierarchy endpoint
  - protected route mounts now enforce `authMiddleware` at the top level as defense in depth
  - backend syntax check passed
  - `npm run lint` in `client` passed
  - `npm run build` in `client` passed
- Branch-management CRUD update completed:
  - backend syntax check passed
  - `npm run lint` in `client` passed
  - `npm run build` in `client` passed
- Branch bootstrap update completed:
  - backend syntax check passed
  - `npm run lint` in `client` passed
  - `npm run build` in `client` passed
- Branch creation UX polish completed:
  - backend syntax check passed
  - `npm run lint` in `client` passed
  - `npm run build` in `client` passed
- Route alias cleanup completed:
  - backend syntax check passed
  - `npm run lint` in `client` passed
  - `npm run build` in `client` passed
- Frontend API client normalization completed:
  - backend syntax check passed
  - `npm run lint` in `client` passed
  - `npm run build` in `client` passed
- Demo transport cleanup completed:
  - backend syntax check passed
  - `npm run lint` in `client` passed
  - `npm run build` in `client` passed
- Scheduler runtime branch visibility update completed:
  - backend syntax check passed
  - `npm run lint` in `client` passed
  - `npm run build` in `client` passed
- Loader runtime guard hardening completed:
  - backend syntax check passed
  - `npm run lint` in `client` passed
  - `npm run build` in `client` passed
- Sales loader transaction/precheck hardening completed:
  - `node --check api/services/loadAgents.js` passed
  - `node --check api/services/loadReports.js` passed
  - `node --check api/services/scheduler.js` passed
- JSON loader retention-alignment completed:
  - `node --check api/services/loadProducts.js` passed
  - `node --check api/services/loadTradePoints.js` passed
- Scheduler run-summary surfacing completed:
  - `node --check api/services/scheduler.js` passed
  - `node --check api/controllers/SchedulerController.js` passed
  - `node --check api/services/loadAgents.js` passed
  - `node --check api/services/loadReports.js` passed
  - `node --check api/services/loadProducts.js` passed
  - `node --check api/services/loadTradePoints.js` passed
  - `node --check api/services/notify.retry.service.js` passed
  - `npm run lint` in `client` passed
  - `npm run build` in `client` passed
- Scheduler lastRun persistence update completed:
  - `node --check api/services/scheduler.js` passed
  - `node --check api/migrations/002_scheduler_last_run.js` passed
- Test DB migration rollout completed on April 26, 2026:
  - `npm run migrate` in `api` passed against the approved restored test DB
  - `schema_migrations` now contains `001_branch_configuration.js` and `002_scheduler_last_run.js`
  - seeded config data and `scheduler_tasks.lastRun` columns verified by direct DB queries
  - branch backfill verified: checked branch-scoped tables have `branch_id` and `NULL` count = 0
- Test DB smoke test completed on April 27, 2026:
  - authenticated smoke requests passed for health, auth, config, balances, reports, and documents
  - manual scheduler run returned structured `source_missing` result as expected on the test DB
  - backend restart passed and persisted `loadSalesReports.lastRun` remained visible after restart
- Backend startup hardening completed on April 27, 2026:
  - `node --check api/server.js` passed
  - `node --check api/services/scheduler.js` passed
  - scheduler startup is now bound to successful port binding instead of module import side effects
- Frontend dev-proxy hardening completed on April 27, 2026:
  - `npm run build` in `client` passed
  - Vite proxy now uses `localhost:5000` by default instead of a stale LAN IP
- Backend syntax check passed for the full `api` tree.
- `npm run lint` in `client` passed.
- `npm run build` in `client` passed.
- Frontend build still emits Sass legacy API warnings and a bundle-size warning.
- Planning checkpoint on May 9, 2026:
  - reviewed current workspace state and `MEMORY.md`
  - confirmed `npm run lint` passes in `client`
  - confirmed `npm run build` passes in `client`
  - confirmed backend syntax check passes across `api/*.js`
- User-access hardening checkpoint on May 9, 2026:
  - audited `Sidebar.jsx`, `Auth.js`, `User.js`, `configController.js`, and `appConfig.service.js`
  - patched backend scope enforcement for `branchAccessIds` during both create-user and update-user-access flows
  - `node --check api/services/appConfig.service.js` passed
  - `node --check api/services/Auth.js` passed
  - `node --check api/controllers/Auth.js` passed
- Scheduler UI adaptive refresh checkpoint on May 9, 2026:
  - implemented adaptive polling in `client/src/components/Configuration/SchedulerConfig.jsx`
  - polling now pauses while the browser tab is hidden and resumes with an immediate refresh on return
  - background refresh now preserves unsaved interval drafts
  - manual `Refresh` button and `Updated ...` status were added to the scheduler panel
  - `npm run lint` in `client` passed
  - `npm run build` in `client` passed
- Existing-user access seed checkpoint on May 9, 2026:
  - inspected the local `auth` DB in read-only mode
  - found 78 active users, 3 active branches, 2 existing extra `user_branch_access` rows, and 0 `user_city_access` rows
  - dry-run identified 5 missing primary branch-access rows and 2 missing primary city-access rows
  - rollout decision: seed only primary user scope rows; do not infer extra branch/city grants from legacy data
  - added `api/scripts/seedUserAccess.js` and `npm run seed:user-access`
  - `node --check api/scripts/seedUserAccess.js` passed
  - `npm run seed:user-access` dry-run passed and made no DB changes
- Bootstrap branch cutover checkpoint on May 9, 2026:
  - inspected current local branch/city/balance/report config in the `auth` DB
  - decision: bootstrap values should no longer live only as hardcoded migration SQL; they now live in `api/config/bootstrapBranchConfig.js`
  - added `api/scripts/syncBootstrapBranchConfig.js` and `npm run sync:bootstrap-branch`
  - dry-run confirmed current branch `id=1` mostly matches the bootstrap config, with 1 balance-page difference and 1 report difference still visible for explicit review before any apply
  - `node --check api/config/bootstrapBranchConfig.js` passed
  - `node --check api/scripts/syncBootstrapBranchConfig.js` passed
  - `node --check api/migrations/001_branch_configuration.js` passed
  - `npm run sync:bootstrap-branch` dry-run passed and made no DB changes
- Final cleanup checkpoint on May 9, 2026:
  - refactored `client/src/App.jsx` into smaller route helpers while keeping the current role-based route behavior
  - removed temporary root files created for smoke/balance investigation
  - `npm run lint` in `client` passed
  - `npm run build` in `client` passed
- Final review checkpoint on May 9, 2026:
  - added backend hierarchy validation so admin APIs now enforce valid `NTO -> SV -> TA` supervisor chains during both create-user and edit-user flows
  - added route-level request validation for `PUT /api/auth/users/:id`, `PUT /api/auth/users/:id/password`, and `PUT /api/auth/users/:id/supervisor`
  - documented asset-finalization guidance: `client/public/Sorce/*` looks intentional, while `client/dist/Sorce/*` looks mirrored/generated
  - `node --check api/controllers/User.js` passed
  - `node --check api/services/Auth.js` passed
  - `node --check api/services/userHierarchy.service.js` passed
  - `node --check api/repositories/User.js` passed
  - `node --check api/validators/User.js` passed
  - `node --check api/routers/Auth.js` passed
- Dist-asset cleanup checkpoint on May 9, 2026:
  - restored mirrored `client/dist/Sorce/balanceDP.xlsx`, `balanceKR.xlsx`, `balanceML.xlsx`, and `balanceZP.xlsx`
  - verified remaining asset diff now contains only `client/public/Sorce/*`
- Source-asset review checkpoint on May 9, 2026:
  - compared all changed `client/public/Sorce/*` files with `HEAD` and confirmed they were data-refresh snapshots, not branch-config asset changes
  - restored `client/public/Sorce/balanceDP.xlsx`, `balanceKR.xlsx`, `balanceML.xlsx`, `balanceZP.xlsx`, and `report_romashka.json`
  - verified no remaining diffs under `client/public/Sorce` or `client/dist/Sorce`
- Commit-scope review checkpoint on May 9, 2026:
  - reviewed the remaining `git diff` after asset cleanup and found no further generated-file noise in `public/dist`
  - updated `README.md` so project documentation now matches the implemented branch-config/admin-config state
  - commit recommendation: keep branch-config app code and rollout scripts together, but separate `AGENTS.md`, `MEMORY.md`, and `.github/instructions/*` into an explicit docs/tooling commit if they are to be versioned at all
- Push and PR-prep checkpoint on May 9, 2026:
  - created four commits for backend foundation, backend hardening, frontend branch-config UI, and docs/tooling guidance
  - pushed `branches-config` to `origin/branches-config` and set upstream tracking
  - branch is now ready for PR creation with a grouped summary of branch-config rollout, access hardening, scheduler/config UI, and rollout helper scripts
- Frontend route-regression fix checkpoint on May 9, 2026:
  - fixed `client/src/App.jsx` so custom helper wrappers no longer appear directly under `<Routes>`
  - `RomashkaRoute` / balance-route helpers now return route elements through plain render helpers instead of custom route components
  - this removes the runtime error: `is not a <Route> component. All component children of <Routes> must be a <Route> or <React.Fragment>`
  - `npm run build` in `client` passed
  - `npm run lint` in `client` passed
- Manual-QA follow-up checkpoint on May 9, 2026:
  - fixed branch visibility logic so branch-switch lists include both the user’s primary `users.branch_id` and the currently active branch token scope; this addresses the “can switch away from Default branch but cannot return” issue
  - persisted `AdminPage` tab state in `localStorage` and added safe tab click handling, so edits in `Конфігурація` no longer bounce the UI back to `Користувачі`
  - translated the remaining branch/scheduler/user-management admin UI strings and related snackbars to Ukrainian
  - translated residual backend/user-management validation and success messages that surface in admin flows
  - `node --check api/services/appConfig.service.js` passed
  - `node --check api/services/Auth.js` passed
  - `node --check api/controllers/Auth.js` passed
  - `node --check api/controllers/User.js` passed
  - `node --check api/services/userHierarchy.service.js` passed
  - `npm run lint` in `client` passed
  - `npm run build` in `client` passed
  - note: `vite build` again touched mirrored `client/dist/Sorce/*`; keep them out of the final commit unless a generated-asset refresh is explicitly intended
- Users hierarchy UX checkpoint on May 9, 2026:
  - added `Список / Ієрархія` toggle to `client/src/components/UsersList/UsersList.jsx`
  - hierarchy mode now renders a multi-level `NTO -> SV -> TA` tree while preserving the same per-user row actions as the flat list: password change, edit, and delete
  - added a Font Awesome unlink action for `TA` rows that are attached to an `SV`; it calls the existing supervisor endpoint with `supervisorId: null`
  - hierarchy mode also separates `SV без NTO`, `TA без керівника`, and non-hierarchy roles into their own sections instead of hiding them
  - added success/error snackbars for detach and delete actions in the users list
  - `npm run lint` in `client` passed
  - `npm run build` in `client` passed
  - mirrored `client/dist/Sorce/*` was restored again after build
- Inactive-tag readability checkpoint on May 9, 2026:
  - added `has-text-grey-light` to inactive status tags across branch/city/balance/report/import configuration tables
  - this improves readability for `Неактивна / Неактивне / Неактивний` tags rendered with Bulma `is-light`
  - `npm run lint` in `client` passed
- Fresh-deploy bootstrap checkpoint on May 9, 2026:
  - added `api/scripts/bootstrapEnvironment.js` and `npm run bootstrap:env`
  - the bootstrap script now:
    - creates the target MySQL database if it does not exist
    - runs the current migration set
    - seeds a default admin user (`admin` / `ChangeMe123!`) when the legacy `users` table is already present
    - warns explicitly when the remaining legacy runtime tables are still missing
  - updated `README.md` with a fresh-environment deployment flow and current limitations
  - important limitation recorded in docs: the repository still does not contain a full migration history for the entire legacy schema, so a truly clean bootstrap still requires either importing the legacy base schema or continuing the migration effort
  - `node --check api/scripts/bootstrapEnvironment.js` passed
- Bootstrap doctor checkpoint on May 9, 2026:
  - added `api/scripts/bootstrapDoctor.js` and `npm run bootstrap:doctor`
  - the doctor script now checks:
    - required and recommended env vars
    - MySQL server connectivity
    - target database existence
    - pending migrations
    - core branch-config table presence/shape
    - legacy runtime table presence/shape
    - admin-user readiness
    - branch runtime readiness, including `BRANCH_ID` / `BRANCH_SLUG` expectations for scheduler
  - updated `README.md` to document the new diagnostics command
  - `node --check api/scripts/bootstrapDoctor.js` passed

## Workflow Notes

- After each completed implementation slice, update `MEMORY.md` with:
  - what changed
  - what remains
  - latest verification status
- Before moving to the next roadmap item, explicitly tell the user what the next step will be.
- This file is the primary resume point for continuing work without re-scanning the whole repo.
## 2026-05-09 - Documentation guides checkpoint

- Created new root folder `documentation/` for end-user operational docs.
- Added `documentation/deployment-ubuntu-clean-server.md` with a detailed beginner-friendly guide for deploying the project on a clean Ubuntu server:
  - server preparation
  - Node.js / MySQL / Nginx / PM2 installation
  - repository setup
  - backend `.env` configuration
  - MySQL database and user creation
  - `bootstrap:doctor` and `bootstrap:env` usage
  - current limitation around missing full legacy schema migration history
  - frontend build
  - PM2 and Nginx configuration
  - HTTPS setup with Certbot
  - verification and troubleshooting
- Added `documentation/administrator-guide.md` with a detailed beginner-friendly administrator manual:
  - login and role overview
  - branch switching
  - user management
  - hierarchy mode and `TA -> SV -> NTO` relationships
  - detach flow for subordinate users
  - notifications
  - scheduler management and blocked-state meaning
  - configuration sections overview
  - sales reports caveats
  - documents workflow overview
  - daily admin checklist and common mistakes
- This documentation slice did not change runtime code.

## 2026-05-10 - Existing server upgrade guide checkpoint

- Reviewed server-specific deployment details gathered from `documentation/old-setings.txt` and `documentation/old-setings2.txt`.
- Confirmed current legacy server shape:
  - host: `ubserv` on Ubuntu 24.04
  - app repo path: `/var/www/apps/jwt-auth`
  - docker runtime path: `/var/www/apps/jwt-auth-docker`
  - current server git branch: `resbr6`
  - target branch for upgrade: `origin/branches-config`
  - deployment mode: in-place Docker update with acceptable short downtime
  - Rocket.Chat and app share external Docker network `rocketchat_default`
- Identified important deployment nuances that must be reflected in the upgrade plan:
  - Docker image is built from `/var/www/apps/jwt-auth-docker/app`, not directly from the git repo
  - frontend for `balance.sweetglobal.com.ua` is served by `rocketchat-nginx-1` from `/usr/share/nginx/html/balance`
  - backend container healthcheck currently points to `/health` instead of the real `/api/health`, which explains the false `unhealthy` status
  - current production DB still has legacy runtime tables only and requires branch-config migration rollout during upgrade
  - server repo contains local changes in `api/db.cjs` and generated `client/dist/Sorce/*.xlsx`, so the guide must preserve/inspect them before branch switching
- Added server-specific upgrade manual:
  - `documentation/update-existing-docker-server-to-branches-config.md`
  - includes backup, git branch switch, env update, compose healthcheck fix, repo-to-build-context sync, migration/doctor/bootstrap flow, frontend publish flow, verification, and rollback.

## 2026-05-10 - Existing server guide refinement checkpoint

- Reviewed and shortened `documentation/update-existing-docker-server-to-branches-config.md` to reduce repetition while keeping explanations of why each command is needed.
- Expanded the guide around production import-file handling:
  - explicit creation of host-side `IMPORT_DIR` at `/var/www/data/excel`
  - explanation that the Docker container sees the same path through the existing bind mount
  - Windows SMB/CIFS share mounting via `cifs-utils`
  - secure credentials file for SMB access
  - `/etc/fstab` example for persistent mount
  - sync script `/usr/local/bin/jwt-auth-import-sync.sh` that copies files from the mounted share into `IMPORT_DIR`
  - cron-based scheduled synchronization example
- The updated guide now reflects the real server-side file flow:
  - Windows source folder -> mounted Ubuntu share -> `/var/www/data/excel` -> Docker bind mount -> app imports/scheduler

## 2026-05-10 - Existing server quick-runbook checkpoint

- Added a compact "Короткий бойовий сценарій" section to the end of `documentation/update-existing-docker-server-to-branches-config.md`.
- The runbook keeps the same server-specific deployment path but compresses it into a practical execution checklist:
  - backup
  - stash and branch switch
  - `.env` update
  - `IMPORT_DIR` creation
  - Windows share mount
  - scheduled sync setup
  - compose healthcheck fix
  - repo-to-build-context sync
  - Docker rebuild
  - migrations and rollout scripts
  - frontend publish
  - final verification
  - rollback
## 2026-05-10 - Production commit prep checkpoint

- Re-checked the current `branches-config` workspace before release commit preparation.
- Verification re-run passed on the current code/docs package:
  - `npm run lint` in `client`
  - `npm run build` in `client`
  - `node --check` for the touched backend controller/service/bootstrap files
- Release-commit scope decision:
  - include current backend/frontend/docs/runtime-config changes
  - exclude `client/dist/Sorce/*` mirrored build artifacts from the commit
  - exclude current `client/public/Sorce/*` business-data snapshot changes from the commit, because they are operational/source-data refreshes rather than product-code changes

## 2026-05-10 - Production rollout commit pushed checkpoint

- Created commit `f67c045` with message:
  - `feat: finalize production rollout tooling and admin qa fixes`
- Pushed `branches-config` to `origin/branches-config`.
- Commit contains:
  - backend/frontend branch-config QA and admin-flow fixes
  - `bootstrapDoctor` and `bootstrapEnvironment`
  - deployment and administrator documentation
  - server-specific production upgrade guide with Windows-share import sync flow
- Intentionally not included in the commit:
  - `client/public/Sorce/*` business-data snapshots
  - `client/dist/Sorce/*` mirrored build artifacts
  - `documentation/old-setings.txt`
  - `documentation/old-setings2.txt`

## 2026-05-10 - Server guide .env example checkpoint

- Updated `documentation/update-existing-docker-server-to-branches-config.md` to include a full production `.env` example for the existing Docker server layout.
- The example now documents:
  - `CLIENT_URL`
  - `BRANCH_SLUG`
  - `IMPORT_DIR`
  - Docker-network DB connection values (`DB_HOST=mysql`)
  - SMTP / Rocket.Chat placeholders
  - `PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium`

## 2026-05-10 - SMB credentials clarification checkpoint

- Expanded `documentation/update-existing-docker-server-to-branches-config.md` with a practical clarification for `/root/.smb-credentials-sweetglobal`.
- Added both variants:
  - with `domain=...`
  - without `domain` for a plain local Windows user
- Documented the practical recommendation:
  - start without `domain` if unsure
  - add it only if the CIFS mount requires domain/workgroup context

## 2026-05-10 - Balance parser unification checkpoint

- Reworked balance XLSX parsing to reduce dependence on the old `balanceZP.xlsx`-specific category-name lists.
- Added shared helper:
  - `client/src/utils/balanceWorkbookParser.js`
- Updated:
  - `client/src/components/ParseExcel/ParseExcel.jsx`
  - `client/src/utils/dataLoader.js`
  - `client/src/components/Table/Table.jsx`
- New parsing approach:
  - reads last-update time from the report header dynamically
  - finds the actual data-start row dynamically instead of relying on a hardcoded row offset only
  - builds hierarchy primarily from Excel row outline metadata (`sheet['!rows'][i].level`)
  - uses light text heuristics for group rows where outline levels are inconsistent between bases
  - normalizes top wrapper groups like `ТОВАР` / `ТОВАРЫ ДЛЯ ТОРГОВЛИ`
  - stripes all leaf rows in the table instead of only `level === 3`, so deeper hierarchies still render cleanly
- Manual parser validation succeeded against:
  - `E:/1/balanceCH.xlsx`
  - `E:/1/balanceZP.xlsx`
- Validation outcome:
  - `balanceCH.xlsx` now parses into a sensible hierarchy rooted at `1. ТОВАРЫ ДЛЯ ТОРГОВЛИ -> РОШЕН -> ...`
  - `balanceZP.xlsx` now parses into a sensible hierarchy rooted at `ТОВАР -> МРІЯ/РОШЕН -> ...`
- Verification:
  - `npm run lint` in `client` passed
  - local `npm run build` attempt was blocked by environment disk exhaustion (`ENOSPC`), not by a parser/runtime syntax error

## 2026-05-11 - Server guide incremental-update checkpoint

- Extended `documentation/update-existing-docker-server-to-branches-config.md` with a short end-of-file section for routine follow-up updates after the server is already migrated to `branches-config`.
- The new section covers:
  - updating the git repo
  - syncing code into `/var/www/apps/jwt-auth-docker/app`
  - rebuilding and recreating the backend container
  - optional migration/doctor rerun
  - rebuilding frontend
  - copying frontend into `rocketchat-nginx-1`
  - final health/smoke verification

## 2026-05-16 - Balance UI compaction checkpoint

- Reworked the balance filter/search panel to make it noticeably smaller and calmer:
  - reduced padding, title size, chip size, field height, and overall visual weight
  - kept the same search + `ВІП / ОПТ / увесь товар` behavior
  - mobile layout still stacks cleanly into one column
- Reworked the balance table back toward readability:
  - restored a light table surface instead of heavy dark gradients
  - brought back clearer row separation and calmer alternating leaf rows
  - preserved hierarchy coloring for group rows while improving text contrast
  - tightened indentation, button size, and quantity column width for better density
  - kept horizontal scrolling behavior for phones and narrower screens
- Small table runtime cleanup:
  - row visibility lookup now uses a memoized `rowMap` instead of repeated linear parent searches
  - leaf-row striping order is precomputed once per render
- Verification:
  - `npm run build` in `client` passed
  - build still reports the known Sass legacy API deprecation warnings and large-chunk warning

## 2026-05-16 - Balance UI extra mobile compaction checkpoint

- Further reduced the balance filter and table footprint after device-width feedback:
  - removed rounding from the filter panel, inputs, stat chips, table shell, and toggle buttons
  - reduced filter paddings, field heights, label sizes, and chip sizes again
  - reduced hierarchy indentation and quantity-column width in the table
  - switched the table to a tighter fixed-layout presentation so it fits narrow screens better
  - narrowed mobile paddings and font sizes for the `430x932` class of screens
- Verification:
  - `npm run build` in `client` passed
  - build still reports the known Sass legacy API deprecation warnings and large-chunk warning

## 2026-05-17 - Balance filter option color checkpoint

- Fixed the native select dropdown option colors for the balance filter:
  - added explicit dark background and light text styling for `.selectControl option`
  - added a slightly stronger selected-option color state
- Verification:
  - `npm run build` in `client` passed
  - build still reports the known Sass legacy API deprecation warnings and large-chunk warning

## 2026-05-17 - Balance product text emphasis checkpoint

- Made product-name text in the balance table bold via `.productText` for stronger readability.
- Verification:
  - `npm run build` in `client` passed
  - build still reports the known Sass legacy API deprecation warnings and large-chunk warning

## 2026-05-17 - Vite LAN dev-host checkpoint

- Updated `client/vite.config.js` so LAN testing from a phone works without custom CLI flags:
  - dev server now binds to `0.0.0.0` by default
  - added configurable `VITE_DEV_PORT` and `VITE_PREVIEW_PORT`
  - added optional `VITE_DEV_PUBLIC_HOST` for HMR when a specific LAN IP is needed
  - proxy behavior to backend API stays unchanged
- This only affects Vite dev/preview runtime and does not change production build output or server deploy behavior.

## 2026-05-17 - Dev LAN CORS checkpoint

- Fixed the likely phone-only `500` during local LAN development:
  - backend `api/server.js` now allows private-network dev origins (`192.168.x.x`, `10.x.x.x`, `172.16-31.x.x`, plus localhost variants) when `NODE_ENV !== "production"`
  - production CORS behavior remains strict and still honors configured `CLIENT_URL`
- Verification:
  - `node --check api/server.js` passed

## 2026-05-17 - Docker update guide correction checkpoint

- Updated `documentation/update-existing-docker-server-to-branches-config.md` so repeated deploys on the existing Docker server no longer trip over `client/dist` permissions:
  - all repo-to-build-context `rsync` examples now exclude `api/.env` and `client/dist`
  - frontend build steps now run from `/var/www/apps/jwt-auth/client`
  - frontend publish steps now copy from `/var/www/apps/jwt-auth/client/dist`
  - corrected the documented frontend build-output path accordingly
- This was a documentation-only change based on the real server behavior observed during deploy.

## 2026-05-17 - PDF Kyiv timezone checkpoint

- Fixed document-PDF timestamp formatting so it no longer depends on the Node/container local timezone:
  - added shared helper `api/pdf/dateFormatters.js`
  - `return.template.js` and `exchange.template.js` now format stamp/history datetimes with explicit `Europe/Kyiv`
  - `documentTemplate.js` now uses the same shared Kyiv-aware date formatter
  - date-only strings like `YYYY-MM-DD` are normalized safely before formatting to avoid timezone drift
- Verification:
  - `node --check api/pdf/dateFormatters.js` passed
  - `node --check api/pdf/return.template.js` passed
  - `node --check api/pdf/exchange.template.js` passed
  - `node --check api/pdf/documentTemplate.js` passed

## 2026-05-17 - Rocket upload API migration checkpoint

- Updated Rocket.Chat notification upload flow in `api/services/notify.service.js`:
  - replaced removed `rooms.upload/{rid}` usage with the current `rooms.media/{rid}` upload step
  - added `rooms.mediaConfirm/{rid}/{fileId}` confirm step to actually post the uploaded file into the room
  - added shared response parsing for Rocket API calls so non-JSON / proxy / 404 responses are logged as readable errors instead of generic JSON parse failures
  - `rooms.info` lookup now uses the same safer response parser
- Sources used for the migration decision:
  - Rocket.Chat deprecated endpoints docs (`rooms.upload/:rid` -> `rooms.media/:rid`)
  - Rocket.Chat upload-media docs
  - Rocket.Chat end-to-end API tests showing `rooms.mediaConfirm/{rid}/{fileId}`
- Verification:
  - `node --check api/services/notify.service.js` passed

## 2026-05-17 - Deploy guide split-runbook checkpoint

- Extended `documentation/update-existing-docker-server-to-branches-config.md` with two additional targeted runbooks:
  - `Пересборка тільки backend`
  - `Пересборка тільки frontend`
- The backend-only block now includes:
  - git update
  - repo-to-build-context sync
  - backend rebuild/recreate
  - optional migrations
  - quick `/api/health` check
- The frontend-only block now includes:
  - git update
  - local frontend rebuild from `/var/www/apps/jwt-auth/client`
  - publish to `rocketchat-nginx-1`
  - quick public-domain checks

## 2026-05-17 - Debet static report checkpoint

- Added a second config-driven static report based on `DebetReport.json`.
- Backend:
  - added `report-debet` to bootstrap branch config
  - added migration `api/migrations/003_add_debet_report_definition.js` so existing branches receive the report definition without a full re-bootstrap
  - extended `ReportsController.getStaticReport` to apply hierarchy-aware filtering for Debet report rows
  - added `ReportsRepository.getVisibleTaUsers` to reuse the current TA/SV/NTO/Accountant visibility tree for static-report filtering
- Frontend:
  - added `ReportDebet` screen and styles
  - introduced `reportRegistry.js` so static reports are routed/rendered through a shared registry instead of hardcoded one-off wiring
  - updated `App.jsx` and `Header.jsx` to build static report routes/menu entries from active report config plus registry access rules
  - configurator support comes automatically from `report_definitions`, so the Debet report can be disabled/enabled through the existing reports config UI
- Verification:
  - `node --check api/controllers/Reports.js` passed
  - `node --check api/repositories/Reports.js` passed
  - `node --check api/migrations/003_add_debet_report_definition.js` passed
  - `npm run build` in `client` passed

## 2026-05-17 - Debet report TA grouping checkpoint

- Reworked the Debet report presentation so it follows the same mental model as the sales report:
  - top-level grouping is now `TA -> rows of their debt`
  - the TA header uses `user_name`/collector as the primary label
  - login is secondary metadata under the TA header instead of a dedicated table column
  - each TA block is collapsible and contains only that TA's debt rows
- Verification:
  - `npm run build` in `client` passed

## 2026-05-17 - Debet overdue filter checkpoint

- Added a quick checkbox filter next to Debet report search:
  - label: `Тільки прострочений борг`
  - when enabled, keeps only rows where `overdueDays > 0`
  - combines cleanly with the existing text search and TA grouping
- Verification:
  - `npm run build` in `client` passed

## 2026-05-17 - Debet nested hierarchy checkpoint

- Reworked Debet report layout into a three-level hierarchy:
  - level 1: TA
  - level 2: `Контрагент + торгова точка`
  - level 3: document rows with `Номер документа`, `Дата документа`, `Дата оплати`, `Сума док.`, `Передоплата`, `Днів прострочки`
- The TA header still uses `user_name`/collector as the main display label.
- Removed phone from visible output.
- Changed `Тільки прострочений борг` to be enabled by default.
- Verification:
  - `npm run build` in `client` passed

## 2026-05-17 - Debet default collapse checkpoint

- Changed Debet report default expansion so the screen opens collapsed to level 2:
  - TA groups stay expanded
  - contractor groups are collapsed by default
- Verification:
  - `npm run build` in `client` passed

## 2026-05-26 - Debet grouping and visibility checkpoint

- Updated Debet static report behavior:
  - added a grouping switch in `client/src/components/Reports/ReportDebet.jsx`
  - collector grouping keeps the existing hierarchy: `TA -> contractor/trade point -> documents`
  - contractor grouping adds the alternate hierarchy: `contractor/trade point -> TA -> documents`
  - both modes keep the search box and default overdue-only filter
  - contractor/TA child groups remain collapsed by default while top-level groups open by default
- Updated Debet report visibility:
  - `GET /api/reports/static/report-debet` now returns the full active `DebetReport.json` for the current branch
  - removed the Debet-specific role/hierarchy row filter from `api/controllers/Reports.js`
  - removed the now-unused `ReportsRepository.getVisibleTaUsers` helper
- Verification:
  - `node --check api/controllers/Reports.js` passed
  - `node --check api/repositories/Reports.js` passed
  - `npm run lint` in `client` passed
  - `npm run build` in `client` passed with the known Sass legacy API and chunk-size warnings

## 2026-05-27 - Debet contractor address checkpoint

- Refined Debet contractor address rendering in `client/src/components/Reports/ReportDebet.jsx`:
  - added a small `getTradePointAddress` helper
  - contractor groups now store `address` during hierarchy construction
  - collector grouping displays the address under the contractor/trade point child header
  - contractor grouping displays the address under the top-level contractor/trade point header
  - removed a temporary `console.log` from the report render
- Verification:
  - `npm run lint` in `client` passed
  - `npm run build` in `client` passed with the known Sass legacy API and chunk-size warnings

## 2026-05-27 - Debet fact column checkpoint

- Reviewed the new Debet document-table `Факт` column in `client/src/components/Reports/ReportDebet.jsx`:
  - `DebetReport.json` rows contain boolean `fact` values
  - the table renders the same check icon pattern used by `Ф2` when `row.fact` is truthy
  - the column is included alongside `Ф2`, before the document date
- Verification:
  - `node --check api/controllers/Reports.js` passed
  - `node --check api/repositories/Reports.js` passed
  - `npm run lint` in `client` passed
  - `npm run build` in `client` passed with the known Sass legacy API and chunk-size warnings

## 2026-05-27 - Orders-by-time report and header checkpoint

- User preference recorded: always append a concise `MEMORY.md` summary for completed work slices.
- Added a new config-driven static report for order uploads by hour:
  - bootstrap report key: `report-orders-by-time`
  - route: `/orders-by-time`
  - source file: `OrderByTimet.json` from `IMPORT_DIR`
  - frontend component: `client/src/components/Reports/ReportOrdersByTime.jsx`
  - styles: `client/src/components/Reports/ReportOrdersByTime.module.scss`
  - registry entry added in `client/src/components/Reports/reportRegistry.js`
- Added and applied migration `api/migrations/004_add_orders_by_time_report_definition.js`.
- Ran branch config sync against local DB:
  - `npm run migrate` applied migration `004_add_orders_by_time_report_definition.js`
  - `node scripts/syncBootstrapBranchConfig.js --apply` synced `localhost:3306/auth`
- Iterated report UX:
  - grouped table by `city -> supervisor -> TA`
  - added city totals below the total order count in the report header
  - made the table denser with smaller padding/font sizes
  - added thick visual separators between city groups
  - shortened displayed supervisor/TA names by removing the last word from full names
  - added an hourly share row (`доля заявок за годину`) under the table headers with red/yellow/green percentage highlighting
- Updated app Header report navigation:
  - when more than one accessible active static report exists, reports render as a single select instead of separate links
  - the same select appears in desktop header navigation and burger menu because both use the shared `navPages` markup
  - if only one report is accessible, the old single-link behavior remains
- Verification:
  - `node --check api/migrations/004_add_orders_by_time_report_definition.js` passed
  - `npm run lint` in `client` passed
  - `npm run build` in `client` passed before the final header change with known Sass legacy API and chunk-size warnings
  - after disk space was freed on 2026-05-29, `npm run lint` and `npm run build` in `client` both passed; build still emits the known Sass legacy API and chunk-size warnings
- Notes:
  - generated `client/dist` changes from build attempts were restored
  - pre-existing unrelated workspace changes remain untouched, including deleted `client/public/Sorce/*` files and documentation edits

## 2026-05-29 - Documentation maintenance rule checkpoint

- Re-read `MEMORY.md`, `AGENTS.md`, and `README.md` at the user's request.
- Promoted the user's documentation preference into repo guidance:
  - after every completed project change, append a concise checkpoint to `MEMORY.md`
  - update `AGENTS.md` and/or `README.md` too when the change affects operating instructions, setup, runbooks, or current capabilities
- Updated `README.md` current-state notes to mention config-driven static reports, the order-upload-by-hour report, and Header report select behavior.

## 2026-06-04 - Universal 1C report JSON export draft

- Added `documentation/1c-universal-report-json-module.bsl` as a first-stage draft for replacing XLSX output from saved 1C DCS report variants with structured JSON files.
- The draft reuses the existing report name, DCS schema name, and saved variant key approach.
- JSON output includes:
  - stable external `reportKey`, report/variant metadata, generation time, and period values
  - a generic column description array with `field_N`, source name, and title
  - flattened DCS result rows with `_level` and `_hasChildren` hierarchy metadata
  - normalized primitive values and ISO-like date strings
- The output remains file-based in `D:\BAL\Exchange\`; HTTP POST integration is intentionally deferred until JSON generation is validated in 1C.
- Verification limitation:
  - the repository has no 1C/BSL compiler or runtime, so the module must be tested in the target 1C platform/version; DCS value-collection output APIs may require a small compatibility adjustment depending on platform version and report structure.

## 2026-06-04 - Universal 1C JSON DCS collection-generator fix

- First runtime test of `documentation/1c-universal-report-json-module.bsl` failed for both saved variants with `Ошибка вывода результата: Неизвестный тип макета`.
- Fixed DCS collection output by generating the layout with:
  - `Тип("ГенераторМакетаКомпоновкиДанныхДляКоллекцииЗначений")`
- Replaced the compact `ПроцессорВывода.Вывести(Процессор)` call with the explicit and more compatible `НачатьВывод` / `Следующий` / `ВывестиЭлемент` / `ЗакончитьВывод` loop.
- Remaining runtime caveat:
  - if a saved DCS variant contains tables, diagrams, or nested reports, 1C may reject collection output with a separate unsupported-layout error; in that case an integration-specific detail-only report variant or another extraction strategy will be required.

## 2026-06-04 - Universal 1C JSON tabular-document fallback

- Runtime confirmed both current saved DCS variants contain table, diagram, or nested-report structures and cannot be generated into a universal value collection.
- Changed `documentation/1c-universal-report-json-module.bsl` to:
  - generate the normal DCS `ТабличныйДокумент`
  - iterate through its visible rows and columns
  - serialize non-empty rows as JSON cell arrays
- JSON schema version is now `2` and declares `outputMode: "tabular-document-matrix"` with `width`, `height`, and `{ rowNumber, cells }` rows.
- Tradeoff: this supports complex DCS layouts but stores displayed cell text rather than typed semantic fields or explicit hierarchy metadata.
- Verification limitation:
  - the repository has no 1C/BSL compiler or runtime, so the updated module must be rerun in the target 1C environment.

## 2026-05-29 - Static report role access checkpoint

- Added configurable per-report role visibility:
  - new migration `api/migrations/005_report_allowed_roles.js` adds `report_definitions.allowed_roles`
  - bootstrap defaults now set `report-orders-by-time` to Director, `report-debet` to Director/NTO/SV/TA/Accountant, and `report-romashka` to Director
  - Admin always has access; `NULL` means all roles, while `[]` means admin-only
- Moved static report access out of hardcoded frontend registry role lists:
  - `reportRegistry.js` now maps report keys to React components only and checks configured `allowedRoles`
  - app routes and Header report select use configured role access
- Hardened backend access:
  - `/api/config` returns only static reports visible to the current user
  - `/api/reports/static/:reportKey` checks `allowed_roles` before reading the static report JSON
  - branch clone/sync/bootstrap helpers preserve `allowed_roles`
- Updated admin report configuration UI to edit role checkboxes per report.
- Updated `README.md`, `AGENTS.md`, and `bootstrapDoctor` schema checks for report role access.
- Verification:
  - `node --check api/services/appConfig.service.js` passed
  - `node --check api/controllers/Reports.js` passed
  - `node --check api/migrations/005_report_allowed_roles.js` passed
  - `node --check api/scripts/syncBootstrapBranchConfig.js` passed
  - `node --check api/scripts/bootstrapDoctor.js` passed
  - `npm run lint` in `client` passed
  - `npm run build` in `client` passed with known Sass legacy API and chunk-size warnings
- Notes:
  - migration was not run in this slice
  - generated `client/dist` changes from build were restored
  - pre-existing unrelated workspace changes remain untouched, including deleted `client/public/Sorce/*` files and documentation/source-report work from the previous slice

## 2026-05-29 - Reports config compact UI checkpoint

- Tightened `client/src/components/Configuration/ReportsConfig.jsx` after adding role access controls:
  - widened the reports table column and narrowed the edit form column
  - made the table `is-narrow` with smaller text, fixed column widths, and ellipsis for long key/route/title/file cells
  - rendered role access as compact small tags instead of a long comma-separated string
  - shortened row action buttons to compact `Edit`/`On`/`Off` buttons with tooltips
  - reduced form field, label, help-text, and role-checkbox spacing/font sizes
- Verification:
  - `npm run lint` in `client` passed
  - `npm run build` in `client` passed with known Sass legacy API and chunk-size warnings
- Notes:
  - generated `client/dist` changes from build were restored

## 2026-05-29 - Configuration page compact layout checkpoint

- Applied the compact admin configuration style to the whole Configuration tab:
  - added `client/src/components/Configuration/configurationCompact.css`
  - wrapped the Configuration tab content in `AdminPage.jsx` with `configuration-compact`
  - tightened section padding, column spacing, headings, tables, tags, buttons, labels, inputs, checkboxes, help text, notifications, and code snippets
  - kept the compact style scoped to the Configuration tab only, leaving Users, Notifications, and the standalone Scheduler tab unchanged
- Verification:
  - `npm run lint` in `client` passed
  - `npm run build` in `client` passed with known Sass legacy API and chunk-size warnings
- Notes:
  - generated `client/dist` changes from build were restored

## 2026-05-29 - Header config fallback checkpoint

- Investigated missing Header links for balances/reports after adding static report role access.
- Root cause: `/api/config` can fail before migration `005_report_allowed_roles.js` is applied because backend queries selected `report_definitions.allowed_roles`; balances and reports both depend on this config response, so Header rendered no dynamic links.
- Hardened backend report-config reads:
  - added a runtime `allowed_roles` column check in `api/services/appConfig.service.js`
  - config/report reads now select `NULL AS allowedRoles` when the column is not present yet
  - static report file access now uses the shared report definition lookup
  - branch clone/report update logic skips `allowed_roles` writes until the column exists
- Verification:
  - `node --check api/services/appConfig.service.js` passed
  - `node --check api/controllers/Reports.js` passed
- Notes:
  - migration `005_report_allowed_roles.js` is still required for persisted per-report role configuration

## 2026-05-29 - Reports config roles display checkpoint

- Refined `client/src/components/Configuration/ReportsConfig.jsx`:
  - removed fixed report-table column widths plus fixed table layout/min-width
  - relaxed compact cell styling so the table can size columns naturally
  - added frontend `allowedRoles` normalization for arrays, JSON strings, comma-separated strings, and null values
  - role tags now display configured roles even if API data reaches the component as serialized JSON
- Checked local DB state:
  - `report_definitions.allowed_roles` column exists
  - current values are `report-romashka = []`, `report-debet = [2,3,4,5,6]`, `report-orders-by-time = [2]`
  - service-level `getReportsForBranch` returns parsed arrays
- Verification:
  - `npm run lint` in `client` passed
  - `npm run build` in `client` passed with known Sass legacy API and chunk-size warnings
- Notes:
  - generated `client/dist` changes from build were restored
  - `report-romashka = []` means admin-only in the current local DB; change it in UI if Director should see it

## 2026-05-30 - Orders-by-time DB storage checkpoint

- Converted `report-orders-by-time` backend storage from direct JSON response toward DB-backed rows:
  - added migration `api/migrations/006_orders_by_time_report_table.js`
  - added `orders_by_time_report_rows` with branch/date/datetime/order/TA/SV/city fields
  - added `api/services/ordersByTimeReport.service.js`
  - `GET /api/reports/static/report-orders-by-time` now syncs `OrderByTimet.json` into the DB and returns DB rows
- Import behavior:
  - source rows are normalized from JSON fields `date`, `number`, `salesAgent`, `supervisor`, `city`
  - import replaces all rows for dates present in the source file, preventing duplicate rows for the same day across imports
  - rows older than 31 days are deleted during sync
  - if the source file has not changed since the last DB update and rows already exist, import is skipped to avoid unnecessary rewrites
  - if the source file is missing, existing DB rows are still returned after retention cleanup
- Updated `bootstrapDoctor`, `README.md`, and `AGENTS.md` for the DB-backed orders-by-time report.
- Verification:
  - `node --check api/migrations/006_orders_by_time_report_table.js` passed
  - `node --check api/services/ordersByTimeReport.service.js` passed
  - `node --check api/controllers/Reports.js` passed
  - `node --check api/scripts/bootstrapDoctor.js` passed
- Notes:
  - migration was not run in this slice

## 2026-05-30 - Orders-by-time import and scheduler checkpoint

- Added the DB-backed orders-by-time report to admin import/scheduler management:
  - new import source key: `loadOrdersByTimeReport`
  - default file: `OrderByTimet.json`
  - new scheduler task key: `loadOrdersByTimeReport`
  - default interval: 300000 ms
  - added migration `api/migrations/007_add_orders_by_time_import_and_scheduler.js`
  - updated `api/migrations/001_branch_configuration.js` seed data for fresh installs
  - added the import source label in `ImportSourcesConfig.jsx`
- Updated scheduler wiring:
  - `api/services/scheduler.js` now registers `Load orders by time report`
  - `api/services/ordersByTimeReport.service.js` exports `loadOrdersByTimeReport`
  - report page sync now prefers the configured import source and uses the report definition filename only as fallback
- Verification:
  - `node --check api/services/ordersByTimeReport.service.js` passed
  - `node --check api/services/scheduler.js` passed
  - `node --check api/migrations/001_branch_configuration.js` passed
  - `node --check api/migrations/007_add_orders_by_time_import_and_scheduler.js` passed
  - `node --check api/controllers/Reports.js` passed
  - `npm run lint` in `client` passed
  - `npm run build` in `client` passed with known Sass legacy API and chunk-size warnings
- Notes:
  - migration was not run in this slice
  - generated `client/dist` changes from build were restored

## 2026-05-31 - Bill of lading report DB/import checkpoint

- Added a DB-backed collected-bills static report:
  - report key: `report-bill-of-lading`
  - route: `/bill-of-lading`
  - source file: `BillOfLading.json`
  - storage table: `bill_of_lading_report_rows`
  - migration: `api/migrations/008_bill_of_lading_report.js`
- Import behavior:
  - report days are calculated as 08:00 through next-day 08:00 using `scanDate`
  - rows are grouped in UI by `warehouseName -> picker`
  - picker rows sort by `scanDate` ascending
  - source fields `id` and `warehouseCode` are intentionally not stored or rendered
  - imports replace all rows for source report dates to avoid duplicate day rows
  - rows older than 31 days are pruned during sync/import
- Admin/runtime wiring:
  - added import source key `loadBillOfLadingReport`
  - added scheduler task key `loadBillOfLadingReport`
  - added the import source label in `ImportSourcesConfig.jsx`
  - added frontend component `ReportBillOfLading` and registered it in `reportRegistry.js`
  - default report access is Director and Warehouse roles; Admin always sees it
- Verification:
  - `node --check api/services/billOfLadingReport.service.js` passed
  - `node --check api/migrations/008_bill_of_lading_report.js` passed
  - `node --check api/controllers/Reports.js` passed
  - `node --check api/services/scheduler.js` passed
  - `node --check api/migrations/001_branch_configuration.js` passed
  - `node --check api/scripts/bootstrapDoctor.js` passed
  - `npm run lint` in `client` passed
  - `npm run build` in `client` passed with known Sass legacy API and chunk-size warnings
- Notes:
  - migration was not run in this slice
  - generated `client/dist` changes from build were restored

## 2026-05-31 - Bill of lading Header visibility fix checkpoint

- Fixed why `report-bill-of-lading` did not appear in the Header reports select:
  - the bootstrap entry had accidentally been placed in `balancePages` instead of `reports`
  - Header receives static reports from `/api/config`, which reads `report_definitions`, so the misplaced bootstrap entry was never seeded as a report definition
- Moved the `report-bill-of-lading` bootstrap entry into `defaultBootstrapBranchConfig.reports`.
- Added repair migration `api/migrations/009_add_bill_of_lading_report_definition.js` so databases that already ran migration `008` can still receive the missing report definition.
- Verification:
  - `node --check api/config/bootstrapBranchConfig.js` passed
  - `node --check api/migrations/008_bill_of_lading_report.js` passed
  - `node --check api/migrations/009_add_bill_of_lading_report_definition.js` passed
- Notes:
  - migration was not run in this slice
  - default visibility remains Director and Warehouse; Admin always sees the report

## 2026-05-31 - Bill of lading report compact mobile UX checkpoint

- Refined `client/src/components/Reports/ReportBillOfLading.jsx` and styles:
  - removed sticky/fixed behavior from the first table column so the table can stay more compact
  - shortened picker names by removing the patronymic/last name part from three-part names
  - shows `scanDate` with seconds
  - replaced one global summary line with one summary row per warehouse
  - added collapse/expand controls for both warehouse and picker groups, with all groups expanded by default
  - tightened report spacing, table width, font sizes, and mobile/tablet density
- Recorded product UX preference in `AGENTS.md`: phones and tablets are primary app devices, so report tables should be compact, adaptive, and touch-friendly by default.
- Verification:
  - `npm run lint` in `client` passed
  - `npm run build` in `client` passed with known Sass legacy API and chunk-size warnings
- Notes:
  - generated `client/dist` changes from build were restored

## 2026-05-31 - Orders-by-time first column sizing checkpoint

- Refined `client/src/components/Reports/ReportOrdersByTime.module.scss`:
  - removed sticky positioning from the first table column
  - removed the `230px` minimum width from `.nameCell`
  - kept names on one line so `Місто / СВ / ТА` sizes by content instead of a fixed minimum
- Verification:
  - `npm run build` in `client` passed with known Sass legacy API and chunk-size warnings
- Notes:
  - generated `client/dist` changes from build were restored

## 2026-05-31 - Orders-by-time cell details checkpoint

- Modernized `client/src/components/Reports/ReportOrdersByTime.jsx`:
  - each non-empty hourly count cell is now clickable
  - clicking a count opens a compact details panel with order numbers and order times for that group/hour
  - detail orders are sorted by timestamp ascending
- Added compact/touch-friendly styles in `ReportOrdersByTime.module.scss` for count buttons and the details panel.
- Verification:
  - `npm run lint` in `client` passed
  - `npm run build` in `client` passed with known Sass legacy API and chunk-size warnings
- Notes:
  - generated `client/dist` changes from build were restored

## 2026-05-31 - Orders-by-time clickable cell cleanup checkpoint

- Refined the hourly count details interaction:
  - removed visible buttons from count cells in `ReportOrdersByTime.jsx`
  - made the `td` cells themselves clickable while preserving keyboard Enter/Space activation
  - replaced button styling with a subtle hover/focus state on the cell
- Verification:
  - `npm run lint` in `client` passed

## 2026-06-01 - Sales report NTO visibility fallback checkpoint

- Updated `api/repositories/Reports.js` sales report filtering for NTO users:
  - NTO still sees their own recursive subordinate tree
  - NTO still sees TA users with no supervisor
  - all NTO in the active branch now also see TA reports under SV users that have no assigned NTO
  - branch scoping remains tied to `sales_reports.branch_id` and the TA/SV users' `branch_id`
- Verification:
  - `node --check api/repositories/Reports.js` passed

## 2026-06-03 - Configurable 1C XLSX reports checkpoint

- Added configurable `Звіти XLSX з 1С` support:
  - migration `010_xlsx_1c_reports.js` adds `report_type`, `sheet_name`, `header_row`, and `data_start_row` to `report_definitions`
  - admin report configuration can create new report pages and store XLSX-specific parsing settings
  - backend `/api/reports/static/:reportKey` now parses `xlsx-1c` reports from `IMPORT_DIR`
  - frontend route registry renders generic XLSX report pages through `ReportXlsx1C`
  - `api/package.json` now declares `xlsx` for backend XLSX parsing
- Verification:
  - `node --check` passed for touched backend controller/service/migration files
  - `npm run lint` in `client` passed
  - `npm run build` in `client` passed with known Sass legacy API and chunk-size warnings
- Notes:
  - generated `client/dist` changes from build were restored
  - pre-existing local `client/public/Sorce/*` deletions and `documentation/old-setings*.txt` files were not touched

## 2026-06-03 - 1C XLSX report readability and hierarchy checkpoint

- Refined generic 1C XLSX report rendering:
  - switched `ReportXlsx1C` table colors to a readable dark theme
  - preserved Excel outline/group hierarchy through `sheet["!rows"].level`
  - applied indentation and row-level styling based on the original XLSX hierarchy metadata
- Verification:
  - parsed `Max.xlsx` and confirmed outline levels are returned for grouped rows
  - `node --check api/services/xlsx1cReport.service.js` passed
  - `npm run lint` in `client` passed

## 2026-06-04 - 1C XLSX hierarchy row alignment checkpoint

- Corrected generic XLSX hierarchy extraction:
  - stopped relying on `sheet_to_json` row arrays for report data because 1C sheets can shift visible row alignment
  - now reads cells directly by Excel row/column addresses from `!ref`
  - confirmed `Max.xlsx` hierarchy matches the original outline: row 16 level 1, rows 17-22 level 2, row 23 level 1, etc.
  - adjusted dark table styling so level 1 rows read as parent/group rows and level 2 rows as children
- Verification:
  - `node --check api/services/xlsx1cReport.service.js` passed
  - `npm run lint` in `client` passed

## 2026-06-04 - 1C XLSX multi-row header checkpoint

- Updated generic XLSX report headers:
  - rows from configured `headerRow` through the row before `dataStartRow` are now treated as the table header
  - backend returns `headerRows` preserving each header row separately
  - frontend renders a multi-row `<thead>` instead of collapsing all header data into one label row
- Verification:
  - confirmed `Max.xlsx` with `headerRow=12` and `dataStartRow=15` returns header rows 12-14 and first data row 15
  - `node --check api/services/xlsx1cReport.service.js` passed
  - `npm run lint` in `client` passed

## 2026-06-05 - SalesAgent 1C GUID export checkpoint

- Updated `client/public/Sorce/Sales agent JSON.epf_ Модуль объекта.txt` so `SalesAgent.json` can include stable 1C GUIDs while preserving the existing top-level array format.
- The 1C query now selects references for:
  - route
  - regional division
  - current sales agent
  - supervisor / route group
- Each JSON row now writes:
  - `routeGuid`
  - `regionalDivisionGuid`
  - `currentAgentGuid`
  - `supervisorGuid`
- Removed noisy per-row `Сообщить` logging and kept only final file path plus exported row count.
- Verification:
  - reviewed `api/services/loadAgents.js`; the current importer expects a top-level array and ignores extra row fields, so this export remains backward-compatible until backend external-key persistence is added.

## 2026-06-07 - DB-backed Montblanc/Lacmi XLSX sales reports

- Added migration `api/migrations/011_xlsx_1c_sales_report_rows.js`:
  - adds `report_definitions.retention_days`
  - creates `xlsx_1c_sales_report_values`
  - seeds separate `xlsx-1c-sales` report definitions for Montblanc and Lacmi
- Added `api/services/xlsx1cSalesReport.service.js`:
  - reads report date from the XLSX parameters row
  - uses XLSX numeric cell values instead of formatted text
  - builds dynamic metric keys/labels from XLSX header rows
  - stores one DB row per report/date/TA/metric value
  - matches visible TA rows by `users.user_name`
  - stores unmatched leaf/TA-like rows with `user_id = NULL` so they can be listed as excluded
  - treats full-person-name rows and `КАМ ...` rows as leaf/TA-like when they are not matched to `users.user_name`
  - prunes rows by per-report `retentionDays`
- Added `ReportXlsx1CSales` frontend view with date range filters, defaulting both dates to the current day, grouped display `СВ -> ТА`, dynamic metric columns, totals, and "В таблицю не включені" names.
- Updated Reports config to support `xlsx-1c-sales` and the `Зберігати, днів` setting.
- Verification:
  - `node --check` passed for touched backend files
  - `npm run lint` in `client` passed
  - `npm run build` in `client` passed with known Sass legacy API and chunk-size warnings
- Follow-up:
  - renamed migration column `row_number` to `source_row_number` because `ROW_NUMBER` is reserved in MySQL versions with window functions

## 2026-06-07 - Next plan: rebuild XLSX sales reports around imported 1C GUIDs

- Current `xlsx-1c-sales` implementation is considered a draft and should be rolled back before the next clean implementation slice.
- Do not make report parsing depend on reading `SalesAgent.json` directly at report time.
- First extend the sales-agent import flow so `loadAgents.js` persists 1C identifiers from `SalesAgent.json`, especially:
  - `currentAgentGuid`
  - `supervisorGuid`
  - `routeGuid`
  - optionally `regionalDivisionGuid`
- Then update user/sales-agent matching so duplicated `users.user_name` values can be resolved through the imported `currentAgentGuid`.
- Fresh XLSX files now include GUIDs in leaf rows, e.g. `ТА name (guid)`, and Excel outline levels distinguish groups (`level=1`) from leaf rows (`level=2`).
- Next clean report-loading design:
  - parse `agentGuid` from XLSX leaf rows
  - resolve it through DB-persisted sales-agent/user mappings
  - store/report clean TA names without GUID suffixes
  - keep unmatched GUID/name rows visible in the "not included" report warning
- Assortment access should be handled later as a separate permission model; GUID matching solves duplicate TA names for the XLSX sales import itself.

## 2026-06-08 - GUID-based Montblanc/Lacmi XLSX sales import rebuild

- Reworked the `xlsx-1c-sales` import around stable 1C GUIDs instead of yesterday's name/leaf-row heuristics.
- `api/migrations/011_xlsx_1c_sales_report_rows.js` now also adds:
  - `users.current_agent_guid`
  - `sales_agents.route_guid`
  - `sales_agents.current_agent_guid`
  - `sales_agents.supervisor_guid`
  - `sales_agents.regional_division_guid`
  - `xlsx_1c_sales_report_values.agent_guid`
- `api/services/loadAgents.js` now imports and persists GUID fields from `SalesAgent.json`; `users.user_name` and `users.current_agent_guid` are synchronized from `sales_agents`.
- `api/services/xlsx1cSalesReport.service.js` now:
  - reads report date from the XLSX `Начало периода` parameter
  - builds metric columns from configured multi-row XLSX headers and merged cells
  - imports only rows whose first cell matches `TA name (guid)`
  - stores clean TA names separately from `agent_guid`
  - resolves visible rows through `sales_agents.current_agent_guid` and active users in the same branch
  - leaves unmatched/ambiguous GUID rows with `user_id = NULL` and returns them in `excludedAgents`
  - displays supervisors from `user_hierarchy`, not from XLSX group rows
- Locally confirmed the new source files contain GUID leaf rows:
  - `montblanc2026.xlsx`: 17 GUID rows
  - `lacmi2026.xlsx`: 18 GUID rows
- Verification:
  - `node --check api/services/xlsx1cSalesReport.service.js`
  - `node --check api/services/loadAgents.js`
  - `node --check api/migrations/011_xlsx_1c_sales_report_rows.js`
  - `node --check api/repositories/User.js`
  - `node --check api/controllers/Reports.js`
  - `node --check api/services/appConfig.service.js`
  - `npm run lint` in `client`
  - `npm run build` in `client` passed with known Sass legacy API and chunk-size warnings

## 2026-06-08 - SalesAgent GUID migration repair

- `loadSalesAgents` failed with `Unknown column 'route_guid' in 'field list'` because local DB had already marked migration `011_xlsx_1c_sales_report_rows.js` as applied before the later GUID-column additions were present.
- Added idempotent repair migration `api/migrations/012_sales_agent_guid_columns_repair.js`.
- The repair migration safely ensures these columns/indexes exist even when `011` is skipped:
  - `users.current_agent_guid`
  - `sales_agents.route_guid`
  - `sales_agents.current_agent_guid`
  - `sales_agents.supervisor_guid`
  - `sales_agents.regional_division_guid`
  - `xlsx_1c_sales_report_values.agent_guid`
- Verification:
  - `node --check api/migrations/012_sales_agent_guid_columns_repair.js`

## 2026-06-08 - XLSX sales table polish

- Removed the empty service metric column `Группа / Супервайзер / Торговый агент по документу` from `xlsx-1c-sales` output.
- Root cause: XLSX error cells (`t: "e"`) were parsed as `Number("") === 0`, so technical empty columns looked numeric and survived metric filtering.
- `getCellNumber` now ignores Excel error cells and empty normalized values.
- `ReportXlsx1CSales` styling was changed to the dark/green visual theme used by the generic `/montblanc-06-2026` XLSX view while preserving date filters, totals, supervisor grouping, and sticky first column.
- Verification:
  - confirmed first parsed Montblanc metric columns are now `Учет с НДС`, `Сумма с НДС`, `Вес, кг`, `КОНФЕТЫ / Вес`
  - confirmed first parsed Lacmi metric columns are now `Учет с НДС`, `Сумма с НДС`, `БАТОНЫ / Вес`, `КОНФЕТЫ КОРОБОЧНЫЕ / Вес`
  - `node --check api/services/xlsx1cSalesReport.service.js`
  - `npm run lint` in `client`

## 2026-06-08 - XLSX sales legacy metric cache fix

- The service column `Группа / Супервайзер / Торговый агент по документу` could still appear after the parser fix because old metric rows were already stored in `xlsx_1c_sales_report_values` and sync skipped reimport when the XLSX file mtime had not changed.
- Added `SERVICE_METRIC_LABEL_PREFIX` filtering in `api/services/xlsx1cSalesReport.service.js`:
  - new imports skip service labels explicitly
  - API queries exclude legacy service labels immediately
  - `shouldImport` forces reimport when legacy service-label rows are found for the report
- Verification:
  - `node --check api/services/xlsx1cSalesReport.service.js`
  - `npm run lint` in `client`

## 2026-06-08 - Scheduled imports for DB-backed XLSX 1C sales reports

- Added migration `api/migrations/013_report_scheduler_flag.js`.
- New `report_definitions.scheduled_import_enabled` flag controls whether an `xlsx-1c-sales` report is imported by scheduler or refreshed when the report page is opened.
- Migration enables scheduled import by default for:
  - `report-montblanc-sales`
  - `report-lacmi-sales`
- Added scheduler task `loadScheduledXlsx1cSalesReports`:
  - runs every 5 minutes by default
  - requires system branch
  - imports all active `xlsx-1c-sales` reports for the system branch with `scheduled_import_enabled = 1`
  - reports per-report import results in scheduler last-run details
- `getXlsx1cSalesReport` now skips sync-on-open when `scheduledImportEnabled` is true; in that mode user requests only read already-imported DB rows.
- Reports Config now shows an update mode tag (`Schedule` / `Open`) and has an `Оновлювати за розкладом` checkbox for `xlsx-1c-sales`.
- Verification:
  - `node --check api/migrations/013_report_scheduler_flag.js`
  - `node --check api/services/appConfig.service.js`
  - `node --check api/services/xlsx1cSalesReport.service.js`
  - `node --check api/services/scheduler.js`
  - `npm run lint` in `client`

## 2026-06-08 - Main sales report date range

- Changed the main `/sales-report` from a single date to a date range.
- Frontend `SalesReport` now:
  - defaults both `dateFrom` and `dateTo` to tomorrow
  - sends `dateFrom`/`dateTo` to `/api/reports/sales`
  - sends the same period to `/api/reports/sales/pdf`
  - keeps the range valid by moving the opposite bound when needed
  - shows a compact report-date column in expanded document rows
- Backend `ReportsController` now accepts `dateFrom`/`dateTo`, while still accepting legacy `date` as a one-day fallback.
- `ReportsRepository.getSalesReport` filters by `sales_reports.report_date BETWEEN :date_from AND :date_to` for all role branches and sorts by report date before document number.
- Sales report PDF now uses the same period label and includes a date column.
- Verification:
  - `node --check api/controllers/Reports.js`
  - `node --check api/repositories/Reports.js`
  - `node --check api/pdf/salesReport.template.js`
  - `npm run lint` in `client`

## 2026-06-09 - Sales report retention depth

- Increased the regular sales report import/storage depth from 5 days to 35 days.
- `api/services/loadReports.js` now uses `SALES_REPORT_RETENTION_DAYS = 35` for both:
  - skipping source JSON rows older than the allowed import window
  - deleting old `sales_reports` rows after import
- Verification:
  - `node --check api/services/loadReports.js`

## 2026-07-18 - Picker role and warehouse earnings

- Added migration `015_picker_warehouse_earnings.js` (prepared, not executed) for:
  - role 8 Picker user linkage through `users.user_guid`
  - `warehouse_guid` / `picker_guid` storage on collected-bills rows
  - branch-scoped warehouses, effective-dated row/kg rates, and rate-change audit
  - config-driven `report-picker-earnings` definition
- `BillOfLading.json` import now stores both GUIDs, automatically upserts warehouses, preserves 08:00 report-day and replace-by-day behavior, and uses configurable retention with a 180-day minimum.
- Picker can access only `report-bill-of-lading`; backend always filters it by active branch and `users.user_guid = picker_guid`. Report `allowed_roles` continues to control full operational access for other roles.
- Added `Налаштування -> Налаштування складу` for Admin and Director. Backdated rate changes preview affected rows/pickers and require explicit confirmation; changes are audited.
- Added separate row and kilogram earnings to the operational report plus period analytics grouped by Picker and warehouse with missing-user/rate diagnostics.
- Verification:
  - backend `node --check` passed for all changed and newly added JS files
  - `npm run lint` in `client`
  - `npm run build` in `client` passed with existing Sass legacy API and chunk-size warnings

## 2026-07-18 - Collected-bills period and report filter polish

- `report-bill-of-lading` now sends `dateFrom` / `dateTo` to the backend and queries only that `report_date` range; both dates default to today (08:00 today through 08:00 tomorrow).
- Replaced the open-time full-table `COUNT/MAX` import check with a latest-row lookup and added migration `016_bill_of_lading_query_performance.js` for `(branch_id, updated_at)`.
- Added explicit units to operational and Picker-earnings table headers.
- Picker earnings in the operational summary are highlighted green.
- Added client-side Picker/warehouse search to `report-picker-earnings`.
- Verification:
  - `node --check api/services/billOfLadingReport.service.js`
  - `node --check api/controllers/Reports.js`
  - `node --check api/migrations/016_bill_of_lading_query_performance.js`
  - `npm run lint` in `client`

## 2026-07-18 - Collected-bills real period labels

- Added small calculated boundary labels beside the `З` / `По` date captions in `ReportBillOfLading`.
- `З` displays `dateFrom 08:00`; `По` displays the day after `dateTo` at 08:00, making the actual inclusive/exclusive report interval visible to users.
- Added the same calculated boundary labels to `report-picker-earnings`.

## 2026-07-19 - Shared data-loading indicator

- Added reusable `DataLoader` with animated ring, glow, accessible status text, compact section mode, and full-page mode.
- Replaced page-level loading text/progress indicators across reports, balances, documents, users, notifications, app bootstrap/config loading, warehouse settings, and admin configuration sections.
- Kept local Bulma `is-loading` indicators for individual buttons and background actions.

## 2026-07-19 - Picker total earnings columns

- Added `Заробіток разом` columns to the operational collected-bills report (including Picker view) and Picker earnings analytics.
- Total earnings are calculated as row earnings plus kilogram earnings at document, warehouse, and Picker aggregate levels.
- Picker operational-report header now shows one green `Заробіток разом` value instead of separate row/kg earnings labels; detailed columns remain unchanged.

## 2026-08-24 - Dark operational UI restored on the current branch

- Created recovery branch `recovery/pre-dark-redesign-2026-08-24` at `93a9f6c` before changing product files; pre-existing local source-snapshot deletions and documentation files were not included or modified.
- Manually ported the saved `redesign-dark-operational-ui` visual direction onto the current `branches-config` implementation instead of cherry-picking the stale WIP commit.
- Added centralized SCSS design tokens for semantic colors, spacing, radii, control dimensions, layout dimensions, motion durations, and shadows; exposed matching `--ui-*` CSS variables and added a JS timing token for the balance price popover.
- Replaced the authenticated header with a compact desktop sidebar/topbar shell and mobile drawer while preserving branch switching, config-driven balances/reports, Picker isolation, Admin navigation, and Admin/Director warehouse settings.
- Restored the dark operational login, balance search/segmented filter, dense hierarchical balance table, muted negative quantities, and price popover without losing the current price-multiplier behavior.
- Kept Bulma as a transitional compatibility dependency for existing admin/document/modal surfaces, moved it from CDN loading to the installed package, and mapped its theme variables to the shared app tokens so its colors and radii no longer define the new shell.
- Verification:
  - `npm run lint` in `client` passed
  - `npm run build` in `client` passed with existing Sass legacy API and chunk-size warnings
  - generated `client/dist` source-file deletions from the build were restored
  - `git diff --check` passed

## 2026-08-24 - Stitch Obsidian Emerald visual alignment

- Reviewed both supplied `stitch_dark_corporate_inventory_portal` archives, including their screenshots, HTML, and shared `DESIGN.md` tokens.
- Aligned the restored UI with the Stitch `Obsidian Emerald Executive` direction:
  - deep navy surface hierarchy (`#051424`, `#0d1c2d`, `#122131`, `#1c2b3c`)
  - emerald actions and focus states (`#10b981`, `#4edea3`)
  - subtle translucent outlines, glass panels, 8px standard radii, and 16px cards
  - data tables use quiet row dividers instead of zebra striping
- Refined the sign-in screen to match the reference composition while retaining only existing product copy (`Вхід`, field labels, auth error, submit state):
  - added the existing ST logo as the visual brand mark
  - added local inline SVG user/lock/password-visibility icons with no network dependency
  - did not add reference-only version, support, access-request, legal, or marketing text
- Updated the app shell, balance filters/table, state cards, and Bulma compatibility variables to use the same centralized design tokens.
- Verification:
  - `npm run lint` in `client` passed
  - `npm run build` in `client` passed with existing Sass legacy API and chunk-size warnings
  - desktop and mobile-sized sign-in screenshots were inspected in local headless Edge
  - generated `client/dist` source-file deletions from build were restored

## 2026-08-24 - Fixed obscured app background gradients

- Rechecked every active `radial-gradient` / `background-image` declaration after the Stitch alignment.
- Root cause: the subtle body gradient was covered by opaque `.authMain` and sign-in `.mainWrapper` backgrounds; the original top glow was also barely visible at `50% -20%` with `0.08` alpha.
- Centralized the two app background gradients in `client/src/variables.scss` and render them through a fixed, pointer-transparent `body::before` layer.
- Made `#root`, `.appMain`, `.authMain`, and the sign-in wrapper transparent where required so the shared fixed background remains visible across routes and scroll positions.
- Increased the top emerald glow visibility and kept the lower-right navy depth layer; local headless Edge screenshot confirmed both layers render.
- Verification:
  - `npm run lint` in `client` passed
  - `npm run build` in `client` passed with existing Sass legacy API and chunk-size warnings
  - generated `client/dist` source-file deletions from build were restored

## 2026-08-24 - Sign-in failure behavior hardening

- Unified unknown-login, missing-password-hash, and wrong-password backend failures to the same `401` / `Неправильний логін або пароль` response.
- Added a fixed dummy bcrypt hash for missing users/hashes so rejected attempts still perform a password comparison instead of returning through a visibly faster branch.
- Removed the duplicate expected-auth snackbar: `401` is now represented only by the inline form banner and invalid states on both credential fields.
- Network, validation, and server failures continue through the snackbar path but no longer mark the login/password as incorrect.
- Sign-in form now uses React Hook Form `reValidateMode: onChange` instead of blindly clearing field errors; inline validation shows the actual Yup message while credential rejection remains generic.
- Access tokens are now stored only after JWT payload decoding succeeds; malformed tokens reject the sign-in promise and produce one system error instead of silently resolving.
- Verification:
  - isolated backend failure-path check confirmed identical `401` responses for unknown user, missing hash, and wrong password
  - `node --check api/services/Auth.js` passed
  - `npm run lint` in `client` passed
  - `npm run build` in `client` passed with existing Sass legacy API and chunk-size warnings
  - generated `client/dist` source-file deletions from build were restored

## 2026-08-24 - Sign-in edit-state error reset

- Corrected the post-auth-failure edit behavior in `SignIn`.
- After any login or password edit, both the shared credential alarm and all visible validation alarms are hidden together; neither field remains red while the user is correcting values.
- Required/min/max validation is still calculated by React Hook Form but is shown only after the next explicit `Увійти` submission through the invalid-submit callback.
- This prevents the password field from showing `Обов'язкове поле` and reopening the banner merely because the user erased it while preparing a retry.
- Verification:
  - `npm run lint` in `client` passed
  - `npm run build` in `client` passed with existing Sass legacy API and chunk-size warnings
  - generated `client/dist` source-file deletions from build were restored

## 2026-08-24 - Edge-only mobile menu swipe gestures

- Added touch-only mobile drawer gestures without taking over horizontal table scrolling.
- Opening starts only inside a configurable `24px` invisible zone at the left screen edge and requires a right swipe; ordinary swipes that start elsewhere in a table remain untouched.
- The open drawer closes with a left swipe across the drawer itself, while vertical and insufficiently horizontal movements continue to scroll or are ignored.
- Centralized the edge width in `variables.scss` and gesture activation, completion, and axis-ratio thresholds in `uiTokens.js`.
- Extracted direction recognition to `utils/swipeGesture.js` and covered right, left, short, and vertical/diagonal cases with isolated assertions.
- Verification:
  - gesture assertions passed
  - `npm run lint` in `client` passed
  - `npm run build` in `client` passed with existing Sass legacy API and chunk-size warnings
  - generated `client/dist` source-file deletions from build were restored

## 2026-08-24 - Documents workspace responsive redesign

- Manually transferred the approved Stitch documents-list direction onto the current React workflow without copying its invented shell, sample statuses, or actions.
- Replaced the Bulma page/table presentation with token-driven document page, filter, table, status, action, and mobile-card styles.
- Added working applied filters for multiple statuses, contractor, and author alongside the existing independently unbounded date period; author choices are derived from documents visible in the loaded period and filtering preserves existing server role/branch boundaries.
- Desktop now uses a high-density bounded table with full dates, conditional branch column, truncation tooltips for long values, icon-only accessible status indicators, and a fixed-width action column sized for the real maximum workflow combination.
- Mobile now replaces the wide table with compact cards, tap-accessible status labels, complete business metadata, and touch-sized actions; History and PDF remain available for every document and workflow actions still come from the existing permission logic.
- Centralized document status colors, indicator/action dimensions, row/card geometry, and status-tooltip duration in shared UI tokens.
- Removed this document workspace's direct dependency on Bulma classes while leaving transitional Bulma support for untouched legacy surfaces.
- Verification:
  - isolated document-filter assertions passed for combined and empty filters plus unique author options
  - `npm run lint` in `client` passed
  - `npm run build` in `client` passed with existing Sass legacy API and chunk-size warnings
  - `git diff --check` passed
  - generated `client/dist` source-file deletions from build were restored

## 2026-08-25 - Compact document creation modals

- Restyled the existing return and exchange creation/editing modals without changing field order, payloads, validation rules, permissions, or document workflow behavior.
- Added a shared token-driven modal shell with compact controls, bounded height, internal scrolling, dark glass surfaces, consistent close/save/cancel actions, and responsive mobile bottom-sheet presentation.
- Visually separated the lower form area: executor choice is a compact segmented panel, return items are contained in a highlighted block, and exchange TAKE/GIVE lists use distinct accent edges.
- Kept item tables dense and horizontally scroll-contained, with compact accessible edit/remove icon actions and a highlighted quantity-mismatch message.
- Restyled the nested item editor to match the same shell, compact geometry, date controls, validation surfaces, and highlighted sticky action footer.
- Verification:
  - `npm run lint` in `client` passed
  - `npm run build` in `client` passed with existing Sass legacy API and chunk-size warnings
  - generated `client/dist` source-file deletions from build were restored

## 2026-08-25 - Stitch modal visual refinements and unified calendars

- Created pre-change recovery checkpoint `8fdf8c7` (`checkpoint: preserve dark documents redesign`) while intentionally excluding user-deleted `client/public/Sorce/*` data and untracked user documentation.
- Transferred only approved visual ideas from Stitch archive 11; no invented fields, copy, products, prices, roles, or workflow behavior were imported.
- Modal positioning now reads the live shell width from `--ui-sidebar-current-width`: 280px expanded, 72px collapsed, and 0px on mobile. Return, exchange, and nested item cards center inside the remaining content area and shrink within its viewport-safe padding.
- Increased desktop form density with two-column primary fields, a narrower item editor, reduced header/body/footer spacing, and side-by-side exchange item panels where available; narrow desktop/tablet and mobile layouts collapse safely.
- Made contractor autocomplete menus opaque and high-contrast with explicit surface, hover, border, shadow, and stacking behavior.
- Added shared native `DateInput` and adopted it in Documents filters, document item manufacture/expiry dates, and Sales Report ranges. Removed the now-unused `react-datepicker` and `date-fns` dependencies.
- Centralized modal maximum widths and viewport gap in `variables.scss`.
- Verification:
  - `npm run lint` in `client` passed
  - `npm run build` in `client` passed with existing Sass legacy API and chunk-size warnings
  - generated `client/dist` source-file deletions from build were restored

## 2026-08-25 - Controlled modal dropdowns and balance row striping

- Used checkpoint `12c216f` as the recovery point before this refinement.
- Replaced native document-modal trade-point and item group/product/unit selects with a shared compact controlled dropdown so Windows/browser blue option hover no longer leaks into the Obsidian Emerald theme.
- Added opaque popover surfaces, emerald-tinted hover and selected states, outside-click/Escape closing, disabled/error states, and compact scrollable option lists without changing stored values or form field order.
- Enabled alternating colors only for leaf/product rows in the hierarchical Balance table; group and subgroup rows retain their existing level surfaces. Leaf odd/even/hover colors are centralized in `variables.scss` and remain distinct from group backgrounds.
- Verification:
  - `npm run lint` in `client` passed
  - `npm run build` in `client` passed with existing Sass legacy API and chunk-size warnings
  - generated `client/dist` source-file deletions from build were restored

## 2026-08-25 - Reverted site-wide table palette experiment

- Reverted checkpoint `aff914b` through revert commit `daef10f` after the proposed global `ReportXlsx1C` table palette was rejected.
- Restored the table styling that existed at checkpoint `def2322`, including the previously approved Balance row striping and modal dropdown colors.
- User-managed `client/public/Sorce/*` and `documentation/*` files were not included in or changed by the rollback.

## 2026-08-25 - Approved Variant C table palette

- Used Stitch archive 12 only as a visual reference and adopted Variant C (`Subtle Emerald-Tinted Navy`) for site tables.
- Centralized table header, three hierarchy levels, odd/even rows, hover, selected state, border, shell, and text colors in `client/src/variables.scss`, with matching `--ui-table-*` CSS variables for transitional Bulma tables.
- Set every table hierarchy level and header to the same muted neutral light-gray `$table-text` (`#c4ccd4`); hierarchy remains visible through background and font-weight differences instead of white or level-specific text colors.
- Applied the shared palette to the Balance and 1C hierarchy tables, Documents, reports, user hierarchy, and document-item tables while preserving semantic error, warning, status, and metric colors.
- Verification:
  - `npm run lint` in `client` passed
  - `npm run build` in `client` passed with existing Sass legacy API and chunk-size warnings
  - `git diff --check -- client/src` passed
  - generated `client/dist` source-file changes from build were restored
  - user-managed `client/public/Sorce/*` and `documentation/*` files were not included

## 2026-08-25 - Unified form controls

- Added reusable `FormInput` and `FormSelect` components with shared standard, compact, bare/composite, error, disabled, placeholder, checkbox/radio, number, search, date, and native-option styling.
- Extracted the common form-control surface, border, text, focus ring, geometry, transition, and error behavior into centralized SCSS tokens and a reusable `_control.scss` mixin.
- Made every standard date field use the existing `DateInput` implementation: `FormInput type="date"` delegates to it, and `DateInput` now supports the same compact and error states.
- Updated `CompactSelect` to consume the same base-control mixin while preserving its opaque emerald-hover option menu and keyboard/outside-click behavior.
- Migrated native fields across document filters/modals, configuration screens, reports, users, notifications, header/sidebar selection, sign-in, and legacy signup wrappers without changing values, handlers, validation, field order, or business logic.
- Kept login/search-shell and navigation selects as explicit `bare` composition variants so their icons and containing surfaces remain intact while still reusing the shared components.
- Mapped transitional Bulma input variables to the same form tokens and removed conflicting hardcoded report control colors.
- Verification:
  - `npm run lint` in `client` passed
  - `npm run build` in `client` passed with existing Sass legacy API and chunk-size warnings
  - `git diff --check -- client/src` passed
  - headless desktop check confirmed the sign-in composition remains visually intact
  - generated `client/dist` source-file changes from build were restored
  - user-managed `client/public/Sorce/*` and `documentation/*` files were not changed or staged

## 2026-08-25 - Sales report hierarchy and table polish

- Restyled the existing sales-report page without changing date-range loading, grouping, totals, permissions, PDF export, status handling, or row data.
- Rebuilt the page heading as a compact glass panel with a clear title, shared date controls, and a token-driven PDF action that collapses safely on phones.
- Mapped supervisor and agent headers to the approved Variant C first/second hierarchy surfaces, with aligned disclosure markers, truncated names, and tabular totals.
- Wrapped each agent table in its own touch-friendly horizontal scroll shell; tables now use the shared header, zebra, border, hover, and muted text tokens with denser alignment for numeric/status columns.
- Replaced legacy bright red/light-blue status and comment fills with dark semantic cancelled, moved, warning-comment, and Form 2 icon states that remain distinct from zebra rows.
- Verification:
  - `npm run lint` in `client` passed
  - `npm run build` in `client` passed with existing Sass legacy API and chunk-size warnings
  - generated `client/dist` source-file changes from build were restored
  - user-managed `client/public/Sorce/*` and `documentation/*` files were not changed or staged

## 2026-08-25 - Debet report full theme alignment

- Restyled the Debet report without changing collector/contractor grouping, search, overdue filtering, totals, document ordering, visibility, or `Ф2`/`Факт` data behavior.
- Rebuilt the report heading and filters as a compact glass panel using shared form controls; the grouping segmented control now uses token-driven emerald hover/selected/focus states instead of the legacy blue button.
- Applied Variant C hierarchy surfaces to primary groups and nested contractor/TA groups, with aligned disclosure markers, compact metadata, tabular totals, and touch-friendly headers.
- Reworked the document table with shared header/zebra/border/hover/text tokens, denser cells, sticky headers inside each horizontal scroll shell, aligned boolean/date/money/overdue columns, and centralized semantic warning/danger/check colors.
- Added dark themed loading-empty/error and grand-total surfaces plus responsive single-column filters, group summaries, and edge-to-edge mobile tables.
- Verification:
  - `npm run lint` in `client` passed
  - `npm run build` in `client` passed with existing Sass legacy API and chunk-size warnings
  - generated `client/dist` source-file changes from build were restored
  - user-managed `client/public/Sorce/*` and `documentation/*` files were not changed or staged

## 2026-08-25 - Debet grouping switch correction

- Replaced the Debet grouping switch's generic nested button/active styling with explicit `segmentButton` and `segmentActive` classes so Bulma/browser button rules cannot distort either half.
- The two modes now use an equal-column grid, fixed shared control height, full button reset, centered labels, emerald hover/focus/selected states, and a clear active underline; the control remains full-width and evenly split on mobile.
- Preserved grouping values and click behavior; added no report logic changes.
- Verification: client lint and build passed, and generated `client/dist` XLSX changes were restored.

## 2026-08-25 - Responsive two-row Debet filters

- Fixed the intermediate-width collision where the Debet search field could overlap the grouping switch inside the viewport remaining beside the sidebar.
- Made the report heading its own row; the controls now use a deterministic grid with grouping plus overdue toggle on the first control row and a full-width search field on the second. Phones stack grouping, search, and overdue toggle vertically.
- Added shared `styles/_filterPanel.scss` mixins for report filter-panel shell, title, and label styling and adopted them in both Debet and Sales report panels.
- Verification: client lint and build passed, generated `client/dist` XLSX changes were restored, and user-managed source/data files were not changed or staged.

## 2026-08-26 - Compact adaptive administration workspace

- Rebuilt the Admin page shell with a dense token-driven tab bar and bounded content surface that adapts from desktop to phone without changing tab persistence or administration behavior.
- Consolidated the user list mode switch, create action, search scope, and search field into one responsive toolbar; tightened the user tables, preserved hierarchy coloring, and kept touch-sized actions on phones.
- Restyled notification settings as a compact table/form workspace and corrected its React icon markup and action accessibility labels.
- Added an Admin-scoped compatibility theme for remaining Bulma configuration surfaces: shared table palette, compact controls/buttons/tags/notices, internal horizontal table scrolling, responsive list/form stacking, and sidebar-aware modal centering.
- Made the user create/edit modal a compact two-column form on wide screens and a single ordered column on phones; field order and all user/access logic remain unchanged.
- Wrapped the scheduler table in an overflow container so long status content no longer expands the Admin page.
- Verification:
  - `npm run lint` in `client` passed
  - `npm run build` in `client` passed with the existing Sass legacy API and chunk-size warnings
  - generated `client/dist` XLSX changes were restored
  - user-managed `client/public/Sorce/*` and `documentation/*` files were not changed or staged

## 2026-08-26 - Contextual user administration actions

- Replaced the four per-row user action columns with one single-selection column and a compact contextual action bar, freeing table width for login, display name, city, and role data.
- Selecting a row or its radio control no longer opens a modal; it selects any real user, including NTO and SV, and exposes password, edit, applicable detach, and delete actions in one predictable location.
- Kept synthetic hierarchy section headings non-selectable and preserved the existing rule that detach is available only for a TA currently linked to a supervisor.
- Changed hierarchy styling so NTO and SV use the approved first/second-level table surfaces while TA and other user rows return to the standard zebra palette; the selected row receives a restrained emerald marker.
- Made the action bar wrap at intermediate widths and switch to four touch-sized icon actions on phones while retaining accessible action labels.
- Verification:
  - `npm run lint` in `client` passed
  - `npm run build` in `client` passed with the existing Sass legacy API and chunk-size warnings
  - `git diff --check` passed for the changed frontend files
  - generated `client/dist` XLSX changes were restored
  - user-managed `client/public/Sorce/*` and `documentation/*` files were not changed or staged

## 2026-08-26 - Toggleable user selection

- Changed the Admin users table's single-selection behavior so clicking the already selected row or its radio indicator clears the selection and disables the contextual actions again.
- Preserved ordinary single selection when switching directly to another user.
- Verification: client lint and targeted `git diff --check` passed.

## 2026-08-26 - Tabbed configuration workspace with modal editors

- Split the Admin `Конфігурація` workspace into persisted nested tabs for `Філії`, `Міста`, `Сторінки залишків`, `Звіти`, `Імпорт`, and `Планувальник`; only the selected configuration component is mounted and visible.
- Removed the permanently visible table/form split from branches, cities, balance pages, reports, and import sources so each selected section now presents a full-width settings table.
- Added explicit create actions where creation is supported and made existing Edit actions open a shared compact configuration editor modal; fixed import sources remain edit-only.
- Preserved each form's field order, validation, API calls, active-state behavior, and reload flows. Successful saves close the modal, while cancel, backdrop click, close control, and Escape reset unsaved form state; closing is blocked while saving.
- Added a sticky separated action area inside long editor forms and a wider modal variant for report configuration. Modal width and viewport-gap values are centralized in shared design tokens/CSS variables and continue to account for the current desktop sidebar width.
- Nested tabs scroll horizontally on narrow viewports, and all configuration tables retain internal horizontal scrolling rather than widening the page.
- Verification:
  - `npm run lint` in `client` passed
  - `npm run build` in `client` passed with the existing Sass legacy API and chunk-size warnings
  - targeted `git diff --check` passed
  - generated `client/dist` XLSX changes were restored
  - user-managed `client/public/Sorce/*` and `documentation/*` files were not changed or staged

## 2026-08-26 - Plain-text configuration table states

- Removed filled badge/tag surfaces from every table inside the Admin configuration workspace, including report roles/statuses and scheduler states.
- Preserved semantic meaning through compact colored text using the shared accent, warning, danger, info, and muted theme variables; tags outside configuration tables and action buttons remain unchanged.
- Verification: `npm run build` in `client` passed with the existing Sass legacy API and chunk-size warnings; generated `client/dist` XLSX changes were restored.

## 2026-08-26 - Centralized frontend color system

- Audited all authored files under `client/src` and removed local `hex`, `rgb`/`rgba`, `hsl`/`hsla`, and named visual color literals outside `client/src/variables.scss`.
- Expanded `variables.scss` with semantic surface, accent, status, modal, loader, legacy-control, report-scale, XLSX-report, calendar-indicator, and shadow tokens while preserving the current dark appearance.
- Moved the runtime `--ui-*` and transitional Bulma variable mappings into mixins defined in `variables.scss`; `main.scss` and the renamed `bulma-theme-override.scss` now only emit those centralized mappings.
- Replaced fixed Bulma text utility colors with shared semantic runtime tokens so legacy admin/configuration markup follows the same palette.
- Moved the remaining inline PDF-viewer error color into a token-driven CSS module and converted the legacy Select stylesheet from Sass `@import` to `@use`.
- Verification:
  - a full scan found no authored `hex`/`rgb`/`hsl` literals outside `variables.scss`
  - `npm run lint` in `client` passed
  - `npm run build` in `client` passed with the existing Sass legacy API and chunk-size warnings
  - generated `client/dist` XLSX changes were restored
  - user-managed `client/public/Sorce/*` and `documentation/*` files were not changed or staged

## 2026-08-26 - Emerald and cyan light theme palettes

- Added complete `variables-emerald-light.scss` and `variables-cyan-light.scss` token sets based on the approved Stitch light-theme direction without adopting Stitch's changed layouts, cards, extra data, or mobile navigation.
- Preserved all 219 SCSS variable names, geometry, motion, responsive sizes, aliases, and runtime/Bulma mixin contracts across emerald dark, cyan dark, emerald light, and cyan light.
- Built restrained light surface hierarchies for the shell, forms, dropdowns, modals, dense table headers/groups/zebra rows, hover/selection, statuses, reports, XLSX views, loaders, and legacy controls.
- Added the shared `--ui-color-text-on-accent` runtime token to all four themes and mapped Bulma primary-button text to it so light and dark primary actions retain appropriate contrast.
- Kept the active application theme unchanged; runtime theme selection remains a separate implementation step.
- Verification:
  - both light theme files compile directly with the installed Sass compiler
  - all four theme files expose the same 219-variable contract
  - key foreground/background contrast checks meet WCAG AA, including primary buttons after darkening the cyan accent to `#087f9c`
  - `npm run lint` and `npm run build` in `client` passed with the existing Sass legacy API and chunk-size warnings
  - generated `client/dist` XLSX changes were restored

## 2026-08-26 - Runtime theme selector

- Added a compact Admin theme selector for Emerald Dark, Cyan Dark, Emerald Light, and Cyan Light; changes apply immediately and persist for the current browser in `localStorage` under `ui-theme`.
- Added an early inline restore in `client/index.html` so the saved theme is applied before React and stylesheet rendering, avoiding a dark/light flash on reload.
- Kept `data-ui-theme` for the four application palettes and synchronized the standard `data-theme` to `dark` or `light`, preserving Bulma's full native scheme behavior and native control rendering.
- Added `theme.scss` as the component-facing facade: theme-dependent colors, gradients, filters, and shadows resolve through runtime CSS custom properties, while geometry, spacing, radii, breakpoints, and motion remain compile-time Sass values.
- Extended all four palette files with matching `export-runtime-theme-colors` mixins and migrated authored component SCSS imports from the fixed Emerald Dark palette to the runtime facade.
- Added an accent-backed login brand mark so the existing white logo remains visible in both light themes.
- Verification:
  - all four palette SCSS files compile directly
  - theme application/localStorage behavior passed a focused runtime check
  - built CSS contains all four `data-ui-theme` selectors
  - Emerald Dark, Emerald Light, and Cyan Light login surfaces were visually checked in headless Edge
  - `npm run lint` and `npm run build` passed with existing Sass legacy API and chunk-size warnings
  - generated `client/dist` XLSX changes were restored

## 2026-08-27 - XLSX 1C sales mobile sticky column

- Changed the mobile `СВ / ТА` column from the fixed 220px minimum to content-driven sizing while preserving the fixed first column and horizontal scrolling for metric columns.
- Kept sticky body cells above horizontally scrolling cells and raised sticky headers above body cells for correct two-axis scrolling.
- Changed row hover from a transparent replacement background to a token-driven overlay on each row's opaque base surface, preventing scrolled metric text from showing through the sticky first column.
- Verification:
  - `npm run lint` in `client` passed
  - `npm run build` in `client` passed with the existing Sass legacy API and chunk-size warnings
  - generated `client/dist` XLSX changes were restored
  - user-managed `client/public/Sorce/*` and `documentation/*` files were not changed or staged

## 2026-08-27 - Sidebar disclosure navigation

- Replaced the sidebar's native report and settings navigation selects with consistent expandable link groups; multi-page balance navigation now uses the same interaction.
- Changed compact desktop behavior so clicking a parent icon expands the sidebar and opens its child list instead of navigating to the first child.
- Preserved direct navigation for leaf items and for balances with only one configured page.
- Replaced the sidebar branch native select with the shared theme-controlled `CompactSelect`; added an upward-opening placement so its list remains visible above the footer.
- Kept desktop and mobile disclosure state independent, opened the group containing the active route, and added `aria-expanded` / `aria-controls` semantics and keyboard focus styling.
- Verification:
  - `npm run lint` in `client` passed
  - `npm run build` in `client` passed with the existing Sass legacy API and chunk-size warnings
  - generated `client/dist` XLSX changes were restored
  - user-managed `client/public/Sorce/*` and `documentation/*` files were not changed or staged

## 2026-08-27 - Login logo light-theme treatment

- Removed the accent background from the login logo container and changed the container to a circular `50%` radius.
- Added the shared runtime `login-brand-image-filter` token to all four theme contracts: dark themes keep the image unchanged, while Emerald Light and Cyan Light apply `invert(100%)`.
- Kept the theme behavior CSS-only so changing the runtime theme updates the logo immediately without React branching.
- Verification:
  - `npm run lint` in `client` passed
  - `npm run build` in `client` passed with the existing Sass legacy API and chunk-size warnings
  - generated `client/dist` XLSX changes were restored
  - user-managed `client/public/Sorce/*` and `documentation/*` files were not changed or staged

## 2026-08-27 - Public Cyan light/dark theme toggle

- Added an always-available two-state Light/Dark control styled as a compact pill: it appears on Sign In and in the sidebar footer for every authenticated role, remaining icon-only when the desktop sidebar is collapsed.
- The public control intentionally switches only between Cyan Light and Cyan Dark and persists the result through the existing `ui-theme` browser setting.
- Changed the first-visit default to the device `prefers-color-scheme` using the corresponding Cyan palette, with Cyan Light as the fallback when the preference API is unavailable.
- Preserved Admin's four-palette selector and added a shared theme-change event so the public toggle and Admin selector remain synchronized when either control changes the theme.
- Visually checked the complete toggle and device-dark default on the Sign In page at a 500px viewport.
- Verification:
  - `npm run lint` in `client` passed
  - `npm run build` in `client` passed with the existing Sass legacy API and chunk-size warnings
  - generated `client/dist` XLSX changes were restored
  - the temporary Vite process used for the visual check was stopped
  - user-managed `client/public/Sorce/*` and `documentation/*` files were not changed or staged

## 2026-08-27 - Documents mobile statuses and filter controls

- Added the localized status name beside the status icon in every mobile document card while preserving icon-only desktop table cells and their tooltips.
- Restored semantic green Signed icon/text in Cyan Dark; the other three theme palettes already used green Signed tokens.
- Replaced the collapsed status filter selector with an always-visible, wrapping checklist; no selected statuses continues to mean all statuses.
- Replaced the contractor native select with the creation-modal interaction: users can type to narrow the contractor list and select a matching suggestion; applying an unselected partial query performs a case-insensitive contractor-name match instead of silently reverting to all contractors.
- Moved the shared contractor dropdown blur delay into `UI_TIMING` and reused it in Documents plus both return/exchange creation modals.
- Raised the desktop filter reflow breakpoint to 1550px so the denser checklist and typeahead reflow before colliding within the sidebar-reduced viewport.
- Verification:
  - focused document-filter check confirmed combined status and case-insensitive partial contractor matching
  - `npm run lint` in `client` passed
  - `npm run build` in `client` passed with the existing Sass legacy API and chunk-size warnings
  - generated `client/dist` XLSX changes were restored
  - user-managed `client/public/Sorce/*` and `documentation/*` files were not changed or staged

## 2026-08-27 - Document history modal and desktop data viewports

- Rebuilt the document history dialog as a portal-mounted, token-driven modal so it is no longer constrained by the document table's sticky action cell; combined document and notification history into one compact scrollable body with desktop live-content centering and a mobile bottom-sheet layout.
- Added the shared `styles/_dataViewport.scss` desktop layout mixins so report controls remain visible while only the results region scrolls vertically and horizontally.
- Applied the bounded desktop results viewport to Documents, Sales, Debet, Romashka, XLSX 1C reports, orders-by-time, collected-bills, picker earnings, Admin users, notifications, scheduler, and configuration tables; Balance already used the same bounded-table behavior.
- Kept mobile pages in normal document flow and added sticky table headings where the new desktop scroll container required them.
- Verification:
  - `npm run lint` in `client` passed
  - `npm run build` in `client` passed with the existing Sass legacy API and chunk-size warnings
  - generated `client/dist` XLSX changes were restored
  - user-managed `client/public/Sorce/*`, the pre-existing UsersList default-view edit, and `documentation/*` files were not changed or staged

## 2026-08-28 - Pre-change admin UI checkpoint

- Preserved the pending Admin display preferences before the next major work slice: the Users tab opens in hierarchy mode and the two Admin tab rows no longer force horizontal scrollbars.
- Confirmed the preceding history/data-viewport checkpoint `89d359e` is readable and repository object verification reports no integrity errors.
- Kept operational `client/public/Sorce/*` changes and untracked `documentation/*` files outside the checkpoint.

## 2026-08-28 - TRO installation/return documents

- Added migration `017_tro_documents.js` for the branch-scoped TRO directory, city sequences, TRO document details/items, expanded document statuses/types/history actions, status-notification metadata, and scheduler/import-source configuration.
- Added `loadTroProducts`, which reads the configured `Product_TRO.json`, preserves rows whose source GUID is reused by hashing the complete source identity, and synchronizes separate directory rows to every active branch.
- Added creation and editing for multi-position TRO documents with automatic `ТРО-{city prefix}-{six digits}` numbering, contractor/trade-point/TA selection, installation/return movement, 250-character comment, and compact responsive token-driven UI.
- Enforced creator roles Admin, Director, SV, and TA; TA is fixed to self, SV can select a direct TA, and Admin/Director can select an active TA in the current branch.
- Added assigned-TA-aware visibility and approval: a direct SV or eligible NTO signature is sufficient and moves `NEW`/`REVISION` directly to `NOT_COMPLETED`; TRO also supports `REVISION` and `REJECTED` without a `PREPARED` stage.
- Added accountant-only UP number, executor snapshot/account, and movement-specific APPU/photo or APPV/warehouse-specification checkboxes. First UP-number entry plans the document; changing or removing an existing number returns it to `NOT_COMPLETED`; explicit confirmation with all required fields sets `COMPLETED` and locks further changes.
- Extended accountant document access to TRO documents in every granted branch, retained branch isolation for all TRO data, added text-only email/Rocket.Chat status notifications with retry metadata, and kept all operations in common document history.
- No TRO PDF was added; the UI hides PDF actions and the API reports that the print form is unavailable.
- Verification: backend `node --check` passed for all touched modules, frontend lint and production build passed, and the source file was inspected as 211 valid rows (with intentionally repeated source GUIDs). Migration `017` was not executed because the target database was not approved.

## 2026-08-28 - TRO development database migration

- Confirmed with the user that the database configured in `api/.env` is the development database and applied the normal migration set with `npm run migrate`.
- Migration `017_tro_documents.js` was registered successfully; verified all four TRO tables, the `loadTroProducts` import source and active two-hour scheduler task, expanded document columns, and notification event metadata.
- The migration only configured the TRO import. Population of `tro_products` remains the responsibility of the configured scheduler/manual task run.

## 2026-08-28 - TRO required reason compatibility fix

- Fixed TRO creation against the existing `documents.reason NOT NULL` schema by storing a movement-derived reason (`Установка ТРО` or `Повернення ТРО`) instead of `NULL`.
- Verified the exact document-header insert against the development database inside an explicit transaction; the insert succeeded and the test row was rolled back.

## 2026-08-28 - Modal snackbar and TRO dropdown layering

- Added shared modal/popover/snackbar layer tokens to all four theme contracts and the runtime facade; Notistack containers now render above modal overlays.
- Changed TRO item selectors to open upward so their option lists remain inside the scrollable modal body instead of being clipped behind the fixed footer.
- Replaced the TRO modal and shared controlled-dropdown literal z-index values with the centralized layer tokens.
- Frontend lint and production build passed with the existing Sass legacy API and bundle-size warnings.

## 2026-08-28 - TRO history status migration

- Added and applied migration `018_tro_document_history_statuses.js` because `document_history.old_status` and `new_status` still used the legacy five-value ENUM and rejected TRO status `NOT_COMPLETED` during signing.
- Both history status columns now use nullable `VARCHAR(32)`, matching the expanded document workflow without changing existing history values.
- Verified an exact `NEW -> NOT_COMPLETED` history insert against the development database inside an explicit transaction; it succeeded and the verification row was rolled back.

## 2026-08-28 - Split return/exchange and TRO workspaces

- Replaced the single mixed Documents screen with `/documents/return-exchange` and `/documents/tro`; the legacy `/documents` URL redirects to return/exchange.
- Converted the Documents sidebar item into an expandable group that works in full, compact desktop, and mobile drawer modes, with role-appropriate TRO visibility.
- Each page now loads only the directories and creation modals it needs and exposes only its own status checklist: legacy five-state return/exchange workflow versus the six TRO workflow states.
- Added backend `category` filtering so the two tables receive disjoint datasets rather than hiding rows only in the browser; also removed TRO list visibility from the Warehouse role to match TRO access rules.
- Tailored the TRO table to show movement and a compact Author/TA cell while preserving its mobile assigned-TA detail.
- Verified against development data that the TRO category returned only TRO rows and return/exchange returned only legacy rows, and that full-document loading still succeeds for both. Frontend lint and production build passed with existing warnings.

## 2026-08-28 - TRO accountant executor identity

- Extended `/api/auth/me` with the explicit `users.user_name` value and retained it in the frontend auth context without changing the existing login-oriented `userName` token field.
- TRO creation now initializes the accountant-only `Виконавець` field strictly from `user_name`; it no longer falls back to `users.NAME`, and remains empty/editable when no full name is configured.
- Backend syntax check, frontend lint, and production build passed with the existing Sass legacy API and bundle-size warnings.

## 2026-08-28 - TRO required-document indicators

- Extended the document-list query with the four TRO accountant checkbox states.
- Added a compact `Документи` column to the desktop TRO table and the corresponding block to mobile cards. Installation shows `АППУ` and `ФУ`; return shows `АППВ` and `ССВ`.
- Missing items use the shared rejected/error color and checked items use the shared signed/success color, so the indicators remain compatible with all runtime themes.
- Backend syntax check, frontend lint, and production build passed with the existing Sass legacy API and bundle-size warnings.

## 2026-08-28 - Documents sticky actions hover fix

- Raised the stacking level of the sticky `Дії` header and body cells in both document workspaces.
- Kept an opaque odd/even row surface beneath the translucent hover overlay, preventing horizontally scrolled row content from showing through or covering the fixed actions column.
- Frontend production build passed with the existing Sass legacy API and bundle-size warnings.

## 2026-08-31 - XLSX 1C sales month-boundary period fix

- Fixed the default next-day period in `ReportXlsx1CSales`: it now advances the `Date` before formatting instead of producing invalid values such as `2026-08-32` on the last day of a month.
- Verified month, leap-year February, and year transitions. Frontend lint and production build passed with the existing Sass legacy API and bundle-size warnings.

## 2026-08-31 - TRO accounting labels and copyable product names

- Replaced the internal accounting abbreviations in TRO list indicators and modal checkbox labels with user-facing `Акт`, `Фото`, and `Специфікація` text while preserving the underlying database fields and workflow.
- Existing TRO documents now show non-editable product names in selectable read-only fields and provide a copy action for every product row at every workflow stage; editable rows retain their selector plus the same copy action.
- Added a clipboard fallback for browsers where the modern Clipboard API is unavailable or denied. Frontend lint and production build passed with the existing Sass legacy API and bundle-size warnings.

## 2026-08-31 - Selected-document print and XLSX registries

- Added multi-selection checkboxes to both document tables and mobile cards, including select-all for the currently filtered result, selected-row highlighting, a selected count, and clear-selection action. Selection is pruned when documents leave the active filtered result.
- Added an adaptive registry toolbar outside the bounded results scroller. `Друк` opens a compact A4-landscape browser print registry, while `Зберегти XLSX` downloads the same normalized registry as a workbook.
- Added protected `POST /api/documents/export/registry` and `POST /api/documents/export/xlsx` endpoints. They accept explicit selected document IDs, revalidate existing branch/role/hierarchy access for every document in controlled batches, reject mixed workspace categories, and cap one request at 250 documents.
- TRO registries include movement, TA, TRO quantities, UP/accounting fields, and Act/Photo/Specification states. Return/exchange registries include their type, products, reason, executor, and comment.
- Verified both registry variants against the development database and read the generated XLSX buffers back successfully (17 TRO columns and 13 return/exchange columns). Backend syntax checks, frontend lint, and production build passed with existing warnings.

## 2026-08-31 - Separate TRO and quantity registry cells

- Split the combined `ТРО та кількість` registry column into adjacent `ТРО` and `Кількість` cells for both browser printing and XLSX downloads.
- Multi-item documents keep names and quantities in matching line order; generated XLSX row height grows with the item count, and the print table preserves line breaks.
- Verified the two headers and their separate values by reading a generated TRO workbook back against the development database. Backend syntax check, frontend lint, and production build passed with existing warnings.

## 2026-08-31 - Separate return/exchange product and quantity cells

- Split the combined return/exchange registry product summary into adjacent `Товар` and `Кількість` cells for both browser printing and XLSX downloads.
- Multi-item product names and quantities remain aligned line by line; quantity values retain their localized units, and exchange products retain `Забрати`/`Видати` operation context.
- Verified the separate headers and values by reading a generated return/exchange workbook back against the development database. Backend syntax check, frontend lint, and production build passed with existing warnings.

## 2026-09-01 - TRO item consolidation and configurable registries

- TRO create/update validation now groups rows by the normalized directory product name (trimmed and case-insensitive) and sums their quantities before inserting document items; this also covers duplicate directory IDs that resolve to the same name.
- Reworked both registry variants to produce one physical row per TRO/product and quantity instead of placing multiple values in one cell. Common document fields use vertical merges in XLSX and `rowspan` in the print registry.
- Added a compact adaptive column-selection modal shared by print and XLSX. TRO defaults to `Дата`, `Контрагент`, `Торгова точка`, `ТА`, `ТРО`, `Кількість`, and `Статус`; return/exchange defaults to all available columns.
- Column metadata and selection validation are server-defined. Unknown columns are ignored, an empty valid selection is rejected, and exports without item columns collapse back to one row per document.
- Verified a five-item TRO registry and a two-item return/exchange registry against the approved development database, including default column sets, separate item cells, and XLSX vertical merges. Backend syntax checks, frontend lint, and production build passed; build output retains the existing Sass legacy API and bundle-size warnings.

## 2026-09-02 - Brighter document creation actions

- Promoted document creation buttons from subdued container controls to the shared solid accent treatment across all four runtime themes, with accent shadow, high-contrast text, stronger hover, visible keyboard focus, and restrained press/hover movement.

## 2026-09-05 - Development TRO data reset

- At the user's explicit request, cleared all TRO operational data from the local development database `auth` on `Stako_PC` before replacement directory data is supplied.
- Deleted 7 TRO documents, 12 cascading item rows, 7 cascading detail rows, their cascading history, 10 notification-log rows, 697 TRO directory rows, and the single TRO numbering-sequence row. Verified all TRO document, item, detail, product, sequence, and notification counts are zero; return/exchange documents were not touched.

## 2026-09-06 - Portal-side TRO/1C integration stage 1

- Added and applied development migration `019_tro_1c_integration.js`. Nullable one-to-one 1C link, executor snapshot/reference, optional warehouse GUID, independent 1C stage, and sync diagnostics now live in `tro_document_details`; `(source_system, document_1c_guid)` is unique and the optional sales-agent FK uses `ON DELETE SET NULL`.
- Added isolated `/api/1c/tro-requests` endpoints for ready `NOT_COMPLETED` requests, idempotent document-created/rejected callbacks, pending-status polling, and idempotent independent 1C-stage updates. `author_user_id` and workflow `ta_user_id` are never changed.
- Reused JWT Bearer authentication with `ONE_C_INTEGRATION_LOGINS`. Integration accounts are closed out of ordinary protected APIs, and an empty allow-list keeps the integration API closed by default.
- Made UP number and executor integration-owned/read-only in the regular TRO modal and backend accounting endpoint while preserving accountant checkbox updates and explicit portal completion. TRO desktop/mobile views now show Author, actual 1C executor (with request-TA fallback before linking), UP number/date, and a separate 1C stage.
- Added protocol documentation and a Node test suite covering status selection, preservation of author/TA, linking, GUID conflicts, missing/ambiguous sales agents, idempotency, stage independence, rejection without deletion, and account isolation. Backend tests, frontend lint/build, backend syntax checks, and live read-only repository queries passed.
- Created recovery tag `checkpoint-before-1c-tro-stage1-20260906` at commit `faa970de7e30d371cfd1d5bd641284c13561417b`; pre-existing uncommitted business-data/document-registry changes were preserved.

## 2026-09-06 - Stable cursor pagination for TRO/1C reads

- Added signed opaque cursor pagination to `GET /api/1c/tro-requests` and `GET /api/1c/tro-requests/status-pending` while preserving their filters and DTO arrays. Both endpoints default to 100 records and cap `limit` at 500.
- Both traversals now use deterministic keyset ordering by immutable `documents.created_at` and `documents.id`. The first request records a ceiling in the cursor, so documents created later are deferred to the next full 1C synchronization cycle instead of extending the active traversal.
- Cursors are bound to the endpoint, accessible branches, and movement filter. Invalid, modified, or cross-scope cursors return controlled `422 INVALID_CURSOR` responses.
- Added coverage for first, next, and final pages; duplicate prevention; equal timestamps; invalid cursors; cursor-less backward compatibility; and insertion during traversal for both read endpoints. Backend tests and syntax checks passed.
- Created the pre-change recovery tag `checkpoint-before-1c-tro-pagination-20260906` at commit `93b4c30fb86627c2d7be2a72e1871edf313a541c`.

## 2026-09-08 - Separate 1C responsible and sales-agent metadata

- Added and applied development migration `020_tro_1c_responsible_and_sales_agent.js` to local database `auth` on `Stako_PC`. It adds `executor_guid`, cleanly renames the sales-agent reference/GUID columns to `one_c_sales_agent_id` and `one_c_sales_agent_guid`, adds `one_c_sales_agent_name`, and recreates the FK with `ON DELETE SET NULL`.
- Existing linked stage-1 records moved their former `executor_name` sales-agent snapshot into `one_c_sales_agent_name`; `executor_name` was cleared for those rows so a repeated `/created` can supply the true 1C responsible. The two existing links were migrated without changing portal documents or workflow.
- `POST /api/1c/tro-requests/:id/created` now requires `responsible_guid` and `responsible_name`. The responsible is stored only as executor metadata; the actual 1C sales agent continues to resolve by branch plus `current_agent_guid` and is stored independently.
- A repeated `/created` for the same existing 1C link refreshes responsible and sales-agent metadata without status rollback, link recreation, notification, or duplicate `ONE_C_CREATED` history.
- TRO desktop rows, mobile cards, and the document modal now display `Виконавець` and `ТА` separately. Before 1C creation, TA falls back to the workflow TA and is marked `ТА заявки`.
- Backend tests (27), frontend lint, frontend production build, backend syntax checks, migration verification, and live read-only DTO queries passed. The pre-change recovery tag is `checkpoint-before-1c-tro-responsible-20260908` at commit `47f9b7fbf84ef2d0b81c4015940bd2d97b76e1e0`.

## 2026-09-09 - Bidirectional group/product selection

- Reworked the return/exchange item modal so Product is searchable and enabled before a Group is chosen. With no group it searches the full directory; selecting a group limits the same search to that group.
- Selecting a product automatically fills its directory group. Changing the group keeps the product only when it still belongs to that group; otherwise the stale product selection and search text are cleared.
- Product results show the product name plus a muted secondary group label, while the selected input retains only the product name. Empty searches show `Товар не знайдено`; mouse, focus, and Escape interactions remain supported.
- Frontend lint and production build passed with the existing Sass legacy API and bundle-size warnings. The pre-change recovery tag is `checkpoint-before-item-product-group-link-20260909` at commit `f2b86f8f876da66ee2864b3584fc6618f1579326`.

## 2026-09-09 - Mobile item-modal width containment

- Prevented long selected product names from shifting the return/exchange item modal on phones. The item modal now renders through a portal directly under `document.body`, explicitly stays within the viewport, and releases the searchable input focus after a product is selected so Android does not pan the page toward the end of the input value.
- The modal shell, grid body, fields, searchable picker, footer, and form controls can shrink without horizontal overflow; mobile negative column gutters were removed. Product option names remain fully visible and wrap to multiple lines rather than being truncated. Frontend lint and production build passed with existing warnings; recovery tags bracket the fix from `checkpoint-before-item-modal-mobile-width-20260909`.

## 2026-09-09 - TRO item picker and document table

- Reused the shared bidirectional Group/Product item modal for TRO positions in a quantity-only mode. TRO groups are derived from the branch-scoped directory `group_name`; the modal keeps Group and TRO mutually dependent and supports full-directory name search before choosing a group.
- TRO position entry now contains only Group, TRO, and Quantity: unit and manufacture/expiry dates remain present for return/exchange documents but are hidden and excluded from validation in TRO mode.
- Replaced inline TRO selectors with the same compact document-position table pattern used by return/exchange documents. The table shows separate TRO and Quantity cells plus copy/edit/remove actions appropriate to the current workflow permissions; names remain selectable and copyable in read-only stages. Adding or editing a duplicate TRO name immediately collapses the visible rows and sums their quantities, matching backend normalization.
- Frontend lint and production build passed with the existing Sass legacy API and bundle-size warnings. The pre-change recovery tag is `checkpoint-before-tro-item-modal-table-20260909` at commit `3808063`.

## 2026-09-09 - Nested item-modal layer and mobile results

- Raised the shared `ItemModal` from a hardcoded modal layer to the centralized `$z-popover` layer (`1500`), keeping it above its parent document modal (`1400`) and below snackbars (`1600`).
- On phones the searchable product/TRO listbox now participates in the modal body's layout instead of extending absolutely into the footer. It receives a bounded viewport-relative height and its own contained scrolling, while the action footer remains visible.
- Frontend lint and production build passed with the existing Sass legacy API and bundle-size warnings. The pre-change recovery tag is `checkpoint-before-item-modal-layer-listbox-20260909` at commit `45b29aa`.

## 2026-09-09 - Unified document-modal layers and portaled item listbox

- Unified the TRO and return/exchange parent document modals on the same derived layer (`$z-modal - 100`, currently `1300`). The shared `ItemModal` is forced onto `$z-popover` (`1500`) with `!important`, so Bulma source order cannot lower it beneath either document modal.
- Moved the searchable Product/TRO listbox into its own `document.body` portal above the item-modal layer. Its fixed position follows the input during scrolling and viewport/virtual-keyboard changes, measures available space, and automatically opens below or above the field with a bounded internal scroller.
- Frontend lint and production build passed; generated CSS was checked to contain the effective `1300`, `1500 !important`, and higher listbox layer values. The pre-change recovery tag is `checkpoint-before-unified-document-modal-layers-listbox-20260909` at commit `cdf9d08`.

## 2026-09-10 - Validated configurable balance XLSX columns

- Added and applied local development migration `021_balance_column_configuration.js` to `localhost/auth`. `balance_pages` now stores optional 1-based `header_row`, `data_start_row`, and a versioned JSON `column_config`; existing rows remain `NULL` and continue using the legacy automatic parser.
- The Admin `Сторінки залишків` editor can inspect the configured XLSX, accept or adjust detected header/data rows, select output columns, rename and reorder them, choose exactly one hierarchy column, optionally choose a displayed `Price` column for the existing percentage multiplier, and preview eight source rows. A reset action restores automatic mode.
- Added admin-only `POST /api/config/balance-pages/preview`. It reads only a basename-constrained `.xlsx` from `IMPORT_DIR`, preserves physical worksheet row numbers, and returns the first sheet's headers and preview values. Create/update validates the saved header snapshots against the current file and rejects shifted/renamed/missing columns explicitly.
- Configured balance pages render their selected columns in configured order with a horizontally scrollable adaptive table. The multiplier applies only to the selected price column. Runtime parsing repeats header validation and shows the mismatch message on the balance page instead of silently displaying wrong cells.
- Branch configuration cloning preserves the new settings, while the bootstrap doctor now requires the three schema columns. Backend tests pass 30/30; frontend lint/build, backend syntax checks, a direct configured-parser/mismatch check, migration, and schema doctor balance-page checks passed. The pre-change tag is `checkpoint-before-balance-column-config-20260910` at commit `e86140b`.

## 2026-09-10 - Multi-row balance XLSX headers

- Added and applied local development migration `022_balance_multiline_headers.js`; configured balance pages now store an optional inclusive `header_end_row`, with old one-row configurations treating it as equal to `header_row`.
- The Admin balance-page editor now accepts `Заголовки: з рядка`, `Заголовки: по рядок`, and the first data row. Inspection builds each column's stable source identity from its full vertical header path while resolving both horizontal and vertical Excel merged cells; the editable display title defaults to the most specific final header fragment.
- Backend preview/save validation and frontend runtime parsing use the same composite-header rules. Actual Excel column letters respect a worksheet whose used range begins after column A, and structure mismatch remains an explicit error.
- Verified against the current `balanceZP.xlsx` rows 8–10: the quantity column resolves as `Склад Центральний Запоріжжя / Свободный остаток / В ед. хранения`. Backend tests pass 31/31; frontend lint and production build pass with the existing Sass and bundle-size warnings. The pre-change recovery tag is `checkpoint-before-balance-multiline-headers-20260910`.

## 2026-09-10 - Balance outline groups and configured Price popover

- Changed balance hierarchy classification so a row followed by a deeper XLSX outline level is always treated as a group, even when digits or slash notation make its name look product-like. This fixes the real `balanceZP.xlsx` row `КАРАМЕЛЬ 200/300`, verified with 63 child rows.
- A configured `Price` column remains part of the validated source contract but is no longer rendered as a table column. Its raw and multiplier-adjusted values feed the same accessible click/tap product-name popover as the legacy automatic parser.
- Price can no longer also be the hierarchy column; choosing a Price column as hierarchy clears that designation, and backend normalization rejects an ambiguous persisted contract.
- Backend tests pass 33/33, including synthetic outline/price and invalid hierarchy-price regression tests; frontend lint and production build pass with existing warnings. The pre-change tag is `checkpoint-before-balance-group-price-popover-20260910`.

## 2026-09-10 - Mobile balance primary-column viewport

- Configured balance tables now reorder only their mobile presentation so Nomenclature/hierarchy and the first balance/stock metric are always the first two columns, regardless of the administrator-defined desktop order.
- The primary pair occupies one phone viewport: stock uses 96 px (84 px at 420 px and below) and nomenclature consumes the remainder. Additional columns extend to the right with widths calculated from their header/data content and clamped to 112–220 px.
- Desktop order and sizing remain unchanged. Frontend lint and production build pass with the existing Sass legacy API and bundle-size warnings. The pre-change tag is `checkpoint-before-balance-mobile-primary-columns-20260910`.

## 2026-09-10 - Readable locked document fields

- Raised disabled and read-only control values from `$text-muted` with reduced element opacity to `$text-medium` at full opacity. Disabled surfaces, borders, and the not-allowed cursor continue to distinguish locked fields without sacrificing readability.
- Applied the rule through the shared FormInput/DateInput control mixin and CompactSelect, plus the return/exchange, TRO, and shared item-modal overrides so every document type has consistent contrast.
- Frontend lint and production build pass with the existing Sass legacy API and bundle-size warnings. The pre-change tag is `checkpoint-before-disabled-control-contrast-20260910`.

## 2026-09-14 - Centered document modals and mobile/tablet result scrolling

- Replaced the mobile/tablet bottom-sheet alignment of return, exchange, TRO, and shared product/TRO item modals with true vertical viewport centering. Cards keep a safe tokenized inset on every edge, full rounding, bounded `100dvh` height, and internal body scrolling.
- Document pages at 900 px and below now use a viewport-height flex layout. The result area consumes the remaining height with a 160 px safety minimum and its own momentum-enabled vertical scroller; headers, filter controls, and registry actions do not shrink. If expanded filters exceed the available space, the outer page can still scroll so controls remain reachable.
- Desktop/landscape-tablet document table containers now explicitly fill the bounded results viewport. Frontend lint and production build pass with the existing Sass legacy API and bundle-size warnings. The pre-change tag is `checkpoint-before-document-modal-scroll-layout-20260914`.

## 2026-09-14 - Collapsible document filters on tablets

- Extended the document filter toggle from the 900 px phone breakpoint through a centralized 1280 px tablet breakpoint. Tablet-width pages now start with the filter panel collapsed and reveal the same full filter form only on demand.
- This keeps the viewport-bounded document result area usable on portrait and landscape tablets instead of permanently spending its height on the multi-row filter panel. The table/cards continue to own the remaining vertical scrolling area.

## 2026-09-15 - City in the TRO/1C ready-request DTO

- Extended only `GET /api/1c/tro-requests` items with `city: { id, name }` while retaining the existing technical `branch` object and all branch filtering/cursor behavior.
- City data is resolved from the existing `cities` directory with both `documents.city = cities.id` and matching `documents.branch_id`; no branch-name inference is used. The DTO test and `docs/1c-tro-integration.md` example now cover the field.
- TRO integration tests pass 27/27, the complete backend suite passes 33/33, and syntax checks pass for the repository and service. The pre-change tag is `checkpoint-before-tro-integration-city-20260915`.

## 2026-09-15 - Real 1C responsible snapshot on TRO rejection

- Added migration `023_tro_1c_rejection_responsible.js` for nullable `tro_document_details.rejected_by_1c_guid` and `rejected_by_1c_name`. The migration file is committed but was not applied to a database in this slice.
- `POST /api/1c/tro-requests/:id/rejected` now requires a valid `responsible_guid` and a trimmed non-empty `responsible_name` up to 150 characters. The first rejection atomically stores the snapshot and status; `author_user_id`, `ta_user_id`, and `executor_*` remain unchanged.
- A retry is idempotent only when reason, optional reason code, responsible GUID, and responsible name all match. Any changed value returns `409 DOCUMENT_ALREADY_REJECTED` without overwriting the first event. History retains the integration account user ID but records the real responsible, reason, and code in a multiline comment.
- Opened rejected TRO documents show a dedicated `Відхилення в УП` block with the responsible name and rejection reason; history comments preserve their line breaks. Backend tests pass 35/35, frontend lint/build and backend syntax checks pass. The pre-change tag is `checkpoint-before-tro-1c-rejection-responsible-20260915`.

## 2026-09-15 - Migration 023 applied

- Applied `023_tro_1c_rejection_responsible.js` to the database configured in `api/.env`. Verified the `schema_migrations` record and nullable `VARCHAR(36)` / `VARCHAR(150)` columns `tro_document_details.rejected_by_1c_guid` and `rejected_by_1c_name` directly through read-only schema queries.

## 2026-09-16 - Sales-agent positions and user assortment phase 1

- Added and applied dev migration `024_sales_agent_positions_and_user_assortment.js`. `sales_agents.user_id` is nullable, identity is branch-scoped `(branch_id, login)`, and position rows now store route name, assortment GUID/name, `last_seen_at`, and `is_active_1c`. `users` gained nullable administrative assortment GUID/name fields so legacy SV rows remain valid after migration.
- Rebuilt `loadSalesAgents` around a fully validated in-memory plan: duplicate login/route rejection, anchor-only user synchronization, future-user state, secondary GUID resolution, ambiguity rejection, person-change/relink diagnostics, transactional upsert, and stale-position deactivation. Empty-login routes are counted as `ignored_no_login`, do not create warnings, and are never linked.
- Executed the current dev import successfully: 38 source rows produced 36 active positions owned by 33 users, with 33 anchors, 3 secondaries, 2 ignored empty-login routes, and no unmatched/ambiguous/conflict rows. The configured `delete_after_success=1` removed the processed `SalesAgent.json`. Control hashes confirmed that `users.NAME/PASSWORD/role`, user hierarchy, and branch/city access were unchanged.
- Admin user APIs expose imported assortment options and per-user `sales_agent_positions`. SV assortment is required and server-resolved from active imported positions; NTO and other roles allow null; TA always clears/ignores the user-level value and shows its positions read-only in the editor. Added non-blocking assortment/hierarchy diagnostics under the admin debug API.
- Backend tests pass 49/49 and the frontend production build passes with existing Sass and bundle-size warnings. No commit was created.

## 2026-09-16 - User assortment M:N correction

- Added and applied migration `025_user_assortments.js`: created `user_assortments` with a cascading user FK and unique `(user_id, assortment_guid)`, added explicit `users.multi_assortment_allowed`, and copied every non-empty legacy `users.assortment_guid/name` value without inferring assignments from user names, IDs, hierarchy, or imported TA positions.
- Replaced the Phase 1 single-value runtime model. Ordinary SV create/update now requires exactly one server-resolved active assortment; an explicitly flagged multi SV requires one or more; NTO and other roles permit zero or more. TA manual assignments are cleared/ignored and its read-only `effective_assortments` are derived from distinct active `sales_agents` positions only. Legacy user assortment columns remain deprecated compatibility data and are removed from runtime DTOs.
- Admin create/update accepts `assortment_guids` and `multi_assortment_allowed`; user DTOs return `assortments`, the explicit flag, imported positions, and TA effective assortments. The editor provides ordinary-SV single selection, an explicit multi-SV switch with multiple selection, optional multiple selection for non-TA roles, and a read-only TA view.
- Added non-mutating diagnostics for SVs without assignments, ordinary SVs with multiple assignments, and child TAs without any active position in the SV's allowed assortment set. Existing hierarchy, authorization, reports, documents, and TRO behavior remain unchanged.
- The dev database currently has all multi-assortment flags disabled; special/office SVs were deliberately not identified or configured automatically. Backend tests pass 52/52 and the frontend production build passes with existing Sass and bundle-size warnings. No commit was created.

## 2026-09-17 - GUID-based normalized Sales Report import

- Added and applied dev migration `026_sales_report_document_identity.js`. `sales_reports` now stores nullable `document_guid` and `sales_agent_guid`, has branch-scoped indexes for both snapshots, and enforces one active row per branch/document GUID through generated `active_document_guid` plus a unique index while retaining multiple `MOVED`/`CANCELLED` history rows.
- Rebuilt `loadSalesReports` for the normalized one-object-per-document contract. It validates UUIDs and `agentLogins[]`, rejects duplicate source GUIDs, builds the full import plan before the write transaction, resolves a workplace independently through `users.current_agent_guid` and active `sales_agents.login`, rejects mapping/user-change ambiguity, and never uses the TA name as identity. `agentLogins[]` remain diagnostic-only, `login_agent` stores canonical `users.NAME`, `sales_agent_guid/name` remain source snapshots, and `sales_agent_id`/assortment remain untouched.
- Added safe transition from legacy rows: the current source may backfill only one unambiguous canonical legacy row for the same branch/document number/user. Existing GUID documents retain their historical workplace if the former employee is no longer current; changes to another resolved workplace are rejected. Date moves retain `MOVED` history and exactly one active GUID; deletion is GUID-based.
- Dry-run of `D:\projects\TEMP\SalesReport.json` found 2,803 unique documents, 2,768 active and 35 deleted, with all 2,803 resolved by both GUID and login and no hard conflicts. One controlled import (import id 8720) backfilled 2,543 canonical rows, added 260 new logical documents, created 7 expected replacement rows for date moves, and performed no retention or historical cleanup.
- Post-import validation: 2,810 physical rows carry both GUID snapshots (2,803 documents plus 7 moved histories), no active GUID duplicates or GUID/user conflicts exist, every `sales_agent_id` remains NULL, and the existing API/repository returns exactly 2,768 active documents totaling 12,211,202.35 for 2026-09-12 through 2026-09-19, matching the source. Backend suite passes 70/70. No commit was created.
## 2026-09-17 — TRO portal request-position phase

- Added a nullable legacy-compatible request-position model for TRO: exact `sales_agents` reference plus immutable login, employee, route, and assortment snapshots.
- New TRO creation requires an active position: one is auto-selected, multiple require explicit selection, zero positions or missing route/agent GUID are rejected with stable codes.
- TRO edit preserves an existing snapshot (including later-inactive positions) unless TA/position is explicitly changed; editing legacy NEW/REVISION records resolves a current position.
- TA options now include branch-scoped active positions; the modal supports dependent 0/1/N position behavior and separates requested TA from actual TA returned by 1C.
- The 1C queue returns additive snapshot position fields with a LEGACY fallback. `/created` accepts optional login/route/assortment identity without changing workflow/idempotency or copying request identity into actual identity.
- Migration `027_tro_request_sales_agent_position.js` intentionally performs no historical backfill. 1C EPF changes remain a separate phase.

## 2026-09-17 — TRO 1C exact-position source phase

- Updated the full exported 1C form/object module sources in `D:\projects\TEMP` without changing the EPF binary or portal application code. New request-position snapshots are parsed, the known city-ID source bug is fixed, and exact route resolution now validates route existence/deletion, login, and current-agent GUID for both INSTALL and RETURN.
- New-format requests never fall back to the legacy route/packing resolver. Legacy requests without `route_guid` retain the old helper. Existing-document retries re-resolve and compare the selected position before retrying `/created`.
- `/created` now sends the actual 1C route GUID and login for new-format requests. Assortment validation/callback remains intentionally disabled because the exact 1C metadata field was not verifiable; route-to-trade-point validation was likewise not invented.
- Saved manual form-metadata instructions and a full implementation report beside the source exports. No commit was created.

## 2026-09-17 — TRO 1C strict-position correction

- Converted the exported 1C TRO integration sources to a strict exact-position contract: every request now requires `request_sales_agent` with route GUID, login, agent GUID, and assortment GUID.
- Removed the old route/packing fallback entirely, simplified the shared resolver to one request-row argument, removed the `НовыйКонтракт` flag, and made position validation unconditional in form validation, INSTALL, RETURN, idempotent retries, and `/created` callbacks.
- Safe numeric parsing is used for the portal position id. Callback always sends actual 1C route GUID/login. Assortment comparison remains deferred under `ASSORTMENT_FIELD_NOT_VERIFIED`; route-to-trade-point validation remains explicitly unimplemented because metadata is unverified.
- Updated the external source reports in `D:\projects\TEMP`; portal code and binary EPF were not changed. No commit was created.

## 2026-09-17 — TRO 1C final source hardening

- Hardened only the two exported 1C TRO source modules: `request_sales_agent` rejects both undefined and JSON NULL; assortment snapshot now requires a syntactically valid UUID without attempting unverified 1C assortment resolution; `/created` callback now verifies that the document agent equals the resolved position agent before building its payload.
- Confirmed zero legacy resolver/flag/runtime references and balanced BSL function, procedure, and try blocks. Portal and binary EPF were not changed; no commit was created.

## 2026-09-17 — TRO top-role signing and route-field polish

- Admin and Director can now sign every accessible TRO document in `NEW`/`REVISION`; backend authorization remains branch-scoped and the new exception is limited to the signature transition, without granting revision/rejection.
- The TRO modal now labels the sales-agent position as `Маршрут ТА 1С`, uses `Оберіть маршрут`, and applies an explicit top-aligned full-width field layout.
- Added a focused permission regression test. Backend suite passes 78/78; frontend lint and production build pass with existing Sass/bundle-size warnings.

## 2026-09-18 — TRO 1C workplace settings and rejection cleanup

- Updated only the exported 1C TRO form/object sources in `D:\projects\TEMP`: workplace settings now persist through `ХранилищеОбщихНастроек`, restore after `UP`/500 defaults, and reset the cached JWT after Save.
- Removed `КодПричиныОтклонения` and `reason_code` from source runtime; rejection now sends only reason plus the existing responsible GUID/name. Binary EPF metadata still requires the documented manual removal of the obsolete field/control.
- Verified zero temporary date-diagnostic strings and balanced BSL procedure/function/try blocks. Portal application code and binary EPF were not modified; no commit was created.

## 2026-09-18 — TRO 1C internal settings simplification

- The exported TRO 1C form source now treats `SourceSystem = "UP"` and `РазмерСтраницы = 500` as fixed internal values set before settings restore.
- Removed both technical values from Save validation, common-settings persistence, and restore; the remaining six workplace settings keep their previous behavior.
- The object export now independently enforces the same constants: `ПолучитьSourceSystem()` always returns `UP`, and request pagination always uses `limit = 500`; no workflow branches were changed.
- Form metadata was not available among the exports, so removing the two visible controls remains a manual configurator step. No commit was created.

## 2026-09-18 — TRO 1C batch creation source phase

- Reworked the exported ordinary-form `СоздатьВыбранныеНажатие` handler into a safe batch flow: every selected row is prechecked, at most 50 ready requests are processed, one confirmation covers the batch, and every request has an isolated try/catch.
- INSTALL/RETURN creation and `/created` callback calls remain unchanged. Successful rows are deselected; failed/not-ready rows remain selected; automatic queue refresh occurs only once after a fully successful batch.
- Added an ordinary-form `ТаблицаЗаявкиПриПолученииДанных` handler that colors only the `РезультатОбработки` cell using stable prefixes (`Создан:`, `Ошибка:`, `Не обработана:`). Binary EPF metadata must manually bind `ТаблицаЗаявки.ПриПолученииДанных` to this handler.
- The object module and portal were not changed. Static BSL block balances passed; no commit was created.

## 2026-09-18 — TRO 1C local city filter source phase

- Added a local city filter to the exported ordinary-form source using portal `city.id` as identity and `city.name` as presentation. A module-level `ВсеЗаявки` table preserves the full fetched queue while visible `Заявки` is rebuilt locally without another HTTP request.
- City changes synchronize visible edits by `PortalID`, clear selection across the full local set, preserve item lookup in the existing shared `Позиции`, and retain the selected city across manual/automatic refresh, including the zero-remaining case.
- Persisted city id/name settings and added a cross-city guard before warehouse assignment, create, and reject. Requests without a city id remain visible only in the all-cities view and fail validation.
- Binary metadata must add the two processing requisites plus the `ГородФильтраID` dropdown and bind its `ПриИзменении` event. The portal and object module were not changed; no commit was created.

## 2026-09-18 — TRO integration test requests

- Created 66 local-development TRO requests in database `auth`, tagged with comment `TEST_TRO_ALL_ACTIVE_TA_20260918`: one INSTALL and one RETURN for each of 33 active TA users with a complete active 1C sales-agent position.
- All generated requests have one TRO item, complete request-position snapshots, and status `NOT_COMPLETED`, making them available to the 1C integration queue. The transition was recorded in document history without sending email or Rocket.Chat notifications.
- Active user `ta_test` (ID 247) was skipped because no complete active 1C sales-agent position exists; no synthetic GUID/route data was invented. No product code was changed and no commit was created.

## 2026-09-18 — separate TRO stage-sync 1C processing sources

- Created source exports and full metadata instructions for a new standalone `ИнтеграцияСтатусовТРОСПорталом` external processing; the existing TRO creation processing, Portal backend/frontend, and binary EPF were not changed.
- The object-module core supports both manual execution and exported background `ВыполнитьЗадание()`, restores user-scoped connection settings, traverses the full status-pending cursor queue, reads 1C documents by strict type/GUID through queries, skips unchanged stages, and posts only the independent `one_c_stage` state.
- Static review confirmed balanced BSL function/procedure/try blocks and no document writes, stage recalculation calls, workflow-completion endpoints, or UI dependencies in the background entry point. Files and full reports were saved under `D:\projects\TEMP`; no commit was created.

## 2026-09-19 — TRO list 1C-stage presentation

- Confirmed that the existing branch-scoped TRO list query already returns `tro_document_details.one_c_stage` as `tro_one_c_stage`, so no backend contract, query, access rule, migration, registry schema, or integration endpoint change was required.
- TRO desktop rows and compact mobile cards now render `Стан в УП` as a separate theme-token badge while preserving the existing Portal workflow status. A shared presentation helper also supplies the same Ukrainian labels to the TRO detail modal.
- Added five-value presentation coverage (`NEW`, `IN_PROGRESS`, `COMPLETED`, `CANCELLED`, and null). Backend tests pass 80/80, frontend lint and production build pass with only the existing Sass and bundle-size warnings. No commit was created.

## 2026-09-19 — TRO 1C-stage icon and registry follow-up

- Refined the TRO list so desktop cells render the independent 1C stage as a compact semantic icon with accessible/native tooltip, while mobile cards render the icon plus the full Ukrainian stage label.
- Added `Стан в УП` to the server-defined TRO registry schema, selected by default for both compact print and XLSX; registry rows translate `tro.oneCStage` independently from the existing Portal `status` column and render missing legacy values as `—`.
- Backend tests pass 81/81, frontend lint and production build pass with only existing Sass and bundle-size warnings. No migration or commit was created.

## 2026-09-19 — UP cancellation propagates to TRO request

- Updated `POST /api/1c/tro-requests/:id/stage` so `stage=CANCELLED` preserves the integration stage and also moves the Portal TRO request to terminal status `REJECTED`, including the `IN_PROGRESS → CANCELLED` path.
- The cancellation records the Portal status transition in common history and sends the normal status notification. An identical retry is idempotent; a retry also repairs legacy inconsistent rows where `one_c_stage` is already `CANCELLED` but the Portal request is not yet rejected.
- Other 1C stages remain independent: in particular, `COMPLETED` still does not complete the Portal accounting workflow. No schema migration or commit was created.

## 2026-09-19 — TRO modal item-table readability

- Increased TRO item body cells in the document modal to `13px` and explicitly vertically centered `td` content, without changing the compact table header or layout.

## 2026-09-19 — Sales report hierarchy search and assortment filter

- Removed the branch prefix from Sales report supervisor labels and extended the report DTO with role/login/assortment data for the TA, direct supervisor, and higher manager. TA assortments come only from active branch-scoped `sales_agents` positions; SV/NTO assortments come from `user_assortments`.
- The screen now renders the available NTO -> SV -> TA hierarchy and appends each user's assortment names in muted text. Hierarchy-aware search keeps only a matching TA, the full subtree of a matching SV, or the full subtree of a matching NTO.
- Added a shared-control assortment filter based on visible TA positions; filtered totals are recalculated from the remaining TA branches, and filtered branches expand automatically. Existing server-side report access and branch scope are unchanged.
- Verified all five live role-specific SQL paths against the development database, including a 6,828-row Admin result (~0.4 s), and confirmed assortment snapshots at all three hierarchy levels. Frontend lint/build and all 83 backend tests pass; no migration or commit was created.
- Follow-up: user labels now explicitly render as `ФИО — ассортимент`; the name is the shrinking portion while the assortment suffix retains reserved row space, preventing long names from pushing it out of view.
- Visual follow-up: removed the expanding spacer behavior between the name and assortment, so the assortment now follows the name immediately and no longer competes visually with the right-aligned sales amount.

## 2026-09-19 — Admin user-list assortment column

- Added an `Асортимент` column to both flat and hierarchy user tables in Admin. TA rows use `effective_assortments` from active 1C positions; all other roles use their administrative `assortments` assignments.
- Multiple assortments render as compact comma-separated text with a full native tooltip; missing assignments render as `—`. Updated the expanded subordinate-row span and table minimum width for the seventh column.

## 2026-09-19 — Separate city-scoped technical accounts for TRO/1C

- Replaced the environment allow-list/ordinary-user integration identity with separate `integration_accounts` and many-to-many `integration_account_cities`. Admin now has a compact `Технічні записи` tab for creating, disabling, password-resetting, assigning multiple cities, and granting request-processing and/or status-sync capabilities. City overlap between accounts is intentionally allowed.
- Added `POST /api/1c/auth/sign-in` with a purpose-bound 30-minute JWT. Active account, capabilities, active cities, and branches are reloaded on every integration request; technical principals remain excluded from ordinary portal APIs.
- Ready and status-pending queues and every callback now enforce city scope; cursor signatures include cities. Integration history rows use nullable `user_id`, while real 1C responsible snapshots remain in event comments/metadata. Status-pending DTO now includes `city`.
- Applied migration `028_integration_accounts.js` to the approved development database. Backend tests pass 87/87; frontend lint and production build pass with only existing Sass/bundle-size warnings.

## 2026-09-20 — 1C source exports switched to technical-account sign-in

- Fixed both TRO request and central status-sync 1C source modules under `D:\projects\TEMP`: authorization now posts `{ login, password }` to `/api/1c/auth/sign-in` and reads `data.accessToken` / `data.accessTokenExpiration` from the new response envelope.
- The integration sign-in DTO now includes `accessTokenExpiration: 1800000` so both 1C modules retain their existing proactive token-refresh behavior. Verified the `test_one_acc` database record is active, has request-processing permission and two assigned cities.
- Source verification finds zero old `/api/auth/sign-in` calls and balanced Function/Procedure/Try blocks in both modules. Backend tests pass 87/87. No commit was created.
- Rebased `ИнтеграцияСтатусовТРОСПорталом_МодульОбъекта.txt` on the user's newer 901-line source and reapplied only the technical-account auth changes. The previous TEMP version is preserved as `ИнтеграцияСтатусовТРОСПорталом_МодульОбъекта.before-tech-auth-20260920.txt`; status queue, pagination, and stage callback logic were left intact.
- 2026-09-20: Added `documentation/JSON_IMPORT_STRUCTURES.md`, a parser-verified reference with minimal examples for all seven JSON imports plus the two directly served static JSON reports. It separately records the latest `SalesAgent.json` and strict `SalesReport.json` contract changes and flags the stale legacy-shaped `client/public/Sorce/SalesReport.json` snapshot.
- 2026-09-21: Implemented the Full HD warehouse-worker ranking dashboard. Added isolated role 9 (`WarehouseDashboard`), migration `029_warehouse_dashboard_accounts.js` with many-to-many `user_warehouse_access` (applied to the confirmed development DB), admin account/warehouse management, strict ordinary-API denial for screen users, direct post-login routing to `/warehouse-dashboard`, current Kyiv 08:00–08:00 aggregation, equal-rank invoice scoring with rows/weight tie ordering, one-minute refresh/stale-state UI, and a server DTO that deliberately contains no earnings/rate/amount fields. New focused tests pass 3/3; frontend lint and production build pass.
- 2026-09-21: Compacted the warehouse TV dashboard header by removing the large `Рейтинг комплектувальників` title, tightening outer/header spacing, clock, and utility controls, and explicitly vertically centering all ranking-table cell content.
- 2026-09-21: Reduced the warehouse dashboard ranking-table header height and font scale while keeping header labels vertically centered.
- 2026-09-21: Removed the ranking table's forced `height: 100%`, which had caused the browser to stretch `thead`; the table header now has a fixed compact 30px height independent of data rows.

## 2026-09-23 — Balance PDF export

- Added `GET /api/balances/:slug/pdf` and a responsive `Зберегти PDF` action on every balance page. The protected endpoint resolves the same branch-scoped active balance page as the XLSX download and re-reads the current source file when generating the PDF.
- The PDF shows the configured warehouse/page title, `Залишок актуальний на:` timestamp from the workbook (falling back to the XLSX modification time), hierarchy indentation, and only the configured visible columns in their saved order. The configured Price helper column remains hidden, matching the screen.
- Added focused template/hierarchy coverage and made the shared parser receive the caller's XLSX adapter, so the backend uses its own declared dependency instead of resolving `client/node_modules`. All 92 backend tests, frontend lint, production build, dependency-tree checks, and production-dependency audits pass; only the existing Sass and bundle-size warnings remain. No migration is required.

## 2026-09-23 — PM2 production update runbook

- Added `documentation/update-pm2-production.md` for updating the existing `balance.roshen.zp.ua` PM2 deployment to pinned release `82ec22c`.
- The runbook covers DB/env/import/frontend backups, clean Git checkout, production environment and Chromium checks, deterministic installs, tests, migrations, build, PM2/Nginx restart, health/browser verification, and code rollback without unsafe automatic Git resets or manual migration reversal.
- Documented the two known false-positive schema checks in the current bootstrap doctor (`scheduler_tasks.id` and lowercase legacy `users` columns) so they are not confused with actual migration failures.
- Clarified the runbook for an SSH-only workflow: one interactive `ssh -t` session from the administrator's local Windows terminal, explicit local/remote command labels, password prompt behavior, and keeping the session open through smoke-test or rollback.

## 2026-09-23 - Sales Report unresolved-agent partial import

- Changed normalized SalesReport planning so an otherwise valid document whose historical `salesAgentGuid`/`agentLogins` cannot resolve to a portal workplace is skipped with a detailed `UNRESOLVED_AGENT` diagnostic instead of blocking the whole source file. The diagnostic preserves document GUID/number plus the source agent GUID/name/logins; no current login is guessed and historical sales are never reassigned to a new employee.
- Resolvable documents still execute atomically. An import containing skipped unresolved documents returns `completed_with_warnings` / `partial_import`, while GUID/login ambiguity, multiple-workplace login conflicts, document-owner changes, duplicate active GUIDs, and ambiguous legacy backfill remain hard failures. Successfully processed source files retain the existing delete-after-success behavior so the same batch is not retried continuously.
- All 93 backend tests pass when executed sequentially in-process; the ordinary parallel Node runner is blocked only by the local Windows sandbox's process-spawn policy. No migration or frontend rebuild is required for this backend-only change.
