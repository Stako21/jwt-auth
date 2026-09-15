# Інтеграція заявок ТРО з 1С

Перший етап інтеграції реалізує API порталу. Код зовнішньої обробки 1С до репозиторію не входить.

## Авторизація

API використовує наявний JWT Bearer flow.

1. Створіть окремого активного користувача порталу для інтеграції.
2. Додайте його логін до `ONE_C_INTEGRATION_LOGINS` (кілька логінів розділяються комами).
3. Виконайте `POST /api/auth/sign-in` і передавайте access token у заголовку:

```http
Authorization: Bearer <access-token>
```

Якщо `ONE_C_INTEGRATION_LOGINS` порожній, `/api/1c/*` закритий для всіх. Інтеграційні користувачі не можуть використовувати звичайні захищені API порталу. Пароль у конфігурації або документації не зберігається.

## Модель станів

`documents.status` і `tro_document_details.one_c_stage` — незалежні workflow.

```text
Портал: NEW → NOT_COMPLETED → PLANNED → COMPLETED
1С:     NEW → IN_PROGRESS → COMPLETED | CANCELLED
```

Оновлення `one_c_stage` ніколи автоматично не встановлює `documents.status = COMPLETED`.

Типи заявок:

```text
INSTALL → ЗаказНаУстановкуТРО
RETURN  → ЗаявкаНаВозвратТРО
```

## Формат відповідей

Успіх:

```json
{ "ok": true, "data": {} }
```

Помилка:

```json
{
  "ok": false,
  "error": { "code": "DOCUMENT_ALREADY_LINKED", "message": "..." }
}
```

## Endpoints

### `GET /api/1c/tro-requests`

Повертає тільки підписані заявки `TRO` зі статусом `NOT_COMPLETED`.

Query: `movement_type=INSTALL|RETURN`, `branch_id`, `limit=1..500`.

Кожна заявка містить технічний об'єкт `branch` для контролю доступу та фільтрації, а також окремий об'єкт `city` з фактичним ID і назвою з довідника `cities`. Місто визначається через `documents.city` у межах `documents.branch_id`, а не з назви філії.

### `POST /api/1c/tro-requests/:id/created`

```json
{
  "portal_document_number": "ТРО-ЧК-000002",
  "document_1c_guid": "11111111-1111-4111-8111-111111111111",
  "document_1c_number": "СГ0000798",
  "document_1c_date": "2026-09-08T08:49:52Z",
  "responsible_guid": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  "responsible_name": "Администратор",
  "sales_agent_guid": "22222222-2222-4222-8222-222222222222",
  "sales_agent_name": "Гудим Наталія Володимирівна",
  "source_system": "UP",
  "warehouse_guid": "33333333-3333-4333-8333-333333333333"
}
```

Обов'язкові `responsible_guid` і `responsible_name` описують реквізит `Ответственный` документа 1С. GUID має стандартний формат GUID, ім'я — непорожній рядок до 150 символів. Вони зберігаються як `executor_guid` і snapshot `executor_name`; відповідальний не вирішується через довідник торгових агентів.

`sales_agent_guid` і `sales_agent_name` описують окремий реквізит `ТорговыйАгент`. GUID, як і раніше, вирішується за `branch_id + sales_agents.current_agent_guid`; результат і snapshots зберігаються в `one_c_sales_agent_id`, `one_c_sales_agent_guid`, `one_c_sales_agent_name`.

Перший успішний виклик заповнює номер УП та обидва набори metadata, зберігає зв'язок з документом 1С, встановлює `one_c_stage=NEW` і переводить `NOT_COMPLETED → PLANNED`. `documents.author_user_id` і `tro_document_details.ta_user_id` не змінюються.

Повторний запит для того самого портального документа, GUID і незмінних реквізитів документа 1С залишається ідемпотентним щодо зв'язку та workflow, але оновлює `executor_*` і `one_c_sales_agent_*`. Він не змінює статус, не створює повторний `ONE_C_CREATED` і не повертає workflow назад. Інший GUID для вже пов'язаної заявки або GUID, пов'язаний з іншою заявкою, повертає `409`.

Успішна відповідь першого або повторного виклику:

```json
{
  "ok": true,
  "data": {
    "idempotent": false,
    "portal_status": "PLANNED",
    "one_c_stage": "NEW",
    "warning": null
  }
}
```

Для повторного metadata-sync `idempotent` дорівнює `true`, а `portal_status` і `one_c_stage` повертаються без зміни.

### `POST /api/1c/tro-requests/:id/rejected`

```json
{
  "reason": "Некоректні дані торгової точки",
  "reason_code": "TRADE_POINT_ERROR",
  "responsible_guid": "44444444-4444-4444-8444-444444444444",
  "responsible_name": "Администратор"
}
```

`reason`, `responsible_guid` і `responsible_name` обов'язкові; `reason_code` залишається необов'язковим. `responsible_guid` має бути UUID/GUID, `responsible_name` — непорожній після `trim` рядок до 150 символів.

