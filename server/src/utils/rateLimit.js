// Small in-memory rate limiter (no new dependency). Per-process state:
// on Vercel serverless this is per function instance, so it limits bursts
// from one instance rather than providing a global count — still an
// effective brute-force brake for login, and it never blocks legitimate
// use at the chosen limits. Counts reset when an instance is recycled.
export function createRateLimiter({ windowMs, max, keyFn, message }) {
  const hits = new Map(); // key -> array of timestamps (ms)
  return (req, res, next) => {
    const key = keyFn ? keyFn(req) : req.ip || 'unknown';
    const now = Date.now();
    const recent = (hits.get(key) || []).filter((t) => now - t < windowMs);
    recent.push(now);
    hits.set(key, recent);
    if (recent.length > max) {
      return res.status(429).json({ message: message || 'Too many requests. Please try again later.' });
    }
    return next();
  };
}

export const loginLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 30,
  // Per IP + attempted email, so one account's failed attempts do not
  // lock out other users behind the same IP.
  keyFn: (req) => `${req.ip || 'unknown'}:${String(req.body?.email || '').toLowerCase()}`,
  message: 'Too many login attempts. Please try again in a few minutes.',
});

export const globalLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  message: 'Too many requests. Please try again later.',
});
