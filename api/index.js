// Vercel serverless entry point for the Express backend.
// The Express app already mounts every route under /api/*, and
// vercel.json rewrites /api/* to this function, so the frontend can
// keep using the same-origin '/api' base with no env change.
// Importing the app runs its top-level DB connect + first-run seeding
// on cold start (server/src/index.js guards app.listen on Vercel).
import app from '../server/src/index.js';

export default app;
