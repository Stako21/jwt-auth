# Быстрое обновление PM2 — ubuntuserv

Для очередного обновления уже настроенного `branches-config`. Проверенный порядок от 01.11.2026: `balance.roshen.zp.ua`, PM2 `jwt-auth-api`, MySQL `auth`, импорты `/var/www/data/excel`, frontend `/var/www/apps/jwt-auth/client/dist`.

Выполнять блоки по порядку в одной интерактивной SSH-сессии пользователя `stako`. Каждый блок заканчивается `... OK`. При ошибке или отсутствии этой отметки **остановиться и прислать вывод**, не выполнять следующий блок. До шага 4 API продолжает работать. Каталог резервной копии сохраняется после обновления.

## 1. Версия, исходное состояние и резервные копии

Заменить `RELEASE_SHA` на согласованный **полный SHA** нового релиза. В примере — уже установленный `f41c7e1`; повторный запуск с ним не установит более новую версию. Для Docker и PM2 выбирать один SHA.

`APPROVED_MIGRATIONS` содержит согласованные миграции. Для установленного `f41c7e1` ожидается пустой pending-список. Если будущий релиз добавляет миграции, сначала проверить их назначение и включить точные имена в этот список. Не разрешать неизвестные миграции автоматически.

```bash
export APP_DIR="/var/www/apps/jwt-auth"
export SITE_URL="https://balance.roshen.zp.ua"
export RELEASE_SHA="f41c7e15619614747dc7984728681a0c7360045c"
export APPROVED_MIGRATIONS="031_tro_1c_execution_documents.js 032_notification_event_settings.js 033_tro_status_sync_requests.js"
export BACKUP_DIR="/var/www/backups/jwt-auth/pm2-$(date +%F-%H%M%S)"
export RELEASE_DIR="$BACKUP_DIR/release"
export FRONTEND_STAGE="$BACKUP_DIR/frontend"
export FRONTEND_DIR="$APP_DIR/client/dist"

# Вспомогательные функции используются последующими блоками.
deploy_log() {
  local logfile="$1"
  shift
  if "$@" > "$BACKUP_DIR/$logfile" 2>&1; then
    if [[ "$logfile" = doctor.log || "$logfile" = preflight.log ]]; then
      cat "$BACKUP_DIR/$logfile"
    else
      tail -n 15 "$BACKUP_DIR/$logfile"
    fi
  else
    tail -n 80 "$BACKUP_DIR/$logfile"
    echo "STOP: $logfile"
    return 1
  fi
}

dump_auth() {
  mysqldump --protocol=TCP --host=127.0.0.1 --port=3306 \
    --user=stako --password --single-transaction \
    --routines --triggers --events --hex-blob --no-tablespaces \
    --set-gtid-purged=OFF --databases auth > "$BACKUP_DIR/$1"
  test -s "$BACKUP_DIR/$1"
  grep -q '^-- Dump completed on ' "$BACKUP_DIR/$1"
  chmod 600 "$BACKUP_DIR/$1"
  ls -lh "$BACKUP_DIR/$1"
}

publish_frontend() {
  test "$(realpath "$FRONTEND_DIR")" = "/var/www/apps/jwt-auth/client/dist"
  test -s "$FRONTEND_STAGE/index.html"
  test -d "$FRONTEND_STAGE/assets"
  sudo rsync -rtp --itemize-changes --chmod=D755,F644 \
    --exclude '/index.html' --exclude '/Sorce/' \
    "$FRONTEND_STAGE/" "$FRONTEND_DIR/"
  while IFS= read -r -d '' asset; do
    relative="${asset#"$FRONTEND_STAGE"/}"
    curl -fsS --max-time 30 "$SITE_URL/$relative" \
      -o "$BACKUP_DIR/asset-check.tmp"
    cmp -s "$asset" "$BACKUP_DIR/asset-check.tmp"
  done < <(find "$FRONTEND_STAGE/assets" -type f -print0)
  sudo install -m 0644 "$FRONTEND_STAGE/index.html" "$FRONTEND_DIR/.index.deploy.tmp"
  sudo mv -f -- "$FRONTEND_DIR/.index.deploy.tmp" "$FRONTEND_DIR/index.html"
  curl -fsS --max-time 20 -H 'Cache-Control: no-cache' \
    "$SITE_URL/?release=$RELEASE_SHA" -o "$BACKUP_DIR/served-index.html"
  cmp -s "$FRONTEND_STAGE/index.html" "$BACKUP_DIR/served-index.html"
  sha256sum "$FRONTEND_STAGE/index.html" "$BACKUP_DIR/served-index.html"
}

(
  set -Eeuo pipefail
  trap 'echo "STOP: step 1"' ERR
  test "$(hostname)" = "ubuntuserv"
  [[ "$RELEASE_SHA" =~ ^[0-9a-f]{40}$ ]]
  command -v rsync
  node --version
  npm --version
  pm2 status
  df -h "$APP_DIR" /var/www/data/excel
  curl -fsS --max-time 20 "$SITE_URL/api/health"
  echo
  umask 077
  sudo install -d -m 0700 -o "$(id -un)" -g "$(id -gn)" "$BACKUP_DIR"
  cd "$APP_DIR"
  test "$(git branch --show-current)" = "branches-config"
  git status --short --branch
  unexpected="$(git status --porcelain | sed '/^ M client\/dist\/Sorce\/[^/]*\.xlsx$/d')"
  test -z "$unexpected"
  git rev-parse HEAD > "$BACKUP_DIR/previous-sha.txt"
  git diff --binary > "$BACKUP_DIR/working-tree.patch"
  pm2 jlist > "$BACKUP_DIR/pm2-before.json"
  if test -f "$HOME/.pm2/dump.pm2"; then
    install -m 0600 "$HOME/.pm2/dump.pm2" "$BACKUP_DIR/dump.pm2.before"
  fi
  for folder in . api client; do
    mkdir -p "$BACKUP_DIR/config/$folder"
    for config in "$APP_DIR/$folder"/.env*; do
      test -f "$config" || continue
      install -m 0600 "$config" "$BACKUP_DIR/config/$folder/$(basename "$config")"
    done
  done
  test -s "$BACKUP_DIR/config/api/.env"
  tar -czf "$BACKUP_DIR/frontend.tar.gz" -C "$FRONTEND_DIR" .
  tar -czf "$BACKUP_DIR/public-Sorce.tar.gz" -C "$APP_DIR/client/public" Sorce
  tar -czf "$BACKUP_DIR/imports.tar.gz" -C /var/www/data excel
  sudo tar -czf - -C /etc nginx > "$BACKUP_DIR/nginx-conf.tar.gz"
  for archive in "$BACKUP_DIR"/*.tar.gz; do gzip -t "$archive"; done
  echo "BACKUP_DIR=$BACKUP_DIR"
  echo "STEP 1 OK"
)
```

