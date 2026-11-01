# Обновление PM2 production до актуального `branches-config`

Инструкция предназначена для существующего production-сервера:

- проект: `/var/www/apps/jwt-auth`;
- backend: PM2 process `jwt-auth-api`;
- frontend: Nginx раздаёт `/var/www/apps/jwt-auth/client/dist`;
- API: `127.0.0.1:5000`;
- сайт: `https://balance.roshen.zp.ua`;
- база MySQL: `auth`;
- production-импорты: `/var/www/data/excel`;
- ветка: `branches-config`;
- release commit: точный SHA опубликованной `origin/branches-config`, однократно зафиксированный в `RELEASE_SHA` перед обновлением;
- состав полного релиза от 01.11.2026: ТРО/документы выполнения и предупреждения об отмене в УП, административные действия в карточке и групповые действия, фильтры документов, события уведомлений и доработки Debet;
- необходимые новые миграции: `031`, `032`, `033` (уже применённые runner пропускает);
- пользователь подтвердил 01.11.2026, что обработка `ИнтеграцияСтатусовТРОСПорталом` уже обновлена в 1С; её редактируемый исходник v2 включён в репозиторий.

Команды ниже не содержат production-паролей. Не вставляйте секреты в терминальные логи, Git или сообщения.

## Как выполнять инструкцию через SSH

Прямой доступ к терминалу сервера не нужен. Откройте PowerShell, Windows Terminal или другой терминал на своём компьютере и создайте одну интерактивную SSH-сессию:

```powershell
ssh -t stako@ROSHEN_SERVER
```

После появления приглашения вида:

```text
stako@server:~$
```

все последующие Linux-команды выполняются в этой SSH-сессии. Не закрывайте её до окончания smoke-test или rollback.

В инструкции явно отмечено:

- **НА ВАШЕМ ПК** — команда выполняется до подключения;
- **В SSH-СЕССИИ** — команда вводится после подключения на сервер.

Для `sudo`, `mysqldump -p` и `mysql -p` SSH передаст интерактивный запрос пароля. Пароль вводится вслепую — символы в терминале не отображаются, это нормально.

## 1. Зафиксировать релиз и подключиться

### НА ВАШЕМ ПК

Проверить опубликованную ветку:

```powershell
git ls-remote https://github.com/Stako21/jwt-auth.git refs/heads/branches-config
```

Зафиксируйте полученный SHA как выбранный релиз. После получения кода на сервере он будет проверен повторно; последующие изменения ветки не должны незаметно менять выбранный релиз.

Подключиться к серверу и запросить интерактивный TTY:

```powershell
ssh -t stako@ROSHEN_SERVER
```

### В SSH-СЕССИИ

Сразу после подключения задать переменные текущего релиза:

```bash
export APP_DIR="/var/www/apps/jwt-auth"
export BACKUP_DIR="/var/www/backups/jwt-auth/pm2-$(date +%F-%H%M%S)"
export RELEASE_SHA="$(git ls-remote https://github.com/Stako21/jwt-auth.git refs/heads/branches-config | awk '{print $1}')"
test "${#RELEASE_SHA}" -eq 40 || { echo "Cannot resolve release SHA"; exit 1; }
echo "Selected release: $RELEASE_SHA"
sudo mkdir -p "$BACKUP_DIR"
sudo chown stako:stako "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"
cd "$APP_DIR"
```

Эти переменные существуют только до закрытия текущей SSH-сессии. Поэтому желательно пройти обновление в одном подключении.

Проверить, что выбран правильный процесс и каталог:

```bash
pwd
pm2 describe jwt-auth-api
pm2 status
git remote -v
```

В `pm2 describe` ожидается script path:

```text
/var/www/apps/jwt-auth/api/server.js
```

## 2. Проверить состояние до обновления

### В SSH-СЕССИИ

