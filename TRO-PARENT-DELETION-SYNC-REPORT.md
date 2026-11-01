# 1. Problem

Дата: 16.10.2026. Внести узкую правку в существующий текстовый модуль
`ИнтеграцияСтатусовТРОСПорталом_МодульОбъекта_v2.txt`:
пометка удаления родителя INSTALL/RETURN должна давать `one_c_stage = CANCELLED`
независимо от стадии родителя и наличия документов исполнения.

# 2. Current behavior

До правки оба запроса родителей читали ссылку, стадию и идентификатор Portal,
но не читали `ПометкаУдаления`. Агрегатная функция учитывала стадию `Отменен`,
но не пометку удаления. Поэтому помеченный родитель мог продолжать давать
`NEW`, `IN_PROGRESS` или `COMPLETED`.

Теперь пометка удаления имеет наивысший приоритет. Portal сохраняет существующую
независимость `one_c_stage` и `documents.status`; в этой задаче код Portal не менялся.

# 3. Changed INSTALL query

В `ПолучитьСостояниеДокумента1С()`, строка 517, добавлено поле:

```bsl
ВЫБРАТЬ ПЕРВЫЕ 1
    Заказ.Ссылка КАК Ссылка,
    Заказ.СтадияДокументаТРО КАК СтадияДокументаТРО,
    Заказ.ПометкаУдаления КАК ПометкаУдаления,
    Заказ.НомерЭлектронногоДокумента КАК ИдентификаторПортала
ИЗ
    Документ.ЗаказНаУстановкуТРО КАК Заказ
ГДЕ
    Заказ.Ссылка = &СсылкаДокумента
```

Поиск остаётся строго по GUID-ссылке. Фильтра `НЕ Заказ.ПометкаУдаления` нет:
помеченный родитель должен быть найден для отправки отменённой стадии.

# 4. Changed RETURN query

В той же функции, строка 539, добавлено поле:

```bsl
ВЫБРАТЬ ПЕРВЫЕ 1
    Заявка.Ссылка КАК Ссылка,
    Заявка.СтадияДокументаТРО КАК СтадияДокументаТРО,
    Заявка.ПометкаУдаления КАК ПометкаУдаления,
    Заявка.Комментарий КАК ИдентификаторПортала
ИЗ
    Документ.ЗаявкаНаВозвратТРО КАК Заявка
ГДЕ
    Заявка.Ссылка = &СсылкаДокумента
```

Фильтра `НЕ Заявка.ПометкаУдаления` нет. Поиск по GUID и существующий комментарий
для проверки принадлежности сохранены.

# 5. Aggregate-stage change

В строках 420–428 единственная используемая агрегатная функция расширена:

```bsl
Функция ПолучитьИтоговуюСтадиюПортала(
    СтадияРодителя,
    ФактическиеДокументы,
    РодительПомеченНаУдаление = Ложь) Экспорт

    Если РодительПомеченНаУдаление Тогда
        Возврат "CANCELLED";
    КонецЕсли;
```

Существующая логика после этой проверки сохранена полностью:
`Отменен -> CANCELLED`; без активных исполнений `Новый -> NEW`,
другие неотменённые стадии дают `IN_PROGRESS`.
`COMPLETED` требует `Завершен`, хотя бы один активный документ исполнения
и `Подтвержден = Истина` у каждого. Отгрузка не даёт `COMPLETED`.

Вызов в строках 636–639 передаёт флаг из выборки:

```bsl
СтадияPortal = ПолучитьИтоговуюСтадиюПортала(
    Выборка.СтадияДокументаТРО,
    ФактическиеДокументы,
    Выборка.ПометкаУдаления);
```

Значение по умолчанию `Ложь` сохраняет совместимость вызова с двумя аргументами.
Дублирующего вычисления отмены и раннего выхода по удалению в функции поиска нет.
Существующая `ПолучитьСтадиюПортала(Стадия1С)` не изменялась.

# 6. Identity validation preserved

Блок проверки принадлежности побайтно совпадает с исходным после нормализации
переводов строк; фактически CRLF также сохранён. Порядок остаётся следующим:

