# 1. Pre-change audit

The worktree was already dirty on branch `branches-config`: it contained the in-progress TRO execution-sync implementation plus unrelated user changes in balance source/dist files, Debet report files, deferred-work documentation, and user-guide artifacts. No restore, reset, checkout, clean, or unrelated edit was performed.

The configured database was confirmed before migration as local DEV: `.env` has `DB_HOST=localhost`, `DB_NAME=auth`; the live server reported hostname `Stako_PC`, port 3306. Migration 031 was not present in `schema_migrations`.

Before migration:

- TRO documents: 95;
- `tro_document_details`: 95;
- Portal statuses: COMPLETED 2, NEW 3, NOT_COMPLETED 17, PLANNED 53, REJECTED 20;
- 1C stages: CANCELLED 4, COMPLETED 2, NEW 50, NULL 39.

# 2. CANCELLED behavior found

The automatic transition was inside `createTroIntegrationService().stage()` in `api/services/TroIntegrationService.js`. It calculated `cancelPortalRequest`, called `repository.savePortalStatus(..., "REJECTED")`, wrote `old_status/new_status` as a Portal transition in `ONE_C_STAGE` history, returned `portal_status="REJECTED"`, and sent a rejection notification. `api/repositories/TroIntegration.js` supplied the dedicated `savePortalStatus()` update used by that path.

# 3. Backend fix

Removed only the stage-driven business transition. `/stage` now updates `one_c_stage` and the authoritative execution snapshot while always returning the unchanged `doc.status`. `NEW`, `IN_PROGRESS`, `COMPLETED`, and `CANCELLED` are all independent from Portal `documents.status`.

The dedicated `/rejected` workflow and `repository.reject()` remain unchanged, so real integration rejection still uses the existing controlled business transition.

# 4. History fix

An actual 1C stage change still creates one `ONE_C_STAGE` event and keeps the human-readable stage-change comment. Its `old_status` and `new_status` are both null because no Portal business status changed. Snapshot-only changes still create no fake same-stage history.

# 5. Regression tests

Updated the CANCELLED regression to start from Portal `PLANNED` / 1C `IN_PROGRESS`, post `CANCELLED` with multiple execution documents, and verify:

- `one_c_stage=CANCELLED`;
- `documents.status=PLANNED`;
- execution rows are retained atomically;
- history has no PLANNED → REJECTED transition;
- no rejection notification is emitted;
- exact repeat is idempotent.

The second regression confirms an already-CANCELLED integration stage cannot “repair” or alter the Portal business status. All existing snapshot, stale, conflict, completion, access, and legacy-payload tests remain active.

# 6. 1C source cleanup

Removed from `ИнтеграцияСтатусовТРОСПорталом_МодульОбъекта_v2.txt`:

- `Сообщить("Технические параметры инициализированы!")`;
- `Сообщить("Настройки интеграции НЕ найдены.")`;
- `Сообщить("Настройки интеграции найдены.")`.

Kept `Сообщить("ОК")` because it is the direct user-visible result of the explicit save-settings command. Exception throwing and registration-log writes were not changed.

# 7. Migration 031 verification

Before execution, migration 031 was verified to define:

- `tro_1c_execution_documents`;
- owner FK `portal_document_id → documents.id`;
- `source_system`, execution GUID/number/date, confirmation and shipment flags, timestamps;
- unique `(source_system, document_1c_guid)`;
- `ON DELETE CASCADE`;
- nullable `tro_document_details.one_c_observed_at`.

# 8. Migration execution

Executed from `D:\projects\jwt-auth\api` with the project runner:

```powershell
npm run migrate
```

The runner applied the previously pending migration 030 first, then applied and registered `031_tro_1c_execution_documents.js`. No production database was contacted.

# 9. Database before/after checks

After migration:

- TRO documents: 95 (unchanged);
- `tro_document_details`: 95 (unchanged);
- execution rows: 0, as expected before the first v2 status sync;
- Portal statuses: COMPLETED 2, NEW 3, NOT_COMPLETED 17, PLANNED 53, REJECTED 20 (unchanged);
- 1C stages: CANCELLED 4, COMPLETED 2, NEW 50, NULL 39 (unchanged).

Therefore migration did not delete TRO data or alter Portal status / 1C stage distributions. It contains no statements that modify `document_1c_guid`.

# 10. Resulting schema

`information_schema` confirms all ten expected execution-table columns, nullable `one_c_observed_at`, unique index `uq_tro_execution_source_guid(source_system,document_1c_guid)`, owner lookup index, and FK `fk_tro_execution_portal_document` with delete rule `CASCADE`. `schema_migrations` contains migration 031.

# 11. Backend tests

- `node tests/troIntegration.test.js`: 43/43 passed after migration.
- `node --check` for changed backend service, repository, DTO service, and migration: passed.
- Regression coverage includes NEW/IN_PROGRESS/COMPLETED/CANCELLED, insert/update/removal/multiple snapshots, same-stage snapshot changes, exact idempotency, stale protection, GUID conflict, atomic completion, Portal status independence, and legacy payload compatibility.

# 12. Frontend lint/build

- `npm run lint`: passed with zero warnings.
- `npm run build`: passed. Only the existing Sass legacy-JS-API and large-chunk warnings were printed.
- The current `Виконання в УП` UI compiled without design changes.

# 13. 1C static check

- Functions/endings: 19/19.
- Procedures/endings: 10/10.
- Try/endings: 6/6.
- Confirmed strict INSTALL `.Заказ`, RETURN `.ДокументОснование`, deletion exclusion, confirmation/shipment flags, and `execution_documents` payload.
- One intentional interactive message remains: save-settings `Сообщить("ОК")`.

# 14. What the user must do next manually

1. Open `ИнтеграцияСтатусовТРОСПорталом.epf`.
2. Replace its object module with `ИнтеграцияСтатусовТРОСПорталом_МодульОбъекта_v2.txt`.
3. Run syntax check in Configurator.
4. Open Portal.
5. Run manual synchronization.
6. Check INSTALL.
7. Check RETURN with multiple execution documents.
8. Check `Не підтверджено`.
9. Check `Відвантажено зі складу`.
10. Check `Підтверджено`.
11. Check NEW → IN_PROGRESS → COMPLETED.
12. Repeat unchanged synchronization and check idempotency.

Do not enable the scheduled job until these manual tests pass.

# 15. Changed files

Correction-specific edits:

- `api/services/TroIntegrationService.js`
- `api/repositories/TroIntegration.js`
- `api/tests/troIntegration.test.js`
- `ИнтеграцияСтатусовТРОСПорталом_МодульОбъекта_v2.txt`
- `docs/1c-tro-integration.md`
- `AGENTS.md`
- `MEMORY.md`
- `TRO-EXECUTION-SYNC-IMPLEMENTATION-REPORT.md`
- `TRO-EXECUTION-SYNC-CODEX-RESULT.md`
- `TRO-EXECUTION-SYNC-FIX-REPORT.md`
- `TRO-EXECUTION-SYNC-FIX-CODEX-RESULT.md`

Migration 031 itself was verified and applied, not structurally changed in this correction.

# 16. Git status

Branch remains `branches-config`; no commit was created. The worktree remains intentionally dirty with the execution-sync implementation, this correction, and the pre-existing unrelated user changes noted in section 1. Binary EPF was not changed.

PORTAL READY FOR 1C MANUAL TESTS: YES
