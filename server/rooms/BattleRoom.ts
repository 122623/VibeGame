import { StateView, type Schema } from "@colyseus/schema";
import { Client, Room } from "colyseus";
import {
  isActionMessage,
  isInputMessage,
  type ActionMessage,
  type AnimationCueMessage,
  type EffectMessage,
  type FeedMessage,
  type JoinOptions,
  type MatchEndMessage,
  type SpectateMessage,
} from "../../src/shared/protocol.js";
import { BattleSimulation } from "../game/BattleSimulation.js";
import { BattleState } from "../state/BattleState.js";

const FIXED_TIME_STEP = 1000 / 60;
type ServerMessageType = "feed" | "animation" | "effect" | "matchEnd" | "spectate";
type ServerMessage = AnimationCueMessage | FeedMessage | EffectMessage | MatchEndMessage | SpectateMessage;

/** Accept the short-lived client prototype aliases while keeping type/index as the public protocol. */
function normalizeAction(payload: unknown): ActionMessage | undefined {
  if (isActionMessage(payload)) return payload;
  if (!payload || typeof payload !== "object") return undefined;
  const legacy = payload as Record<string, unknown>;
  const candidate = {
    type: legacy.action,
    index: legacy.slot,
  };
  return isActionMessage(candidate) ? candidate : undefined;
}

export class BattleRoom extends Room {
  maxClients = 16;
  maxMessagesPerSecond = 120;
  patchRate = 50;
  state = new BattleState();

  private simulation!: BattleSimulation;
  private roomLockRequested = false;
  private readonly readyClients = new Set<string>();
  private readonly pendingMessages = new Map<string, Array<{ type: ServerMessageType; message: ServerMessage }>>();

  messages = {
    input: (client: Client, payload: unknown) => {
      if (isInputMessage(payload)) this.simulation.setInput(client.sessionId, payload);
    },
    action: (client: Client, payload: unknown) => {
      const action = normalizeAction(payload);
      if (action) {
        this.simulation.handleAction(client.sessionId, action);
        this.syncClientViews();
      }
    },
    ready: (client: Client) => this.markClientReady(client),
  };

  onCreate(): void {
    this.simulation = new BattleSimulation({
      state: this.state,
      events: {
        feed: (message, targetPlayerId) => this.sendFeed(message, targetPlayerId),
        animation: (message) => this.sendAnimation(message),
        effect: (message) => this.sendEffect(message),
        matchEnd: (message, targetPlayerId) => this.sendMatchEnd(message, targetPlayerId),
        spectate: (message, targetPlayerId) => this.sendSpectate(message, targetPlayerId),
      },
    });

    let elapsed = 0;
    this.setSimulationInterval((deltaTime) => {
      elapsed += Math.min(deltaTime, 250);
      while (elapsed >= FIXED_TIME_STEP) {
        elapsed -= FIXED_TIME_STEP;
        this.simulation.fixedUpdate(FIXED_TIME_STEP / 1000);
        this.syncClientViews();
      }
    });
  }

  onJoin(client: Client, options: JoinOptions): void {
    client.view = new StateView();
    this.pendingMessages.set(client.sessionId, []);
    this.simulation.addPlayer(client.sessionId, options);
    this.syncClientViews();
  }

  onLeave(client: Client): void {
    this.readyClients.delete(client.sessionId);
    this.pendingMessages.delete(client.sessionId);
    this.simulation.removePlayer(client.sessionId);
  }

  onBeforePatch(): void {
    this.syncClientViews();
  }

  private sendFeed(message: FeedMessage, targetPlayerId?: string): void {
    const ownerId = message.ownerId ?? "";
    if (ownerId) {
      const owner = this.clientById(ownerId);
      if (owner) this.sendClient(owner, "feed", message);
      return;
    }

    if (targetPlayerId) {
      const target = this.clientById(targetPlayerId);
      if (target && this.isBattleClient(target)) this.sendClient(target, "feed", message);
      return;
    }

    this.sendToBattleClients("feed", message);
  }

