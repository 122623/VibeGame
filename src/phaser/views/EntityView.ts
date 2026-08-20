import Phaser from "phaser";
import type { AnimationCueMessage, EffectMessage } from "../../shared/protocol";
import {
  getActionPresentation,
  shouldAlignEffectToImpact,
  type ActionPresentation,
} from "../combatPresentation";
import { BASIC_ATTACK_ANIMATION, BLOOD_SLASH_ANIMATION, TEXTURES } from "../constants";
import type { EntityStateLike } from "../types";

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
  private readonly baseTexture: string;
  private readonly baseScale: number;
  private readonly baseOriginY: number;
  private jumpLift = 0;
  private walkLift = 0;
  private walkPhase = 0;
  private previousX: number;
  private previousY: number;
  private actionTween?: Phaser.Tweens.Tween;
  private hitTween?: Phaser.Tweens.Tween;
  private activeActionId = "";
  private activePresentation?: ActionPresentation;
  private actionStartedAt = 0;
  private actionFacingAngle = 0;
  private actionAngleOffset = 0;
  private actionScaleX = 1;
  private actionScaleY = 1;
  private actionLift = 0;
  private hitAngleOffset = 0;
  private hitScaleX = 1;
  private hitScaleY = 1;
  private movementLean = 0;
  private movementScaleX = 1;
  private movementScaleY = 1;
  private landingCompression = 0;
  private previousJumpTime = 0;
  private flashUntil = 0;
  private initialized = false;
  private targetAngle = 0;

  private readonly handleActionAnimationComplete = (animation: Phaser.Animations.Animation): void => {
    if (animation.key !== BASIC_ATTACK_ANIMATION.key && animation.key !== BLOOD_SLASH_ANIMATION.key) return;
    this.finishActionAnimation();
  };

  constructor(scene: Phaser.Scene, id: string, state: EntityStateLike, isLocal: boolean) {
    this.scene = scene;
    this.id = id;
    this.kind = state.kind ?? "fighter";
    this.ownerId = state.ownerId ?? "";
    this.isLocal = isLocal;
    this.state = state;
    this.targetX = numberOr(state.x, 0);
    this.targetY = numberOr(state.y, 0);
    this.previousX = this.targetX;
    this.previousY = this.targetY;

    const isBoss = this.kind === "boss";
    const careerId = state.careerId ?? "berserker";
    const texture = isBoss
      ? TEXTURES.boss
      : TEXTURES.fighters[careerId as keyof typeof TEXTURES.fighters] ?? TEXTURES.fighters.berserker;
    this.baseTexture = texture;
    this.shadow = scene.add.ellipse(this.targetX, this.targetY + (isBoss ? 40 : 27), isBoss ? 82 : 48, isBoss ? 20 : 13, 0x030712, 0.48);
    this.sprite = scene.physics.add.sprite(this.targetX, this.targetY, texture);
    this.baseScale = isBoss ? 0.63 : 0.52;
    this.sprite.setScale(this.baseScale);
    this.baseOriginY = 0.72;
    this.sprite.setOrigin(0.5, this.baseOriginY);

    const body = this.sprite.body as Phaser.Physics.Arcade.Body;
    if (isLocal) {
      body.setSize(isBoss ? 58 : 30, isBoss ? 54 : 34, true);
      body.setCollideWorldBounds(true);
    } else {
      body.enable = false;
    }

    this.nameLabel = scene.add.text(this.targetX, this.targetY - (isBoss ? 108 : 78), state.name || (isBoss ? "裂隙领主" : "无名剑士"), {
      fontFamily: "system-ui, sans-serif",
      fontSize: isBoss ? "17px" : "13px",
      color: isLocal ? "#a8ecff" : "#f4f7fb",
      stroke: "#080c14",
      strokeThickness: 4,
    }).setOrigin(0.5, 1);

    this.healthBack = scene.add.rectangle(this.targetX, this.targetY - (isBoss ? 96 : 68), isBoss ? 92 : 48, 7, 0x111827, 0.92).setOrigin(0, 0.5);
    this.healthFill = scene.add.rectangle(this.targetX, this.targetY - (isBoss ? 96 : 68), isBoss ? 92 : 48, 5, isBoss ? 0xef4444 : 0x5ee5a8, 1).setOrigin(0, 0.5);

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

    if (this.scene.time.now >= this.flashUntil) this.sprite.clearTint();
    this.nameLabel.setText(state.name || (this.kind === "boss" ? "牛头械王" : "无名剑士"));

    const alive = state.alive !== false && numberOr(state.health, 1) > 0;
    if (!alive && this.activeActionId) this.finishActionAnimation();
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

    const facingAngle = this.activeActionId ? this.actionFacingAngle : this.targetAngle;
    const facingLeft = Math.cos(facingAngle) < 0;
    this.sprite.setFlipX(facingLeft);
    const travelled = Phaser.Math.Distance.Between(this.previousX, this.previousY, this.sprite.x, this.sprite.y);
    const alive = this.state.alive !== false && numberOr(this.state.health, 1) > 0;
    const moving = alive && !this.activeActionId && travelled > 0.08;
    if (moving) {
      const visualSpeed = travelled / Math.max(0.001, deltaSeconds);
      this.walkPhase += deltaSeconds * Phaser.Math.Clamp(visualSpeed / 17, 8, 15);
      const stride = Math.sin(this.walkPhase * Math.PI);
      const strideAmount = Math.abs(stride);
      this.walkLift = strideAmount * (this.kind === "boss" ? 2 : 3);
      this.movementScaleX = 1 + strideAmount * 0.025;
      this.movementScaleY = 1 - strideAmount * 0.035;
      const horizontalVelocity = (this.sprite.x - this.previousX) / Math.max(0.001, deltaSeconds);
      this.movementLean = Phaser.Math.Linear(
        this.movementLean,
        Phaser.Math.Clamp(horizontalVelocity * 0.018, -4.5, 4.5),
        Math.min(1, deltaSeconds * 14),
      );
    } else {
      this.walkLift = Phaser.Math.Linear(this.walkLift, 0, Math.min(1, deltaSeconds * 12));
      this.movementScaleX = Phaser.Math.Linear(this.movementScaleX, 1, Math.min(1, deltaSeconds * 14));
      this.movementScaleY = Phaser.Math.Linear(this.movementScaleY, 1, Math.min(1, deltaSeconds * 14));
      this.movementLean = Phaser.Math.Linear(this.movementLean, 0, Math.min(1, deltaSeconds * 12));
    }
    this.previousX = this.sprite.x;
    this.previousY = this.sprite.y;
    const jumpTime = numberOr(this.state.jumpTime, 0);
    if (this.previousJumpTime > 0.02 && jumpTime <= 0.02) this.landingCompression = 1;
    this.previousJumpTime = jumpTime;
    this.landingCompression = Math.max(0, this.landingCompression - deltaSeconds * 6.5);
    const remaining = Phaser.Math.Clamp(jumpTime / 1.2, 0, 1);
    this.jumpLift = Math.sin(remaining * Math.PI) * 42;
    const landingPulse = Math.sin(this.landingCompression * Math.PI) * this.landingCompression;
    const visualLift = this.jumpLift + this.walkLift + this.actionLift;
    this.sprite.setOrigin(0.5, this.baseOriginY + visualLift / Math.max(1, this.sprite.displayHeight));
    this.sprite.setAngle((this.movementLean + this.actionAngleOffset + this.hitAngleOffset) * (facingLeft ? -1 : 1));
    this.sprite.setScale(
      this.baseScale * this.movementScaleX * this.actionScaleX * this.hitScaleX * (1 + landingPulse * 0.08),
      this.baseScale * this.movementScaleY * this.actionScaleY * this.hitScaleY * (1 - landingPulse * 0.1),
    );
    this.layoutAttachments();
  }

  flash(color = 0xffffff): void {
    this.flashUntil = Math.max(this.flashUntil, this.scene.time.now + 70);
    this.sprite.setTint(color);
    this.scene.time.delayedCall(70, () => {
      if (!this.sprite.active || this.scene.time.now < this.flashUntil) return;
      this.sprite.clearTint();
    });
  }

  playSkillAnimation(cue: AnimationCueMessage): boolean {
    if (cue.kind !== "skill") return false;
    const hasAuthoredClip = cue.actionId === BLOOD_SLASH_ANIMATION.actionId
      && this.state.careerId === "berserker"
      && this.scene.anims.exists(BLOOD_SLASH_ANIMATION.key)
      && this.scene.textures.exists(BLOOD_SLASH_ANIMATION.textureKey);
    return hasAuthoredClip
      ? this.playAuthoredAction(cue, BLOOD_SLASH_ANIMATION.key)
      : this.playProceduralAction(cue);
  }

  playBasicAttackAnimation(cue: AnimationCueMessage): boolean {
    if (cue.kind !== "attack" || cue.actionId !== BASIC_ATTACK_ANIMATION.actionId) return false;
    if (this.activeActionId === BLOOD_SLASH_ANIMATION.actionId) return false;
    const hasAuthoredClip = this.state.careerId === "berserker"
      && this.scene.anims.exists(BASIC_ATTACK_ANIMATION.key)
      && this.scene.textures.exists(BASIC_ATTACK_ANIMATION.textureKey);
    return hasAuthoredClip
      ? this.playAuthoredAction(cue, BASIC_ATTACK_ANIMATION.key)
      : this.playProceduralAction(cue);
  }

  effectDelayFor(effect: Pick<EffectMessage, "type" | "actionId">): number {
    if (!this.activeActionId || !this.activePresentation || !shouldAlignEffectToImpact(effect.type)) return 0;
    if (!effect.actionId || effect.actionId !== this.activeActionId) return 0;
    return Math.max(0, this.activePresentation.impactDelayMs - (this.scene.time.now - this.actionStartedAt));
  }

  playAttack(angle = this.targetAngle, actionId: string = BASIC_ATTACK_ANIMATION.actionId, kind: AnimationCueMessage["kind"] = "attack"): void {
    if (this.activeActionId) return;
    this.playProceduralAction({
      entityId: this.id,
      ownerId: this.ownerId,
      actionId,
      kind,
      angle,
    });
  }

  playHitReaction(angle = this.targetAngle, intensity = 1): void {
    this.hitTween?.stop();
    this.hitAngleOffset = 0;
    this.hitScaleX = 1;
    this.hitScaleY = 1;
    const direction = Math.cos(angle) < 0 ? -1 : 1;
    this.hitTween = this.scene.tweens.addCounter({
      from: 0,
      to: 1,
      duration: Math.round(125 * Phaser.Math.Clamp(intensity, 0.7, 1.5)),
      ease: "Quad.Out",
      onUpdate: (tween) => {
        const progress = numberOr(tween.getValue(), 0);
        const pulse = Math.sin(progress * Math.PI) * (1 - progress * 0.35);
        this.hitAngleOffset = direction * pulse * 7 * intensity;
        this.hitScaleX = 1 + pulse * 0.055 * intensity;
        this.hitScaleY = 1 - pulse * 0.07 * intensity;
      },
      onComplete: () => {
        this.hitTween = undefined;
        this.hitAngleOffset = 0;
        this.hitScaleX = 1;
        this.hitScaleY = 1;
      },
    });
  }

  destroy(): void {
    this.actionTween?.stop();
    this.hitTween?.stop();
    this.sprite.off(Phaser.Animations.Events.ANIMATION_COMPLETE, this.handleActionAnimationComplete);
    this.shadow.destroy();
    this.sprite.destroy();
    this.nameLabel.destroy();
    this.healthBack.destroy();
    this.healthFill.destroy();
  }

  private finishActionAnimation(): void {
    this.actionTween?.stop();
    this.actionTween = undefined;
    this.sprite.off(Phaser.Animations.Events.ANIMATION_COMPLETE, this.handleActionAnimationComplete);
    if (!this.sprite.active) return;
    this.sprite.stop();
    this.sprite.setTexture(this.baseTexture);
    this.sprite.setAngle(0);
    this.sprite.setScale(this.baseScale);
    this.sprite.setFlipX(Math.cos(this.targetAngle) < 0);
    this.activeActionId = "";
    this.activePresentation = undefined;
    this.actionStartedAt = 0;
    this.actionAngleOffset = 0;
    this.actionScaleX = 1;
    this.actionScaleY = 1;
    this.actionLift = 0;
  }

  private playAuthoredAction(cue: AnimationCueMessage, animationKey: string): boolean {
    this.beginAction(cue);
    this.sprite.once(Phaser.Animations.Events.ANIMATION_COMPLETE, this.handleActionAnimationComplete);
    this.sprite.play(animationKey, true);
    return true;
  }

  private playProceduralAction(cue: AnimationCueMessage): boolean {
    const profile = this.beginAction(cue);
    this.actionTween = this.scene.tweens.addCounter({
      from: 0,
      to: 1,
      duration: profile.totalDurationMs,
      ease: "Linear",
      onUpdate: (tween) => this.updateActionPose(profile, numberOr(tween.getValue(), 0)),
      onComplete: () => this.finishActionAnimation(),
    });
    return true;
  }

  private beginAction(cue: AnimationCueMessage): ActionPresentation {
    this.actionTween?.stop();
    this.actionTween = undefined;
    this.sprite.off(Phaser.Animations.Events.ANIMATION_COMPLETE, this.handleActionAnimationComplete);
    this.sprite.stop();
    this.sprite.setTexture(this.baseTexture);
    this.targetAngle = numberOr(cue.angle, this.targetAngle);
    this.actionFacingAngle = this.targetAngle;
    this.activeActionId = cue.actionId;
    this.activePresentation = getActionPresentation(cue.actionId, cue.kind);
    this.actionStartedAt = this.scene.time.now;
    this.actionAngleOffset = 0;
    this.actionScaleX = 1;
    this.actionScaleY = 1;
    this.actionLift = 0;
    this.sprite.setFlipX(Math.cos(this.actionFacingAngle) < 0);
    return this.activePresentation;
  }

  private updateActionPose(profile: ActionPresentation, progress: number): void {
    const elapsed = Phaser.Math.Clamp(progress, 0, 1) * profile.totalDurationMs;
    const beforeImpact = elapsed < profile.impactDelayMs;
    const phase = beforeImpact
      ? Phaser.Math.Clamp(elapsed / Math.max(1, profile.windupMs), 0, 1)
      : Phaser.Math.Clamp((elapsed - profile.impactDelayMs) / Math.max(1, profile.totalDurationMs - profile.impactDelayMs), 0, 1);
    const windup = Phaser.Math.Easing.Cubic.Out(phase);
    const release = 1 - Phaser.Math.Easing.Cubic.Out(phase);
    const amount = profile.intensity;

    if (beforeImpact) {
      switch (profile.motion) {
        case "slash":
          this.actionAngleOffset = -13 * windup * amount;
          this.actionScaleX = 1 - 0.055 * windup;
          this.actionScaleY = 1 + 0.07 * windup;
          this.actionLift = 2 * windup;
          break;
        case "thrust":
          this.actionAngleOffset = -5 * windup;
          this.actionScaleX = 1 - 0.08 * windup;
          this.actionScaleY = 1 + 0.045 * windup;
          this.actionLift = -2 * windup;
          break;
        case "cast":
          this.actionAngleOffset = -4 * Math.sin(windup * Math.PI);
          this.actionScaleX = 1 - 0.035 * windup;
          this.actionScaleY = 1 + 0.06 * windup;
          this.actionLift = 4 * windup;
          break;
        case "burst":
          this.actionAngleOffset = Math.sin(windup * Math.PI * 2) * 2.5;
          this.actionScaleX = 1 - 0.075 * windup;
          this.actionScaleY = 1 + 0.095 * windup;
          this.actionLift = 3 * windup;
          break;
        case "guard":
          this.actionAngleOffset = -7 * windup;
          this.actionScaleX = 1 + 0.025 * windup;
          this.actionScaleY = 1 - 0.04 * windup;
          this.actionLift = -1 * windup;
          break;
        case "dash":
          this.actionAngleOffset = -8 * windup;
          this.actionScaleX = 1 - 0.1 * windup;
          this.actionScaleY = 1 + 0.055 * windup;
          this.actionLift = -2 * windup;
          break;
      }
      return;
    }

    const strikeAngle = profile.motion === "slash" ? 16 : profile.motion === "burst" ? 8 : profile.motion === "thrust" || profile.motion === "dash" ? 5 : 3;
    this.actionAngleOffset = strikeAngle * release * amount;
    this.actionScaleX = 1 + (profile.motion === "thrust" || profile.motion === "dash" ? 0.13 : 0.075) * release * amount;
    this.actionScaleY = 1 - 0.065 * release * amount;
    this.actionLift = (profile.motion === "burst" ? 6 : 2) * release * amount;
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
    const topOffset = isBoss ? 96 : 68;
    const nameOffset = isBoss ? 108 : 78;
    const fullWidth = isBoss ? 92 : 48;
    const visualLift = this.jumpLift + this.walkLift + this.actionLift;
    this.shadow.setPosition(this.sprite.x, this.sprite.y + (isBoss ? 40 : 27));
    this.shadow.setScale(1 - this.jumpLift / 170, 1 - this.jumpLift / 100).setAlpha(this.state.alive === false ? 0.18 : 0.48 - this.jumpLift / 180);
    this.nameLabel.setPosition(this.sprite.x, this.sprite.y - visualLift - nameOffset);
    this.healthBack.setPosition(this.sprite.x - fullWidth / 2, this.sprite.y - visualLift - topOffset);
    this.healthFill.setPosition(this.sprite.x - fullWidth / 2, this.sprite.y - visualLift - topOffset);

    const depth = Math.round(this.sprite.y);
    this.shadow.setDepth(depth - 2);
    this.sprite.setDepth(depth);
    this.healthBack.setDepth(depth + 2);
    this.healthFill.setDepth(depth + 3);
    this.nameLabel.setDepth(depth + 4);
  }
}
