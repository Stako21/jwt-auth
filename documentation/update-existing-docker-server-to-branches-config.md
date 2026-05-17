# Оновлення старого Docker-розгортання до `branches-config` на сервері `ubserv`

## Що це за інструкція

Це коротша, але все ще детальна інструкція **саме під ваш сервер**.

Вона враховує вже відомі факти:

- код у git лежить у `/var/www/apps/jwt-auth`
- Docker-збірка бере код з `/var/www/apps/jwt-auth-docker/app`
- поточна гілка на сервері: `resbr6`
- цільова гілка: `origin/branches-config`
- backend працює у контейнері `jwt-auth-api`
- MySQL працює у контейнері `jwt-auth-mysql`
- frontend `balance.sweetglobal.com.ua` віддає контейнер `rocketchat-nginx-1`
- допустимий короткий downtime: `5-15 хвилин`

## Що важливо зрозуміти до старту

### 1. Docker збирається не прямо з git-репозиторію

Після оновлення `/var/www/apps/jwt-auth` треба **окремо синхронізувати** код у:

```bash
/var/www/apps/jwt-auth-docker/app
```

Інакше контейнер збереться зі старого коду.

### 2. Поточний `healthcheck` у вас неправильний

Зараз у compose перевіряється:

```bash
http://localhost:5000/health
```

А правильний endpoint у застосунку:

```bash
http://localhost:5000/api/health
```

Через це контейнер і показує `unhealthy`, хоча сам backend може працювати.

### 3. Нова версія очікує нормальну серверну папку для імпортів

Краще не тримати імпортні файли у `client/public/Sorce`.

Для production варто використовувати окрему папку, наприклад:

```bash
/var/www/data/excel
```

Саме її ми й налаштуємо як `IMPORT_DIR`.

### 4. Файли звітів у вас з’являються на Windows-машині

Тому для нормальної роботи потрібен такий ланцюжок:

1. Ubuntu монтує Windows-шару
2. за розкладом забирає файли зі шари
3. кладе їх у `IMPORT_DIR`
4. контейнер бачить `IMPORT_DIR` через bind mount

---

## План оновлення

1. зробити backup
2. зберегти локальні git-зміни
3. переключитися на `branches-config`
4. оновити `.env`
5. створити `IMPORT_DIR`
6. підключити Windows-шару
7. налаштувати sync за розкладом
8. виправити `docker-compose.yml`
9. синхронізувати git-код у Docker build context
10. пересобрати контейнер
11. прогнати `migrate`, `bootstrap:doctor`, `sync:bootstrap-branch`, `seed:user-access`
12. зібрати і викласти frontend
13. перевірити сайт

---

## 1. Підключення і backup

### Підключення

```bash
ssh stako@YOUR_SERVER_IP
cd /var/www/apps/jwt-auth
```

Це потрібно, щоб працювати з реальним git-репозиторієм, а не з Docker-копією.

### Каталог backup

```bash
export BACKUP_DIR="/var/www/apps/backups/jwt-auth-$(date +%F-%H%M%S)"
mkdir -p "$BACKUP_DIR"
echo "$BACKUP_DIR"
```

Це окрема папка, куди ми складемо дамп БД і копії конфігів.

### Backup БД

```bash
docker exec -it jwt-auth-mysql sh -lc 'mysqldump -u stako -p auth' > "$BACKUP_DIR/auth-before-branches-config.sql"
```

Це страховка на випадок, якщо міграції або rollout дадуть не той результат.

### Backup конфігів

```bash
cp /var/www/apps/jwt-auth/.env "$BACKUP_DIR/root.env.backup"
cp /var/www/apps/jwt-auth-docker/docker-compose.yml "$BACKUP_DIR/docker-compose.yml.backup"
cp /var/www/apps/jwt-auth-docker/Dockerfile "$BACKUP_DIR/Dockerfile.backup"
cp /var/www/apps/jwt-auth-docker/rocketchat.conf "$BACKUP_DIR/rocketchat.conf.backup"
```

Це дає можливість швидко відкотити конфігурацію без ручного відновлення.

---

## 2. Збереження локальних git-змін

