# Обновление существующего Ubuntu сервера до `branches-config` без Docker

Эта инструкция для текущего production-сервера:

- проект: `/var/www/apps/jwt-auth`
- frontend отдается Nginx из `/var/www/apps/jwt-auth/client/dist`
- API запущен через PM2 как `jwt-auth-api`
- API слушает `127.0.0.1:5000`
- домен: `https://balance.roshen.zp.ua`
- MySQL база: `auth`
- импортные файлы лежат отдельно: `/var/www/data/excel`
- текущая старая ветка: `resbr6`
- новая ветка: `origin/branches-config`

Цель обновления: переключить существующее развертывание с уже заполненной базой пользователей, документов и отчетов на новую branch/config версию, применить все миграции и не потерять рабочие данные.

## Что важно перед стартом

Миграции меняют существующую базу данных. Не запускайте их без свежего backup.

На сервере уже были показаны реальные секреты: GitHub token в `git remote`, JWT secrets, SMTP пароль и Rocket.Chat token. После успешного обновления их нужно считать скомпрометированными и заменить.

На сервере много файлов проекта принадлежит `root`, поэтому обычный `git fetch` уже падал с `Permission denied`. Перед обновлением нужно исправить владельца проекта.

Сейчас `api/.env` старого сервера не содержит DB-переменные, а старый `api/db.cjs` содержит логин/пароль прямо в коде. После переключения на `branches-config` база должна настраиваться через `api/.env`.

## 1. Зайти на сервер

```bash
ssh stako@SERVER_IP
cd /var/www/apps/jwt-auth
```

Проверить, что это правильный проект:

```bash
pwd
git branch --show-current
pm2 describe jwt-auth-api
```

Ожидаемо:

- `pwd` показывает `/var/www/apps/jwt-auth`
- текущая ветка перед обновлением может быть `resbr6`
- PM2 process `jwt-auth-api` имеет `script path` `/var/www/apps/jwt-auth/api/server.js`

## 2. Сделать backup базы, env и импортных файлов

Создать каталог backup:

```bash
mkdir -p /var/www/backups/jwt-auth
```

Backup базы:

```bash
mysqldump -u stako -p --single-transaction --routines --triggers auth > /var/www/backups/jwt-auth/auth-before-branches-config-$(date +%F-%H%M%S).sql
```

Backup конфигурации backend:

```bash
sudo cp /var/www/apps/jwt-auth/api/.env /var/www/backups/jwt-auth/api.env.before-branches-config.$(date +%F-%H%M%S)
sudo cp /var/www/apps/jwt-auth/api/db.cjs /var/www/backups/jwt-auth/db.cjs.before-branches-config.$(date +%F-%H%M%S)
```

Backup импортных файлов:

```bash
tar -czf /var/www/backups/jwt-auth/excel-before-branches-config-$(date +%F-%H%M%S).tar.gz -C /var/www/data excel
```

Проверить, что backup-файлы появились:

```bash
ls -lh /var/www/backups/jwt-auth
```

## 3. Исправить владельца проекта

Сейчас `.git`, `api` и часть `client` принадлежат `root`, поэтому Git и npm могут не работать от пользователя `stako`.

```bash
sudo chown -R stako:stako /var/www/apps/jwt-auth
```

Проверить:

```bash
cd /var/www/apps/jwt-auth
stat -c '%U:%G %a %n' . .git api api/.env api/db.cjs client client/dist
```

Ожидаемо владелец должен быть `stako:stako`.

## 4. Убрать token из Git remote

Сейчас remote содержит GitHub token в URL. Заменить на безопасный URL:

```bash
cd /var/www/apps/jwt-auth
git remote set-url origin https://github.com/Stako21/jwt-auth.git
git remote -v
```

Если GitHub попросит доступ при `fetch` или `pull`, используйте актуальный token интерактивно или настройте SSH remote отдельно.

## 5. Проверить текущее состояние Git

```bash
cd /var/www/apps/jwt-auth
git status --short
```

На сервере уже были видны удаления старых source-файлов:

