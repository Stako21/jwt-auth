# Розгортання проєкту на чистому сервері Ubuntu

## Для кого ця інструкція

Ця інструкція написана максимально докладно, ніби ви робите таке розгортання вперше.

Вона описує:

- підготовку чистого Ubuntu-сервера
- встановлення Node.js, MySQL, Nginx, PM2
- завантаження проєкту
- налаштування `.env`
- підготовку бази даних
- запуск backend і frontend у production
- базову перевірку, що все працює

## Важливе чесне зауваження перед стартом

У поточному стані репозиторій **ще не містить повної історії міграцій для всієї legacy-схеми БД**.

Що це означає на практиці:

- проєкт уже має bootstrap-інструменти для:
  - створення БД
  - запуску поточних міграцій
  - створення default admin
- але для **повністю порожньої БД** деяких старих таблиць може не вистачити

Тому перед production-запуском діємо так:

1. запускаємо `bootstrap:doctor`
2. якщо він каже, що бракує legacy-таблиць, імпортуємо legacy-базову схему
3. знову запускаємо `bootstrap:env`
4. ще раз запускаємо `bootstrap:doctor`
5. тільки після цього запускаємо застосунок

Нижче весь процес описаний покроково.

---

## 1. Початкові дані, які треба підготувати

Перед початком бажано мати:

- IP-адресу сервера
- домен або піддомен, якщо сайт буде відкриватися з браузера не лише по IP
- доступ по SSH
- користувача з правами `sudo`
- копію репозиторію
- розуміння, чи є у вас legacy SQL-дамп для старої схеми БД

Також заздалегідь підготуйте:

- нові безпечні значення для:
  - `ACCESS_TOKEN_SECRET`
  - `REFRESH_TOKEN_SECRET`
  - `DB_PASSWORD`
  - `SMTP_PASS`
  - `ROCKET_TOKEN`

Ніколи не використовуйте production-секрети з локального `.env`.

---

## 2. Підключення до сервера

На своєму комп'ютері відкрийте термінал і підключіться:

```bash
ssh your_user@your_server_ip
```

Приклад:

```bash
ssh ubuntu@203.0.113.10
```

Після входу перевірте версію Ubuntu:

```bash
lsb_release -a
```

---

## 3. Оновлення системи

Оновіть список пакетів і саму систему:

```bash
sudo apt update
sudo apt upgrade -y
```

Потім встановіть базові утиліти:

```bash
sudo apt install -y git curl unzip build-essential ca-certificates
```

---

## 4. Встановлення Node.js

Для цього проєкту краще використовувати сучасну LTS-версію Node.js.

Приклад для Node.js 22:

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
```

Перевірте:

```bash
node -v
npm -v
```

Очікувано ви побачите щось на зразок:

- `v22.x.x`
- `10.x.x`

---

## 5. Встановлення MySQL

Встановіть сервер MySQL:

```bash
sudo apt install -y mysql-server
```

Перевірте, що сервіс працює:

```bash
sudo systemctl status mysql
```

Якщо потрібно, увімкніть автозапуск:

```bash
sudo systemctl enable mysql
sudo systemctl start mysql
```

Запустіть базове налаштування безпеки:

```bash
sudo mysql_secure_installation
```

Якщо ви новачок, можна пройтись по типовому безпечному сценарію:

- встановити root password, якщо система просить
- прибрати анонімних користувачів
- заборонити root login remotely
- видалити test database
- перезавантажити privilege tables

---

## 6. Встановлення Nginx

Nginx буде:

- віддавати frontend
- проксувати `/api` на backend

Встановлення:

```bash
sudo apt install -y nginx
```

Перевірка:

```bash
sudo systemctl status nginx
```

Увімкнення автозапуску:

```bash
sudo systemctl enable nginx
sudo systemctl start nginx
```

---

## 7. Встановлення PM2

PM2 потрібен для стабільного запуску backend як сервісу.

Встановлення:

```bash
sudo npm install -g pm2
```

Перевірка:

```bash
pm2 -v
```

---

## 8. Створення каталогу застосунку

Рекомендований шлях:

```bash
sudo mkdir -p /var/www/jwt-auth
sudo chown -R $USER:$USER /var/www/jwt-auth
```

Переходимо:

```bash
cd /var/www/jwt-auth
```

---

## 9. Завантаження коду

Якщо репозиторій у Git:

```bash
git clone <REPOSITORY_URL> .
```

Якщо потрібна конкретна гілка:

```bash
git clone --branch branches-config <REPOSITORY_URL> .
```

Або якщо код уже скопійований іншим способом, просто переконайтесь, що в каталозі є:

- `api/`
- `client/`
- `README.md`

---

## 10. Встановлення залежностей

### Backend

```bash
cd /var/www/jwt-auth/api
npm install
```

### Frontend

```bash
cd /var/www/jwt-auth/client
npm install
```

---

## 11. Створення production `.env` для backend

Перейдіть у backend:

```bash
cd /var/www/jwt-auth/api
```

Створіть `.env`:

```bash
nano .env
```

Приклад production-конфігу:

```env
PORT=5000
CLIENT_URL=https://your-domain.example

