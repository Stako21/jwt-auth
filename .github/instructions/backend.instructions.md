---
applyTo: "api/**/*.js"
---

# Backend Instructions

## Scope

These instructions apply to backend files under `api/`.

## Existing Stack

- Express routes/controllers/services.
- MySQL through `mysql2/promise` pool exported by `api/db.cjs`.
- JWT access tokens and refresh sessions.
- Puppeteer-generated PDFs.
- Import jobs that read JSON files from an import directory.

## Layering

- Routes belong in `api/routes` or `api/routers`.
- Controllers handle HTTP status codes, request params/body, and response shape.
- Services contain business logic and workflow rules.
- Repositories contain reusable SQL access where such repository already exists.
- Do not put large business workflows directly into route files.
- Do not move unrelated code while implementing a scoped change.

## Branch And Configuration Rules

- `branch_id` is being introduced as the multi-branch isolation boundary.
- New business-data tables should include `branch_id` when data belongs to a branch.
- Existing business-data queries should be checked for branch filtering when touched.
- City labels and document prefixes should come from `cities`.
- Stock balance page metadata should come from `balance_pages`.
- Optional static reports should come from `report_definitions`.
- Scheduler active/interval settings should come from `scheduler_tasks`.

## Error Handling

- Controllers should catch service errors and return useful HTTP statuses.
- Existing controllers often return `{ message: error.message }`; keep response style consistent unless improving a touched path.
- Do not leak stack traces to clients.
- Log server-side errors with enough context to debug.

## Validation

- Reuse existing Yup validator pattern where present.
- Validate required fields in controllers/services before DB writes.
- For city/config mutations, future code must validate required fields such as `slug`, `name`, `short_name`, and `document_prefix`.
- For scheduler updates, keep positive integer validation for intervals.

## Migrations

- Migrations are JS modules under `api/migrations` exporting `up(pool)`.
- The runner is `api/scripts/migrate.js`.
- Do not assume migrations have run in a target environment.
- Do not run migrations against an unknown DB without confirmation.

## Critical Behavior

- Do not break JWT login/refresh.
- Do not change role IDs casually.
- Do not loosen document access/status rules.
- Do not remove import file deletion behavior for JSON DB imports unless explicitly requested.
- Do not delete XLSX balance files after reading them.