Доступний для непов'язаної заявки `NOT_COMPLETED`. Встановлює `REJECTED`, але не видаляє документ. Snapshot відповідального зберігається окремо у `rejected_by_1c_guid` / `rejected_by_1c_name`; він не записується в `executor_guid` / `executor_name`. `documents.author_user_id` і `tro_document_details.ta_user_id` не змінюються.

Перша успішна відповідь:

```json
{
  "ok": true,
  "data": {
    "idempotent": false,
    "portal_status": "REJECTED"
  }
}
```

Повторний запит ідемпотентний тільки за повного збігу нормалізованих `reason`, `reason_code`, `responsible_guid` і `responsible_name`; він повертає той самий response з `idempotent: true` без нового запису історії. Якщо хоча б одне значення відрізняється, endpoint повертає `409 DOCUMENT_ALREADY_REJECTED` і не переписує перший факт відхилення. Відсутні або некоректні обов'язкові поля повертають контрольований `422`.

Подія `ONE_C_REJECTED` зберігає технічний `document_history.user_id` інтеграційного облікового запису, але її коментар містить snapshot реального відповідального:

```text
Заявку відхилено в УП.
Відповідальний: Администратор.
Причина: Некоректні дані торгової точки.
Код причини: TRADE_POINT_ERROR.
```

### `GET /api/1c/tro-requests/status-pending`

Повертає лише пов'язані документи порталу зі станом 1С `NULL`, `NEW` або `IN_PROGRESS`. Query: `branch_id`, `limit=1..500`.

### `POST /api/1c/tro-requests/:id/stage`

```json
{
  "document_1c_guid": "11111111-1111-4111-8111-111111111111",
  "source_system": "UP",
  "stage": "IN_PROGRESS",
  "changed_at": "2026-09-06T14:31:00+03:00"
}
```

Допустимі `NEW`, `IN_PROGRESS`, `COMPLETED`, `CANCELLED`. Повтор незміненого стану повертає `200` без додаткової історії. Застаріле `changed_at` повертає `409 STALE_STAGE_UPDATE`.

Основні коди: `400` некоректний запит, `401` JWT відсутній/недійсний, `403` обліковий запис або філія недоступні, `404` документ відсутній, `409` конфлікт зв'язку/стану, `422` помилка полів, `429` ліміт запитів, `500` внутрішня помилка без stack trace.

## Cursor pagination

`GET /api/1c/tro-requests` і `GET /api/1c/tro-requests/status-pending` використовують однаковий контракт cursor pagination.

Query parameters:

- `limit` — необов'язковий, за замовчуванням `100`, діапазон `1..500`;
- `cursor` — необов'язковий opaque cursor із попередньої відповіді;
- `branch_id` залишається доступним для обох endpoint;
- `movement_type=INSTALL|RETURN` залишається доступним для `/tro-requests`.

Перша сторінка запитується без `cursor`. Наступну сторінку потрібно запитувати з незміненими фільтрами та значенням `pagination.next_cursor`:

```http
GET /api/1c/tro-requests?movement_type=INSTALL&branch_id=1&limit=100
Authorization: Bearer <access-token>
```

```json
{
  "ok": true,
  "data": [
    {
      "portal_document_id": 125,
      "portal_document_number": "ТРО-ZP-000125",
      "portal_created_at": "2026-09-06T08:15:00.000Z",
      "movement_type": "INSTALL",
      "branch": { "id": 1, "name": "Філія" },
      "city": { "id": 3, "name": "Черкаси" },
      "trade_point": { "guid": "...", "name": "Торгова точка", "address": "Адреса" },
      "contractor": { "guid": "...", "name": "Контрагент" },
      "request_sales_agent": { "guid": "...", "name": "Торговий агент" },
      "items": [
        { "product_guid": "...", "product_name": "ТРО", "quantity": 1 }
      ],
      "comment": null,
      "status": "NOT_COMPLETED",
      "updated_at": "2026-09-06T08:20:00.000Z"
    }
  ],
  "pagination": {
    "next_cursor": "eyJ2IjoxLC4uLn0.signature",
    "has_more": true
  }
}
```

```http
GET /api/1c/tro-requests?movement_type=INSTALL&branch_id=1&limit=100&cursor=<next_cursor>
Authorization: Bearer <access-token>
```

Остання сторінка:

```json
{
  "ok": true,
  "data": [],
  "pagination": {
    "next_cursor": null,
    "has_more": false
  }
}
```

`data` завжди є масивом. Старий запит без `cursor` повертає першу сторінку і залишається сумісним за складом DTO; поле `pagination` є додатковим.

Порядок стабільний: `documents.created_at ASC, documents.id ASC`. Cursor підписаний, прив'язаний до endpoint, доступних філій і фільтрів та не повинен розбиратися або змінюватися клієнтом. Перша сторінка фіксує верхню межу обходу, тому документи, створені після початку обходу, будуть отримані в наступному повному циклі синхронізації.

Некоректний, змінений або використаний з іншими фільтрами cursor:

```json
{
  "ok": false,
  "error": {
    "code": "INVALID_CURSOR",
    "message": "Некоректний cursor"
  }
}
```

HTTP status: `422 Unprocessable Entity`.