BRANCH_SLUG=default

DB_HOST=127.0.0.1
DB_PORT=3306
DB_NAME=auth
DB_USER=jwt_auth
DB_PASSWORD=REPLACE_WITH_STRONG_DB_PASSWORD
DB_CHARSET=utf8mb4
DB_CONNECTION_LIMIT=10
DB_QUEUE_LIMIT=0

ACCESS_TOKEN_SECRET=REPLACE_WITH_LONG_RANDOM_ACCESS_SECRET
REFRESH_TOKEN_SECRET=REPLACE_WITH_LONG_RANDOM_REFRESH_SECRET

SMTP_HOST=mail.example.com
SMTP_USER=documents@example.com
SMTP_PASS=REPLACE_WITH_SMTP_PASSWORD

ROCKET_URL=https://chat.example.com
ROCKET_USER_ID=REPLACE_WITH_ROCKET_USER_ID
ROCKET_TOKEN=REPLACE_WITH_ROCKET_TOKEN

IMPORT_DIR=/var/lib/jwt-auth/imports

BOOTSTRAP_ADMIN_LOGIN=admin
BOOTSTRAP_ADMIN_PASSWORD=ChangeMe123!
BOOTSTRAP_ADMIN_DISPLAY_NAME=Адміністратор
BOOTSTRAP_ADMIN_BRANCH_ID=1
```

### Пояснення важливих змінних

#### `CLIENT_URL`

Це адреса frontend у браузері.

Приклади:

- `http://SERVER_IP`
- `https://your-domain.example`

#### `BRANCH_SLUG`

Якщо у вас більше однієї активної філії, scheduler повинен знати, для якої філії запускати фонові branch-dependent задачі.

Найбезпечніший варіант:

```env
BRANCH_SLUG=default
```

#### `IMPORT_DIR`

Дуже рекомендується не зберігати імпортні файли в `client/public/Sorce` у production.

Краще використовувати окремий серверний каталог:

```bash
sudo mkdir -p /var/lib/jwt-auth/imports
sudo chown -R $USER:$USER /var/lib/jwt-auth
```

Якщо в майбутньому ви будете використовувати окремі підкаталоги по філіях, backend це підтримує.

---

## 12. Створення користувача MySQL і БД

Зайдіть у MySQL:

```bash
sudo mysql
```

Створіть окремого користувача:

```sql
CREATE DATABASE IF NOT EXISTS auth CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS 'jwt_auth'@'localhost' IDENTIFIED BY 'REPLACE_WITH_STRONG_DB_PASSWORD';
GRANT ALL PRIVILEGES ON auth.* TO 'jwt_auth'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```

Після цього переконайтесь, що `DB_USER` і `DB_PASSWORD` у `.env` збігаються з цими значеннями.

---

## 13. Перший запуск діагностики

Перед будь-яким bootstrap-запуском виконайте:

```bash
cd /var/www/jwt-auth/api
npm run bootstrap:doctor
```

Що дивитися у відповіді:

- `[ok] required env`
- `[ok] mysql server connection`
- `[ok] database auth exists`

Можливі сценарії:

### Сценарій A: doctor показує, що БД існує, але таблиць майже немає

Це нормально для чистого сервера.

Далі запускайте:

```bash
npm run bootstrap:env
```

