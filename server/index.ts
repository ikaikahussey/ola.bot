import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHandler } from "./app";

const here = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT ?? 8787);
const staticDir = process.env.NODE_ENV === "production" ? path.resolve(here, "../dist") : undefined;

createServer(createHandler({ staticDir })).listen(port, () => {
  console.log(`OLA BOT server on http://localhost:${port}${staticDir ? "" : " (API only; run `npm run dev:web` for the UI)"}`);
});