```text
D client/dist/Sorce/balanceDP.xlsx
D client/dist/Sorce/balanceKR.xlsx
D client/dist/Sorce/balanceML.xlsx
D client/dist/Sorce/balanceZP.xlsx
D client/public/Sorce/balanceDP.xlsx
D client/public/Sorce/balanceKR.xlsx
D client/public/Sorce/balanceML.xlsx
D client/public/Sorce/balanceZP.xlsx
D client/public/Sorce/report_romashka.json
```

Это не должно затрагивать реальные production-источники, потому что они лежат в `/var/www/data/excel`. Чтобы Git дал переключиться на новую ветку, восстановить только эти tracked-файлы:

```bash
git restore -- \
  client/dist/Sorce/balanceDP.xlsx \
  client/dist/Sorce/balanceKR.xlsx \
  client/dist/Sorce/balanceML.xlsx \
  client/dist/Sorce/balanceZP.xlsx \
  client/public/Sorce/balanceDP.xlsx \
  client/public/Sorce/balanceKR.xlsx \
  client/public/Sorce/balanceML.xlsx \
  client/public/Sorce/balanceZP.xlsx \
  client/public/Sorce/report_romashka.json
```

Снова проверить:

```bash
git status --short
```

Если есть другие изменения, не продолжать вслепую. Сначала сохранить их отдельно или понять, что это.

## 6. Получить новую ветку

```bash
cd /var/www/apps/jwt-auth
git fetch --all --prune
git log --oneline origin/branches-config -5
```

Ожидаемо должна быть ветка `origin/branches-config`, например с последними коммитами про branch config и XLSX reports.

## 7. Переключиться на новую ветку

```bash
cd /var/www/apps/jwt-auth
git show-ref --verify --quiet refs/heads/branches-config && git switch branches-config || git switch --track -c branches-config origin/branches-config
git pull --ff-only
git status --short
git rev-parse --short HEAD
```

Если `git switch` ругается на локальные изменения, остановиться и посмотреть `git status --short`.

## 8. Обновить `api/.env`

Открыть файл:

```bash
nano /var/www/apps/jwt-auth/api/.env
```

Сохранить существующие production-секреты, но добавить DB-переменные, `IMPORT_DIR` и branch runtime:

```env
PORT=5000
CLIENT_URL=https://balance.roshen.zp.ua

DB_HOST=localhost
DB_PORT=3306
DB_NAME=auth
DB_USER=stako
DB_PASSWORD=YOUR_CURRENT_DB_PASSWORD
DB_CHARSET=utf8mb4
DB_CONNECTION_LIMIT=10
DB_QUEUE_LIMIT=0

BRANCH_SLUG=default
IMPORT_DIR=/var/www/data/excel

ACCESS_TOKEN_SECRET=ROTATE_ME_AFTER_UPDATE
REFRESH_TOKEN_SECRET=ROTATE_ME_AFTER_UPDATE

SMTP_HOST=mail.roshen.zp.ua
SMTP_USER=documents@roshen.zp.ua
SMTP_PASS=ROTATE_ME_AFTER_UPDATE

ROCKET_URL=https://rchat.roshen.zp.ua
ROCKET_USER_ID=ROTATE_ME_AFTER_UPDATE
ROCKET_TOKEN=ROTATE_ME_AFTER_UPDATE

PUPPETEER_EXECUTABLE_PATH=/home/stako/.cache/puppeteer/chrome/linux-144.0.7559.96/chrome-linux64/chrome
```

Не вставляйте секреты в инструкцию, чат или Git. Значения `ROTATE_ME_AFTER_UPDATE` в примере нужно заменить реальными текущими значениями, а после успешного обновления лучше выпустить новые.

Проверить, что файл не читается всеми пользователями:

```bash
chmod 600 /var/www/apps/jwt-auth/api/.env
```

## 9. Установить зависимости

Backend:

```bash
cd /var/www/apps/jwt-auth/api
npm install
```

Frontend:

```bash
cd /var/www/apps/jwt-auth/client
npm install
```

## 10. Предварительная диагностика до остановки API

```bash
cd /var/www/apps/jwt-auth/api
npm run bootstrap:doctor
```

До миграций нормально увидеть предупреждения про:

- missing `schema_migrations`
- pending migrations
- missing `branches`, `cities`, `balance_pages`, `report_definitions`, `scheduler_tasks`

