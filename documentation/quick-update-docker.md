# Быстрое обновление Docker — ubserv

Для очередного обновления уже настроенного `branches-config`. Проверенный порядок от 01.11.2026: `balance.sweetglobal.com.ua`, контейнеры `jwt-auth-api`, `jwt-auth-mysql`, `rocketchat-nginx-1`. Это не инструкция первоначального перехода с `resbr6`.

Выполнять блоки по порядку в одной интерактивной SSH-сессии пользователя `stako`. Каждый блок заканчивается `... OK`. При ошибке или отсутствии отметки **остановиться и прислать вывод**, не выполнять следующий блок. До шага 4 API продолжает работать.

Особенности сервера: Git находится в `/var/www/apps/jwt-auth`, Docker собирается из отдельного `/var/www/apps/jwt-auth-docker/app`. Nginx раздаёт `/home/stako/rocketchat/nginx/html/balance` через bind mount в `/usr/share/nginx/html/balance`. Публиковать файлы внутри этого каталога; не переименовывать и не заменять сам каталог. Импорты `/var/www/data/excel` и `Sorce` сохраняются.

## 1. Версия, исходное состояние и резервные копии

Заменить `RELEASE_SHA` на согласованный **полный SHA** нового релиза. В примере — уже установленный `f41c7e1`; повторный запуск с ним не установит более новую версию. Для Docker и PM2 выбирать один SHA.

`APPROVED_MIGRATIONS` содержит согласованные миграции. На установленном `f41c7e1` ожидается пустой pending-список. Для будущих миграций сначала проверить назначение и добавить точные имена в список. Не разрешать неизвестные миграции автоматически.

```bash
export APP_DIR="/var/www/apps/jwt-auth"
export DOCKER_DIR="/var/www/apps/jwt-auth-docker"
export FRONTEND_DIR="/home/stako/rocketchat/nginx/html/balance"
export SITE_URL="https://balance.sweetglobal.com.ua"
export RELEASE_SHA="f41c7e15619614747dc7984728681a0c7360045c"
export APPROVED_MIGRATIONS="031_tro_1c_execution_documents.js 032_notification_event_settings.js 033_tro_status_sync_requests.js"
export BACKUP_DIR="/var/www/backups/jwt-auth/docker-$(date +%F-%H%M%S)"
export RELEASE_DIR="$BACKUP_DIR/release"
export FRONTEND_STAGE="$BACKUP_DIR/frontend"
export COMPOSE_API_IMAGE="jwt-auth-docker-jwt-auth-api:latest"
export RELEASE_IMAGE="jwt-auth-api-release:${RELEASE_SHA:0:12}"
export ROLLBACK_IMAGE="jwt-auth-api-rollback:$(date +%Y%m%d-%H%M%S)"

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
  docker exec jwt-auth-mysql sh -eu -c '
    if [ -n "${MYSQL_ROOT_PASSWORD:-}" ]; then
      export MYSQL_PWD="$MYSQL_ROOT_PASSWORD"
    elif [ -n "${MYSQL_ROOT_PASSWORD_FILE:-}" ] && [ -r "$MYSQL_ROOT_PASSWORD_FILE" ]; then
      MYSQL_PWD="$(cat "$MYSQL_ROOT_PASSWORD_FILE")"
      export MYSQL_PWD
    else
      echo "Root credential unavailable; stop and use approved backup credentials" >&2
      exit 1
    fi
    exec mysqldump --user=root --protocol=socket --single-transaction \
      --routines --triggers --events --hex-blob --no-tablespaces \
      --set-gtid-purged=OFF --databases auth
  ' > "$BACKUP_DIR/$1"
  test -s "$BACKUP_DIR/$1"
  grep -q '^-- Dump completed on ' "$BACKUP_DIR/$1"
  chmod 600 "$BACKUP_DIR/$1"
  ls -lh "$BACKUP_DIR/$1"
}

publish_frontend() {
  test "$(realpath "$FRONTEND_DIR")" = "/home/stako/rocketchat/nginx/html/balance"
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
  test "$(hostname)" = "ubserv"
  [[ "$RELEASE_SHA" =~ ^[0-9a-f]{40}$ ]]
  command -v rsync
  docker compose version
  df -h "$APP_DIR" "$DOCKER_DIR" /var/www/data/excel "$FRONTEND_DIR"
  docker system df
  cd "$DOCKER_DIR"
  docker compose ps
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
  for folder in . api client; do
    mkdir -p "$BACKUP_DIR/config/$folder"
    for config in "$APP_DIR/$folder"/.env*; do
      test -f "$config" || continue
      install -m 0600 "$config" "$BACKUP_DIR/config/$folder/$(basename "$config")"
    done
  done
  test -s "$BACKUP_DIR/config/.env"
  install -m 0600 "$DOCKER_DIR/docker-compose.yml" "$BACKUP_DIR/docker-compose.yml"
  install -m 0600 "$DOCKER_DIR/Dockerfile" "$BACKUP_DIR/Dockerfile"
  for name in .env .dockerignore; do
    if test -f "$DOCKER_DIR/$name"; then
      install -m 0600 "$DOCKER_DIR/$name" "$BACKUP_DIR/docker-${name#.}"
    fi
  done
  docker inspect jwt-auth-api --format '{{.Image}}' > "$BACKUP_DIR/api-image-id.txt"
  docker image tag "$(cat "$BACKUP_DIR/api-image-id.txt")" "$ROLLBACK_IMAGE"
  printf '%s\n' "$ROLLBACK_IMAGE" > "$BACKUP_DIR/api-rollback-image.txt"
  tar -czf "$BACKUP_DIR/frontend.tar.gz" -C "$FRONTEND_DIR" .
  tar -czf "$BACKUP_DIR/repository-dist.tar.gz" -C "$APP_DIR/client" dist
  tar -czf "$BACKUP_DIR/public-Sorce.tar.gz" -C "$APP_DIR/client/public" Sorce
  tar -czf "$BACKUP_DIR/imports.tar.gz" -C /var/www/data excel
  tar -czf "$BACKUP_DIR/nginx-conf.tar.gz" -C /home/stako/rocketchat/nginx conf.d
  for archive in "$BACKUP_DIR"/*.tar.gz; do gzip -t "$archive"; done
  echo "BACKUP_DIR=$BACKUP_DIR"
  echo "STEP 1 OK"
)
```

