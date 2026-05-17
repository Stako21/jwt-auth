# MEMORY.md

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
