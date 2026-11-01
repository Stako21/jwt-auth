# Реєстр піктограм інструкції ТРО

Portal підключає Font Awesome Free 6.2.1 у `client/index.html`. Нижче перелічено тільки піктограми, фактично використані поточними компонентами ТРО.

| Призначення | UI location | Клас Font Awesome | Джерело в коді | Asset для DOCX | Примітка |
|---|---|---|---|---|---|
| Створити ТРО | Заголовок сторінки ТРО | `fa-solid fa-shop` | `DocumentsPage.jsx` | `documentation/tro-guide-assets/icon-create.svg` | Кнопка `ТРО`. |
| Підписати | Дії рядка | `fa-solid fa-signature` | `DocumentRowAction.jsx` | `documentation/tro-guide-assets/icon-approve.svg` | Перехід до `Не виконано`. |
| На доопрацювання | Дії рядка | `fa-solid fa-pen` | `DocumentRowAction.jsx` | `documentation/tro-guide-assets/icon-revision.svg` | Дія СВ/НТО. |
| Відхилити / закрити | Дії рядка, модальні вікна | `fa-solid fa-xmark` | `DocumentRowAction.jsx`, `CreateTroDocumentModal.jsx` | `documentation/tro-guide-assets/icon-reject.svg` | Значення уточнюється tooltip/контекстом. |
| Історія | Дії рядка | `fa-solid fa-clock-rotate-left` | `DocumentRowAction.jsx` | `documentation/tro-guide-assets/icon-history.svg` | Відкриває історію документа. |
| Додати позицію | Форма ТРО | `fa-solid fa-plus` | `CreateTroDocumentModal.jsx` | `documentation/tro-guide-assets/icon-add.svg` | Кнопка `Додати позицію`. |
| Редагувати позицію | Таблиця позицій ТРО | `fa-solid fa-pencil` | `CreateTroDocumentModal.jsx` | `documentation/tro-guide-assets/icon-edit.svg` | Лише у редагованому статусі. |
| Копіювати назву | Таблиця позицій ТРО | `fa-regular fa-copy` | `CreateTroDocumentModal.jsx` | `documentation/tro-guide-assets/icon-copy.svg` | Доступно у відкритому існуючому документі. |
| Фільтри | Панель фільтрів | `fa-solid fa-filter` | `DocumentsPage.jsx` | `documentation/tro-guide-assets/icon-filter.svg` | На телефоні відкриває/ховає фільтри. |
| Оновлення стану УП | Мобільна картка | `fa-solid fa-arrows-rotate` | `DocumentsTable.jsx` | `documentation/tro-guide-assets/icon-sync.svg` | Біля `Стан в УП`. |
| Друк реєстру | Панель вибраних | `fa-solid fa-print` | `DocumentsPage.jsx` | `documentation/tro-guide-assets/icon-print.svg` | Друкуються лише вибрані документи. |
| XLSX | Панель вибраних | `fa-regular fa-file-excel` | `DocumentsPage.jsx` | `documentation/tro-guide-assets/icon-xlsx.svg` | Зберігаються лише вибрані документи. |

Assets повинні бути взяті з офіційних SVG Font Awesome тієї ж лінійки, а не намальовані вручну.