```bash
cd "$APP_DIR"
git status --short --branch | tee "$BACKUP_DIR/git-status-before.txt"
git branch -vv | tee "$BACKUP_DIR/git-branches-before.txt"
git log --oneline -20 | tee "$BACKUP_DIR/git-log-before.txt"
git rev-parse HEAD | tee "$BACKUP_DIR/previous-sha.txt"
pm2 describe jwt-auth-api > "$BACKUP_DIR/pm2-before.txt"
```

Если `git status` показывает незнакомые изменения, остановиться. Не выполнять `git reset --hard` и не удалять файлы вслепую.

Если `tee` сообщает `Permission denied`, не запускайте `sudo git`: в pipeline `sudo` применяется только к `git`, но не к `tee`. Исправьте каталог backup и повторите команды:

```bash
sudo mkdir -p "$BACKUP_DIR"
sudo chown stako:stako "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"
test -w "$BACKUP_DIR" && echo "BACKUP_DIR writable" || echo "BACKUP_DIR is not writable"
```

Если изменены только `client/dist/Sorce/balance*.xlsx`, сначала сохранить их и проверить отдельный production-каталог импортов:

```bash
mkdir -p "$BACKUP_DIR/dist-Sorce"
cp -a client/dist/Sorce/balance*.xlsx "$BACKUP_DIR/dist-Sorce/"
git diff --binary -- client/dist/Sorce > "$BACKUP_DIR/client-dist-Sorce.patch"

IMPORT_DIR="$(grep '^IMPORT_DIR=' api/.env | cut -d= -f2-)"
echo "IMPORT_DIR=$IMPORT_DIR"
test -n "$IMPORT_DIR" && test -d "$IMPORT_DIR" \
  && echo "IMPORT_DIR exists" \
  || echo "IMPORT_DIR is missing or not configured"
```

Сравнить файлы, ничего не перезаписывая:

```bash
for src in client/dist/Sorce/balance*.xlsx; do
  name="$(basename "$src")"
  echo "=== $name ==="
  stat -c 'dist:   %y %s bytes' "$src"
  if [ -f "$IMPORT_DIR/$name" ]; then
    stat -c 'import: %y %s bytes' "$IMPORT_DIR/$name"
    sha256sum "$src" "$IMPORT_DIR/$name"
  else
    echo "IMPORT_DIR copy is missing"
  fi
done
```

Если файла нет в `IMPORT_DIR`, скопировать сохранённую production-версию:

```bash
for src in client/dist/Sorce/balance*.xlsx; do
  name="$(basename "$src")"
  if [ ! -f "$IMPORT_DIR/$name" ]; then
    cp -a "$src" "$IMPORT_DIR/$name"
    echo "Copied $name to IMPORT_DIR"
  fi
done
```

Если файл уже есть, но checksum отличается, не перезаписывать его автоматически. Сначала определить, какая версия актуальна. После подтверждения, что все рабочие XLSX сохранены в backup и `IMPORT_DIR`, tracked-копии можно вернуть к Git-версии:

```bash
git restore -- \
  client/dist/Sorce/balanceDP.xlsx \
  client/dist/Sorce/balanceKR.xlsx \
  client/dist/Sorce/balanceML.xlsx \
  client/dist/Sorce/balanceZP.xlsx

git status --short --branch
```

Production-файлы отчётов должны находиться в `/var/www/data/excel`, а не быть локальными изменениями в `client/public/Sorce` или `client/dist/Sorce`.

## 3. Сделать backup

### В SSH-СЕССИИ

### База данных

```bash
mysqldump -u stako -p \
  --single-transaction \
  --routines \
  --triggers \
  auth > "$BACKUP_DIR/auth.sql"
```

Проверить, что дамп не пустой:

```bash
test -s "$BACKUP_DIR/auth.sql" && echo "DB backup OK" || echo "DB backup FAILED"
```

При `DB backup FAILED` обновление не продолжать.

### Конфигурация, frontend и импорты

