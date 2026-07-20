import Phaser from "phaser";
import { Client, type Room } from "@colyseus/sdk";
import type { JoinOptions } from "../shared/protocol";
import { emitGameEvent } from "./events";
import { BootScene } from "./scenes/BootScene";
import { NetworkScene } from "./scenes/NetworkScene";
import {
  SCENE_BRIDGE_KEY,
  type PhaserClientConfig,
  type PhaserSceneHandle,
  type SceneBridge,
} from "./types";

export class PhaserGameController {
  private readonly config: PhaserClientConfig;
  private client?: Client;
  private room?: Room;
  private game?: Phaser.Game;
  private scene?: PhaserSceneHandle;
  private generation = 0;

  constructor(config: any) {
    this.config = (config ?? {}) as PhaserClientConfig;
  }

  async start(parentId = "game-root"): Promise<void> {
    const generation = ++this.generation;
    await this.teardown();

    const parent = document.getElementById(parentId);
    if (!parent) throw new Error(`找不到 Phaser 容器 #${parentId}`);

    let resolveScene!: (scene: PhaserSceneHandle) => void;
    const sceneReady = new Promise<PhaserSceneHandle>((resolve) => {
      resolveScene = resolve;
    });
    const bridge: SceneBridge = {
      config: this.config,
      onSceneReady: (scene) => resolveScene(scene),
    };

    const canvas = parent instanceof HTMLCanvasElement ? parent : undefined;
    const canvasParent = canvas ? canvas.parentElement ?? undefined : parent;
    const gameConfig: Phaser.Types.Core.GameConfig = {
      type: Phaser.WEBGL,
      parent: canvasParent,
      canvas,
      width: 1280,
      height: 720,
      backgroundColor: "#0d121b",
      banner: false,
      render: {
        antialias: true,
        roundPixels: false,
        powerPreference: "high-performance",
      },
      scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
        width: 1280,
        height: 720,
      },
      input: {
        keyboard: true,
        mouse: true,
        touch: true,
        activePointers: 2,
      },
      physics: {
        default: "arcade",
        arcade: {
          gravity: { x: 0, y: 0 },
          fixedStep: true,
          fps: 60,
          debug: false,
        },
      },
      callbacks: {
        preBoot: (game) => game.registry.set(SCENE_BRIDGE_KEY, bridge),
      },
      scene: [BootScene, NetworkScene],
    };

    this.game = new Phaser.Game(gameConfig);
    this.client = new Client(resolveServerUrl(this.config));
    emitGameEvent("feed", { text: "正在连接战斗服务器……", tone: "info" });

    try {
      const roomPromise = this.client.joinOrCreate(this.config.roomName || "battle", createJoinOptions(this.config));
      const [scene, room] = await Promise.all([sceneReady, roomPromise]);
      if (generation !== this.generation) {
        await room.leave(true);
        return;
      }
      this.scene = scene;
      this.room = room;
      bridge.room = room;
      scene.attachRoom(room);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      emitGameEvent("feed", { text: `无法进入战斗房间：${message}`, tone: "danger" });
      await this.teardown();
      throw error;
    }
  }

  async destroy(): Promise<void> {
    ++this.generation;
    await this.teardown();
  }

  setPaused(paused: boolean): void {
    this.scene?.setPaused(paused);
  }

  private async teardown(): Promise<void> {
    const room = this.room;
    this.room = undefined;
    this.scene?.detachRoom();
    this.scene = undefined;

    if (room) {
      try {
        await room.leave(true);
      } catch {
        // The socket may already be closed. The Phaser view should still be cleaned up.
      }
    }

    this.game?.destroy(true);
    this.game = undefined;
    this.client = undefined;
  }
}

export async function startPhaserGame(config: any, parentId = "game-root"): Promise<PhaserGameController> {
  const controller = new PhaserGameController(config);
  await controller.start(parentId);
  return controller;
}

function resolveServerUrl(config: PhaserClientConfig): string {
  if (typeof config.serverUrl === "string" && config.serverUrl) return config.serverUrl;
  const environmentUrl = import.meta.env.VITE_COLYSEUS_URL;
  if (environmentUrl) return environmentUrl;

  const protocol = window.location.protocol === "https:" ? "https:" : "http:";
  const hostname = window.location.hostname || "127.0.0.1";
  const development = window.location.port === "4317" || window.location.port === "5173";
  return development ? `${protocol}//${hostname}:2567` : window.location.origin;
}

function createJoinOptions(config: PhaserClientConfig): JoinOptions {
  const careerId = config.careerId || "berserker";
  return {
    name: config.playerName || config.name || "玩家",
    careerId,
    skillIds: config.skillsByCareer?.[careerId] ?? [],
    skillsByCareer: config.skillsByCareer ?? {},
  };
}