### Зберегти інформацію про поточний стан

```bash
cd /var/www/apps/jwt-auth
git status --short --branch > "$BACKUP_DIR/git-status.txt"
git branch -vv > "$BACKUP_DIR/git-branches.txt"
git log --oneline -20 > "$BACKUP_DIR/git-log.txt"
```

Це фіксує, з чого ви стартували.

### Зберегти diff локальних правок

```bash
git diff -- api/db.cjs > "$BACKUP_DIR/api-db.cjs.diff"
git diff -- client/dist/Sorce > "$BACKUP_DIR/client-dist-Sorce.diff"
```

Це потрібно, щоб не втратити локальні незакомічені зміни при переході на нову гілку.

### Сховати локальні зміни

```bash
git stash push -u -m "pre-branches-config-update-$(date +%F-%H%M%S)"
git stash list
```

`stash` потрібен, щоб переключення гілки пройшло без конфліктів.

### Створити страховочну гілку

```bash
git branch "backup/resbr6-before-branches-config-$(date +%F-%H%M%S)"
```

Це швидка точка повернення до старого стану.

---

## 3. Переключення на актуальну гілку

### Оновити список гілок

```bash
cd /var/www/apps/jwt-auth
git fetch --all --prune
git branch -r --sort=-committerdate | head -20
```

Тут ви перевіряєте, що `origin/branches-config` реально існує і доступна.

### Переключитися

Якщо локальної гілки ще немає:

```bash
git switch --track origin/branches-config
```

Якщо вже є:

```bash
git switch branches-config
git pull --ff-only
```

### Перевірити результат

```bash
git status --short --branch
git branch -vv
git rev-parse --short HEAD
```

Це потрібно, щоб переконатися, що ви вже не на `resbr6`.

---

## 4. Оновлення production `.env`

### Який `.env` реально використовує Docker

У вашому compose використовується:

```yaml
env_file:
  - /var/www/apps/jwt-auth/.env
```

Тобто редагувати треба саме:

```bash
/var/www/apps/jwt-auth/.env
```

### Відкрити файл

```bash
nano /var/www/apps/jwt-auth/.env
```

### Повний приклад `.env`

Нижче приклад production `.env` саме для вашої docker-схеми. Значення секретів потрібно замінити на реальні.

```env
PORT=5000
CLIENT_URL=https://balance.sweetglobal.com.ua

BRANCH_SLUG=default
IMPORT_DIR=/var/www/data/excel

DB_HOST=mysql
DB_PORT=3306
DB_NAME=auth
DB_USER=stako
DB_PASSWORD=REPLACE_WITH_DB_PASSWORD
DB_CHARSET=utf8mb4
DB_CONNECTION_LIMIT=10
DB_QUEUE_LIMIT=0

ACCESS_TOKEN_SECRET=REPLACE_WITH_ACCESS_TOKEN_SECRET
REFRESH_TOKEN_SECRET=REPLACE_WITH_REFRESH_TOKEN_SECRET

SMTP_HOST=mail.sweetglobal.com.ua
SMTP_USER=documents@sweetglobal.com.ua
SMTP_PASS=REPLACE_WITH_SMTP_PASSWORD

ROCKET_URL=https://rchat.roshen.zp.ua
ROCKET_USER_ID=REPLACE_WITH_ROCKET_USER_ID
ROCKET_TOKEN=REPLACE_WITH_ROCKET_TOKEN

PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
```

### Що означають головні значення у цьому прикладі

- `DB_HOST=mysql`:
  backend працює в Docker і підключається до MySQL не через `localhost`, а через ім'я сервісу `mysql` у compose-мережі.
- `IMPORT_DIR=/var/www/data/excel`:
  це папка на хості, яка змонтована в контейнер і буде отримувати файли зі Windows-шари.
- `BRANCH_SLUG=default`:
  це системна філія для scheduler, якщо активних філій більше однієї.
- `PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium`:
  потрібно для генерації PDF всередині контейнера, бо Chromium встановлюється в образі.

### Що там обов’язково перевірити