### Сценарій B: doctor попереджає, що бракує legacy runtime tables

Це важливо.

Це означає, що поточні міграції не покривають усю стару схему, і для повного запуску вам, ймовірно, доведеться імпортувати legacy SQL-дамп.

---

## 14. Bootstrap бази та default admin

Запуск:

```bash
cd /var/www/jwt-auth/api
npm run bootstrap:env
```

Що робить цей скрипт:

- створює БД, якщо вона ще не існує
- запускає поточні міграції
- пробує створити default admin
- попереджає про відсутні legacy-таблиці

### Default admin

За замовчуванням:

- логін: `admin`
- пароль: `ChangeMe123!`

Після першого входу пароль треба змінити одразу.

---

## 15. Якщо бракує legacy-таблиць

Якщо після `bootstrap:env` або `bootstrap:doctor` ви бачите попередження на кшталт:

- missing legacy tables
- users table missing
- sales_reports table missing

це означає:

- branch-config шар уже створений
- але legacy runtime schema ще не повна

У такому випадку алгоритм такий:

1. отримайте legacy SQL-дамп або схему від поточного production/staging джерела
2. імпортуйте її в БД `auth`
3. знову запустіть:

```bash
npm run bootstrap:env
npm run bootstrap:doctor
```

Поки повна legacy-схема не перенесена в кодові міграції, це нормальний і очікуваний крок.

---

## 16. Збірка frontend

Переходимо:

```bash
cd /var/www/jwt-auth/client
```

Збірка:

```bash
npm run build
```

Після цього production-файли будуть у:

```bash
/var/www/jwt-auth/client/dist
```

---

## 17. Запуск backend через PM2

Переходимо:

```bash
cd /var/www/jwt-auth/api
```

Запускаємо:

```bash
pm2 start server.js --name jwt-auth-api
```

Перевірка:

```bash
pm2 status
pm2 logs jwt-auth-api
```

Щоб PM2 переживав перезавантаження сервера:

```bash
pm2 startup
```

PM2 покаже команду, яку треба виконати через `sudo`. Виконайте її.

Потім збережіть конфіг:

```bash
pm2 save
```

---

## 18. Налаштування Nginx

Створіть конфіг:

```bash
sudo nano /etc/nginx/sites-available/jwt-auth
```

Приклад:

```nginx
server {
    listen 80;
    server_name your-domain.example;

    root /var/www/jwt-auth/client/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:5000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Якщо працюєте без домену, тимчасово можна вказати:

```nginx
server_name _;
```

Увімкніть сайт:

```bash
sudo ln -s /etc/nginx/sites-available/jwt-auth /etc/nginx/sites-enabled/jwt-auth
```

За бажанням вимкніть дефолтний сайт:

```bash
sudo rm -f /etc/nginx/sites-enabled/default
```

Перевірте конфіг:

```bash
sudo nginx -t
```

Перезапустіть Nginx:

```bash
sudo systemctl reload nginx
```

---

## 19. Перевірка backend health

З сервера:

```bash
curl http://127.0.0.1:5000/api/health
```

Очікувано:

```json
{"status":"ok", ...}
```

З браузера або локальної машини:

```bash
curl http://YOUR_SERVER_IP/api/health
```

або

```bash
curl https://your-domain.example/api/health
```

---

## 20. Перевірка сайту в браузері

Відкрийте:

- `http://YOUR_SERVER_IP`
- або `https://your-domain.example`

Що перевірити:

1. відкривається frontend
2. форма входу видима
3. входить `admin / ChangeMe123!`
4. після входу відкривається адмінка
5. можна змінити пароль
6. у `Конфігурація` не падають вкладки
7. `Планувальник` не показує критичних помилок

---

## 21. Що зробити одразу після першого успішного входу

Обов'язково:

1. змініть default admin password
2. створіть окремого production-admin користувача
3. якщо треба, обмежте доступ до root-admin
4. перевірте:
   - активні філії
   - міста
   - сторінки залишків
   - звіти
   - import sources
   - scheduler

---

## 22. Налаштування HTTPS

Якщо у вас є домен, дуже бажано увімкнути HTTPS через Let's Encrypt.

Встановіть certbot:

```bash
sudo apt install -y certbot python3-certbot-nginx
```