Допустимы только обычные незакоммиченные изменения XLSX в `client/dist/Sorce`; они сохраняются и остаются на месте. При других изменениях рабочего дерева остановиться. Не запускать `git reset --hard`, `git restore` или автоматический stash.

## 2. Подготовка и тесты без остановки API

```bash
(
  set -Eeuo pipefail
  trap 'echo "STOP: step 2"' ERR
  umask 022
  cd "$APP_DIR"
  git fetch origin branches-config
  git cat-file -e "${RELEASE_SHA}^{commit}"
  git merge-base --is-ancestor HEAD "$RELEASE_SHA"
  git merge-base --is-ancestor "$RELEASE_SHA" origin/branches-config
  git diff --quiet HEAD "$RELEASE_SHA" -- client/dist client/public/Sorce
  git show -s --format='%H %cI %s' "$RELEASE_SHA"
  mkdir -p "$RELEASE_DIR" "$FRONTEND_STAGE"
  git archive --format=tar --output="$BACKUP_DIR/source.tar" "$RELEASE_SHA"
  tar -xf "$BACKUP_DIR/source.tar" -C "$RELEASE_DIR"

  export CHROME_PATH="$(cd "$APP_DIR/api" && node --input-type=commonjs -e \
    'require("dotenv").config({quiet:true}); process.stdout.write(process.env.PUPPETEER_EXECUTABLE_PATH || "")')"
  test -x "$CHROME_PATH"
  "$CHROME_PATH" --version

  cd "$RELEASE_DIR/api"
  deploy_log backend-install.log env PUPPETEER_SKIP_DOWNLOAD=true npm ci
  deploy_log backend-tests.log env DB_HOST=127.0.0.1 DB_PORT=9 \
    DB_NAME=unit_test DB_USER=unit_test DB_PASSWORD=unit_test \
    node --test --test-concurrency=1 tests/*.test.js
  install -m 0600 "$APP_DIR/api/.env" "$RELEASE_DIR/api/.env"
  for config in "$APP_DIR/client"/.env*; do
    test -f "$config" || continue
    install -m 0600 "$config" "$RELEASE_DIR/client/$(basename "$config")"
  done
  cd "$RELEASE_DIR/client"
  deploy_log frontend-install.log npm ci
  deploy_log frontend-lint.log npm run lint
  deploy_log frontend-build.log npm run build -- --outDir "$FRONTEND_STAGE" --emptyOutDir
  test -s "$FRONTEND_STAGE/index.html"
  find "$FRONTEND_STAGE" -type d -exec chmod 755 {} +
  find "$FRONTEND_STAGE" -type f -exec chmod 644 {} +
  echo "STEP 2 OK"
)
```