Критично, если doctor не может подключиться к MySQL или не видит базу `auth`.

## 11. Остановить API на время миграций

```bash
pm2 stop jwt-auth-api
```

Проверить:

```bash
pm2 status
```

## 12. Применить все миграции

```bash
cd /var/www/apps/jwt-auth/api
npm run migrate
```

Что должно произойти:

- создастся `schema_migrations`
- применятся миграции `001` ... `014`
- создадутся `branches`, `cities`, `balance_pages`, `report_definitions`, `import_sources`, `scheduler_tasks`
- в старые таблицы добавится `branch_id`
- существующие строки получат `branch_id = 1`
- добавятся таблицы для новых DB-backed отчетов

Если миграция упала, не запускать ее повторно наугад. Сначала сохранить полный текст ошибки и проверить, какие миграции успели записаться:

```bash
mysql -u stako -p auth -e "SELECT * FROM schema_migrations ORDER BY name;"
```

## 13. Заполнить primary access для существующих пользователей

Сначала dry run:

```bash
cd /var/www/apps/jwt-auth/api
npm run seed:user-access
```

Он должен показать, какие строки будут добавлены в:

- `user_branch_access`
- `user_city_access`

Если план выглядит нормально, применить:

```bash
npm run seed:user-access -- --apply
```

Для этого сервера `DB_HOST=localhost`, поэтому `--allow-non-local` не нужен.

## 14. Проверить состояние базы после миграций

```bash
mysql -u stako -p auth -e "SELECT name, executed_at FROM schema_migrations ORDER BY name;"
```

Проверить новые таблицы:

```bash
mysql -u stako -p auth -e "
SHOW TABLES WHERE Tables_in_auth IN (
  'schema_migrations',
  'branches',
  'cities',
  'balance_pages',
  'report_definitions',
  'import_sources',
  'scheduler_tasks',
  'user_branch_access',
  'user_city_access',
  'orders_by_time_report_rows',
  'bill_of_lading_report_rows',
  'xlsx_1c_sales_report_values'
);
"
```

Проверить, что старые данные получили branch:

```bash
mysql -u stako -p auth -e "
SELECT 'users' table_name, COUNT(*) null_branch FROM users WHERE branch_id IS NULL
UNION ALL SELECT 'documents', COUNT(*) FROM documents WHERE branch_id IS NULL
UNION ALL SELECT 'sales_reports', COUNT(*) FROM sales_reports WHERE branch_id IS NULL
UNION ALL SELECT 'sales_agents', COUNT(*) FROM sales_agents WHERE branch_id IS NULL
UNION ALL SELECT 'trade_points', COUNT(*) FROM trade_points WHERE branch_id IS NULL
UNION ALL SELECT 'region_notifications', COUNT(*) FROM region_notifications WHERE branch_id IS NULL;
"
```

Ожидаемо везде `0`.

Проверить config seed:

```bash
mysql -u stako -p auth -e "SELECT * FROM branches;"
mysql -u stako -p auth -e "SELECT id, branch_id, slug, name, document_prefix, is_active FROM cities ORDER BY id;"
mysql -u stako -p auth -e "SELECT branch_id, slug, file_name, is_active FROM balance_pages ORDER BY sort_order;"
mysql -u stako -p auth -e "SELECT report_key, route, file_name, report_type, is_active FROM report_definitions ORDER BY sort_order;"
```

## 15. Запустить doctor после миграций

```bash
cd /var/www/apps/jwt-auth/api
npm run bootstrap:doctor
```

Ожидаемо:

- pending migrations: none
- branch/config таблицы найдены
- runtime branch resolved через `BRANCH_SLUG=default`

Если doctor пишет, что scheduler заблокирован из-за нескольких branch, проверьте `BRANCH_SLUG=default` в `api/.env`.

## 16. Собрать frontend

```bash
cd /var/www/apps/jwt-auth/client
npm run build
```

Nginx уже смотрит в:

```text
/var/www/apps/jwt-auth/client/dist
```

Дополнительно Nginx менять не нужно, текущий конфиг уже подходит:

```nginx
root /var/www/apps/jwt-auth/client/dist;

location /api/ {
    proxy_pass http://127.0.0.1:5000;
}

location / {
    try_files $uri $uri/ /index.html;
}
```