Запуск:

```bash
sudo certbot --nginx -d your-domain.example
```

Після цього certbot сам оновить Nginx-конфіг.

Перевірка автооновлення сертифіката:

```bash
sudo certbot renew --dry-run
```

---

## 23. Корисні команди для супроводу

### Логи backend

```bash
pm2 logs jwt-auth-api
```

### Статус процесів PM2

```bash
pm2 status
```

### Перезапуск backend

```bash
pm2 restart jwt-auth-api
```

### Перезбірка frontend після оновлення коду

```bash
cd /var/www/jwt-auth/client
npm install
npm run build
```

### Оновлення backend після змін

```bash
cd /var/www/jwt-auth/api
npm install
pm2 restart jwt-auth-api
```

### Повторна діагностика після змін

```bash
cd /var/www/jwt-auth/api
npm run bootstrap:doctor
```

---

## 24. Рекомендований порядок оновлення проєкту на сервері

Якщо ви вже розгорнули проєкт і хочете оновити код:

1. зробіть backup БД
2. оновіть код:

```bash
cd /var/www/jwt-auth
git pull
```

3. оновіть backend-залежності:

```bash
cd /var/www/jwt-auth/api
npm install
```

4. оновіть frontend-залежності:

```bash
cd /var/www/jwt-auth/client
npm install
```

5. перевірте стан:

```bash
cd /var/www/jwt-auth/api
npm run bootstrap:doctor
```

6. якщо є нові міграції:

```bash
npm run migrate
```

7. пересоберіть frontend:

```bash
cd /var/www/jwt-auth/client
npm run build
```

8. перезапустіть backend:

```bash
pm2 restart jwt-auth-api
```

---

## 25. Типові проблеми та що робити

### Проблема: сайт відкривається, але API не працює

Перевірте:

- `pm2 status`
- `pm2 logs jwt-auth-api`
- `curl http://127.0.0.1:5000/api/health`
- `sudo nginx -t`

### Проблема: CORS-помилки в браузері

Найчастіше винен `CLIENT_URL` у `api/.env`.

Він повинен точно збігатися з реальною адресою frontend.

Наприклад:

```env
CLIENT_URL=https://your-domain.example
```

Після зміни:

```bash
pm2 restart jwt-auth-api
```

### Проблема: scheduler пише, що є кілька активних branch

Треба задати:

```env
BRANCH_SLUG=default
```

або:

```env
BRANCH_ID=1
```

Після цього перезапустити backend.

### Проблема: `bootstrap:doctor` каже, що бракує legacy tables

Це не баг doctor-а.

Це означає, що вам реально потрібна або:

- legacy base schema
- або подальше винесення старих таблиць у кодові міграції

### Проблема: admin не створився

Перевірте:

- існує таблиця `users`
- у неї є колонки:
  - `name`
  - `password`
  - `role`
- якщо є `branch_id` і `city`, то в БД уже повинні бути створені `branches` і `cities`

---

## 26. Короткий чекліст успішного production deploy

Успішне розгортання виглядає так:

- сервер оновлений
- Node.js встановлений
- MySQL встановлений
- Nginx встановлений
- PM2 встановлений
- код проєкту завантажений
- `.env` налаштований
- `npm install` пройшов у `api` і `client`
- `npm run bootstrap:doctor` виконується без критичних помилок
- `npm run bootstrap:env` відпрацював
- якщо треба, legacy schema імпортована
- `npm run build` для client пройшов
- backend працює через PM2
- frontend віддається через Nginx
- `/api/health` відповідає `status=ok`
- admin може увійти

---

## 27. Найкращий практичний сценарій для цього проєкту зараз

На сьогодні найбезпечніший реальний сценарій такий:

1. розгорнути сервер
2. налаштувати `.env`
3. створити БД і MySQL-користувача
4. виконати `npm run bootstrap:doctor`
5. виконати `npm run bootstrap:env`
6. якщо не вистачає legacy schema — імпортувати її
7. знову виконати `bootstrap:doctor`
8. зібрати frontend
9. запустити backend через PM2
10. налаштувати Nginx
11. увійти під admin
12. змінити пароль

Це зараз найбільш чесний і практичний шлях.