На обновлении 01.11.2026 после сборки оставалось около 6,4 ГБ свободного места. Перед следующим обновлением оценить место под новый образ, npm и дамп; при сомнении прислать `df -h` и `docker system df`. Не применять blanket prune, не удалять volumes, работающие образы или предыдущий rollback-образ.

Допустимы только обычные локальные изменения XLSX в `client/dist/Sorce`; они сохраняются. При других изменениях рабочего дерева остановиться. Не выполнять reset/restore/stash автоматически.

## 2. Подготовить код, образ и frontend без остановки API

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
  for config in "$APP_DIR/client"/.env*; do
    test -f "$config" || continue
    install -m 0600 "$config" "$RELEASE_DIR/client/$(basename "$config")"
  done

  test "$(realpath "$DOCKER_DIR/app")" = "/var/www/apps/jwt-auth-docker/app"
  rsync -a --delete --exclude='.git/' --exclude='node_modules/' \
    --exclude='.env*' --exclude='*.env' \
    --exclude='/client/dist/' --exclude='/client/public/Sorce/' \
    "$RELEASE_DIR/" "$DOCKER_DIR/app/"

  cat > "$DOCKER_DIR/.dockerignore" <<'IGNORE'
*
!Dockerfile
!app/
!app/**
app/.git
app/**/node_modules
app/.env*
app/**/.env*
app/**/*.env
app/client/dist
app/client/public/Sorce
app/**/.vite
app/**/*.log
IGNORE

  cd "$DOCKER_DIR"
  deploy_log image-build.log docker compose build jwt-auth-api
  docker image tag "$COMPOSE_API_IMAGE" "$RELEASE_IMAGE"
  docker image inspect "$RELEASE_IMAGE" --format '{{.Id}}' > "$BACKUP_DIR/new-image-id.txt"
  docker run --rm --network none --entrypoint node "$RELEASE_IMAGE" -e '
    const fs=require("node:fs");
    for (const name of ["/app/.env", "/app/api/.env", "/app/client/.env"]) {
      if (fs.existsSync(name)) throw new Error("ENV_EMBEDDED_IN_IMAGE");
    }
    console.log("IMAGE ENV CHECK OK");'
  deploy_log backend-tests.log docker run --rm --network none \
    --env DB_USER=unit_test --env DB_PASSWORD=unit_test \
    --workdir /app/api --entrypoint sh "$RELEASE_IMAGE" \
    -lc 'node --test --test-concurrency=1 tests/*.test.js'

  deploy_log frontend-build.log docker run --rm \
    --user "$(id -u):$(id -g)" \
    --mount "type=bind,source=$RELEASE_DIR/client,target=/workspace" \
    --mount "type=bind,source=$FRONTEND_STAGE,target=/release-output" \
    --workdir /workspace --entrypoint sh node:20 -lc '
      umask 022
      npm ci --cache /tmp/npm-cache &&
      npm run lint &&
      npm run build -- --outDir /release-output --emptyOutDir
    '
  test -s "$FRONTEND_STAGE/index.html"
  find "$FRONTEND_STAGE" -type d -exec chmod 755 {} +
  find "$FRONTEND_STAGE" -type f -exec chmod 644 {} +
  echo "STEP 2 OK"
)
```

`.dockerignore` предотвращает включение production `.env`, зависимостей хоста и бизнес-файлов в образ. Образ проверяется отдельно от работающего контейнера. Для `f41c7e1` ожидается 179 успешных тестов; число может измениться в следующем релизе. Предупреждения Sass legacy API и размера bundle сами по себе не означают ошибку сборки.

## 3. Проверить целевую БД и миграции новым образом

Запускается только Node-проверка; сервер и scheduler в одноразовом контейнере не стартуют.

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
    if (identity.db !== "auth" || identity.server !== process.env.EXPECTED_DB_SERVER ||
        process.env.DB_HOST !== "mysql" || !files.length ||
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
  cd "$DOCKER_DIR"
  EXPECTED_DB_SERVER="$(docker inspect jwt-auth-mysql --format '{{.Config.Hostname}}')"
  test -n "$EXPECTED_DB_SERVER"
  deploy_log preflight.log docker compose run --rm --no-deps -T \
    --env "APPROVED_MIGRATIONS=$APPROVED_MIGRATIONS" \
    --env "EXPECTED_DB_SERVER=$EXPECTED_DB_SERVER" \
    --workdir /app/api --entrypoint node jwt-auth-api \
    --input-type=commonjs < "$BACKUP_DIR/preflight.cjs"
  echo "STEP 3 OK"
)
```