Проверить Nginx:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

## 17. Запустить API

```bash
pm2 restart jwt-auth-api --update-env
pm2 status
pm2 logs jwt-auth-api --lines 100
```

Сохранить PM2 process list:

```bash
pm2 save
```

`pm2 save --dry-run` на этом сервере не поддерживается, используйте обычный `pm2 save`.

Если `pm2 startup` еще не был применен, команда сама показывает нужную `sudo env ...` строку:

```bash
pm2 startup
```

После выполнения показанной PM2 команды снова:

```bash
pm2 save
```

## 18. Проверить API и сайт

Локальный health:

```bash
curl -i http://127.0.0.1:5000/api/health
```

Через Nginx:

```bash
curl -i https://balance.roshen.zp.ua/api/health
```

Открыть сайт:

```text
https://balance.roshen.zp.ua
```

Проверить в браузере:

- вход существующим пользователем
- меню балансов загружается из config
- баланс `/balance/zp`, `/balance/dp`, `/balance/kr` открывается
- документы открываются и создаются
- отчеты открываются согласно ролям
- админка -> configuration открывается
- scheduler показывает runtime branch и не находится в blocked состоянии

## 19. Проверить импортную папку

```bash
ls -la /var/www/data/excel
```

Минимально ожидаемые файлы:

```text
balanceDP.xlsx
balanceKR.xlsx
balanceML.xlsx
balanceZP.xlsx
DebetReport.json
Product.json
report_romashka.json
SalesAgent.json
TradePoint.json
```

Если новые отчеты уже включены в config, но файлов еще нет, соответствующие страницы или scheduler-задачи могут показывать `source_missing`. Это нормально до появления файлов:

```text
OrderByTimet.json
BillOfLading.json
montblanc2026.xlsx
lacmi2026.xlsx
```

Точные имена XLSX-файлов можно посмотреть в админке в `Configuration -> Reports` и `Configuration -> Import sources`.

## 20. Ротация секретов после обновления

После того как сайт работает:

1. выпустить новый GitHub token или перейти на SSH remote;
2. заменить `ACCESS_TOKEN_SECRET` и `REFRESH_TOKEN_SECRET`;
3. заменить SMTP password, если он был раскрыт;
4. перевыпустить Rocket.Chat token;
5. обновить `api/.env`;
6. перезапустить API:

```bash
pm2 restart jwt-auth-api --update-env
```

После смены JWT secrets все пользователи должны будут перелогиниться.

## 21. Быстрый rollback

Rollback нужен только если миграции или запуск новой версии сломали production.

Остановить API:

```bash
pm2 stop jwt-auth-api
```

Вернуть код на старую ветку:

```bash
cd /var/www/apps/jwt-auth
git switch resbr6
```

Вернуть старые config-файлы из backup:

```bash
sudo cp /var/www/backups/jwt-auth/api.env.before-branches-config.YYYY-MM-DD-HHMMSS /var/www/apps/jwt-auth/api/.env
sudo cp /var/www/backups/jwt-auth/db.cjs.before-branches-config.YYYY-MM-DD-HHMMSS /var/www/apps/jwt-auth/api/db.cjs
```

Восстановить базу из backup. Внимание: это заменит состояние базы на момент backup:

```bash
mysql -u stako -p auth < /var/www/backups/jwt-auth/auth-before-branches-config-YYYY-MM-DD-HHMMSS.sql
```

Переустановить зависимости старой ветки и собрать frontend:

```bash
cd /var/www/apps/jwt-auth/api
npm install

cd /var/www/apps/jwt-auth/client
npm install
npm run build
```

Запустить API:

```bash
pm2 restart jwt-auth-api --update-env
pm2 status
```

## 22. Короткий checklist обновления