```bash
cp "$APP_DIR/api/.env" "$BACKUP_DIR/api.env"
tar -czf "$BACKUP_DIR/client-dist.tar.gz" -C "$APP_DIR/client" dist
tar -czf "$BACKUP_DIR/imports.tar.gz" -C /var/www/data excel
ls -lh "$BACKUP_DIR"
```

## 4. Проверить production `.env`

### В SSH-СЕССИИ

Не печатая секретные значения:

```bash
cd "$APP_DIR/api"
for key in PORT CLIENT_URL DB_HOST DB_PORT DB_NAME DB_USER DB_PASSWORD \
  ACCESS_TOKEN_SECRET REFRESH_TOKEN_SECRET BRANCH_SLUG IMPORT_DIR; do
  grep -q "^${key}=" .env && echo "OK ${key}" || echo "MISSING ${key}"
done
```

Обязательные значения для этого сервера:

```env
PORT=5000
CLIENT_URL=https://balance.roshen.zp.ua
DB_HOST=localhost
DB_PORT=3306
DB_NAME=auth
BRANCH_SLUG=default
IMPORT_DIR=/var/www/data/excel
```

Также должны быть реальные `DB_USER`, `DB_PASSWORD`, JWT, SMTP и Rocket.Chat secrets.

Для PDF нужен доступный Chromium. Проверить настроенный путь:

```bash
CHROME_PATH="$(grep '^PUPPETEER_EXECUTABLE_PATH=' .env | cut -d= -f2-)"
if [ -n "$CHROME_PATH" ]; then
  test -x "$CHROME_PATH" && echo "Chromium OK" || echo "Chromium path is invalid"
else
  echo "PUPPETEER_EXECUTABLE_PATH is not set; bundled Puppeteer Chromium will be used"
fi
```

Проверить каталог импортов:

```bash
test -d /var/www/data/excel && echo "IMPORT_DIR OK" || echo "IMPORT_DIR missing"
test -r /var/www/data/excel && echo "IMPORT_DIR readable" || echo "IMPORT_DIR not readable"
ls -lah /var/www/data/excel | head -30
```

Если Chromium или `IMPORT_DIR` недоступны пользователю `stako`, сначала исправить путь/права.

## 5. Получить release из GitHub

### В SSH-СЕССИИ

```bash
cd "$APP_DIR"
git fetch --prune origin
git show -s --format='%H %cI %s' origin/branches-config
```

Строго проверить SHA:

```bash
test "$(git rev-parse origin/branches-config)" = "$RELEASE_SHA" \
  && echo "Release SHA OK" \
  || { echo "Release SHA mismatch"; exit 1; }
```

Переключить рабочую копию:

```bash
git show-ref --verify --quiet refs/heads/branches-config \
  && git switch branches-config \
  || git switch --track -c branches-config origin/branches-config

git pull --ff-only origin branches-config
test "$(git rev-parse HEAD)" = "$RELEASE_SHA" \
  && echo "Checked out expected release" \
  || { echo "Wrong release checked out"; exit 1; }
```

Если переключение блокируют локальные изменения, остановиться и разобраться с ними. Не использовать автоматический `reset --hard`.

## 6. Установить зависимости и выполнить проверки до downtime

### В SSH-СЕССИИ

Backend:

```bash
cd "$APP_DIR/api"
CHROME_PATH="$(grep '^PUPPETEER_EXECUTABLE_PATH=' .env | cut -d= -f2-)"
if [ -n "$CHROME_PATH" ] && [ -x "$CHROME_PATH" ]; then
  PUPPETEER_SKIP_DOWNLOAD=true npm ci
else
  npm ci
fi
npm ls --depth=0
npm audit --omit=dev --audit-level=high
node --test tests/*.test.js
```

Frontend:

```bash
cd "$APP_DIR/client"
npm ci
npm run lint
```

