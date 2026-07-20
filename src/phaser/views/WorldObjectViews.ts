import Phaser from "phaser";
import { QUALITY_COLORS, TEXTURES } from "../constants";
import type { LootStateLike, ProjectileStateLike } from "../types";

const numberOr = (value: unknown, fallback: number): number =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

export class LootView {
  readonly sprite: Phaser.GameObjects.Sprite;
  id: string;
  state: LootStateLike;
  targetX: number;
  targetY: number;

  private elapsed = Math.random() * Math.PI * 2;
  private readonly label: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene, id: string, state: LootStateLike) {
    this.id = id;
    this.state = state;
    this.targetX = numberOr(state.x, 0);
    this.targetY = numberOr(state.y, 0);
    const isPotion = state.kind === "potion" || state.type === "potion";
    this.sprite = scene.add.sprite(this.targetX, this.targetY, isPotion ? TEXTURES.potion : TEXTURES.loot);
    this.sprite.setTint(isPotion ? 0x57d99a : parseColor(state.color, qualityColor(state.quality)));
    this.sprite.setDepth(Math.round(this.targetY));
    this.label = scene.add.text(this.targetX, this.targetY - 25, state.name || (isPotion ? "生命药剂" : "装备"), {
      fontFamily: "system-ui, sans-serif",
      fontSize: "12px",
      color: "#e9eef7",
      stroke: "#070a11",
      strokeThickness: 3,
    }).setOrigin(0.5, 1).setDepth(Math.round(this.targetY) + 1).setAlpha(0.82);
  }

  applyState(state: LootStateLike): void {
    this.state = state;
    this.targetX = numberOr(state.x, this.targetX);
    this.targetY = numberOr(state.y, this.targetY);
    const isPotion = state.kind === "potion" || state.type === "potion";
    this.sprite.setTint(isPotion ? 0x57d99a : parseColor(state.color, qualityColor(state.quality)));
    this.label.setText(state.name || (isPotion ? "生命药剂" : "装备"));
  }

  update(deltaMs: number): void {
    this.elapsed += deltaMs / 1000;
    const interpolation = 1 - Math.exp(-15 * Math.min(0.05, deltaMs / 1000));
    this.sprite.x = Phaser.Math.Linear(this.sprite.x, this.targetX, interpolation);
    const baseY = Phaser.Math.Linear(this.sprite.y - Math.sin(this.elapsed * 2.2) * 2, this.targetY, interpolation);
    this.sprite.y = baseY + Math.sin(this.elapsed * 2.2) * 2;
    this.sprite.rotation = Math.sin(this.elapsed * 1.7) * 0.045;
    this.label.setPosition(this.sprite.x, this.sprite.y - 25);
    this.sprite.setDepth(Math.round(this.sprite.y));
    this.label.setDepth(Math.round(this.sprite.y) + 1);
  }

  destroy(): void {
    this.sprite.destroy();
    this.label.destroy();
  }
}

export class ProjectileView {
  readonly sprite: Phaser.GameObjects.Sprite;
  id: string;
  state: ProjectileStateLike;
  targetX: number;
  targetY: number;

  constructor(scene: Phaser.Scene, id: string, state: ProjectileStateLike) {
    this.id = id;
    this.state = state;
    this.targetX = numberOr(state.x, 0);
    this.targetY = numberOr(state.y, 0);
    this.sprite = scene.add.sprite(this.targetX, this.targetY, TEXTURES.projectile);
    this.sprite.setRotation(projectileAngle(state, 0));
    this.sprite.setTint(parseColor(state.color, 0x77d5ff));
    this.sprite.setBlendMode(Phaser.BlendModes.ADD);
    this.sprite.setDepth(5000);
  }

  applyState(state: ProjectileStateLike): void {
    this.state = state;
    this.targetX = numberOr(state.x, this.targetX);
    this.targetY = numberOr(state.y, this.targetY);
    this.sprite.setRotation(projectileAngle(state, this.sprite.rotation));
    this.sprite.setTint(parseColor(state.color, 0x77d5ff));
  }

  update(deltaMs: number): void {
    const interpolation = 1 - Math.exp(-22 * Math.min(0.05, deltaMs / 1000));
    this.sprite.x = Phaser.Math.Linear(this.sprite.x, this.targetX, interpolation);
    this.sprite.y = Phaser.Math.Linear(this.sprite.y, this.targetY, interpolation);
  }

  destroy(): void {
    this.sprite.destroy();
  }
}

function qualityColor(quality: string | undefined): number {
  if (!quality) return QUALITY_COLORS.common;
  return QUALITY_COLORS[quality] ?? QUALITY_COLORS[quality.toLowerCase()] ?? QUALITY_COLORS.common;
}

export function parseColor(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value.replace(/^#/, ""), 16);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function projectileAngle(state: ProjectileStateLike, fallback: number): number {
  if (typeof state.angle === "number" && Number.isFinite(state.angle)) return state.angle;
  if (typeof state.vx === "number" && typeof state.vy === "number" && (state.vx !== 0 || state.vy !== 0)) {
    return Math.atan2(state.vy, state.vx);
  }
  return fallback;
}