```text
[ ] backup MySQL auth сделан
[ ] backup api/.env и api/db.cjs сделан
[ ] backup /var/www/data/excel сделан
[ ] владелец /var/www/apps/jwt-auth исправлен на stako:stako
[ ] Git remote больше не содержит token
[ ] git status чистый или понятный
[ ] ветка branches-config получена
[ ] проект переключен на branches-config
[ ] api/.env содержит DB_*, BRANCH_SLUG=default, IMPORT_DIR=/var/www/data/excel
[ ] npm install выполнен в api и client
[ ] bootstrap:doctor до миграции не показывает проблем с MySQL
[ ] pm2 stop jwt-auth-api выполнен
[ ] npm run migrate выполнен успешно
[ ] npm run seed:user-access выполнен dry-run
[ ] npm run seed:user-access -- --apply выполнен
[ ] schema_migrations содержит все миграции
[ ] branch_id NULL count = 0 в основных таблицах
[ ] bootstrap:doctor после миграции без pending migrations
[ ] npm run build выполнен в client
[ ] nginx -t успешен
[ ] pm2 restart jwt-auth-api --update-env выполнен
[ ] /api/health отвечает локально и через домен
[ ] вход, документы, балансы, отчеты, config и scheduler проверены
[ ] секреты заменены после успешного обновления
```

## 23. Дальнейшие обновления двух production-сайтов

Этот блок использовать после того, как первичный переход на `branches-config` уже выполнен и миграции на обоих production-сайтах успешно работают.

Production-сайты:

- Docker: `https://balance.sweetglobal.com.ua/`
- PM2/Nginx: `https://balance.roshen.zp.ua/`

Правило: оба production-сайта должны всегда быть на одной версии кода и с одинаковым набором примененных миграций. Не оставляйте один сайт обновленным, а второй на старом commit, кроме короткого окна самого релиза.

Перед каждым релизом выберите один commit, который будет установлен на оба сервера:

```bash
git rev-parse --short HEAD
git log --oneline -1
```

Дальше в командах ниже используйте это значение как `RELEASE_SHA`.

## 24. Общий порядок релиза на оба production

Рекомендуемый порядок:

1. локально убедиться, что релизная ветка собрана и готова;
2. записать `RELEASE_SHA`;
3. сделать backup на обоих production;
4. обновить Docker production `balance.sweetglobal.com.ua`;
5. проверить Docker production;
6. обновить PM2 production `balance.roshen.zp.ua`;
7. проверить PM2 production;
8. сверить, что оба сервера стоят на одном `RELEASE_SHA`;
9. сверить, что на обоих одинаковый список `schema_migrations`;
10. проверить оба домена в браузере.

Если новая версия содержит миграции, они должны быть применены на обоих production в рамках одного релиза. Если миграция прошла на одном сайте, но упала на втором, не продолжайте обычную работу: либо чините второй до той же стадии, либо откатывайте оба сайта по backup.

## 25. Предрелизная проверка локально

На рабочей машине:

```bash
git status --short
git branch --show-current
git log --oneline -5
```

Проверить frontend:

```bash
cd client
npm run lint
npm run build
```

Проверить измененные backend-файлы через `node --check`, если релиз трогал backend. Пример:

```bash
cd api
node --check server.js
node --check scripts/migrate.js
```

Записать commit релиза:

```bash
cd /path/to/local/jwt-auth
export RELEASE_SHA="$(git rev-parse --short HEAD)"
echo "$RELEASE_SHA"
git log --oneline -1
```

## 26. Быстрая проверка текущего состояния обоих production

### Docker production: `balance.sweetglobal.com.ua`

```bash
ssh stako@SWEETGLOBAL_SERVER
cd /var/www/apps/jwt-auth
git rev-parse --short HEAD
git branch --show-current
docker exec jwt-auth-api sh -lc "cd /app/api && npm run bootstrap:doctor"
curl -I https://balance.sweetglobal.com.ua/api/health
```

Проверить миграции:

```bash
docker exec -it jwt-auth-mysql sh -lc 'mysql -u stako -p auth -e "SELECT name FROM schema_migrations ORDER BY name;"'
```

### PM2 production: `balance.roshen.zp.ua`

```bash
ssh stako@ROSHEN_SERVER
cd /var/www/apps/jwt-auth
git rev-parse --short HEAD
git branch --show-current
cd api
npm run bootstrap:doctor
curl -I https://balance.roshen.zp.ua/api/health
```

Проверить миграции:

```bash
mysql -u stako -p auth -e "SELECT name FROM schema_migrations ORDER BY name;"
```

