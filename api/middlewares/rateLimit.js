const stores = new Map();

function getClientIp(req) {
  return (
    req.ip ||
    req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
    req.socket?.remoteAddress ||
    "unknown"
  );
}

export function createRateLimit({
  windowMs = 15 * 60 * 1000,
  max = 100,
  keyPrefix = "global",
} = {}) {
  if (!stores.has(keyPrefix)) {
    stores.set(keyPrefix, new Map());
  }

  const store = stores.get(keyPrefix);

  return function rateLimit(req, res, next) {
    const now = Date.now();
    const key = `${keyPrefix}:${getClientIp(req)}`;
    const existing = store.get(key);

    if (!existing || existing.resetAt <= now) {
      store.set(key, { count: 1, resetAt: now + windowMs });
      res.setHeader("RateLimit-Limit", max);
      res.setHeader("RateLimit-Remaining", max - 1);
      res.setHeader("RateLimit-Reset", Math.ceil((now + windowMs) / 1000));
      return next();
    }

    if (existing.count >= max) {
      const retryAfter = Math.max(1, Math.ceil((existing.resetAt - now) / 1000));
      res.setHeader("Retry-After", retryAfter);
      res.setHeader("RateLimit-Limit", max);
      res.setHeader("RateLimit-Remaining", 0);
      res.setHeader("RateLimit-Reset", Math.ceil(existing.resetAt / 1000));
      return res.status(429).json({ message: "Too many requests" });
    }

    existing.count += 1;
    store.set(key, existing);
    res.setHeader("RateLimit-Limit", max);
    res.setHeader("RateLimit-Remaining", Math.max(0, max - existing.count));
    res.setHeader("RateLimit-Reset", Math.ceil(existing.resetAt / 1000));

    if (store.size > 10_000) {
      for (const [entryKey, value] of store.entries()) {
        if (value.resetAt <= now) {
          store.delete(entryKey);
        }
      }
    }

    return next();
  };
}
