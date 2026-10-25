import crypto from 'crypto';

// JWT signing secret. There is intentionally NO hardcoded fallback value
// anywhere in this codebase: shipping one would let anyone forge tokens.
// - If JWT_SECRET is set, it is used.
// - In a production/Vercel deployment without JWT_SECRET, fail fast
//   (index.js checks this at startup; this function also throws).
// - In local development only, an ephemeral secret is generated once per
//   process, so tokens stay valid for the life of that process but are
//   worthless after a restart — never a shipped, guessable value.
let devSecret = null;

export function getJwtSecret() {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  if (process.env.VERCEL || process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET is not set for this deployment');
  }
  if (!devSecret) devSecret = crypto.randomBytes(32).toString('hex');
  return devSecret;
}

export function isProductionDeployment() {
  return Boolean(process.env.VERCEL || process.env.NODE_ENV === 'production');
}