Сборка выполняется в закрытом backup-каталоге, зависимости работающего API не меняются. Для релиза `f41c7e1` ожидается 179 успешных тестов; число может измениться в следующем релизе. Предупреждения Sass legacy API и размера bundle сами по себе не означают ошибку сборки.

## 3. Проверить целевую БД и разрешённые миграции

```bash
cat > "$BACKUP_DIR/preflight.cjs" <<'NODE'
const fs = require("node:fs");
const pool = require("./db.cjs");
(async () => {
  try {
    const [[identity]] = await pool.query("SELECT DATABASE() AS db, @@hostname AS server");
    const [rows] = await pool.query("SELECT name FROM schema_migrations ORDER BY name");
    const files = fs.readdirSync("./migrations").filter(x => x.endsWith(".js")).sort();
    const applied = new Set(rows.map(row => row.name));
    const pending = files.filter(name => !applied.has(name));
    const approved = new Set((process.env.APPROVED_MIGRATIONS || "").split(/\s+/));
    console.log(JSON.stringify({identity, host: process.env.DB_HOST, pending}, null, 2));
    if (identity.db !== "auth" || identity.server !== "ubuntuserv" ||
        process.env.DB_HOST !== "localhost" || !files.length ||
        rows.some(row => !files.includes(row.name)) ||
        pending.some(name => !approved.has(name))) throw new Error("UNEXPECTED_DATABASE_OR_MIGRATIONS");
    console.log("PREFLIGHT OK");
  } catch (error) {
    console.error(error.code || error.message);
    process.exitCode = 1;
  } finally { await pool.end(); }
})();
NODE

(
  set -Eeuo pipefail
  trap 'echo "STOP: step 3"' ERR
  cd "$RELEASE_DIR/api"
  deploy_log preflight.log node --input-type=commonjs < "$BACKUP_DIR/preflight.cjs"
  echo "STEP 3 OK"
)
```

В выводе должны быть `auth`, `ubuntuserv`, `localhost` и только согласованные миграции. До остановки API просмотреть этот вывод.

## 4. Остановить API, сделать свежий дамп и переключить backend

Начинается downtime API. При запросе `Enter password` вводить пароль **MySQL stako**, не sudo. Не скрывать интерактивный запрос перенаправлением всего блока в файл.