Если какая-либо команда завершилась ошибкой, API не останавливать. Исправить причину или вернуться к предыдущему commit.

## 7. Остановить API и применить миграции

### В SSH-СЕССИИ

```bash
pm2 stop jwt-auth-api
pm2 status
```

Применить только миграции, зарегистрированные в репозитории:

```bash
cd "$APP_DIR/api"
npm run migrate
npm run bootstrap:doctor | tee "$BACKUP_DIR/bootstrap-doctor.txt"
```

В этом полном релизе должны быть зарегистрированы миграции `031_tro_1c_execution_documents.js`, `032_notification_event_settings.js` и `033_tro_status_sync_requests.js`. `031` создаёт таблицу документов выполнения УП и время наблюдения, `032` добавляет настройки групп/событий уведомлений, `033` добавляет ручную регистрацию на синхронизацию. Применять их нужно до запуска нового API. Не переносите отметки из локальной DEV-базы на production: runner проверяет `schema_migrations` именно целевой базы.

`032` сохраняет прежние группы и шесть событий для существующих получателей; новое уведомление о создании ТРО остаётся выключенным. `033` не ставит существующие документы в очередь автоматически.

В текущем `bootstrap:doctor` известны два ложных schema-warning:

- `scheduler_tasks` — скрипт ожидает `id`, хотя primary key таблицы — `task_key`;
- `users` — скрипт ожидает lowercase `name/password`, а legacy-таблица использует `NAME/PASSWORD`.

Эти две строки сами по себе не являются причиной отката. Любые другие `fail`, ошибка соединения с БД или pending migrations после `npm run migrate` требуют остановить обновление.

Если это первый переход данного сервера на `branches-config`, дополнительно свериться с полной инструкцией `update-existing-non-docker-server-to-branches-config.md`. Для уже работающего `branches-config` не запускать rollout/seed-команды без отдельной необходимости.

## 8. Собрать frontend

### В SSH-СЕССИИ

Пока API остановлен:

```bash
cd "$APP_DIR/client"
npm run build
test -s dist/index.html && echo "Frontend build OK" || { echo "Frontend build FAILED"; exit 1; }
```

Nginx уже раздаёт этот `dist`, отдельное копирование не требуется.

## 9. Запустить backend через PM2

### В SSH-СЕССИИ

```bash
cd "$APP_DIR/api"
pm2 restart jwt-auth-api --update-env
pm2 status
pm2 logs jwt-auth-api --lines 150 --nostream
```

После успешного запуска сохранить process list:

```bash
pm2 save
```

Если автозапуск PM2 ещё не настроен:

```bash
pm2 startup
```

Выполнить команду с `sudo`, которую напечатает PM2, затем снова выполнить `pm2 save`.

## 10. Проверить Nginx и health

### В SSH-СЕССИИ

```bash
sudo nginx -t
sudo systemctl reload nginx

curl --fail --show-error http://127.0.0.1:5000/api/health
curl --fail --show-error https://balance.roshen.zp.ua/api/health
curl -I https://balance.roshen.zp.ua
```

Проверить фактический release:

```bash
cd "$APP_DIR"
git rev-parse HEAD
git log -1 --oneline
git status --short --branch
```

Проверить совпадение с зафиксированным SHA:

```bash
test "$(git rev-parse HEAD)" = "$RELEASE_SHA" \
  && echo "Expected release deployed" \
  || { echo "Unexpected deployed release"; exit 1; }
```

Проверить миграции:

```bash
mysql -u stako -p auth -e "SELECT name, executed_at FROM schema_migrations ORDER BY name;"
```

## 11. Smoke-test в браузере

Сайт проверяется в браузере на вашем компьютере. SSH-сессию при этом не закрывать: она понадобится для просмотра логов или rollback.

Проверить под реальными тестовыми ролями:

1. вход и обновление JWT-сессии;
2. страницу остатков и загрузку XLSX из `IMPORT_DIR`;
3. кнопку `Зберегти PDF` на странице остатков;
4. наличие в PDF склада, строки `Залишок актуальний на:` и настроенных колонок;
5. документы `Повернення / Обмін` и `ТРО`;
6. один обычный отчёт и отчёт XLSX;
7. Admin → конфигурация, scheduler и технические учётные записи;
8. dashboard склада, если он используется на этом сервере.

Дополнительно для полного релиза:

9. В ТРО доступны поиск по номерам Portal/УП, город и раздельные номера заказа/документов выполнения; карточка показывает документы выполнения. Отменённый в УП родитель с активными выполнениями виден как предупреждение.
10. Admin → `Дії з документами`: список, выбор и окно подтверждения трёх действий. Реальные отмены/доработки проверять только на согласованных тестовых документах. Возврат уже обработанного в УП документа на доработку должен быть запрещён.
11. Admin → `Сповіщення`: группы документов и семь событий ТРО, сохранность настроек существующих получателей. Тестовую отправку выполнять только на согласованные адреса/каналы.
12. Debet: фильтры даты документа/платежа, переключатель просрочки и счётчики.
13. По одному согласованному ТРО проверить полный `execution_documents` snapshot из установленной обработки 1С. Ручная регистрация снимается после успешного свежего полного snapshot; собственный Portal-статус `COMPLETED` автоматически не отменяется.

После проверки просмотреть свежие логи:

```bash
pm2 logs jwt-auth-api --lines 150 --nostream
```

## 12. Быстрый rollback к предыдущему коду

### В ТОЙ ЖЕ SSH-СЕССИИ

Rollback выполнять, если API не стартует, health не проходит или основной workflow сломан.

Получить предыдущий SHA из backup:

```bash
export PREVIOUS_SHA="$(cat "$BACKUP_DIR/previous-sha.txt")"
echo "$PREVIOUS_SHA"
```

Остановить API и вернуть код:

```bash
pm2 stop jwt-auth-api
cd "$APP_DIR"
git switch --detach "$PREVIOUS_SHA"
```

Переустановить зависимости и вернуть frontend:

```bash
cd "$APP_DIR/api"
npm ci

cd "$APP_DIR/client"
npm ci
mv dist "dist.failed-$(date +%F-%H%M%S)"
tar -xzf "$BACKUP_DIR/client-dist.tar.gz" -C "$APP_DIR/client"
```

Вернуть backend:

```bash
cd "$APP_DIR/api"
pm2 restart jwt-auth-api --update-env
pm2 status
pm2 logs jwt-auth-api --lines 150 --nostream
curl --fail --show-error http://127.0.0.1:5000/api/health
```

Не откатывать миграции вручную. Если несовместимость требует возврата БД, оставить приложение остановленным и восстанавливать `auth.sql` только как отдельную аварийную операцию с подтверждённым downtime.

После устранения проблемы вернуться на ветку:

```bash
cd "$APP_DIR"
git switch branches-config
```

## Короткий checklist

```text
[ ] RELEASE_SHA на GitHub проверен
[ ] git working tree на сервере проверен
[ ] backup БД создан и не пустой
[ ] api/.env и client/dist сохранены
[ ] IMPORT_DIR существует и читается
[ ] Chromium доступен
[ ] checkout совпадает с зафиксированным RELEASE_SHA
[ ] npm ci backend/frontend прошёл
[ ] backend tests прошли
[ ] frontend lint прошёл
[ ] PM2 остановлен перед миграциями
[ ] migrate завершился без ошибок
[ ] миграции 031/032/033 зарегистрированы в целевой БД
[ ] frontend build создан
[ ] PM2 запущен с --update-env
[ ] pm2 save выполнен
[ ] локальный и внешний /api/health отвечают
[ ] PDF остатков проверен
[ ] основные роли и страницы проверены
[ ] свежие PM2 logs не содержат критических ошибок
```