1. Создать типизированную ссылку родителя строго из GUID.
2. Выполнить запрос и проверить существование.
3. Выполнить существующий INSTALL/RETURN cross-check.
4. Получить активные документы исполнения.
5. Рассчитать агрегатную стадию с учётом удаления.
6. Отправить стадию и полный snapshot существующим вызовом.

INSTALL: как и до задачи, непустой `НомерЭлектронногоДокумента` сравнивается
с `СокрЛП(НомерПортала)`; несовпадение вызывает исключение. Существующее
поведение пустого номера не менялось.

RETURN: начало комментария обязано совпадать с
`PORTAL-TRO:<НомерPortal>;`; несовпадение вызывает исключение.

Пометка удаления не обходит эти проверки. Чужой/неверно связанный родитель
с несовпадающей идентичностью не отправляется как `CANCELLED`.

# 7. Execution-document filtering preserved

`ПолучитьФактическиеДокументы1С()` полностью сохранена:

```bsl
// INSTALL
Выполнение.Заказ = &ДокументОснование
И НЕ Выполнение.ПометкаУдаления

// RETURN
Выполнение.ДокументОснование = &ДокументОснование
И НЕ Выполнение.ПометкаУдаления
```

Помеченные исполнения исключены в обоих запросах. Активные исполнения
собираются до расчёта стадии и остаются в snapshot даже при удалении родителя.
Агрегатная функция не изменяет и не очищает массив.
Формирование JSON, поля confirmed/shipped_from_warehouse и отправка полного
snapshot не изменялись.

# 8. Parent-not-found behavior preserved

Если запрос не вернул строку, по-прежнему возвращается `Найден = Ложь`.
Обработчик очереди выбрасывает прежнее исключение
`Документ 1С по GUID не найден.` до отправки стадии (строка 848).

Физическое отсутствие остаётся ошибкой, не превращается в `CANCELLED`.

# 9. Static scenario audit

Ниже ручной проход по веткам фактического исходника. PASS означает соответствие
кода ожидаемому сценарию, а не выполненный запуск в 1С.

| CASE | Исходные условия | Результат по коду | Snapshot / основание | Статический аудит |
| --- | --- | --- | --- | --- |
| 1 | INSTALL, родитель помечен, исполнений нет | CANCELLED | INSTALL выбирает флаг; первая ветка агрегатора; [] отправляется | PASS |
| 2 | RETURN, родитель помечен, исполнений нет | CANCELLED | RETURN выбирает флаг; та же первая ветка; [] отправляется | PASS |
| 3 | Родитель помечен, есть активное исполнение | CANCELLED | Активный документ получен до агрегатора, массив не очищается | PASS |
| 4 | Родитель активен, исполнение помечено | Зависит от родителя и оставшихся активных исполнений | Помеченное исполнение исключено; при [] Новый -> NEW, Выполняется -> IN_PROGRESS | PASS |
| 5 | Родитель Отменен, пометка Ложь | CANCELLED | Существующая проверка стадии после новой проверки | PASS |
| 6 | Родитель Завершен и помечен, все исполнения подтверждены | CANCELLED | Проверка пометки срабатывает раньше COMPLETED; активный snapshot сохраняется | PASS |
| 7 | Родитель физически отсутствует по GUID | ERROR | Найден = Ложь; исключение до отправки; CANCELLED не вычисляется | PASS |
| 8 | Родитель Завершен, пометка Ложь, есть исполнения и все подтверждены | COMPLETED | Существующая проверка завершения полностью сохранена | PASS |

Дополнительно: при пометке родителя и всех исполнений получается
`stage = CANCELLED, execution_documents = []`.
При корректном принятии Portal должен сохранить прежний `documents.status`
(например, `PLANNED`); это ожидаемое поведение существующего Portal,
в рамках этой задачи через HTTP не проверялось.

# 10. Static syntax/balance check

PASS: выполнена проверка вложенности блоков и скобок после исключения строковых
литералов и комментариев, а не только подсчёт ключевых слов.

