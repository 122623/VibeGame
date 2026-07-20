import { createServer } from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));
const dataDir = join(root, ".data");
const configFile = join(dataDir, "player-config.json");
const port = Number(process.env.PORT || 4317);

const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

function reply(response, status, body, contentType = "application/json; charset=utf-8") {
  response.writeHead(status, { "Content-Type": contentType, "Cache-Control": "no-store" });
  response.end(body);
}

async function readBody(request) {
  let body = "";
  for await (const chunk of request) {
    body += chunk;
    if (body.length > 1_000_000) throw new Error("请求内容过大");
  }
  return JSON.parse(body || "{}");
}

async function handleConfig(request, response) {
  if (request.method === "GET") {
    try {
      const config = await readFile(configFile, "utf8");
      return reply(response, 200, config);
    } catch (error) {
      if (error.code === "ENOENT") return reply(response, 200, "null");
      throw error;
    }
  }

  if (request.method === "PUT") {
    const config = await readBody(request);
    await mkdir(dataDir, { recursive: true });
    await writeFile(configFile, JSON.stringify(config, null, 2), "utf8");
    return reply(response, 200, JSON.stringify({ ok: true, savedAt: new Date().toISOString() }));
  }

  return reply(response, 405, JSON.stringify({ error: "Method not allowed" }));
}

async function serveStatic(request, response) {
  const requestPath = decodeURIComponent(new URL(request.url, `http://${request.headers.host}`).pathname);
  const relativePath = requestPath === "/" ? "index.html" : requestPath.slice(1);
  const safePath = normalize(relativePath).replace(/^(\.\.[/\\])+/, "");
  const filePath = join(root, safePath);

  if (!filePath.startsWith(root)) return reply(response, 403, "Forbidden", "text/plain");

  try {
    const file = await readFile(filePath);
    reply(response, 200, file, types[extname(filePath)] || "application/octet-stream");
  } catch (error) {
    if (error.code === "ENOENT") return reply(response, 404, "Not found", "text/plain; charset=utf-8");
    throw error;
  }
}

const server = createServer(async (request, response) => {
  try {
    if (request.url.startsWith("/api/player/config")) return await handleConfig(request, response);
    await serveStatic(request, response);
  } catch (error) {
    console.error(error);
    reply(response, 500, JSON.stringify({ error: "服务器内部错误" }));
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`VibeGame running at http://127.0.0.1:${port}`);
});
