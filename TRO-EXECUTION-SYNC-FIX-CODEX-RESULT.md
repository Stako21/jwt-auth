# TRO execution synchronization correction — completed

The targeted correction is complete. Portal and 1C stages are now fully independent: receiving `one_c_stage=CANCELLED` no longer changes `documents.status`, no longer creates a false PLANNED → REJECTED business-history transition, and no longer sends a Portal rejection notification.

## Exact old and new behavior

Previously, `createTroIntegrationService().stage()` detected `CANCELLED`, called `savePortalStatus(..., "REJECTED")`, wrote the Portal transition into `ONE_C_STAGE` history, returned `portal_status="REJECTED"`, and emitted a rejection notification.

Now a request starting as:

```text
documents.status = PLANNED
one_c_stage = IN_PROGRESS
```

and receiving `stage=CANCELLED` finishes as:

```text
documents.status = PLANNED
one_c_stage = CANCELLED
```

The stage history remains, but its business `old_status/new_status` fields are null. The ordinary dedicated `/rejected` workflow was not changed.

`CANCELLED` with `execution_documents` remains one atomic transaction. The snapshot is saved, the stage becomes CANCELLED, Portal status stays unchanged, and an exact repeat is idempotent.

## Migration execution and safety

The target was verified as the local development database `auth` on MySQL host `Stako_PC` via `DB_HOST=localhost`. Migration 031 had not been applied.

Executed:

```powershell
cd D:\projects\jwt-auth\api
npm run migrate
```

The standard runner applied the previously pending migration 030 and then migration 031. Migration 031 is registered in `schema_migrations`.

Before and after values are identical:

| Check | Before | After |
|---|---:|---:|
| TRO documents | 95 | 95 |
| TRO detail rows | 95 | 95 |
| COMPLETED Portal | 2 | 2 |
| NEW Portal | 3 | 3 |
| NOT_COMPLETED Portal | 17 | 17 |
| PLANNED Portal | 53 | 53 |
| REJECTED Portal | 20 | 20 |
| CANCELLED 1C stage | 4 | 4 |
| COMPLETED 1C stage | 2 | 2 |
| NEW 1C stage | 50 | 50 |
| NULL 1C stage | 39 | 39 |

The new execution table contains zero rows, which is expected before the first updated 1C synchronization.

Schema verification confirmed:

- `tro_1c_execution_documents` exists with all expected fields;
- `tro_document_details.one_c_observed_at` exists and is nullable;
- unique `(source_system, document_1c_guid)` exists;
- owner FK references `documents.id`;
- delete rule is `CASCADE`.

No production database was touched.

## Tests and checks

- Backend integration tests after migration: 43/43 passed.
- Backend syntax checks: passed.
- Frontend lint: passed with zero warnings.
- Frontend production build: passed; only existing Sass legacy-API and chunk-size warnings remain.
- Regression verifies CANCELLED only changes `one_c_stage`, preserves Portal status, stores multiple execution rows atomically, creates no false business transition, sends no rejection notification, and repeats idempotently.
- Existing coverage still verifies all aggregate stages, snapshot insert/update/removal, multiple documents, unchanged-stage updates, stale rejection, cross-document GUID conflicts, atomic COMPLETED, access isolation, and legacy `/stage` compatibility.

## Cleaned 1C source

In `ИнтеграцияСтатусовТРОСПорталом_МодульОбъекта_v2.txt` removed:

- `Сообщить("Технические параметры инициализированы!")`;
- `Сообщить("Настройки интеграции НЕ найдены.")`;
- `Сообщить("Настройки интеграции найдены.")`.

Kept only the useful `Сообщить("ОК")` produced by the explicit save-settings command. Registration logging, exceptions, INSTALL/RETURN lookup, deletion exclusion, aggregate logic, JWT, pagination, strict GUID lookup, and full snapshot behavior are unchanged.

Static balance remains 19/19 functions, 10/10 procedures, and 6/6 try blocks.

## Manual EPF steps

1. Open `ИнтеграцияСтатусовТРОСПорталом.epf`.
2. Replace the object module with the complete contents of `ИнтеграцияСтатусовТРОСПорталом_МодульОбъекта_v2.txt`.
3. Run syntax validation in Configurator.
4. Open Portal.
5. Run manual synchronization.
6. Verify INSTALL.
7. Verify RETURN with multiple execution documents.
8. Verify `Не підтверджено`.
9. Verify `Відвантажено зі складу`.
10. Verify `Підтверджено`.
11. Verify NEW → IN_PROGRESS → COMPLETED.
12. Repeat synchronization without changes and verify idempotency.

Do not enable the scheduled job until those manual tests pass.

## Files and repository state

Changed for the correction: backend stage service/repository/tests, v2 1C source, protocol/current-state documentation, prior execution-sync reports, and the two new fix-result reports. Migration 031 was applied without a structural rewrite. Binary EPF was not edited. Existing unrelated dirty-worktree files were preserved. No commit was created.

FULL CODEX RESPONSE SAVED TO:
TRO-EXECUTION-SYNC-FIX-CODEX-RESULT.md

FIX REPORT SAVED TO:
TRO-EXECUTION-SYNC-FIX-REPORT.md

PORTAL READY FOR 1C MANUAL TESTS:
YES
