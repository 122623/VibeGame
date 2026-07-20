import Phaser from "phaser";
import { CAREERS, DEFAULT_CAREER, TEXTURES } from "../constants";
import type { EntityStateLike } from "../types";
import { parseColor } from "./WorldObjectViews";

const numberOr = (value: unknown, fallback: number): number =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

export class EntityView {
  readonly sprite: Phaser.Physics.Arcade.Sprite;
  readonly isLocal: boolean;
  id: string;
  kind: string;
  ownerId: string;
  state: EntityStateLike;
  targetX: number;
  targetY: number;

  private readonly scene: Phaser.Scene;
  private readonly shadow: Phaser.GameObjects.Ellipse;
  private readonly nameLabel: Phaser.GameObjects.Text;
  private readonly healthBack: Phaser.GameObjects.Rectangle;
  private readonly healthFill: Phaser.GameObjects.Rectangle;
  private initialized = false;
  private targetAngle = 0;

  constructor(scene: Phaser.Scene, id: string, state: EntityStateLike, isLocal: boolean) {
    this.scene = scene;
    this.id = id;
    this.kind = state.kind ?? "fighter";
    this.ownerId = state.ownerId ?? "";
    this.isLocal = isLocal;
    this.state = state;
    this.targetX = numberOr(state.x, 0);
    this.targetY = numberOr(state.y, 0);

    const isBoss = this.kind === "boss";
    const texture = isBoss ? TEXTURES.boss : TEXTURES.fighter;
    this.shadow = scene.add.ellipse(this.targetX, this.targetY + (isBoss ? 40 : 27), isBoss ? 82 : 48, isBoss ? 20 : 13, 0x030712, 0.48);
    this.sprite = scene.physics.add.sprite(this.targetX, this.targetY, texture);
    this.sprite.setScale(isBoss ? 0.96 : 0.9);
    this.sprite.setOrigin(0.5, isBoss ? 0.72 : 0.68);

    const body = this.sprite.body as Phaser.Physics.Arcade.Body;
    if (isLocal) {
      body.setSize(isBoss ? 58 : 30, isBoss ? 54 : 34, true);
      body.setCollideWorldBounds(true);
    } else {
      body.enable = false;
    }

    const career = CAREERS[state.careerId ?? ""] ?? DEFAULT_CAREER;
    const tint = isBoss ? 0xd74c56 : parseColor(state.color, career.color);
    this.sprite.setTint(tint);

    this.nameLabel = scene.add.text(this.targetX, this.targetY - (isBoss ? 75 : 57), state.name || (isBoss ? "裂隙领主" : "无名剑士"), {
      fontFamily: "system-ui, sans-serif",
      fontSize: isBoss ? "17px" : "13px",
      color: isLocal ? "#a8ecff" : "#f4f7fb",
      stroke: "#080c14",
      strokeThickness: 4,
    }).setOrigin(0.5, 1);

    this.healthBack = scene.add.rectangle(this.targetX, this.targetY - (isBoss ? 68 : 50), isBoss ? 92 : 48, 7, 0x111827, 0.92).setOrigin(0, 0.5);
    this.healthFill = scene.add.rectangle(this.targetX, this.targetY - (isBoss ? 68 : 50), isBoss ? 92 : 48, 5, isBoss ? 0xef4444 : 0x5ee5a8, 1).setOrigin(0, 0.5);

    this.applyState(state, true);
  }

  applyState(state: EntityStateLike, snap = false): void {
    this.state = state;
    this.kind = state.kind ?? this.kind;
    this.ownerId = state.ownerId ?? this.ownerId;
    this.targetX = numberOr(state.x, this.targetX);
    this.targetY = numberOr(state.y, this.targetY);
    this.targetAngle = numberOr(state.angle, this.targetAngle);

    if (!this.initialized || snap) {
      this.sprite.setPosition(this.targetX, this.targetY);
      this.initialized = true;
    }

    const career = CAREERS[state.careerId ?? ""] ?? DEFAULT_CAREER;
    this.sprite.setTint(this.kind === "boss" ? 0xd74c56 : parseColor(state.color, career.color));
    this.nameLabel.setText(state.name || (this.kind === "boss" ? "裂隙领主" : "无名剑士"));

    const alive = state.alive !== false && numberOr(state.health, 1) > 0;
    this.sprite.setAlpha(alive ? 1 : 0.28);
    this.shadow.setAlpha(alive ? 0.48 : 0.18);
    this.nameLabel.setAlpha(alive ? 1 : 0.45);
    this.updateHealthBar();
  }

  update(deltaMs: number): void {
    const deltaSeconds = Math.min(0.05, deltaMs / 1000);
    if (this.isLocal) {
      const errorX = this.targetX - this.sprite.x;
      const errorY = this.targetY - this.sprite.y;
      const distance = Math.hypot(errorX, errorY);
      if (distance > 170) {
        this.sprite.setPosition(this.targetX, this.targetY);
      } else if (distance > 2) {
        const correction = 1 - Math.exp(-3.5 * deltaSeconds);
        this.sprite.x += errorX * correction;
        this.sprite.y += errorY * correction;
      }
    } else {
      const interpolation = 1 - Math.exp(-12 * deltaSeconds);
      this.sprite.x = Phaser.Math.Linear(this.sprite.x, this.targetX, interpolation);
      this.sprite.y = Phaser.Math.Linear(this.sprite.y, this.targetY, interpolation);
    }

    const facingLeft = Math.cos(this.targetAngle) < 0;
    this.sprite.setFlipX(facingLeft);
    this.layoutAttachments();
  }

  flash(color = 0xffffff): void {
    this.sprite.setTint(color);
    this.scene.time.delayedCall(70, () => {
      if (!this.sprite.active) return;
      const career = CAREERS[this.state.careerId ?? ""] ?? DEFAULT_CAREER;
      this.sprite.setTint(this.kind === "boss" ? 0xd74c56 : parseColor(this.state.color, career.color));
    });
  }

  destroy(): void {
    this.shadow.destroy();
    this.sprite.destroy();
    this.nameLabel.destroy();
    this.healthBack.destroy();
    this.healthFill.destroy();
  }

  private updateHealthBar(): void {
    const maximum = Math.max(1, numberOr(this.state.maxHealth, 100));
    const health = Phaser.Math.Clamp(numberOr(this.state.health, maximum), 0, maximum);
    const fullWidth = this.kind === "boss" ? 92 : 48;
    this.healthFill.width = Math.max(0, fullWidth * health / maximum);
    const show = this.kind === "boss" || health < maximum;
    this.healthBack.setVisible(show);
    this.healthFill.setVisible(show);
  }

  private layoutAttachments(): void {
    const isBoss = this.kind === "boss";
    const topOffset = isBoss ? 68 : 50;
    const fullWidth = isBoss ? 92 : 48;
    this.shadow.setPosition(this.sprite.x, this.sprite.y + (isBoss ? 40 : 27));
    this.nameLabel.setPosition(this.sprite.x, this.sprite.y - (isBoss ? 75 : 57));
    this.healthBack.setPosition(this.sprite.x - fullWidth / 2, this.sprite.y - topOffset);
    this.healthFill.setPosition(this.sprite.x - fullWidth / 2, this.sprite.y - topOffset);

    const depth = Math.round(this.sprite.y);
    this.shadow.setDepth(depth - 2);
    this.sprite.setDepth(depth);
    this.healthBack.setDepth(depth + 2);
    this.healthFill.setDepth(depth + 3);
    this.nameLabel.setDepth(depth + 4);
  }
}
