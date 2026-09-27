import { readFile, stat } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";
import { nearestZip } from "./geo";
import { validateLogEntry, writeLog } from "./log";
import { HttpError, searchProviders, type Fetcher } from "./npi";

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
};

const SECURITY_HEADERS: Record<string, string> = {
  "Content-Security-Policy":
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "Permissions-Policy": "geolocation=(self), camera=(), microphone=()",
};

function send(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...SECURITY_HEADERS });
  res.end(JSON.stringify(body));
}

async function readBody(req: IncomingMessage, limit = 20_000): Promise<unknown> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > limit) throw new HttpError(413, "Body too large");
    chunks.push(chunk as Buffer);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new HttpError(400, "Invalid JSON");
  }
}

export interface AppOptions {
  staticDir?: string;
  fetcher?: Fetcher;
  logDir?: string;
}

export function createHandler(opts: AppOptions = {}) {
  return async (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    try {
      if (url.pathname === "/api/health") return send(res, 200, { ok: true });

      if (url.pathname === "/api/providers" && req.method === "GET") {
        let zip = url.searchParams.get("zip") ?? "";
        const lat = Number(url.searchParams.get("lat"));
        const lon = Number(url.searchParams.get("lon"));
        if (!zip && Number.isFinite(lat) && Number.isFinite(lon) && url.searchParams.has("lat")) {
          const z = nearestZip(lat, lon);
          if (!z) throw new HttpError(400, "No U.S. ZIP code found near your location.");
          zip = z.zip;
        }
        const result = await searchProviders(
          { specialty: url.searchParams.get("specialty") ?? "", zip, radius: Number(url.searchParams.get("radius") ?? 25) },
          opts.fetcher,
        );
        return send(res, 200, result);
      }

      if (url.pathname === "/api/log" && req.method === "POST") {
        const entry = validateLogEntry(await readBody(req));
        await writeLog(entry, opts.logDir);
        return send(res, 201, { stored: true });
      }

      if (url.pathname.startsWith("/api/")) throw new HttpError(404, "Not found");

      if (opts.staticDir) return serveStatic(opts.staticDir, url.pathname, res);
      throw new HttpError(404, "Not found");
    } catch (e) {
      if (e instanceof HttpError) return send(res, e.status, { error: e.message });
      console.error(e);
      return send(res, 500, { error: "Internal error" });
    }
  };
}

async function serveStatic(root: string, pathname: string, res: ServerResponse) {
  const resolvedRoot = path.resolve(root);
  let file = path.resolve(resolvedRoot, "." + decodeURIComponent(pathname));
  if (!file.startsWith(resolvedRoot)) throw new HttpError(403, "Forbidden");
  const isFile = await stat(file).then((s) => s.isFile()).catch(() => false);
  if (!isFile) file = path.join(resolvedRoot, "index.html");
  const body = await readFile(file);
  const ext = path.extname(file);
  res.writeHead(200, {
    "Content-Type": MIME[ext] ?? "application/octet-stream",
    "Cache-Control": file.includes(`${path.sep}assets${path.sep}`) ? "public, max-age=31536000, immutable" : "no-cache",
    ...SECURITY_HEADERS,
  });
  res.end(body);
}
