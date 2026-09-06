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

### `POST /api/1c/tro-requests/:id/created`

```json
{
  "portal_document_number": "ТРО-ZP-000125",
  "document_1c_guid": "11111111-1111-4111-8111-111111111111",
  "document_1c_number": "РП-005843",
  "document_1c_date": "2026-09-06T12:15:35+03:00",
  "sales_agent_guid": "22222222-2222-4222-8222-222222222222",
  "sales_agent_name": "Іваненко Петро Іванович",
  "source_system": "UP",
  "warehouse_guid": null
}
```

Операція заповнює номер УП та snapshot виконавця, зберігає GUID, встановлює `one_c_stage=NEW` і переводить `NOT_COMPLETED → PLANNED`. Автор і `ta_user_id` не змінюються.

Той самий еквівалентний запит ідемпотентний. Інший GUID для вже пов'язаної заявки або GUID, пов'язаний з іншою заявкою, повертає `409`.

### `POST /api/1c/tro-requests/:id/rejected`

```json
{ "reason": "Некоректні дані", "reason_code": "DATA" }
```

Доступний для непов'язаної заявки `NOT_COMPLETED`. Встановлює `REJECTED`, але не видаляє документ. Повтор з тією самою причиною ідемпотентний.

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