```env
CLIENT_URL=https://balance.sweetglobal.com.ua
BRANCH_SLUG=default
IMPORT_DIR=/var/www/data/excel
```

### Що це означає

- `CLIENT_URL` потрібен для коректного CORS і cookie flow
- `BRANCH_SLUG=default` потрібен scheduler, якщо активних філій більше однієї
- `IMPORT_DIR` показує, звідки backend бере імпортні файли

### Перевірка після редагування

```bash
grep -E '^(PORT|CLIENT_URL|BRANCH_SLUG|IMPORT_DIR|DB_HOST|DB_PORT|DB_NAME|DB_USER)=' /var/www/apps/jwt-auth/.env
```

---

## 5. Створення `IMPORT_DIR`

### Створити папку

```bash
sudo mkdir -p /var/www/data/excel
sudo chown -R stako:stako /var/www/data/excel
sudo chmod 775 /var/www/data/excel
```

Це фізична папка на хості, в яку будуть потрапляти файли з Windows-шари.

### Чому це важливо

У вашому compose уже є bind mount:

```yaml
- /var/www/data/excel:/var/www/data/excel
```

Отже:

- Linux-хост зберігає файли тут
- контейнер бачить ту саму папку всередині себе

---

## 6. Підключення Windows-шари

### Встановити пакет для SMB/CIFS

```bash
sudo apt update
sudo apt install -y cifs-utils
```

Це потрібно, щоб Ubuntu могла монтувати Windows-шари.

### Створити точку монтування

```bash
sudo mkdir -p /mnt/windows-reports
sudo chown root:root /mnt/windows-reports
```

Це локальна папка, в яку буде підключена мережева шара.

### Створити файл з обліковими даними

```bash
sudo nano /root/.smb-credentials-sweetglobal
```

Приклад вмісту:

```ini
username=YOUR_WINDOWS_USER
password=YOUR_WINDOWS_PASSWORD
domain=YOUR_DOMAIN_OR_WORKGROUP
```

### Якщо `domain` не використовується

У багатьох невеликих мережах або на окремому Windows-ПК домену немає. Тоді файл може бути простішим:

```ini
username=YOUR_WINDOWS_USER
password=YOUR_WINDOWS_PASSWORD
```

Тобто:

- якщо у вас Active Directory або робоча група з окремим доменним входом, залишайте `domain=...`
- якщо це звичайний локальний Windows-користувач, `domain` часто не потрібен

Якщо не впевнені, почніть без `domain`, а якщо mount не спрацює, тоді вже додайте його.

Потім обмежте права:

```bash
sudo chmod 600 /root/.smb-credentials-sweetglobal
```

Це потрібно, щоб пароль не був доступний іншим користувачам системи.

### Додати mount у `/etc/fstab`

```bash
sudo nano /etc/fstab
```

Додайте рядок:

```fstab
//WINDOWS_HOST/ReportsShare /mnt/windows-reports cifs credentials=/root/.smb-credentials-sweetglobal,iocharset=utf8,uid=stako,gid=stako,file_mode=0664,dir_mode=0775,vers=3.0,nofail,x-systemd.automount,_netdev 0 0
```

Пояснення:

- `credentials=...` бере логін і пароль з окремого файлу
- `uid/gid` робить файли зручними для користувача `stako`
- `nofail` не блокує завантаження системи, якщо Windows-шара тимчасово недоступна
- `x-systemd.automount` і `_netdev` роблять монтування стабільнішим для мережевого ресурсу

### Застосувати і перевірити монтування

```bash
sudo mount -a
mount | grep windows-reports
ls -la /mnt/windows-reports
```

Це підтверджує, що Ubuntu реально бачить файли з Windows.

---

## 7. Налаштування копіювання файлів зі шари в `IMPORT_DIR`

### Створити скрипт синхронізації

```bash
sudo nano /usr/local/bin/jwt-auth-import-sync.sh
```

Вставте:

```bash
#!/usr/bin/env bash
set -euo pipefail

SOURCE_DIR="/mnt/windows-reports"
TARGET_DIR="/var/www/data/excel"
LOG_FILE="/var/log/jwt-auth-import-sync.log"

mkdir -p "$TARGET_DIR"
touch "$LOG_FILE"

if ! mountpoint -q "$SOURCE_DIR"; then
  echo "$(date '+%F %T') source share is not mounted: $SOURCE_DIR" >> "$LOG_FILE"
  exit 1
fi

rsync -av --delete \
  --exclude 'System Volume Information' \
  --exclude '$RECYCLE.BIN' \
  "$SOURCE_DIR"/ "$TARGET_DIR"/ >> "$LOG_FILE" 2>&1

echo "$(date '+%F %T') sync completed" >> "$LOG_FILE"
```

Зробіть файл виконуваним:

```bash
sudo chmod +x /usr/local/bin/jwt-auth-import-sync.sh
```

### Що робить цей скрипт

- перевіряє, що Windows-шара змонтована
- копіює файли у `IMPORT_DIR`
- синхронізує вміст через `rsync`
- пише лог у `/var/log/jwt-auth-import-sync.log`

### Перевірити вручну

```bash
sudo /usr/local/bin/jwt-auth-import-sync.sh
ls -la /var/www/data/excel
tail -n 50 /var/log/jwt-auth-import-sync.log
```

Це дозволяє побачити, що копіювання реально працює до того, як ми повісимо його на розклад.

---

## 8. Налаштування розкладу синхронізації

### Варіант через cron

Відкрийте cron root-користувача:

```bash
sudo crontab -e
```

Додайте, наприклад, запуск кожні 5 хвилин:

```cron
*/5 * * * * /usr/local/bin/jwt-auth-import-sync.sh
```

### Що це дає

Кожні 5 хвилин сервер:

1. перевіряє доступність Windows-шари
2. копіює нові або змінені файли
3. оновлює `IMPORT_DIR`

### Перевірити cron

```bash
sudo crontab -l
```

Якщо хочете менше навантаження, можна поставити раз на 10 або 15 хвилин.

---

## 9. Виправлення `docker-compose.yml`

### Відкрити compose

```bash
nano /var/www/apps/jwt-auth-docker/docker-compose.yml
```

### Виправити healthcheck

Замініть:

```yaml
healthcheck:
  test: ["CMD", "curl", "-f", "http://localhost:5000/health"]
```

на:

```yaml
healthcheck:
  test: ["CMD", "curl", "-f", "http://localhost:5000/api/health"]
  interval: 30s
  timeout: 10s
  retries: 3
```

### Перевірити підсумковий compose

```bash
cd /var/www/apps/jwt-auth-docker
docker compose config > /tmp/jwt-auth-compose-check.yml
tail -n 40 /tmp/jwt-auth-compose-check.yml
```

Це потрібно, щоб упевнитися, що YAML не зламаний після редагування.

---

## 10. Синхронізація git-коду у Docker build context

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

Це копіює оновлений код у те місце, звідки реально будується контейнер.

---

## 11. Пересбірка і запуск backend-контейнера

```bash
cd /var/www/apps/jwt-auth-docker
docker compose build --no-cache jwt-auth-api
docker compose up -d jwt-auth-api
docker logs --tail 100 jwt-auth-api
```

Це запускає новий backend на коді з `branches-config`.

---

## 12. Міграції і rollout-скрипти

### Діагностика

```bash
docker exec -it jwt-auth-api sh -lc "cd /app/api && npm run bootstrap:doctor"
```

Це перевіряє env, БД, таблиці і readiness перед наступними кроками.

### Міграції

```bash
docker exec -it jwt-auth-api sh -lc "cd /app/api && npm run migrate"
```

Це створює нові branch-config таблиці в існуючій БД.

### Doctor ще раз

```bash
docker exec -it jwt-auth-api sh -lc "cd /app/api && npm run bootstrap:doctor"
```

Це перевірка, що після міграцій структура вже в кращому стані.

### Bootstrap branch config: спочатку dry run

```bash
docker exec -it jwt-auth-api sh -lc "cd /app/api && npm run sync:bootstrap-branch"
```

Це показує, що саме буде створено або змінено для bootstrap branch.

### Bootstrap branch config: apply

