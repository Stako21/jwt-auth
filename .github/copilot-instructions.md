# Copilot Instructions

## Coding Style

- Use modern JavaScript/React consistent with the existing codebase.
- Keep frontend components as functional React components.
- Use existing CSS modules and Bulma conventions already present in the project.
- Prefer clear names over new abstractions.
- Keep comments short and only where they clarify non-obvious logic.

## Naming Conventions

- Backend DB columns use snake_case.
- Backend JS responses often map DB fields to camelCase for frontend config.
- Frontend props/state use camelCase.
- Roles are numeric IDs defined in both `api/utils/roles.js` and `client/src/utils/roles.js`.
- Branch/city config naming currently uses:
  - `branch_id` in DB
  - `branchId` in JS/frontend
  - `document_prefix` in DB
  - `documentPrefix` in JS/frontend

## Architecture Rules

- Continue the branch/city configuration work already started.
- Do not restart the refactor from scratch.
- Do not re-hardcode city lists, balance routes, balance file names, or document prefixes.
- Treat `branches` and `branch_id` as the future multi-branch isolation boundary.
- Treat `cities` as the source of truth for city labels and document prefixes.
- Treat `balance_pages` as the source of truth for stock balance menu/routes/files.
- Treat `report_definitions` as the source of truth for optional static reports.
- Treat `scheduler_tasks` as the source of truth for scheduler active/interval settings.

## Backend Rules

- Keep route handlers thin.
- Put request/response handling in controllers.
- Put business logic in services.
- Put direct SQL access in repositories where a repository exists; do not create ad hoc query patterns unnecessarily.
- Existing code does not fully enforce this separation yet; when touching files, move toward it without broad unrelated rewrites.
- Always consider branch scoping for business data queries.

## Frontend Rules

- Use `AppConfigContext` for app configuration.
- Use API clients in `client/src/services` for backend calls.
- Do not fetch protected files directly from `/Sorce`.
- Use `/balance/:slug` for dynamic balance pages.
- Keep auth-token behavior aligned with existing `inMemoryJWT` service.

## Current Refactor Requirements

Future changes should continue these partial changes:

- Add Admin UI for "Конфігурація".
- Add CRUD endpoints for cities, balance pages, report definitions, and possibly branch access.
- Wire Accountant/Warehouse additional city access to `user_city_access`.
- Wire Director/multi-branch access to `user_branch_access`.
- Avoid breaking existing document and sales report visibility rules while adding branch support.