```bash
(
  set -Eeuo pipefail
  trap 'echo "STOP: step 4; API may be stopped — send output"' ERR
  cd "$APP_DIR"
  test "$(git rev-parse HEAD)" = "$(cat "$BACKUP_DIR/previous-sha.txt")"
  cmp -s "$APP_DIR/api/.env" "$BACKUP_DIR/config/api/.env"
  test -d "$RELEASE_DIR/api/node_modules"
  test -d "$APP_DIR/api/node_modules"
  test ! -e "$BACKUP_DIR/api-node_modules-before"
  test -s "$FRONTEND_STAGE/index.html"
  pm2 stop jwt-auth-api
  pm2 jlist | node -e '
    let s=""; process.stdin.on("data", x => s += x);
    process.stdin.on("end", () => {
      const p=JSON.parse(s).find(x => x.name === "jwt-auth-api");
      if (!p || p.pm2_env.status !== "stopped") process.exitCode=1;
    });'
  umask 077
  dump_auth auth-before-migrations.sql
  umask 022
  git merge --ff-only "$RELEASE_SHA"
  test "$(git rev-parse HEAD)" = "$RELEASE_SHA"
  cmp -s "$APP_DIR/api/.env" "$BACKUP_DIR/config/api/.env"
  mv -- "$APP_DIR/api/node_modules" "$BACKUP_DIR/api-node_modules-before"
  mv -- "$RELEASE_DIR/api/node_modules" "$APP_DIR/api/node_modules"
  cd "$APP_DIR/api"
  deploy_log migrations.log npm run migrate
  pm2 restart jwt-auth-api --update-env
  ready=0
  for attempt in $(seq 1 10); do
    if curl -fsS --max-time 3 http://127.0.0.1:5000/api/health \
      > "$BACKUP_DIR/health.json" 2> "$BACKUP_DIR/health-error.log"; then
      ready=1
      break
    fi
    sleep 2
  done
  test "$ready" = 1
  cat "$BACKUP_DIR/health.json"
  echo
  pm2 status
  echo "STEP 4 OK"
)
```

Дамп сделан до изменения схемы. Если пароль неверный или миграция завершилась ошибкой, API останется остановленным: сначала прислать ошибку. Не восстанавливать дамп автоматически и не повторять перемещение `node_modules` вслепую.

## 5. Опубликовать frontend и проверить

Функция проверяет каждый новый asset через HTTPS до замены HTML. `Sorce` и старые assets сохраняются. Перезагрузка Nginx не нужна.

```bash
(
  set -Eeuo pipefail
  trap 'echo "STOP: step 5"' ERR
  publish_frontend
  curl -fsS --max-time 20 "$SITE_URL/api/health"
  echo
  pm2 save
  cd "$APP_DIR/api"
  deploy_log doctor.log npm run bootstrap:doctor
  cd "$APP_DIR"
  git rev-parse HEAD
  git status --short --branch
  pm2 status
  echo "STEP 5 OK — review doctor output and check browser"
)
```

`doctor` должен показать `pending migrations — none`. Его exit code 0 **не гарантирует отсутствие `[fail]`**: проверить текст. Известны два ложных сообщения: `scheduler_tasks.id` (ключ — `task_key`) и `users.name/password` (реальные имена — `NAME/PASSWORD`). Они сами по себе не требуют изменения БД или отката. Другие `[fail]` требуют разбора.

После Ctrl+F5 проверить вход, `Дії з документами` (период с существующими документами), открытие ТРО, остатки/PDF, Debet и настройки уведомлений. Реальные отмены документов и тестовые отправки для этой проверки не нужны. Завершение deployment подтверждать после браузера.

## Если возникла ошибка — что прислать

Прислать номер шага, текст ошибки и безопасный контекст:

```bash
hostname
date
echo "RELEASE_SHA=$RELEASE_SHA"
echo "BACKUP_DIR=$BACKUP_DIR"
git -C "$APP_DIR" rev-parse HEAD
git -C "$APP_DIR" status --short --branch
pm2 status
df -h "$APP_DIR"
```

| Где ошибка | Дополнительно прислать |
| --- | --- |
| Git / рабочее дерево | Полный вывод неудачной Git-команды; имена изменённых файлов. Не применять reset/restore. |
| Установка / тесты / сборка | `tail -n 80 "$BACKUP_DIR/backend-install.log"` или `backend-tests.log`, `frontend-install.log`, `frontend-lint.log`, `frontend-build.log` — файл соответствующего шага. |
| Preflight | `cat "$BACKUP_DIR/preflight.log"`. При неизвестных миграциях сначала согласовать список. |
| Дамп | Сообщение `mysqldump` и `ls -lh "$BACKUP_DIR/auth-before-migrations.sql"`. При 1045 проверить пароль; файл не считать backup до проверки завершения. |
| Миграции | `tail -n 100 "$BACKUP_DIR/migrations.log"`. API не запускать до выяснения результата. |
| API / PM2 | `cat "$BACKUP_DIR/health-error.log"`, результаты локального/внешнего health и `pm2 logs jwt-auth-api --lines 80 --nostream`. |
| Frontend / HTTPS / cmp | Вывод блока, URL с ошибкой и `curl -I --max-time 20` этого URL; `ls -ld "$FRONTEND_DIR" "$FRONTEND_DIR/assets"`. |
| Doctor / браузер / PDF | `cat "$BACKUP_DIR/doctor.log"`; страница, действие, сообщение ошибки и время. Для PDF — также Chrome path/version. |

Перед отправкой логов просмотреть их и скрыть секреты. **Не присылать `.env*`, `pm2-before.json`, `dump.pm2.before`, SQL-дампы, Authorization/Cookie и пароли.** Не отправлять полный `pm2 env`, `pm2 jlist` или конфигурацию с секретами.

## Откат при необходимости

Для релиза с аддитивными миграциями 031–033 возможен возврат к предыдущему коду. Для будущего релиза сначала подтвердить совместимость старого API с новой схемой. БД автоматически не восстанавливать: это потеряет записи после дампа.

На шагах 1–3 рабочий API не меняется; сначала исправить ошибку подготовки. Следующий блок предназначен для возврата после начала переключения, после разбора ошибки, в той же SSH-сессии:

```bash
(
  set -Eeuo pipefail
  trap 'echo "STOP: rollback interrupted"' ERR
  pm2 stop jwt-auth-api
  cd "$APP_DIR"
  git switch --detach "$(cat "$BACKUP_DIR/previous-sha.txt")"
  if test -d "$BACKUP_DIR/api-node_modules-before"; then
    test ! -e "$BACKUP_DIR/api-node_modules-failed"
    if test -d "$APP_DIR/api/node_modules"; then
      mv -- "$APP_DIR/api/node_modules" "$BACKUP_DIR/api-node_modules-failed"
    fi
    mv -- "$BACKUP_DIR/api-node_modules-before" "$APP_DIR/api/node_modules"
  fi
  pm2 restart jwt-auth-api --update-env
  mkdir -p "$BACKUP_DIR/frontend-rollback"
  tar -xzf "$BACKUP_DIR/frontend.tar.gz" -C "$BACKUP_DIR/frontend-rollback"
  export FRONTEND_STAGE="$BACKUP_DIR/frontend-rollback"
  publish_frontend
  curl -fsS --retry 5 --retry-connrefused --retry-delay 2 --max-time 10 "$SITE_URL/api/health"
  echo
  pm2 save
  echo "ROLLBACK OK — check browser"
)
```

Рабочая копия после отката находится в detached HEAD. Это видно в `git status`; перед следующим обновлением нужно отдельно вернуть ветку к согласованному состоянию. Резервные копии и старые зависимости не удалять до подтверждения стабильной работы.