Проверить `auth`, host `mysql` и согласованные pending-миграции. Hostname БД автоматически сравнивается с текущим контейнером `jwt-auth-mysql`. На 01.11.2026 он был `abe755a8a4ba`; после пересоздания MySQL может измениться.

## 4. Остановить API, сделать свежий дамп, применить миграции и запустить

Начинается downtime API. MySQL и остальные сервисы не останавливаются. После build не запускать API до миграций.

```bash
(
  set -Eeuo pipefail
  trap 'echo "STOP: step 4; API may be stopped — send output"' ERR
  cd "$APP_DIR"
  test "$(git rev-parse HEAD)" = "$(cat "$BACKUP_DIR/previous-sha.txt")"
  test -s "$FRONTEND_STAGE/index.html"
  cmp -s "$APP_DIR/.env" "$BACKUP_DIR/config/.env"
  cmp -s "$DOCKER_DIR/docker-compose.yml" "$BACKUP_DIR/docker-compose.yml"
  if test -f "$BACKUP_DIR/docker-env"; then
    cmp -s "$DOCKER_DIR/.env" "$BACKUP_DIR/docker-env"
  else
    test ! -f "$DOCKER_DIR/.env"
  fi
  test "$(docker image inspect "$COMPOSE_API_IMAGE" --format '{{.Id}}')" = "$(cat "$BACKUP_DIR/new-image-id.txt")"
  cd "$DOCKER_DIR"
  docker compose stop --timeout 60 jwt-auth-api
  test "$(docker inspect jwt-auth-api --format '{{.State.Running}}')" = false
  umask 077
  dump_auth auth-before-migrations.sql
  umask 022
  cd "$APP_DIR"
  git merge --ff-only "$RELEASE_SHA"
  test "$(git rev-parse HEAD)" = "$RELEASE_SHA"
  cd "$DOCKER_DIR"
  deploy_log migrations.log docker compose run --rm --no-deps -T \
    --workdir /app/api --entrypoint npm jwt-auth-api run migrate
  deploy_log api-start.log docker compose up -d --no-deps --no-build \
    --force-recreate --wait --wait-timeout 120 jwt-auth-api
  test "$(docker inspect jwt-auth-api --format '{{.Image}}')" = "$(cat "$BACKUP_DIR/new-image-id.txt")"
  curl -fsS --max-time 20 "$SITE_URL/api/health"
  echo
  docker compose ps
  echo "STEP 4 OK"
)
```

При ошибке дампа или миграций API остаётся остановленным. Прислать ошибку до следующего действия. Не запускать `docker compose down`, не восстанавливать БД автоматически.

## 5. Опубликовать frontend и проверить

Функция проверяет новые assets по HTTPS до атомарной замены HTML. Старые assets и `Sorce` сохраняются. Перезапуск Nginx не нужен.

```bash
(
  set -Eeuo pipefail
  trap 'echo "STOP: step 5"' ERR
  publish_frontend
  curl -fsS --max-time 20 "$SITE_URL/api/health"
  echo
  deploy_log doctor.log docker exec -w /app/api jwt-auth-api npm run bootstrap:doctor
  git -C "$APP_DIR" rev-parse HEAD
  git -C "$APP_DIR" status --short --branch
  cd "$DOCKER_DIR"
  docker compose ps
  echo "STEP 5 OK — review doctor output and check browser"
)
```