```bash
docker exec -it jwt-auth-api sh -lc "cd /app/api && npm run sync:bootstrap-branch -- --apply --allow-non-local"
```

`--allow-non-local` потрібен, бо всередині контейнера `DB_HOST=mysql`.

### Seed user access: dry run

```bash
docker exec -it jwt-auth-api sh -lc "cd /app/api && npm run seed:user-access"
```

Це показує, які стартові записи доступів буде додано користувачам.

### Seed user access: apply

```bash
docker exec -it jwt-auth-api sh -lc "cd /app/api && npm run seed:user-access -- --apply --allow-non-local"
```

Це наповнює `user_branch_access` і `user_city_access` для вже існуючих користувачів.

---

## 13. Збірка frontend

```bash
cd /var/www/apps/jwt-auth/client
npm install
npm run build
```

Так ви збираєте frontend у контрольованому середовищі, не залежачи від host Node.js.

Результат буде тут:

```bash
/var/www/apps/jwt-auth/client/dist
```

---

## 14. Оновлення frontend у контейнері Rocket.Chat nginx

### Подивитися mounts

```bash
docker inspect rocketchat-nginx-1 --format '{{json .Mounts}}'
```

Це потрібно, щоб зрозуміти, чи `balance` змонтована з хоста, чи живе просто всередині контейнера.

### Якщо це звичайна папка всередині контейнера

```bash
docker exec rocketchat-nginx-1 sh -lc "rm -rf /usr/share/nginx/html/balance/*"
docker cp /var/www/apps/jwt-auth/client/dist/. rocketchat-nginx-1:/usr/share/nginx/html/balance/
docker exec rocketchat-nginx-1 ls -la /usr/share/nginx/html/balance
```

Це публікує новий frontend для `https://balance.sweetglobal.com.ua`.

---

## 15. Фінальна перевірка

### Перевірити backend health

```bash
docker exec jwt-auth-api curl -s http://localhost:5000/api/health
docker inspect jwt-auth-api --format '{{json .State.Health}}'
```

Тут ви перевіряєте, що backend і реально відповідає, і більше не має фальшивого `unhealthy`.

### Перевірити сайт зовні

```bash
curl -I https://balance.sweetglobal.com.ua
curl -I https://balance.sweetglobal.com.ua/api/health
```

Це перевірка вже з боку опублікованого домену.

### Перевірити sync лог

```bash
tail -n 50 /var/log/jwt-auth-import-sync.log
ls -la /var/www/data/excel
```

Це показує, що файли зі шари реально доходять у папку, яку читає застосунок.

### Ручна перевірка в браузері

Перевірте:

1. логін працює
2. адмінка відкривається
3. `Конфігурація` не падає
4. перемикання філій працює
5. `Default branch` доступна
6. `Планувальник` відкривається
7. сторінки залишків і звітів відкриваються

---

## 16. Якщо щось пішло не так

### Повернути стару гілку

```bash
cd /var/www/apps/jwt-auth
git switch resbr6
```

Це повертає старий код у git-репозиторії.

### Повернути старі конфіги

```bash
cp "$BACKUP_DIR/root.env.backup" /var/www/apps/jwt-auth/.env
cp "$BACKUP_DIR/docker-compose.yml.backup" /var/www/apps/jwt-auth-docker/docker-compose.yml
cp "$BACKUP_DIR/Dockerfile.backup" /var/www/apps/jwt-auth-docker/Dockerfile
cp "$BACKUP_DIR/rocketchat.conf.backup" /var/www/apps/jwt-auth-docker/rocketchat.conf
```

Це повертає конфігурацію до попереднього стану.

### Відновити БД

```bash
cat "$BACKUP_DIR/auth-before-branches-config.sql" | docker exec -i jwt-auth-mysql sh -lc 'mysql -u stako -p auth'
```

Це rollback даних, якщо проблема саме в міграціях або rollout.

### Пересобрати старий контейнер