  private sendEffect(message: EffectMessage): void {
    const ownerId = message.ownerId ?? "";
    if (ownerId) {
      const owner = this.clientById(ownerId);
      if (owner) this.sendClient(owner, "effect", message);
      return;
    }

    this.sendToBattleClients("effect", message);
  }

  private sendAnimation(message: AnimationCueMessage): void {
    const ownerId = message.ownerId ?? "";
    if (ownerId) {
      const owner = this.clientById(ownerId);
      if (owner) this.sendClient(owner, "animation", message);
      return;
    }

    this.sendToBattleClients("animation", message);
  }

  private sendMatchEnd(message: MatchEndMessage, targetPlayerId?: string): void {
    this.requestRoomLock();
    if (targetPlayerId) {
      const target = this.clientById(targetPlayerId);
      if (target && this.isBattleClient(target)) this.sendClient(target, "matchEnd", message);
      return;
    }

    this.sendToBattleClients("matchEnd", message);
  }

  private sendSpectate(message: SpectateMessage, targetPlayerId: string): void {
    const target = this.clientById(targetPlayerId);
    if (target && this.isBattleClient(target)) this.sendClient(target, "spectate", message);
  }

  private markClientReady(client: Client): void {
    if (this.readyClients.has(client.sessionId)) return;
    this.readyClients.add(client.sessionId);
    const pending = this.pendingMessages.get(client.sessionId) ?? [];
    this.pendingMessages.delete(client.sessionId);
    for (const item of pending) client.send(item.type, item.message);
  }

  private sendClient(client: Client, type: ServerMessageType, message: ServerMessage): void {
    if (this.readyClients.has(client.sessionId)) {
      client.send(type, message);
      return;
    }
    const pending = this.pendingMessages.get(client.sessionId) ?? [];
    pending.push({ type, message });
    this.pendingMessages.set(client.sessionId, pending.slice(-40));
  }

  private clientById(sessionId: string): Client | undefined {
    return this.clients.find((client) => client.sessionId === sessionId);
  }

  private syncClientViews(): void {
    for (const client of this.clients) this.syncClientView(client);
    if (this.clients.some((client) => this.isBattleClient(client))) this.requestRoomLock();
  }

  private syncClientView(client: Client): void {
    const clientView = client.view;
    if (!clientView) return;

    const visibleOwnerId = this.isBattleClient(client) ? "" : client.sessionId;
    this.syncCollectionView(clientView, this.state.entities.values(), visibleOwnerId);
    this.syncCollectionView(clientView, this.state.loot.values(), visibleOwnerId);
    this.syncCollectionView(clientView, this.state.projectiles.values(), visibleOwnerId);
    this.syncCollectionView(clientView, this.state.inventory.values(), client.sessionId);
  }

  private syncCollectionView<T extends Schema & { ownerId: string }>(view: StateView, items: Iterable<T>, visibleOwnerId: string): void {
    for (const item of items) {
      const shouldBeVisible = item.ownerId === visibleOwnerId;
      if (shouldBeVisible && !view.has(item)) view.add(item);
      else if (!shouldBeVisible && view.has(item)) view.remove(item);
    }
  }

  private isBattleClient(client: Client): boolean {
    const player = this.state.entities.get(client.sessionId);
    return player?.kind === "player" && player.stage === "battle" && player.ownerId === "";
  }

  private sendToBattleClients(
    type: "feed" | "animation" | "effect" | "matchEnd",
    message: AnimationCueMessage | FeedMessage | EffectMessage | MatchEndMessage,
  ): void {
    for (const client of this.clients) {
      if (this.isBattleClient(client)) this.sendClient(client, type, message);
    }
  }

  private requestRoomLock(): void {
    if (this.roomLockRequested) return;
    this.roomLockRequested = true;
    void this.lock().catch(() => undefined);
  }
}
