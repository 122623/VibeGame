import type { Room } from "@colyseus/sdk";
import { WORLD, type EntityStage } from "../shared/protocol";

export type GameStage = EntityStage | "finished";

export type ActionName =
  | "moveUp"
  | "moveDown"
  | "moveLeft"
  | "moveRight"
  | "attack"
  | "skill1"
  | "skill2"
  | "skill3"
  | "skill4"
  | "interact"
  | "dodge"
  | "potion"
  | "inventory";

export interface PhaserClientConfig {
  careerId?: string;
  playerName?: string;
  name?: string;
  skillsByCareer?: Record<string, string[]>;
  bindings?: Partial<Record<ActionName, string>>;
  serverUrl?: string;
  roomName?: string;
  /** @deprecated Movement speed is authoritative and comes from EntityState.speed. */
  moveSpeed?: number;
  [key: string]: unknown;
}

export interface EntityStateLike {
  id?: string;
  name?: string;
  kind?: string;
  ownerId?: string;
  careerId?: string;
  careerName?: string;
  color?: string;
  skill0?: string;
  skill1?: string;
  skill2?: string;
  skill3?: string;
  x?: number;
  y?: number;
  angle?: number;
  health?: number;
  maxHealth?: number;
  shield?: number;
  alive?: boolean;
  kills?: number;
  damage?: number;
  weaponName?: string;
  armorName?: string;
  weaponPower?: number;
  armorPower?: number;
  potions?: number;
  stage?: GameStage;
  prepTime?: number;
  bossDamage?: number;
  rewardQuality?: string;
  gear?: unknown;
  cooldown0?: number;
  cooldown1?: number;
  cooldown2?: number;
  cooldown3?: number;
  attackCooldown?: number;
  dodgeCooldown?: number;
  invulnerable?: number;
  buffTime?: number;
  slowTime?: number;
  speed?: number;
  radius?: number;
}

export interface LootStateLike {
  id?: string;
  ownerId?: string;
  kind?: string;
  type?: string;
  name?: string;
  quality?: string;
  color?: string;
  value?: number;
  amount?: number;
  x?: number;
  y?: number;
}

export interface ProjectileStateLike {
  id?: string;
  ownerId?: string;
  kind?: string;
  color?: string;
  x?: number;
  y?: number;
  angle?: number;
  vx?: number;
  vy?: number;
}

export interface ZoneStateLike {
  x?: number;
  y?: number;
  radius?: number;
  targetX?: number;
  targetY?: number;
  targetRadius?: number;
  phase?: number;
  timer?: number;
  label?: string;
  damage?: number;
}

export interface BattleStateLike {
  entities?: SchemaMapLike<EntityStateLike>;
  loot?: SchemaMapLike<LootStateLike>;
  projectiles?: SchemaMapLike<ProjectileStateLike>;
  zone?: ZoneStateLike;
  zoneX?: number;
  zoneY?: number;
  zoneRadius?: number;
  zonePhase?: number;
  zoneLabel?: string;
  zoneTimer?: number;
  battleElapsed?: number;
  aliveCount?: number;
  worldWidth?: number;
  worldHeight?: number;
}

export interface SchemaMapLike<T> {
  forEach(callback: (value: T, key: string | number) => void): void;
}

export type {
  ActionMessage,
  EffectMessage,
  FeedMessage,
  InputMessage,
  MatchEndMessage,
} from "../shared/protocol";

export interface SceneBridge {
  config: PhaserClientConfig;
  room?: Room;
  onSceneReady(scene: PhaserSceneHandle): void;
}

export interface PhaserSceneHandle {
  attachRoom(room: Room): void;
  detachRoom(): void;
  setPaused(paused: boolean): void;
}

export const DEFAULT_BINDINGS: Record<ActionName, string> = {
  moveUp: "ArrowUp",
  moveDown: "ArrowDown",
  moveLeft: "ArrowLeft",
  moveRight: "ArrowRight",
  attack: "KeyJ",
  skill1: "KeyQ",
  skill2: "KeyW",
  skill3: "KeyE",
  skill4: "KeyR",
  interact: "KeyF",
  dodge: "ShiftLeft",
  potion: "Digit1",
  inventory: "Tab",
};

/** @deprecated Import WORLD from shared/protocol in new code. */
export const WORLD_SIZE = WORLD;
export const SCENE_BRIDGE_KEY = "vibegame:phaser-bridge";
