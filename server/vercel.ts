// Entry point for the Vercel serverless function (see scripts/build-vercel.mjs).
// Vercel has no persistent disk, so consented outcome logging is disabled here.

import { createHandler } from "./app";

export default createHandler({ logging: false });
