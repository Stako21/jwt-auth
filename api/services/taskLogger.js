function nowIso() {
  return new Date().toISOString();
}

function formatMeta(meta = {}) {
  const entries = Object.entries(meta).filter(([, value]) => value !== undefined);
  if (entries.length === 0) return "";

  return entries
    .map(([key, value]) => {
      if (value instanceof Error) {
        return `${key}="${value.message}"`;
      }

      if (typeof value === "object" && value !== null) {
        return `${key}=${JSON.stringify(value)}`;
      }

      return `${key}=${JSON.stringify(value)}`;
    })
    .join(" ");
}

export function createTaskLogger(taskName) {
  function write(level, message, meta) {
    const suffix = formatMeta(meta);
    const line = `[${nowIso()}] [${taskName}] ${message}${suffix ? ` ${suffix}` : ""}`;

    if (level === "error") {
      console.error(line);
      return;
    }

    if (level === "warn") {
      console.warn(line);
      return;
    }

    console.log(line);
  }

  return {
    info(message, meta) {
      write("info", message, meta);
    },
    warn(message, meta) {
      write("warn", message, meta);
    },
    error(message, meta) {
      write("error", message, meta);
    },
    child(scope) {
      return createTaskLogger(`${taskName}:${scope}`);
    },
    start(message = "started", meta) {
      const startedAt = Date.now();
      write("info", message, meta);

      return {
        info(stepMessage, stepMeta) {
          write("info", stepMessage, stepMeta);
        },
        warn(stepMessage, stepMeta) {
          write("warn", stepMessage, stepMeta);
        },
        error(stepMessage, stepMeta) {
          write("error", stepMessage, stepMeta);
        },
        end(endMessage = "completed", endMeta) {
          write("info", endMessage, {
            ...endMeta,
            durationMs: Date.now() - startedAt,
          });
        },
        fail(error, failMessage = "failed", failMeta) {
          write("error", failMessage, {
            ...failMeta,
            durationMs: Date.now() - startedAt,
            errorMessage: error?.message,
            errorStack: error?.stack,
          });
        },
      };
    },
  };
}
