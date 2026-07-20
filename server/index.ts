import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { defineRoom, defineServer } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
import express from "express";
import { BattleRoom } from "./rooms/BattleRoom.js";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const dataDirectory = join(root, ".data");
const configFile = join(dataDirectory, "player-config.json");
const distributionDirectory = join(root, "dist");
const port = Number(process.env.PORT ?? 2567);

export const server = defineServer({
  rooms: {
    battle: defineRoom(BattleRoom),
  },
  transport: new WebSocketTransport({
    pingInterval: 10_000,
  }),
  devMode: process.env.NODE_ENV !== "production",
  express: (app) => {
    app.use((request, response, next) => {
      response.setHeader("Access-Control-Allow-Origin", request.headers.origin ?? "*");
      response.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
      response.setHeader("Access-Control-Allow-Methods", "GET, PUT, POST, OPTIONS");
      if (request.method === "OPTIONS") response.sendStatus(204);
      else next();
    });
    app.use(express.json({ limit: "1mb" }));

    app.get("/api/health", (_request, response) => {
      response.json({ ok: true, service: "vibe-game", transport: "colyseus" });
    });

    app.get("/api/player/config", async (_request, response) => {
      try {
        response.type("application/json").send(await readFile(configFile, "utf8"));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") response.json(null);
        else throw error;
      }
    });

    app.put("/api/player/config", async (request, response) => {
      await mkdir(dataDirectory, { recursive: true });
      await writeFile(configFile, JSON.stringify(request.body ?? {}, null, 2), "utf8");
      response.json({ ok: true, savedAt: new Date().toISOString() });
    });

    app.use(express.static(distributionDirectory));
    app.get("/", (_request, response) => {
      response.sendFile(join(distributionDirectory, "index.html"), (error) => {
        if (error && !response.headersSent) response.status(404).send("Run npm run dev for the development client, or npm run build first.");
      });
    });
  },
});

await server.listen(port);
console.log(`VibeGame Colyseus server listening on http://127.0.0.1:${port}`);
