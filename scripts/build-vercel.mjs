// Builds a Vercel Build Output API (v3) bundle in .vercel/output:
// static UI from `vite build`, and one Node function serving /api/*.

import { build } from "esbuild";
import { execSync } from "node:child_process";
import { cpSync, mkdirSync, rmSync, writeFileSync } from "node:fs";

const out = ".vercel/output";
rmSync(out, { recursive: true, force: true });

execSync("npx vite build", { stdio: "inherit" });
cpSync("dist", `${out}/static`, { recursive: true });

const fn = `${out}/functions/api.func`;
mkdirSync(fn, { recursive: true });
await build({
  entryPoints: ["server/vercel.ts"],
  bundle: true,
  platform: "node",
  target: "node22",
  format: "cjs",
  outfile: `${fn}/index.js`,
  footer: { js: "module.exports = module.exports.default;" },
});
writeFileSync(`${fn}/package.json`, JSON.stringify({ type: "commonjs" }));
writeFileSync(`${fn}/.vc-config.json`, JSON.stringify({ runtime: "nodejs22.x", handler: "index.js", launcherType: "Nodejs", maxDuration: 30 }, null, 2));

const securityHeaders = {
  "Content-Security-Policy":
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "Permissions-Policy": "geolocation=(self), camera=(), microphone=()",
};
writeFileSync(
  `${out}/config.json`,
  JSON.stringify(
    {
      version: 3,
      routes: [
        { src: "/(.*)", headers: securityHeaders, continue: true },
        { src: "/assets/(.*)", headers: { "Cache-Control": "public, max-age=31536000, immutable" }, continue: true },
        { src: "^/api/(.*)$", dest: "/api" },
        { handle: "filesystem" },
        { src: "/(.*)", dest: "/index.html" },
      ],
    },
    null,
    2,
  ),
);
console.log("Vercel output written to", out);