```bash
rsync -a --delete \
  --exclude '.git' \
  --exclude 'node_modules' \
  --exclude 'api/node_modules' \
  --exclude 'client/node_modules' \
  --exclude 'api/.env' \
  --exclude 'client/dist' \
  /var/www/apps/jwt-auth/ /var/www/apps/jwt-auth-docker/app/

cd /var/www/apps/jwt-auth-docker
docker compose build --no-cache jwt-auth-api
docker compose up -d jwt-auth-api
```

Це повертає runtime до попередньої версії коду.

---

## Короткий чекліст

Усе зроблено правильно, якщо:

- сервер стоїть на гілці `branches-config`
- у `.env` є `BRANCH_SLUG=default`
- у `.env` є `IMPORT_DIR=/var/www/data/excel`
- папка `/var/www/data/excel` існує
- Windows-шара монтується в `/mnt/windows-reports`
- sync-скрипт працює
- cron запускає sync за розкладом
- `docker-compose.yml` перевіряє `/api/health`
- контейнер `jwt-auth-api` пересобраний
- міграції виконані
- rollout-скрипти виконані
- frontend опублікований
- сайт і `/api/health` відповідають

## Що я б покращив після цього оновлення

Після успішного переходу варто окремо спростити production-схему:

1. прибрати дублювання між `/var/www/apps/jwt-auth` і `/var/www/apps/jwt-auth-docker/app`
2. винести frontend publish у більш передбачуваний deploy-flow
3. перейти від cron-скрипта до окремого systemd timer, якщо захочете більш “серверний” варіант розкладу

---

## Короткий бойовий сценарій

Нижче той самий процес, але у максимально стиснутому вигляді. Це зручно, коли ви вже прочитали інструкцію вище і хочете просто пройти оновлення по чеклісту-командах.

### 1. Підключення і backup

```bash
ssh stako@YOUR_SERVER_IP
cd /var/www/apps/jwt-auth

export BACKUP_DIR="/var/www/apps/backups/jwt-auth-$(date +%F-%H%M%S)"
mkdir -p "$BACKUP_DIR"

docker exec -it jwt-auth-mysql sh -lc 'mysqldump -u stako -p auth' > "$BACKUP_DIR/auth-before-branches-config.sql"

cp /var/www/apps/jwt-auth/.env "$BACKUP_DIR/root.env.backup"
cp /var/www/apps/jwt-auth-docker/docker-compose.yml "$BACKUP_DIR/docker-compose.yml.backup"
cp /var/www/apps/jwt-auth-docker/Dockerfile "$BACKUP_DIR/Dockerfile.backup"
cp /var/www/apps/jwt-auth-docker/rocketchat.conf "$BACKUP_DIR/rocketchat.conf.backup"
```

Це створює точку відкату по БД і конфігах.

### 2. Збереження локальних змін і перехід на нову гілку

```bash
cd /var/www/apps/jwt-auth

git diff -- api/db.cjs > "$BACKUP_DIR/api-db.cjs.diff"
git diff -- client/dist/Sorce > "$BACKUP_DIR/client-dist-Sorce.diff"
git stash push -u -m "pre-branches-config-update-$(date +%F-%H%M%S)"
git branch "backup/resbr6-before-branches-config-$(date +%F-%H%M%S)"

git fetch --all --prune
git switch --track origin/branches-config || git switch branches-config
git pull --ff-only
git status --short --branch
```

Це безпечно прибирає локальний шум і переводить сервер на актуальну гілку.

### 3. Оновлення `.env`

```bash
nano /var/www/apps/jwt-auth/.env
```

Перевірте, що є:

```env
CLIENT_URL=https://balance.sweetglobal.com.ua
BRANCH_SLUG=default
IMPORT_DIR=/var/www/data/excel
```

Це задає правильний URL frontend, системну філію для scheduler і серверну папку імпортів.

### 4. Підготовка папки імпортів

```bash
sudo mkdir -p /var/www/data/excel
sudo chown -R stako:stako /var/www/data/excel
sudo chmod 775 /var/www/data/excel
```

Це host-папка, яку бачить контейнер через bind mount.

### 5. Підключення Windows-шари

```bash
sudo apt update
sudo apt install -y cifs-utils

sudo mkdir -p /mnt/windows-reports
sudo nano /root/.smb-credentials-sweetglobal
sudo chmod 600 /root/.smb-credentials-sweetglobal
sudo nano /etc/fstab
```