| Конструкция | Начало | Конец | Результат |
| --- | ---: | ---: | --- |
| Функция / КонецФункции | 19 | 19 | PASS |
| Процедура / КонецПроцедуры | 10 | 10 | PASS |
| Попытка / КонецПопытки | 6 | 6 | PASS |
| Если / КонецЕсли | 70 | 70 | PASS |
| Цикл / КонецЦикла | 5 | 5 | PASS |
| Скобки | 246 | 246 | PASS |

Статический поиск подтвердил оба SELECT-поля, передачу
`Выборка.ПометкаУдаления`, единственный вызов и единственное определение
агрегатной функции, INSTALL-связь `.Заказ`, RETURN-связь
`.ДокументОснование` и оба `И НЕ Выполнение.ПометкаУдаления`.

Сравнение с сохранённым состоянием до задачи подтвердило ровно четыре
предусмотренные правки в двух функциях; остальные 27 функций/процедур не изменены.
Сохранены UTF-8 и CRLF (1040 переводов строк CRLF из 1040).
Проверка whitespace/diff и контроль сохранности сторонних файлов отражены ниже.

Это статическая проверка, не компиляция в Конфигураторе и не runtime-тест 1С.
1С/BSL-компилятор в доступных командах не обнаружен. Файл предназначен для
ручной вставки в существующую EPF с последующей проверкой в целевой 1С.

# 11. Changed files

Изменения только этой задачи:

- `ИнтеграцияСтатусовТРОСПорталом_МодульОбъекта_v2.txt` — четыре узкие правки.
- `AGENTS.md` — одна инструкция о новой обработке пометки удаления.
- `MEMORY.md` — краткий checkpoint по требованиям репозитория.
- `TRO-PARENT-DELETION-SYNC-REPORT.md` — данный отчёт.
- `TRO-PARENT-DELETION-SYNC-CODEX-RESULT.md` — полный результат.

Текстовый исходник v2 уже был untracked до начала задачи; он изменён на месте,
v3/v4 не создавались. AGENTS.md и MEMORY.md уже имели пользовательские изменения;
добавлены только указанные сведения.

Portal backend/frontend, API/JSON, auth/JWT, changed_at, pagination, настройки,
регламентное задание, database, migrations и binary EPF не менялись этой задачей.
Миграции и проверки с обращением к базе не запускались. Commit не создавался;
reset/restore/checkout/clean не выполнялись.

# 12. Git status

Рабочее дерево до задачи уже содержало изменения и untracked-файлы.
Они не являются результатом этой задачи.

До изменения (`git status --short`):

```text
 M AGENTS.md
 M MEMORY.md
 M api/repositories/TroIntegration.js
 M api/services/DocumentService.js
 M api/services/TroDocumentService.js
 M api/services/TroIntegrationService.js
 M api/tests/troIntegration.test.js
 M client/dist/Sorce/balanceDP.xlsx
 M client/dist/Sorce/balanceKR.xlsx
 D client/dist/Sorce/balanceML.xlsx
 M client/dist/Sorce/balanceZP.xlsx
 M client/public/Sorce/balanceDP.xlsx
 M client/public/Sorce/balanceKR.xlsx
 D client/public/Sorce/balanceML.xlsx
 M client/public/Sorce/balanceZP.xlsx
 D client/public/Sorce/report_romashka.json
 M client/src/components/Documents/DocumentsTable.jsx
 M client/src/components/Documents/DocumentsTable.module.scss
 M client/src/components/Reports/ReportDebet.jsx
 M client/src/components/Reports/ReportDebet.module.scss
 M client/src/modals/CreateTroDocumentModal.jsx
 M client/src/modals/CreateTroDocumentModal.module.scss
 M client/src/pages/DocumentsPage.jsx
 M client/src/pages/DocumentsPage.module.scss
 M client/src/utils/documentFilters.js
 M docs/1c-tro-integration.md
 M documentation/deferred-work-plan.md
?? TRO-EXECUTION-SYNC-CODEX-RESULT.md
?? TRO-EXECUTION-SYNC-FIX-CODEX-RESULT.md
?? TRO-EXECUTION-SYNC-FIX-REPORT.md
?? TRO-EXECUTION-SYNC-IMPLEMENTATION-REPORT.md
?? TRO-USER-GUIDE-CODEX-RESULT.md
?? TRO-USER-GUIDE-ICONS.md
?? TRO-USER-GUIDE-SOURCE-AUDIT.md
?? USER-GUIDE-TRO.docx
?? USER-GUIDE-TRO.pdf
?? api/migrations/031_tro_1c_execution_documents.js
?? api/tests/documentFilters.test.js
?? client/src/components/Documents/executionDocumentStatus.js
?? documentation/JSON_IMPORT_STRUCTURES.md
?? documentation/old-setings.txt
?? documentation/old-setings2.txt
?? documentation/tro-guide-assets/
?? documentation/update-pm2-production.md
?? ИнтеграцияСтатусовТРОСПорталом_МодульОбъекта_v2.txt
```

