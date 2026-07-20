export const WORLD = Object.freeze({ width: 2400, height: 1600 });

export const PREPARATION = Object.freeze({
  duration: 60,
  spawnX: 260,
  spawnY: WORLD.height / 2,
  bossX: 1180,
  bossY: WORLD.height / 2,
  bossHealth: 720,
  lootCount: 14,
});

export const PORTAL = Object.freeze({
  x: 2150,
  y: WORLD.height / 2,
  radius: 80,
});

export const BATTLE = Object.freeze({
  botCount: 11,
  initialLootCount: 38,
  spawnX: 320,
  spawnY: WORLD.height / 2,
  zoneX: WORLD.width / 2,
  zoneY: WORLD.height / 2,
  zoneRadius: 1050,
});

export interface WorldObstacle {
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
}

export const PREPARATION_OBSTACLES: readonly WorldObstacle[] = Object.freeze([
  { x: 420, y: 250, w: 280, h: 150, label: "补给仓" },
  { x: 420, y: 1130, w: 280, h: 150, label: "医疗站" },
  { x: 980, y: 260, w: 430, h: 120, label: "领主祭坛" },
  { x: 980, y: 1220, w: 430, h: 120, label: "破碎回廊" },
  { x: 1670, y: 360, w: 260, h: 180, label: "传送前厅" },
  { x: 1670, y: 1060, w: 260, h: 180, label: "传送前厅" },
]);

export const BATTLE_OBSTACLES: readonly WorldObstacle[] = Object.freeze([
  { x: 280, y: 250, w: 330, h: 160, label: "北部仓库" },
  { x: 820, y: 160, w: 250, h: 240, label: "遗弃工坊" },
  { x: 1450, y: 220, w: 390, h: 145, label: "断桥营地" },
  { x: 1940, y: 390, w: 250, h: 240, label: "东部废墟" },
  { x: 460, y: 750, w: 210, h: 300, label: "瞭望塔" },
  { x: 950, y: 620, w: 430, h: 270, label: "中央神殿" },
  { x: 1580, y: 760, w: 290, h: 220, label: "旧车站" },
  { x: 260, y: 1210, w: 370, h: 150, label: "南部营地" },
  { x: 940, y: 1190, w: 290, h: 220, label: "沉没庭院" },
  { x: 1630, y: 1160, w: 410, h: 170, label: "封锁线" },
]);

export const ZONE_TIMELINE = Object.freeze([
  { start: 0, end: 35, from: 1050, to: 1050, label: "安全区稳定" },
  { start: 35, end: 55, from: 1050, to: 780, label: "第 1 次收缩" },
  { start: 55, end: 80, from: 780, to: 780, label: "安全区稳定" },
  { start: 80, end: 100, from: 780, to: 560, label: "第 2 次收缩" },
  { start: 100, end: 120, from: 560, to: 560, label: "安全区稳定" },
  { start: 120, end: 140, from: 560, to: 350, label: "第 3 次收缩" },
  { start: 140, end: 155, from: 350, to: 350, label: "决赛区即将收缩" },
  { start: 155, end: 178, from: 350, to: 145, label: "决赛区收缩" },
  { start: 178, end: 230, from: 145, to: 55, label: "裂隙正在吞噬战场" },
]);

export type EntityKind = "player" | "bot" | "boss";
export type EntityStage = "preparation" | "battle";
export type LootKind = "weapon" | "armor" | "potion";
export type LootQuality = "普通" | "稀有" | "史诗";

export interface InputMessage {
  seq: number;
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  angle: number;
}

export type ActionType = "attack" | "skill" | "interact" | "dodge" | "potion";

export interface ActionMessage {
  type: ActionType;
  index?: number;
}

export interface FeedMessage {
  text: string;
  tone?: "info" | "good" | "danger";
  /** Empty means the public battlefield. A session id means a private preparation realm. */
  ownerId?: string;
}

export interface EffectMessage {
  type: string;
  x: number;
  y: number;
  color?: string;
  radius?: number;
  angle?: number;
  text?: string;
  ownerId?: string;
}

export interface MatchEndMessage {
  victory: boolean;
  rank: number;
  kills: number;
  damage: number;
  /** Match duration in seconds. */
  time: number;
  winnerName?: string;
}

export interface JoinOptions {
  name?: string;
  careerId?: string;
  skillIds?: string[];
  /** The lobby currently sends the complete account configuration. */
  skillsByCareer?: Record<string, string[]>;
}

export function isOwnedBy(ownerId: string, sessionId: string): boolean {
  return ownerId === "" || ownerId === sessionId;
}

export function isInputMessage(value: unknown): value is InputMessage {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return Number.isSafeInteger(candidate.seq)
    && typeof candidate.angle === "number"
    && Number.isFinite(candidate.angle)
    && ["up", "down", "left", "right"].every((key) => typeof candidate[key] === "boolean");
}

export function isActionMessage(value: unknown): value is ActionMessage {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  const action = String(candidate.type);
  if (!["attack", "skill", "interact", "dodge", "potion"].includes(action)) return false;
  if (action === "skill") {
    return Number.isInteger(candidate.index)
      && Number(candidate.index) >= 0
      && Number(candidate.index) <= 3;
  }
  return candidate.index === undefined;
}