Приклад рядка в `/etc/fstab`:

```fstab
//WINDOWS_HOST/ReportsShare /mnt/windows-reports cifs credentials=/root/.smb-credentials-sweetglobal,iocharset=utf8,uid=stako,gid=stako,file_mode=0664,dir_mode=0775,vers=3.0,nofail,x-systemd.automount,_netdev 0 0
```

Потім:

```bash
sudo mount -a
ls -la /mnt/windows-reports
```

Це дає серверу доступ до Windows-файлів звітів.

### 6. Налаштування sync-скрипта і розкладу

```bash
sudo nano /usr/local/bin/jwt-auth-import-sync.sh
sudo chmod +x /usr/local/bin/jwt-auth-import-sync.sh
sudo /usr/local/bin/jwt-auth-import-sync.sh
sudo crontab -e
```

Рядок для cron:

```cron
*/5 * * * * /usr/local/bin/jwt-auth-import-sync.sh
```

Перевірка:

```bash
tail -n 50 /var/log/jwt-auth-import-sync.log
ls -la /var/www/data/excel
```

Це забезпечує регулярне копіювання файлів зі шари у папку, яку читає застосунок.

### 7. Виправлення `docker-compose.yml`

```bash
nano /var/www/apps/jwt-auth-docker/docker-compose.yml
```

Замініть:

```yaml
healthcheck:
  test: ["CMD", "curl", "-f", "http://localhost:5000/health"]
```

на:

```yaml
healthcheck:
  test: ["CMD", "curl", "-f", "http://localhost:5000/api/health"]
  interval: 30s
  timeout: 10s
  retries: 3
```

Перевірка:

```bash
cd /var/www/apps/jwt-auth-docker
docker compose config > /tmp/jwt-auth-compose-check.yml
```

Це прибирає фальшивий `unhealthy`.

### 8. Синхронізація коду в Docker build context

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

Це переносить новий код у реальний build context Docker.

### 9. Пересбірка backend

```bash
cd /var/www/apps/jwt-auth-docker
docker compose build --no-cache jwt-auth-api
docker compose up -d jwt-auth-api
docker logs --tail 100 jwt-auth-api
```

Це запускає backend уже на новій версії коду.

### 10. Міграції і rollout

```bash
docker exec -it jwt-auth-api sh -lc "cd /app/api && npm run bootstrap:doctor"
docker exec -it jwt-auth-api sh -lc "cd /app/api && npm run migrate"
docker exec -it jwt-auth-api sh -lc "cd /app/api && npm run bootstrap:doctor"

docker exec -it jwt-auth-api sh -lc "cd /app/api && npm run sync:bootstrap-branch"
docker exec -it jwt-auth-api sh -lc "cd /app/api && npm run sync:bootstrap-branch -- --apply --allow-non-local"

docker exec -it jwt-auth-api sh -lc "cd /app/api && npm run seed:user-access"
docker exec -it jwt-auth-api sh -lc "cd /app/api && npm run seed:user-access -- --apply --allow-non-local"
```

Це створює нові branch-config таблиці і підтягує стартову branch/user-access конфігурацію.

### 11. Збірка frontend

```bash
cd /var/www/apps/jwt-auth/client
npm install
npm run build
```

Це збирає production frontend.

### 12. Публікація frontend

```bash
docker inspect rocketchat-nginx-1 --format '{{json .Mounts}}'
docker exec rocketchat-nginx-1 sh -lc "rm -rf /usr/share/nginx/html/balance/*"
docker cp /var/www/apps/jwt-auth/client/dist/. rocketchat-nginx-1:/usr/share/nginx/html/balance/
docker exec rocketchat-nginx-1 ls -la /usr/share/nginx/html/balance
```

Це викладає новий frontend на домен `balance.sweetglobal.com.ua`.

### 13. Фінальна перевірка