После изменения (`git status --short`):

```text
 M AGENTS.md
 M MEMORY.md
 M api/repositories/TroIntegration.js
 M api/services/DocumentService.js
 M api/services/TroDocumentService.js
 M api/services/TroIntegrationService.js
 M api/tests/troIntegration.test.js
 M client/dist/Sorce/balanceDP.xlsx
 M client/dist/Sorce/balanceKR.xlsx
 D client/dist/Sorce/balanceML.xlsx
 M client/dist/Sorce/balanceZP.xlsx
 M client/public/Sorce/balanceDP.xlsx
 M client/public/Sorce/balanceKR.xlsx
 D client/public/Sorce/balanceML.xlsx
 M client/public/Sorce/balanceZP.xlsx
 D client/public/Sorce/report_romashka.json
 M client/src/components/Documents/DocumentsTable.jsx
 M client/src/components/Documents/DocumentsTable.module.scss
 M client/src/components/Reports/ReportDebet.jsx
 M client/src/components/Reports/ReportDebet.module.scss
 M client/src/modals/CreateTroDocumentModal.jsx
 M client/src/modals/CreateTroDocumentModal.module.scss
 M client/src/pages/DocumentsPage.jsx
 M client/src/pages/DocumentsPage.module.scss
 M client/src/utils/documentFilters.js
 M docs/1c-tro-integration.md
 M documentation/deferred-work-plan.md
?? TRO-EXECUTION-SYNC-CODEX-RESULT.md
?? TRO-EXECUTION-SYNC-FIX-CODEX-RESULT.md
?? TRO-EXECUTION-SYNC-FIX-REPORT.md
?? TRO-EXECUTION-SYNC-IMPLEMENTATION-REPORT.md
?? TRO-PARENT-DELETION-SYNC-CODEX-RESULT.md
?? TRO-PARENT-DELETION-SYNC-REPORT.md
?? TRO-USER-GUIDE-CODEX-RESULT.md
?? TRO-USER-GUIDE-ICONS.md
?? TRO-USER-GUIDE-SOURCE-AUDIT.md
?? USER-GUIDE-TRO.docx
?? USER-GUIDE-TRO.pdf
?? api/migrations/031_tro_1c_execution_documents.js
?? api/tests/documentFilters.test.js
?? client/src/components/Documents/executionDocumentStatus.js
?? documentation/JSON_IMPORT_STRUCTURES.md
?? documentation/old-setings.txt
?? documentation/old-setings2.txt
?? documentation/tro-guide-assets/
?? documentation/update-pm2-production.md
?? ИнтеграцияСтатусовТРОСПорталом_МодульОбъекта_v2.txt
```

Контроль SHA-256 по 364 существовавшим файлам: изменены только исходник v2,
AGENTS.md и MEMORY.md; остальные 361 файл совпадают с состоянием до задачи.
Новых файлов ровно два — отчёт и полный результат. Прежние строки Git status,
включая ранее удалённые файлы и untracked-артефакты, сохранены без изменений.

`git diff --check -- AGENTS.md MEMORY.md` — PASS.
Новые Markdown-файлы проверены на завершающие пробелы и корректность UTF-8.
Временные материалы проверки удалены.


PARENT DELETION SYNC READY FOR MANUAL 1C TEST:
YES
