// Sert l'export web de l'app (dist-web), comme EAS Hosting : une adresse inconnue
// (/rejoindre/<jeton>, /soiree/<id>) renvoie index.html, et l'app choisit l'écran.
// Sans dépendance : node server.mjs <dossier> <port>
import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, resolve } from "node:path";

const root = resolve(process.argv[2] ?? "dist-web");
const port = Number(process.argv[3] ?? 4173);

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ttf": "font/ttf",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
};

createServer((request, response) => {
  const path = decodeURIComponent(new URL(request.url ?? "/", "http://localhost").pathname);
  // normalize + préfixe : une adresse en « ../ » ne sort jamais du dossier servi.
  const candidate = normalize(join(root, path));
  const isInside = candidate.startsWith(root);
  const file =
    isInside && existsSync(candidate) && statSync(candidate).isFile()
      ? candidate
      : join(root, "index.html");

  response.writeHead(200, { "Content-Type": TYPES[extname(file)] ?? "application/octet-stream" });
  createReadStream(file).pipe(response);
}).listen(port, () => console.log(`dist-web servi sur http://localhost:${port}`));