## 27. Backup перед обычным релизом

### Docker production

```bash
ssh stako@SWEETGLOBAL_SERVER
export BACKUP_DIR="/var/www/apps/backups/jwt-auth-release-$(date +%F-%H%M%S)"
mkdir -p "$BACKUP_DIR"

docker exec -it jwt-auth-mysql sh -lc 'mysqldump -u stako -p --single-transaction --routines --triggers auth' > "$BACKUP_DIR/auth.sql"
cp /var/www/apps/jwt-auth/.env "$BACKUP_DIR/root.env"
cp /var/www/apps/jwt-auth-docker/docker-compose.yml "$BACKUP_DIR/docker-compose.yml"
git -C /var/www/apps/jwt-auth rev-parse --short HEAD > "$BACKUP_DIR/git-sha.txt"
echo "$BACKUP_DIR"
```

### PM2 production

```bash
ssh stako@ROSHEN_SERVER
export BACKUP_DIR="/var/www/backups/jwt-auth-release-$(date +%F-%H%M%S)"
mkdir -p "$BACKUP_DIR"

mysqldump -u stako -p --single-transaction --routines --triggers auth > "$BACKUP_DIR/auth.sql"
cp /var/www/apps/jwt-auth/api/.env "$BACKUP_DIR/api.env"
git -C /var/www/apps/jwt-auth rev-parse --short HEAD > "$BACKUP_DIR/git-sha.txt"
echo "$BACKUP_DIR"
```

## 28. Обновление Docker production: `balance.sweetglobal.com.ua`

```bash
ssh stako@SWEETGLOBAL_SERVER
cd /var/www/apps/jwt-auth
git fetch --all --prune
git switch branches-config
git pull --ff-only
git rev-parse --short HEAD
```

Сверить, что показанный SHA совпадает с `RELEASE_SHA`.

Синхронизировать код в Docker build context:

```bash
rsync -a --delete \
  --exclude '.git' \
  --exclude 'node_modules' \
  --exclude 'api/node_modules' \
  --exclude 'client/node_modules' \
  --exclude 'api/.env' \
  --exclude 'client/dist' \
  /var/www/apps/jwt-auth/ /var/www/apps/jwt-auth-docker/app/
```

Пересобрать и перезапустить backend:

```bash
cd /var/www/apps/jwt-auth-docker
docker compose build --no-cache jwt-auth-api
docker compose up -d --force-recreate jwt-auth-api
docker logs --tail 100 jwt-auth-api
```

Применить миграции и проверить doctor:

```bash
docker exec -it jwt-auth-api sh -lc "cd /app/api && npm run migrate"
docker exec -it jwt-auth-api sh -lc "cd /app/api && npm run bootstrap:doctor"
```

Если в релизе менялась стартовая branch/config seed-конфигурация, сначала dry-run:

```bash
docker exec -it jwt-auth-api sh -lc "cd /app/api && npm run sync:bootstrap-branch"
```

Применять только если план ожидаемый:

```bash
docker exec -it jwt-auth-api sh -lc "cd /app/api && npm run sync:bootstrap-branch -- --apply --allow-non-local"
```

Если добавлялись новые правила первичного доступа пользователей, проверить и применить:

```bash
docker exec -it jwt-auth-api sh -lc "cd /app/api && npm run seed:user-access"
docker exec -it jwt-auth-api sh -lc "cd /app/api && npm run seed:user-access -- --apply --allow-non-local"
```

Собрать и опубликовать frontend:

```bash
cd /var/www/apps/jwt-auth/client
npm install
npm run build

docker exec rocketchat-nginx-1 sh -lc "rm -rf /usr/share/nginx/html/balance/*"
docker cp /var/www/apps/jwt-auth/client/dist/. rocketchat-nginx-1:/usr/share/nginx/html/balance/
docker exec rocketchat-nginx-1 sh -lc "test -f /usr/share/nginx/html/balance/index.html && echo index-ok || echo index-missing"
```

Проверить:

```bash
docker exec jwt-auth-api curl -s http://localhost:5000/api/health
curl -I https://balance.sweetglobal.com.ua
curl -I https://balance.sweetglobal.com.ua/api/health
docker exec -it jwt-auth-mysql sh -lc 'mysql -u stako -p auth -e "SELECT name FROM schema_migrations ORDER BY name;"'
```

