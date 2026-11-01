# 1. Existing architecture audit

The existing integration already had a protected `POST /api/1c/tro-requests/:id/stage`, branch/city access checks, parent GUID validation, cursor-based `status-pending`, and independent Portal/1C statuses. It stored only the aggregate `one_c_stage`; actual 1C execution documents were not persisted. The separate status processor skipped POST when the aggregate stage had not changed, so detail changes could not reach Portal.

# 2. Database changes

Migration `031_tro_1c_execution_documents.js` creates `tro_1c_execution_documents` and adds nullable `tro_document_details.one_c_observed_at`. The migration does not alter existing TRO rows, Portal statuses, or existing 1C stages.

# 3. Execution document model

Each row stores the Portal owner, source system, 1C GUID, number, date, `confirmed`, and `shipped_from_warehouse`. `(source_system, document_1c_guid)` is unique. The owner FK references `documents.id` with `ON DELETE CASCADE`.

# 4. API contract changes

`POST /api/1c/tro-requests/:id/stage` accepts optional `execution_documents`:

```json
{
  "document_1c_guid": "11111111-1111-4111-8111-111111111111",
  "source_system": "UP",
  "stage": "IN_PROGRESS",
  "changed_at": "2026-09-08T10:30:00+03:00",
  "execution_documents": [{
    "document_1c_guid": "55555555-5555-4555-8555-555555555555",
    "document_number": "СГ0003111",
    "document_date": "2026-09-08T10:27:29+03:00",
    "confirmed": false,
    "shipped_from_warehouse": true
  }]
}
```

Success data contains `idempotent`, `stage_changed`, `execution_documents_changed`, `portal_status`, and `one_c_stage`. Validation errors use HTTP 422; stale snapshots and cross-request execution GUID conflicts use HTTP 409.

# 5. Transaction semantics

Parent link/access validation, stale validation, conflict detection, execution upsert/removal, aggregate-stage update, and stage history are handled inside the existing repository transaction. A final `COMPLETED` snapshot and the aggregate stage commit together. No 1C stage changes Portal `documents.status`.

# 6. Idempotency

An exact repeat performs no execution-row write and creates no history. Changed rows are updated, new rows inserted, and missing rows deleted. A snapshot-only change does not create a fake same-stage history event.

# 7. Stale-update handling

Snapshot calls compare `changed_at` against `one_c_observed_at`, falling back to `one_c_stage_updated_at` for pre-migration data. Legacy calls without `execution_documents` retain the former stage-based barrier. `one_c_stage_updated_at` remains the stage-change timestamp.

# 8. INSTALL lookup

The v2 status source resolves the parent strictly by `document_1c_guid` as `Документ.ЗаказНаУстановкуТРО`, then reads all non-deleted `Документ.УстановкаТРОНаТорговуюТочку` rows where `Выполнение.Заказ = &ДокументОснование`.

# 9. RETURN lookup

The v2 status source resolves the parent strictly by `document_1c_guid` as `Документ.ЗаявкаНаВозвратТРО`, then reads all non-deleted `Документ.ВозвратТРОСТорговойТочки` rows where `Выполнение.ДокументОснование = &ДокументОснование`.

# 10. Aggregate stage algorithm

- Parent `Отменен` → `CANCELLED`.
- No execution rows and parent `Новый` → `NEW`.
- No rows with any other non-cancelled parent stage → `IN_PROGRESS`.
- `COMPLETED` requires parent `Завершен`, at least one execution row, and every row `Подтвержден=true`.
- Every other case → `IN_PROGRESS`. `ОтгруженСоСклада` never completes the aggregate.

# 11. Portal full-document DTO

`tro.execution_documents` now contains the five integration fields. It remains available from the ordinary full-document endpoint after a completed item drops out of `status-pending`.

# 12. Portal UI

The TRO modal has a read-only compact `Виконання в УП` table with columns `Документ`, `Дата`, and `Стан`. The centralized mapping gives confirmation precedence, then shipment, then not-confirmed. An empty snapshot displays a neutral message.

# 13. 1C processing changes

