import Phaser from "phaser";
import { getActionPresentation } from "../combatPresentation";
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
    const texture = isPotion ? TEXTURES.potion : state.type === "armor" ? TEXTURES.armorLoot : TEXTURES.weaponLoot;
    this.sprite = scene.add.sprite(this.targetX, this.targetY, texture);
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

  private readonly trail: Phaser.GameObjects.Graphics;
  private readonly trailX = new Float32Array(14);
  private readonly trailY = new Float32Array(14);
  private trailHead = 0;
  private trailCount = 0;
  private elapsed = 0;
  private color: number;
  private intensity: number;

  constructor(scene: Phaser.Scene, id: string, state: ProjectileStateLike) {
    this.id = id;
    this.state = state;
    this.targetX = numberOr(state.x, 0);
    this.targetY = numberOr(state.y, 0);
    this.color = parseColor(state.color, 0x77d5ff);
    this.intensity = state.actionId ? getActionPresentation(state.actionId).intensity : 1;
    this.trail = scene.add.graphics().setDepth(4999).setBlendMode(Phaser.BlendModes.ADD);
    this.sprite = scene.add.sprite(this.targetX, this.targetY, TEXTURES.projectile);
    this.sprite.setRotation(projectileAngle(state, 0));
    this.sprite.setTint(this.color);
    this.sprite.setBlendMode(Phaser.BlendModes.ADD);
    this.sprite.setDepth(5000);
    this.recordTrailPoint(this.targetX, this.targetY);
  }

  applyState(state: ProjectileStateLike): void {
    this.state = state;
    this.targetX = numberOr(state.x, this.targetX);
    this.targetY = numberOr(state.y, this.targetY);
    this.color = parseColor(state.color, this.color);
    this.intensity = state.actionId ? getActionPresentation(state.actionId).intensity : this.intensity;
    this.sprite.setRotation(projectileAngle(state, this.sprite.rotation));
    this.sprite.setTint(this.color);
  }

  update(deltaMs: number): void {
    const deltaSeconds = Math.min(0.05, deltaMs / 1000);
    this.elapsed += deltaSeconds;
    const interpolation = 1 - Math.exp(-22 * deltaSeconds);
    this.sprite.x = Phaser.Math.Linear(this.sprite.x, this.targetX, interpolation);
    this.sprite.y = Phaser.Math.Linear(this.sprite.y, this.targetY, interpolation);
    const newest = (this.trailHead - 1 + this.trailX.length) % this.trailX.length;
    if (Phaser.Math.Distance.Between(this.trailX[newest], this.trailY[newest], this.sprite.x, this.sprite.y) >= 5) {
      this.recordTrailPoint(this.sprite.x, this.sprite.y);
    }
    const birth = Phaser.Math.Easing.Cubic.Out(Phaser.Math.Clamp(this.elapsed / 0.09, 0, 1));
    const pulse = 1 + Math.sin(this.elapsed * 22) * 0.055;
    this.sprite.setScale(Phaser.Math.Linear(0.42, 1, birth) * pulse * this.intensity);
    this.sprite.setAlpha(Phaser.Math.Linear(0.3, 1, birth));
    this.drawTrail();
  }

  destroy(): void {
    this.trail.destroy();
    this.sprite.destroy();
  }

  private recordTrailPoint(x: number, y: number): void {
    this.trailX[this.trailHead] = x;
    this.trailY[this.trailHead] = y;
    this.trailHead = (this.trailHead + 1) % this.trailX.length;
    this.trailCount = Math.min(this.trailCount + 1, this.trailX.length);
  }

  private drawTrail(): void {
    this.trail.clear();
    if (this.trailCount < 2) return;
    const oldest = (this.trailHead - this.trailCount + this.trailX.length) % this.trailX.length;
    for (let index = 1; index < this.trailCount; index += 1) {
      const previous = (oldest + index - 1) % this.trailX.length;
      const current = (oldest + index) % this.trailX.length;
      const progress = index / (this.trailCount - 1);
      this.trail.lineStyle(
        (1.5 + progress * 5.5) * this.intensity,
        index === this.trailCount - 1 ? 0xffffff : this.color,
        0.06 + progress * 0.58,
      );
      this.trail.lineBetween(
        this.trailX[previous],
        this.trailY[previous],
        this.trailX[current],
        this.trailY[current],
      );
    }
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