## 29. Обновление PM2 production: `balance.roshen.zp.ua`

```bash
ssh stako@ROSHEN_SERVER
cd /var/www/apps/jwt-auth
git fetch --all --prune
git switch branches-config
git pull --ff-only
git rev-parse --short HEAD
```

Сверить, что показанный SHA совпадает с `RELEASE_SHA`.

Установить зависимости:

```bash
cd /var/www/apps/jwt-auth/api
npm install

cd /var/www/apps/jwt-auth/client
npm install
```

Остановить API на время миграций:

```bash
pm2 stop jwt-auth-api
```

Применить миграции и проверить doctor:

```bash
cd /var/www/apps/jwt-auth/api
npm run migrate
npm run bootstrap:doctor
```

Если в релизе менялась стартовая branch/config seed-конфигурация, сначала dry-run:

```bash
npm run sync:bootstrap-branch
```

Применять только если план ожидаемый:

```bash
npm run sync:bootstrap-branch -- --apply
```

Если добавлялись новые правила первичного доступа пользователей:

```bash
npm run seed:user-access
npm run seed:user-access -- --apply
```

Собрать frontend:

```bash
cd /var/www/apps/jwt-auth/client
npm run build
```

Запустить API и проверить Nginx:

```bash
pm2 restart jwt-auth-api --update-env
pm2 status
pm2 logs jwt-auth-api --lines 100

sudo nginx -t
sudo systemctl reload nginx
```

Проверить:

```bash
curl -i http://127.0.0.1:5000/api/health
curl -I https://balance.roshen.zp.ua
curl -I https://balance.roshen.zp.ua/api/health
mysql -u stako -p auth -e "SELECT name FROM schema_migrations ORDER BY name;"
```

## 30. Финальная сверка двух production после релиза

Оба сервера должны показать один и тот же commit:

```bash
cd /var/www/apps/jwt-auth
git rev-parse --short HEAD
git log --oneline -1
```

Оба сервера должны показать одинаковый список миграций:

```bash
SELECT name FROM schema_migrations ORDER BY name;
```

Оба health endpoint должны отвечать:

```bash
curl -I https://balance.sweetglobal.com.ua/api/health
curl -I https://balance.roshen.zp.ua/api/health
```

В браузере проверить на обоих сайтах:

- логин существующим пользователем;
- меню балансов;
- один баланс;
- список документов;
- один отчет;
- `Configuration`;
- `Scheduler`.

Записать результат релиза:

```text
Release SHA:
Docker production balance.sweetglobal.com.ua:
PM2 production balance.roshen.zp.ua:
Migrations:
Checked by:
Date:
```

## 31. Если один production обновился, а второй нет

Это аварийная ситуация релиза. Не вносите новые бизнес-настройки через админку, пока сайты на разных версиях.

Если второй production не обновился из-за временной инфраструктурной проблемы, лучше быстро довести его до того же `RELEASE_SHA`.

Если второй production не обновился из-за ошибки миграции или несовместимости данных:

1. остановить rollout;
2. сохранить полный текст ошибки;
3. не запускать миграции повторно наугад;
4. сравнить `schema_migrations` на обоих production;
5. принять решение: чинить второй сервер вперед или откатывать первый по backup;
6. после решения снова добиться одинакового commit и одинакового списка миграций на обоих сайтах.

## 32. Короткий checklist обычного релиза на два production

```text
[ ] выбран RELEASE_SHA
[ ] локально npm run lint прошел
[ ] локально npm run build прошел
[ ] backup Docker production сделан
[ ] backup PM2 production сделан
[ ] Docker production обновлен до RELEASE_SHA
[ ] Docker production migrations применены
[ ] Docker production frontend опубликован
[ ] Docker production health OK
[ ] PM2 production обновлен до RELEASE_SHA
[ ] PM2 production migrations применены
[ ] PM2 production frontend собран
[ ] PM2 production health OK
[ ] оба git rev-parse --short HEAD совпадают
[ ] оба schema_migrations совпадают
[ ] оба сайта проверены в браузере
```