```bash
docker exec jwt-auth-api curl -s http://localhost:5000/api/health
docker inspect jwt-auth-api --format '{{json .State.Health}}'

curl -I https://balance.sweetglobal.com.ua
curl -I https://balance.sweetglobal.com.ua/api/health

tail -n 50 /var/log/jwt-auth-import-sync.log
ls -la /var/www/data/excel
```

Це перевіряє backend, домен і канал доставки файлів зі шари.

### 14. Якщо потрібен rollback

```bash
cd /var/www/apps/jwt-auth
git switch resbr6

cp "$BACKUP_DIR/root.env.backup" /var/www/apps/jwt-auth/.env
cp "$BACKUP_DIR/docker-compose.yml.backup" /var/www/apps/jwt-auth-docker/docker-compose.yml
cp "$BACKUP_DIR/Dockerfile.backup" /var/www/apps/jwt-auth-docker/Dockerfile
cp "$BACKUP_DIR/rocketchat.conf.backup" /var/www/apps/jwt-auth-docker/rocketchat.conf

cat "$BACKUP_DIR/auth-before-branches-config.sql" | docker exec -i jwt-auth-mysql sh -lc 'mysql -u stako -p auth'

rsync -a --delete \
  --exclude '.git' \
  --exclude 'node_modules' \
  --exclude 'api/node_modules' \
  --exclude 'client/node_modules' \
  --exclude 'api/.env' \
  --exclude 'client/dist' \
  /var/www/apps/jwt-auth/ /var/www/apps/jwt-auth-docker/app/

cd /var/www/apps/jwt-auth-docker
docker compose build --no-cache jwt-auth-api
docker compose up -d jwt-auth-api
```

Це повертає старий код, конфіги і БД.

---

## Коротке оновлення після нових змін

Цей блок для ситуації, коли сервер уже переведений на `branches-config`, Windows-шара вже змонтована, `IMPORT_DIR` вже налаштований, і потрібно просто оновити застосунок після нових комітів.

### 1. Оновити код у git-репозиторії

```bash
cd /var/www/apps/jwt-auth
git fetch --all --prune
git switch branches-config
git pull --ff-only
git log --oneline -3
```

Це забирає останні зміни в основну серверну копію репозиторію.

### 2. Синхронізувати код у Docker build context

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

Це обов'язково, бо контейнер збирається не з git-папки напряму, а з `/var/www/apps/jwt-auth-docker/app`.

### 3. Пересобрати і перезапустити backend

```bash
cd /var/www/apps/jwt-auth-docker
docker compose build --no-cache jwt-auth-api
docker compose up -d --force-recreate jwt-auth-api
docker logs --tail 100 jwt-auth-api
```

Це запускає backend уже на новому коді.

### 4. Якщо є нові міграції

```bash
docker exec -it jwt-auth-api sh -lc "cd /app/api && npm run migrate"
docker exec -it jwt-auth-api sh -lc "cd /app/api && npm run bootstrap:doctor"
```

Це потрібно тільки якщо в новому релізі изменялась структура БД или rollout-скрипты.

### 5. Пересобрати frontend

```bash
cd /var/www/apps/jwt-auth/client
npm install
npm run build
```

Це створює новий production frontend у `client/dist`.

### 6. Опублікувати frontend у nginx-контейнері

```bash
docker exec rocketchat-nginx-1 sh -lc "rm -rf /usr/share/nginx/html/balance/*"
docker cp /var/www/apps/jwt-auth/client/dist/. rocketchat-nginx-1:/usr/share/nginx/html/balance/
docker exec rocketchat-nginx-1 sh -lc "test -f /usr/share/nginx/html/balance/index.html && echo index-ok || echo index-missing"
```

Це оновлює frontend на `https://balance.sweetglobal.com.ua`.

### 7. Фінальна перевірка

```bash
docker exec jwt-auth-api curl -s http://localhost:5000/api/health
curl -I https://balance.sweetglobal.com.ua
curl -I https://balance.sweetglobal.com.ua/api/health
tail -n 50 /var/log/jwt-auth-import-sync.log
```

Після цього достатньо коротко перевірити в браузері:

1. логін
2. відкриття залишків
3. вкладку `Конфігурація`
4. вкладку `Планувальник`
5. один-два ключові звіти
