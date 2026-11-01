# TRO execution synchronization — completed implementation

Implemented the complete Portal-side storage and synchronization of actual 1C TRO execution documents without changing the TRO creation processing, binary EPF, or unrelated workflows. No commit was created. Migration 031 was subsequently applied to the local DEV database during the correction pass.

## Audit and decisions

The existing integration had a correct protected parent-stage callback but no collection for actual execution documents. The old 1C status processor skipped the callback whenever the aggregate stage matched Portal, which lost changes such as SHIPPED → CONFIRMED or the appearance/removal of a second execution document. The solution extends the existing `/stage` transaction rather than creating another endpoint.

`one_c_stage_updated_at` keeps its original meaning: time of the last actual stage change. New `one_c_observed_at` records the latest accepted full observation and is the stale-snapshot barrier.

## Migration and data model

Migration `api/migrations/031_tro_1c_execution_documents.js` adds:

- `tro_1c_execution_documents` with Portal owner FK and cascade delete;
- unique `(source_system, document_1c_guid)`;
- number, date, confirmation and warehouse-shipment flags;
- `tro_document_details.one_c_observed_at`.

It does not modify existing rows, `documents.status`, or current `one_c_stage`. It is applied to the local DEV database `auth` on `Stako_PC`; no production database was touched.

## Actual `/stage` contract

```http
POST /api/1c/tro-requests/125/stage
Authorization: Bearer <integration-token-with-can_sync_statuses>
Content-Type: application/json
```

```json
{
  "document_1c_guid": "11111111-1111-4111-8111-111111111111",
  "source_system": "UP",
  "stage": "IN_PROGRESS",
  "changed_at": "2026-09-08T10:30:00+03:00",
  "execution_documents": [
    {
      "document_1c_guid": "55555555-5555-4555-8555-555555555555",
      "document_number": "СГ0003111",
      "document_date": "2026-09-08T10:27:29+03:00",
      "confirmed": true,
      "shipped_from_warehouse": true
    }
  ]
}
```

```json
{
  "ok": true,
  "data": {
    "idempotent": false,
    "stage_changed": true,
    "execution_documents_changed": true,
    "portal_status": "PLANNED",
    "one_c_stage": "IN_PROGRESS"
  }
}
```

`execution_documents` omitted means legacy operation and does not clear execution rows. Present `[]` is an authoritative empty snapshot. GUID format, per-payload uniqueness, non-empty number up to 64 characters, parseable ISO date, and strict JSON booleans are validated. Invalid fields return 422. A stale observation returns `409 STALE_STAGE_UPDATE`; an execution GUID already owned by another Portal request returns `409 EXECUTION_DOCUMENT_GUID_CONFLICT`.

## Atomicity, idempotency, and history

Access/link checks, stale checks, conflict checks, detail-row synchronization, stage update, and history all run in the existing database transaction. `COMPLETED` and its final detail rows therefore commit together before the request disappears from `status-pending`.

An exact repeat creates no row/history duplicates and performs no execution-row update. Detail changes with an unchanged aggregate stage are accepted without a false `IN_PROGRESS → IN_PROGRESS` history event. No aggregate 1C stage, including `CANCELLED`, changes Portal `documents.status`.

## 1C INSTALL and RETURN algorithms

The new source `ИнтеграцияСтатусовТРОСПорталом_МодульОбъекта_v2.txt` retains strict parent lookup by the Portal-provided GUID and has no number fallback.

- INSTALL reads non-deleted `Документ.УстановкаТРОНаТорговуюТочку` where `.Заказ` equals the resolved `ЗаказНаУстановкуТРО` reference.
- RETURN reads non-deleted `Документ.ВозвратТРОСТорговойТочки` where `.ДокументОснование` equals the resolved `ЗаявкаНаВозвратТРО` reference.

Every polling pass posts the full current snapshot. The processing remains read-only toward 1C business documents.

Aggregate stage is calculated identically for both movements:

- parent `Отменен` → `CANCELLED`;
- zero execution rows plus parent `Новый` → `NEW`;
- zero rows in another non-cancelled state → `IN_PROGRESS`;
- `COMPLETED` only when parent is `Завершен`, at least one active execution document exists, and all are confirmed;
- otherwise `IN_PROGRESS`.

Shipment never makes the aggregate completed.

## Portal DTO and UI

The full TRO DTO now includes `tro.execution_documents[]`. The modal displays a read-only compact `Виконання в УП` table (`Документ | Дата | Стан`) and keeps GUIDs hidden. The centralized frontend helper maps:

- confirmed → `Підтверджено`;
- not confirmed but shipped → `Відвантажено зі складу`;
- neither → `Не підтверджено`.

The empty list is a neutral state, not an error. The ordinary TRO list remains unchanged.

## Counters and logging

The v2 1C source increments `Изменено` when either the stage or execution snapshot changed. Exact repeats increment `БезИзменений` and `Идемпотентно`. Snapshot-only changes use a dedicated message and do not pretend the aggregate stage changed.

## Tests and checks

- Backend TRO integration suite: 43/43 passed.
- Backend syntax checks for service, repository, DTO service, and migration: passed.
- Frontend lint: passed with zero warnings.
- Frontend production build: passed; only the existing Sass legacy API and chunk-size warnings remain.
- 1C source balance: 19 functions/19 endings, 10 procedures/10 endings, 6 try blocks/6 endings.
- Static search confirms INSTALL `.Заказ`, RETURN `.ДокументОснование`, deletion exclusion, and full snapshot payload.

## Manual EPF instructions

1. Open only the separate status processing `ИнтеграцияСтатусовТРОСПорталом.epf`.
2. Replace its object module with `ИнтеграцияСтатусовТРОСПорталом_МодульОбъекта_v2.txt`.
3. New functions are `ПолучитьФактическиеДокументы1С`, `ПолучитьИтоговуюСтадиюПортала`, and `СформироватьExecutionDocumentsJSON`; the source also updates state building, callback payload/response parsing, and row processing.
4. Do not change the form module: existing counters are sufficient.
5. Do not add EPF metadata fields or form controls.
6. Compile/syntax-check in Configurator.
7. Manually test INSTALL without rows, shipped/unconfirmed, confirmed/completed, RETURN with two rows, snapshot removal, and an exact repeat.

## Safe deployment order

1. Apply migration 031.
2. Deploy the backward-compatible Portal backend.
3. Deploy the Portal frontend.
4. Verify the old status client still works without `execution_documents`.
5. Transfer and compile the v2 object-module source in the status EPF.
6. Run manual sync and inspect Portal details.
7. Enable scheduled execution.

## Changed files

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
- `TRO-EXECUTION-SYNC-IMPLEMENTATION-REPORT.md`
- `TRO-EXECUTION-SYNC-CODEX-RESULT.md`

## Git status and limitations

No commit was created. Existing unrelated working-tree changes were preserved. Migration 031 is applied only to the local DEV database. The 1C source cannot be compiled here and must be validated against the target configuration; the supplied metadata field names are used exactly. Binary EPF and `ИнтеграцияТРОСПорталом` creation processing are unchanged. No automated browser runner was available, but lint/build and helper tests pass.

FULL CODEX RESPONSE SAVED TO:
TRO-EXECUTION-SYNC-CODEX-RESULT.md

IMPLEMENTATION REPORT SAVED TO:
TRO-EXECUTION-SYNC-IMPLEMENTATION-REPORT.md