`doctor` должен показать `pending migrations — none`. Exit code 0 **не гарантирует отсутствие `[fail]`**: проверить текст. Два известных ложных сообщения: `scheduler_tasks.id` (ключ — `task_key`) и `users.name/password` (реальные имена — `NAME/PASSWORD`). Они сами по себе не требуют изменения БД или отката. Другие `[fail]` требуют разбора.

После Ctrl+F5 проверить вход, `Дії з документами` (период с существующими документами), открытие ТРО, остатки/PDF, Debet и настройки уведомлений. Реальные отмены документов и тестовые отправки для этой проверки не нужны. Deployment завершён после подтверждения браузера.

## Если возникла ошибка — что прислать

Прислать номер шага, текст ошибки и безопасный контекст:

```bash
hostname
date
echo "RELEASE_SHA=$RELEASE_SHA"
echo "BACKUP_DIR=$BACKUP_DIR"
git -C "$APP_DIR" rev-parse HEAD
git -C "$APP_DIR" status --short --branch
docker compose -f "$DOCKER_DIR/docker-compose.yml" ps
df -h "$DOCKER_DIR"
docker system df
```

| Где ошибка | Дополнительно прислать |
| --- | --- |
| Git / рабочее дерево | Вывод неудачной команды и имена изменённых файлов. Не применять reset/restore. |
| Образ / тесты / frontend | `tail -n 80 "$BACKUP_DIR/image-build.log"` или `backend-tests.log`, `frontend-build.log` — файл соответствующего шага. |
| Preflight | `cat "$BACKUP_DIR/preflight.log"`; неожиданные миграции сначала согласовать. |
| Дамп | Сообщение `mysqldump` и `ls -lh "$BACKUP_DIR/auth-before-migrations.sql"`. Не отправлять сам SQL. |
| Миграции | `tail -n 100 "$BACKUP_DIR/migrations.log"`. API не запускать до выяснения результата. |
| API / unhealthy | `tail -n 80 "$BACKUP_DIR/api-start.log"`, `docker inspect jwt-auth-api --format '{{json .State}}'`, `docker logs --since 10m --tail 80 jwt-auth-api` и результат внешнего health. |
| Frontend / HTTPS / cmp | Вывод блока, URL с ошибкой и `curl -I --max-time 20` этого URL; `ls -ld "$FRONTEND_DIR" "$FRONTEND_DIR/assets"`. |
| Doctor / браузер / PDF | `cat "$BACKUP_DIR/doctor.log"`; страница, действие, сообщение ошибки и время. |

Перед отправкой просмотреть логи и скрыть секреты. **Не присылать `.env*`, SQL, Authorization/Cookie, полный `docker inspect`, `docker compose config` или `env`.** Для диагностики достаточно перечисленных выборок.

## Откат при необходимости

Для аддитивных миграций 031–033 возможен возврат старого кода. Для будущих релизов сначала проверить совместимость старого API с новой схемой. БД автоматически не восстанавливать: это потеряет записи после дампа.

На шагах 1–3 работающий контейнер API не меняется; сначала исправить ошибку подготовки. Следующий блок предназначен для возврата после начала переключения, после разбора ошибки, в той же SSH-сессии:

```bash
(
  set -Eeuo pipefail
  trap 'echo "STOP: rollback interrupted"' ERR
  cd "$DOCKER_DIR"
  docker compose stop --timeout 60 jwt-auth-api
  docker image tag "$(cat "$BACKUP_DIR/api-rollback-image.txt")" "$COMPOSE_API_IMAGE"
  docker compose up -d --no-deps --no-build --force-recreate \
    --wait --wait-timeout 120 jwt-auth-api
  test "$(docker inspect jwt-auth-api --format '{{.Image}}')" = "$(cat "$BACKUP_DIR/api-image-id.txt")"
  cd "$APP_DIR"
  git switch --detach "$(cat "$BACKUP_DIR/previous-sha.txt")"
  mkdir -p "$BACKUP_DIR/frontend-rollback"
  tar -xzf "$BACKUP_DIR/frontend.tar.gz" -C "$BACKUP_DIR/frontend-rollback"
  export FRONTEND_STAGE="$BACKUP_DIR/frontend-rollback"
  publish_frontend
  curl -fsS --max-time 20 "$SITE_URL/api/health"
  echo
  echo "ROLLBACK OK — check browser"
)
```

Старый образ запускается без rebuild. Рабочая копия после отката — в detached HEAD; перед следующим обновлением отдельно вернуть ветку к согласованному состоянию. Build context `app` после отката может содержать неудачный релиз: при следующем обновлении обязательно повторить подготовку из выбранного SHA. Резервные копии, старые assets и rollback-образ пока сохранять.