Created `ИнтеграцияСтатусовТРОСПорталом_МодульОбъекта_v2.txt`. It adds execution lookup, aggregate-stage calculation, JSON snapshot construction, and posts every observation. It only reads 1C business documents and sends HTTP requests. The creation processing and binary EPF were not changed.

# 14. Counters/logging

`Изменено` increments when either `stage_changed` or `execution_documents_changed` is true. Exact idempotent responses increment `БезИзменений` and `Идемпотентно`. Snapshot-only changes are logged without implying a stage transition.

# 15. Backward compatibility

Omitting `execution_documents` preserves the old snapshot behavior and never clears stored rows. Passing `[]` is an authoritative empty snapshot. `NEW`, `IN_PROGRESS`, `COMPLETED`, and `CANCELLED` do not mutate Portal `documents.status`.

# 16. Deployment order

1. Apply Portal migration 031.
2. Deploy the backward-compatible Portal backend.
3. Deploy the Portal frontend.
4. Verify the old 1C status client still synchronizes stages.
5. Replace the status processing object module with the v2 source and compile the EPF.
6. Run a manual status synchronization and inspect one INSTALL and one RETURN request.
7. Enable scheduled/regulatory execution.

# 17. Test results

- `node tests/troIntegration.test.js`: 43/43 passed.
- Relevant backend `node --check`: passed.
- `npm run lint` in `client`: passed with zero warnings.
- `npm run build` in `client`: passed; only existing Sass legacy-API and large-chunk warnings were printed.
- 1C static balance: 19/19 functions, 10/10 procedures, 6/6 try blocks.
- Migration 031 was subsequently applied to the local DEV database `auth` on `Stako_PC` during the correction pass; the standard runner also applied the previously pending migration 030 first.

# 18. Changed files

- `api/migrations/031_tro_1c_execution_documents.js`
- `api/repositories/TroIntegration.js`
- `api/services/TroIntegrationService.js`
- `api/services/TroDocumentService.js`
- `api/tests/troIntegration.test.js`
- `client/src/components/Documents/executionDocumentStatus.js`
- `client/src/modals/CreateTroDocumentModal.jsx`
- `client/src/modals/CreateTroDocumentModal.module.scss`
- `docs/1c-tro-integration.md`
- `AGENTS.md`
- `MEMORY.md`
- `ИнтеграцияСтатусовТРОСПорталом_МодульОбъекта_v2.txt`
- this report and `TRO-EXECUTION-SYNC-CODEX-RESULT.md`

# 19. Migration status

Migration 031 is applied and registered in the local DEV database `auth` on `Stako_PC`. The table, nullable observation column, unique index, and cascading FK were verified from `information_schema`. No production database was touched.

# 20. Known limitations

- The v2 1C text source was statically audited but cannot be compiled or executed without the target 1C configurator/database.
- The exact 1C metadata names `Подтвержден`, `ОтгруженСоСклада`, `Заказ`, and `ДокументОснование` follow the supplied contract and must exist in that configuration.
- No browser-driven visual test was available; frontend lint/build and the shared status-helper test pass.
- Binary EPF is unchanged; the source must be transferred manually.

# 21. Git status

No commit was created. The worktree already contained unrelated modified/deleted XLSX/JSON, Debet-report, documentation, and user-guide files; they were preserved. The implementation files listed in section 18 are the only files intentionally added or edited for this task (apart from appending the required checkpoint to the already-modified `MEMORY.md`).

## Manual EPF update

1. Open the separate `ИнтеграцияСтатусовТРОСПорталом.epf` in Configurator.
2. Replace its object module with `ИнтеграцияСтатусовТРОСПорталом_МодульОбъекта_v2.txt`.
3. The source adds `ПолучитьФактическиеДокументы1С`, `ПолучитьИтоговуюСтадиюПортала`, and `СформироватьExecutionDocumentsJSON`; it also replaces the state assembly, `/stage` payload/response parsing, and per-row processing logic.
4. The form module does not change. No metadata attributes or new controls are required.
5. Run syntax check/compile in Configurator.
6. Manually synchronize one INSTALL with no execution document, one shipped but unconfirmed execution, one confirmed INSTALL, and one RETURN with multiple execution documents.
7. Confirm Portal shows every row and the expected aggregate stage; repeat the same sync and confirm it is counted as unchanged/idempotent.
