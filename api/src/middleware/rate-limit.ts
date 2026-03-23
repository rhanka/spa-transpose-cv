import type { MiddlewareHandler } from 'hono';

interface RateLimitStore {
  [ip: string]: { count: number; resetAt: number };
}

export function rateLimiter(opts: { max: number; windowMs: number }): MiddlewareHandler {
  const store: RateLimitStore = {};

  return async (c, next) => {
    const ip = c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || 'unknown';
    const now = Date.now();

    if (!store[ip] || store[ip].resetAt < now) {
      store[ip] = { count: 0, resetAt: now + opts.windowMs };
    }

    store[ip].count++;

    if (store[ip].count > opts.max) {
      return c.json({ error: 'Too many requests' }, 429);
    }

    await next();
  };
}
