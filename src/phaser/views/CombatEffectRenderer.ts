import Phaser from "phaser";
import type { AnimationCueMessage, EffectMessage } from "../../shared/protocol";
import { CAREER_EFFECT_TEXTURES } from "../assets/effectAssets";
import { getActionPresentation, type ActionPresentation } from "../combatPresentation";
import { CAREERS, TEXTURES } from "../constants";
import type { EntityStateLike } from "../types";
import type { EntityView } from "./EntityView";
import { parseColor } from "./WorldObjectViews";

const MAX_GRAPHICS_POOL = 48;
const MAX_IMAGE_POOL = 128;

const finite = (value: unknown, fallback: number): number =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

export class CombatEffectRenderer {
  private readonly graphicsPool: Phaser.GameObjects.Graphics[] = [];
  private readonly imagePool: Phaser.GameObjects.Image[] = [];
  private readonly activeGraphics = new Set<Phaser.GameObjects.Graphics>();
  private readonly activeImages = new Set<Phaser.GameObjects.Image>();

  constructor(private readonly scene: Phaser.Scene) {}

  beginAction(cue: AnimationCueMessage, source: EntityView): void {
    const profile = getActionPresentation(cue.actionId, cue.kind);
    const color = parseColor(source.state.color, this.careerColor(source.state));
    const angle = finite(cue.angle, source.state.angle ?? 0);
    const glyph = this.acquireGraphics(source.sprite.x, source.sprite.y + 10, 8038);
    const radius = (source.kind === "boss" ? 58 : 38) * profile.intensity;

    glyph.setBlendMode(Phaser.BlendModes.ADD).setRotation(angle).setAlpha(0.18);
    switch (profile.motion) {
      case "slash":
      case "thrust":
      case "dash":
        glyph.lineStyle(Math.max(2, radius * 0.07), color, 0.8);
        glyph.beginPath();
        glyph.arc(0, 0, radius, -0.88, 0.88, false);
        glyph.strokePath();
        glyph.lineStyle(2, 0xffffff, 0.55).lineBetween(radius * 0.2, 0, radius * 1.15, 0);
        glyph.setScale(1.28, 0.72);
        break;
      case "cast":
        glyph.lineStyle(3, color, 0.78).strokeCircle(0, 0, radius * 0.72);
        glyph.lineStyle(1, 0xffffff, 0.6).strokeCircle(0, 0, radius * 0.42);
        for (let index = 0; index < 4; index += 1) {
          const spoke = (Math.PI * 2 * index) / 4;
          glyph.lineBetween(
            Math.cos(spoke) * radius * 0.5,
            Math.sin(spoke) * radius * 0.5,
            Math.cos(spoke) * radius,
            Math.sin(spoke) * radius,
          );
        }
        glyph.setScale(1.35);
        break;
      case "burst":
        glyph.lineStyle(4, color, 0.82).strokeCircle(0, 0, radius);
        glyph.lineStyle(2, 0xffffff, 0.55).strokeCircle(0, 0, radius * 0.62);
        for (let index = 0; index < 8; index += 1) {
          const spoke = (Math.PI * 2 * index) / 8;
          glyph.lineBetween(
            Math.cos(spoke) * radius * 0.7,
            Math.sin(spoke) * radius * 0.7,
            Math.cos(spoke) * radius * 1.14,
            Math.sin(spoke) * radius * 1.14,
          );
        }
        glyph.setScale(0.48, 0.34);
        break;
      case "guard":
        glyph.lineStyle(5, color, 0.78);
        for (let index = 0; index < 4; index += 1) {
          glyph.beginPath();
          glyph.arc(0, 0, radius, index * Math.PI / 2 + 0.15, (index + 1) * Math.PI / 2 - 0.15, false);
          glyph.strokePath();
        }
        glyph.lineStyle(2, 0xffffff, 0.45).strokeCircle(0, 0, radius * 0.68);
        glyph.setScale(1.18, 0.72);
        break;
    }

    const burstLike = profile.motion === "burst" || profile.motion === "guard";
    this.scene.tweens.add({
      targets: glyph,
      scaleX: burstLike ? 1 : 0.62,
      scaleY: burstLike ? 0.58 : 0.62,
      rotation: glyph.rotation + (burstLike ? 0.4 : -0.12),
      alpha: 0.88,
      duration: Math.max(45, profile.impactDelayMs - 12),
      ease: "Sine.In",
      onUpdate: () => {
        if (source.sprite.active) glyph.setPosition(source.sprite.x, source.sprite.y + 10);
      },
      onComplete: () => this.releaseGraphics(glyph),
    });
  }

  play(effect: EffectMessage, source?: EntityView): void {
    const color = parseColor(effect.color, effect.type === "damage" ? 0xff5d67 : 0x74d7ff);
    const radius = Math.max(12, finite(effect.radius, 54));
    const angle = finite(effect.angle, source?.state.angle ?? 0);
    const profile = effect.actionId ? getActionPresentation(effect.actionId) : undefined;
    const intensity = profile?.intensity ?? 1;

    switch (effect.type) {
      case "damage":
        this.playHit(effect.x, effect.y, angle, color, intensity);
        break;
      case "heal":
        this.playAura(effect.x, effect.y, radius, color, "heal", source);
        break;
      case "shield":
      case "buff":
        this.playAura(effect.x, effect.y, radius, color, effect.type, source);
        break;
      case "dash":
        this.playDash(effect.x, effect.y, radius, angle, color, source, intensity);
        break;
      case "projectile":
        this.playProjectileCast(effect.x, effect.y, angle, color, source, profile);
        break;
      case "death":
        this.playDeath(effect.x, effect.y, radius, angle, color);
        break;
      case "jump":
        this.playRing(effect.x, effect.y + 14, radius, color, 260, 1.45);
        this.playSparks(effect.x, effect.y + 12, color, 5, 38, 260, -Math.PI / 2);
        break;
      case "ring":
        this.playCareerArt(effect.x, effect.y, radius, angle, source, 1.15 * intensity, 430, false);
        this.playRing(effect.x, effect.y, radius, color, 420, 1.65);
        this.playBurst(effect.x, effect.y, radius, color, profile);
        this.playSparks(effect.x, effect.y, color, Math.round(10 + 3 * intensity), radius * 0.8, 400);
        break;
      case "skillSlash":
        this.playCareerArt(effect.x, effect.y, radius, angle, source, 1.05 * intensity, 360, true);
        this.playSkillSlashes(effect.x, effect.y, radius, angle, color, profile);
        this.playSparks(effect.x, effect.y, color, Math.round(8 + 3 * intensity), radius * 0.72, 330, angle);
        break;
      case "slash":
      default:
        this.playSlashTrail(effect.x, effect.y, radius * 0.72, angle, color, 190);
        this.playSparks(effect.x, effect.y, color, 4, radius * 0.42, 190, angle);
        break;
    }

    if (effect.text) this.playText(effect.x, effect.y - radius, effect.text, color);
  }

  destroy(): void {
    const graphics = [...this.activeGraphics, ...this.graphicsPool];
    const images = [...this.activeImages, ...this.imagePool];
    this.activeGraphics.clear();
    this.activeImages.clear();
    this.graphicsPool.length = 0;
    this.imagePool.length = 0;
    for (const object of graphics) {
      this.scene.tweens.killTweensOf(object);
      object.destroy();
    }
    for (const object of images) {
      this.scene.tweens.killTweensOf(object);
      object.destroy();
    }
  }

  private playCareerArt(
    x: number,
    y: number,
    radius: number,
    angle: number,
    source: EntityView | undefined,
    intensity: number,
    duration: number,
    directional: boolean,
  ): void {
    const texture = this.careerTexture(source?.state);
    if (!texture || !this.scene.textures.exists(texture)) return;

    const size = Phaser.Math.Clamp(radius * 2.7, 120, 410);
    const rotation = directional ? angle : angle * 0.12;
    const image = this.acquireImage(texture, x, y, 8050)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setRotation(rotation)
      .setDisplaySize(size * 0.58, size * 0.58)
      .setAlpha(Math.min(1, 0.82 * intensity));
    const imageScaleX = image.scaleX;
    const imageScaleY = image.scaleY;

    const afterimage = this.acquireImage(texture, x, y, 8049)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setRotation(rotation - (directional ? 0.12 : 0.04))
      .setDisplaySize(size * 0.46, size * 0.46)
      .setAlpha(Math.min(0.52, 0.28 * intensity));
    const afterScaleX = afterimage.scaleX;
    const afterScaleY = afterimage.scaleY;

    this.scene.tweens.add({
      targets: image,
      scaleX: imageScaleX * 1.86,
      scaleY: imageScaleY * 1.86,
      alpha: 0,
      duration,
      ease: "Cubic.Out",
      onComplete: () => this.releaseImage(image),
    });
    this.scene.tweens.add({
      targets: afterimage,
      scaleX: afterScaleX * 2.8,
      scaleY: afterScaleY * 2.8,
      rotation: afterimage.rotation + (directional ? 0.18 : 0.1),
      alpha: 0,
      duration: Math.round(duration * 1.15),
      ease: "Quad.Out",
      onComplete: () => this.releaseImage(afterimage),
    });
  }

  private playSkillSlashes(
    x: number,
    y: number,
    radius: number,
    angle: number,
    color: number,
    profile?: ActionPresentation,
  ): void {
    const actionId = profile?.actionId ?? "";
    const count = actionId === "triple-cut" || actionId === "phantom-array" || actionId === "blade-storm" ? 3 : 1;
    for (let index = 0; index < count; index += 1) {
      this.scene.time.delayedCall(index * 55, () => {
        if (!this.scene.sys.isActive()) return;
        const offset = (index - (count - 1) / 2) * 0.18;
        this.playSlashTrail(x, y, radius * (1 - index * 0.07), angle + offset, color, 300 + index * 45);
      });
    }
    if (profile?.motion === "thrust") this.playThrustLine(x, y, radius, angle, color);
  }

  private playSlashTrail(x: number, y: number, radius: number, angle: number, color: number, duration: number): void {
    const trail = this.acquireGraphics(x, y, 8055).setRotation(angle).setBlendMode(Phaser.BlendModes.ADD);
    trail.lineStyle(Math.max(4, radius * 0.09), 0xffffff, 0.95);
    trail.beginPath();
    trail.arc(0, 0, radius * 0.8, -0.92, 0.92, false);
    trail.strokePath();
    trail.lineStyle(Math.max(2, radius * 0.045), color, 0.72);
    trail.beginPath();
    trail.arc(0, 0, radius, -1.04, 1.04, false);
    trail.strokePath();
    trail.setScale(0.62, 0.78);
    this.scene.tweens.add({
      targets: trail,
      scaleX: 1.18,
      scaleY: 1.05,
      alpha: 0,
      duration,
      ease: "Cubic.Out",
      onComplete: () => this.releaseGraphics(trail),
    });
  }

  private playThrustLine(x: number, y: number, radius: number, angle: number, color: number): void {
    const line = this.acquireGraphics(x, y, 8058).setRotation(angle).setBlendMode(Phaser.BlendModes.ADD);
    line.fillStyle(color, 0.18).fillTriangle(0, -16, radius * 1.25, 0, 0, 16);
    line.lineStyle(8, 0xffffff, 0.9).lineBetween(6, 0, radius * 1.18, 0);
    line.lineStyle(3, color, 0.9).lineBetween(0, -8, radius, -4);
    this.scene.tweens.add({
      targets: line,
      scaleX: 1.25,
      alpha: 0,
      duration: 250,
      ease: "Cubic.Out",
      onComplete: () => this.releaseGraphics(line),
    });
  }

  private playDash(
    x: number,
    y: number,
    distance: number,
    angle: number,
    color: number,
    source: EntityView | undefined,
    intensity: number,
  ): void {
    this.playCareerArt(x, y, Math.min(distance * 0.55, 105), angle, source, 0.62 * intensity, 300, true);
    const streak = this.acquireGraphics(x, y, 8035).setRotation(angle).setBlendMode(Phaser.BlendModes.ADD);
    streak.fillStyle(color, 0.18).fillTriangle(0, -25, 0, 25, -distance, 0);
    streak.lineStyle(7, color, 0.82).lineBetween(0, 0, -distance, 0);
    streak.lineStyle(2, 0xffffff, 0.7).lineBetween(-12, -10, -distance * 0.82, -10);
    this.scene.tweens.add({
      targets: streak,
      alpha: 0,
      scaleX: 1.12,
      duration: 300,
      ease: "Cubic.Out",
      onComplete: () => this.releaseGraphics(streak),
    });
    this.playDashAfterimages(x, y, distance, angle, color, source);
    this.playSparks(x, y, color, 7, Math.min(distance * 0.45, 90), 280, angle + Math.PI);
  }

  private playDashAfterimages(
    x: number,
    y: number,
    distance: number,
    angle: number,
    color: number,
    source?: EntityView,
  ): void {
    if (!source?.sprite.active) return;
    for (let index = 0; index < 3; index += 1) {
      const progress = (index + 1) / 4;
      const ghost = this.acquireImage(source.sprite.texture.key, x, y, 8042)
        .setFrame(source.sprite.frame.name)
        .setOrigin(source.sprite.originX, source.sprite.originY)
        .setDisplaySize(source.sprite.displayWidth, source.sprite.displayHeight)
        .setFlipX(source.sprite.flipX)
        .setAngle(source.sprite.angle)
        .setTint(color)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setAlpha(0.34 - index * 0.07)
        .setPosition(
          x + Math.cos(angle) * distance * progress,
          y + Math.sin(angle) * distance * progress,
        );
      this.scene.tweens.add({
        targets: ghost,
        alpha: 0,
        duration: 210 + index * 45,
        ease: "Quad.Out",
        onComplete: () => this.releaseImage(ghost),
      });
    }
  }

  private playProjectileCast(
    x: number,
    y: number,
    angle: number,
    color: number,
    source?: EntityView,
    profile?: ActionPresentation,
  ): void {
    this.playCareerArt(x, y, 45, angle, source, 0.45 * (profile?.intensity ?? 1), 190, true);
    this.playRing(x, y, 30, color, 220, 1.7);
    this.playThrustLine(x, y, 58, angle, color);
    this.playSparks(x, y, color, 5, 42, 220, angle);
  }

  private playAura(
    x: number,
    y: number,
    radius: number,
    color: number,
    type: "heal" | "shield" | "buff",
    source?: EntityView,
  ): void {
    if (type !== "heal") this.playCareerArt(x, y, radius, 0, source, 0.42, 520, false);
    this.playRing(x, y + 12, radius, color, 540, type === "shield" ? 1.25 : 1.65);
    this.playRing(x, y + 12, radius * 0.66, type === "heal" ? 0xffffff : color, 420, 1.5);
    this.playSparks(x, y + 18, color, type === "heal" ? 11 : 8, radius * 0.8, 520, -Math.PI / 2);
  }

  private playHit(x: number, y: number, angle: number, color: number, intensity: number): void {
    const flash = this.acquireGraphics(x, y, 8090).setBlendMode(Phaser.BlendModes.ADD).setRotation(angle);
    flash.fillStyle(0xffffff, 0.95).fillCircle(0, 0, 9 * intensity);
    flash.lineStyle(4, color, 0.92);
    for (let index = 0; index < 7; index += 1) {
      const spread = -0.9 + (1.8 * index) / 6;
      flash.lineBetween(5, spread * 4, 30 * intensity, spread * 22 * intensity);
    }
    this.scene.tweens.add({
      targets: flash,
      scale: 1.55,
      alpha: 0,
      duration: 190,
      ease: "Quad.Out",
      onComplete: () => this.releaseGraphics(flash),
    });
    this.playSparks(x, y, color, Math.round(7 + intensity * 2), 58 * intensity, 300, angle);
  }

  private playDeath(x: number, y: number, radius: number, angle: number, color: number): void {
    this.playRing(x, y, radius, color, 520, 2.1);
    this.playBurst(x, y, radius, color);
    this.playSparks(x, y, color, 18, radius * 1.3, 620, angle);
  }

  private playBurst(x: number, y: number, radius: number, color: number, profile?: ActionPresentation): void {
    const burst = this.acquireGraphics(x, y, 8062).setBlendMode(Phaser.BlendModes.ADD);
    const spokes = profile?.kind === "nova" ? 14 : 10;
    burst.fillStyle(color, 0.13).fillCircle(0, 0, radius * 0.72);
    for (let index = 0; index < spokes; index += 1) {
      const angle = (Math.PI * 2 * index) / spokes;
      const length = radius * (index % 2 === 0 ? 1.12 : 0.82);
      burst.lineStyle(index % 3 === 0 ? 5 : 2, index % 3 === 0 ? 0xffffff : color, 0.75);
      burst.lineBetween(
        Math.cos(angle) * radius * 0.2,
        Math.sin(angle) * radius * 0.2,
        Math.cos(angle) * length,
        Math.sin(angle) * length,
      );
    }
    burst.setScale(0.45, 0.32);
    this.scene.tweens.add({
      targets: burst,
      scaleX: 1.2,
      scaleY: 0.76,
      rotation: 0.18,
      alpha: 0,
      duration: profile?.kind === "nova" ? 520 : 360,
      ease: "Cubic.Out",
      onComplete: () => this.releaseGraphics(burst),
    });

    if (profile?.kind !== "nova") return;
    for (let index = 1; index <= 2; index += 1) {
      this.scene.time.delayedCall(index * 80, () => {
        if (this.scene.sys.isActive()) this.playRing(x, y, radius * (0.78 + index * 0.12), color, 360, 1.55);
      });
    }
  }

  private playRing(x: number, y: number, radius: number, color: number, duration: number, endScale: number): void {
    const ring = this.acquireGraphics(x, y, 8030).setBlendMode(Phaser.BlendModes.ADD);
    ring.lineStyle(Math.max(3, radius * 0.07), color, 0.88).strokeCircle(0, 0, radius);
    ring.lineStyle(2, 0xffffff, 0.5).strokeCircle(0, 0, radius * 0.78);
    ring.fillStyle(color, 0.08).fillCircle(0, 0, radius);
    ring.setScale(0.56, 0.38);
    this.scene.tweens.add({
      targets: ring,
      scaleX: endScale,
      scaleY: endScale * 0.55,
      alpha: 0,
      duration,
      ease: "Cubic.Out",
      onComplete: () => this.releaseGraphics(ring),
    });
  }

  private playSparks(
    x: number,
    y: number,
    color: number,
    count: number,
    travel: number,
    duration: number,
    bias?: number,
  ): void {
    for (let index = 0; index < count; index += 1) {
      const spread = bias === undefined
        ? Phaser.Math.FloatBetween(-Math.PI, Math.PI)
        : bias + Phaser.Math.FloatBetween(-0.8, 0.8);
      const distance = travel * Phaser.Math.FloatBetween(0.48, 1);
      const spark = this.acquireImage(TEXTURES.fxParticle, x, y, 8070)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setTint(index % 3 === 0 ? 0xffffff : color)
        .setRotation(spread)
        .setScale(Phaser.Math.FloatBetween(0.55, 1.3))
        .setAlpha(Phaser.Math.FloatBetween(0.6, 1));
      this.scene.tweens.add({
        targets: spark,
        x: x + Math.cos(spread) * distance,
        y: y + Math.sin(spread) * distance * 0.62,
        scaleX: 0.1,
        scaleY: 0.1,
        alpha: 0,
        duration: Math.round(duration * Phaser.Math.FloatBetween(0.72, 1.12)),
        ease: "Cubic.Out",
        onComplete: () => this.releaseImage(spark),
      });
    }
  }

  private playText(x: number, y: number, value: string, color: number): void {
    const text = this.scene.add.text(x, y, value, {
      fontFamily: "system-ui, sans-serif",
      fontSize: "18px",
      fontStyle: "bold",
      color: `#${color.toString(16).padStart(6, "0")}`,
      stroke: "#090c12",
      strokeThickness: 4,
    }).setOrigin(0.5).setDepth(8100);
    this.scene.tweens.add({
      targets: text,
      y: y - 34,
      alpha: 0,
      duration: 650,
      ease: "Cubic.Out",
      onComplete: () => text.destroy(),
    });
  }

  private acquireGraphics(x: number, y: number, depth: number): Phaser.GameObjects.Graphics {
    const graphics = this.graphicsPool.pop() ?? this.scene.add.graphics();
    this.activeGraphics.add(graphics);
    graphics.clear();
    graphics.setActive(true).setVisible(true).setPosition(x, y).setDepth(depth);
    graphics.setAlpha(1).setScale(1).setRotation(0).setBlendMode(Phaser.BlendModes.NORMAL);
    return graphics;
  }

  private releaseGraphics(graphics: Phaser.GameObjects.Graphics): void {
    if (!this.activeGraphics.delete(graphics) || !graphics.active) return;
    graphics.clear().setActive(false).setVisible(false);
    if (this.graphicsPool.length < MAX_GRAPHICS_POOL) this.graphicsPool.push(graphics);
    else graphics.destroy();
  }

  private acquireImage(texture: string, x: number, y: number, depth: number): Phaser.GameObjects.Image {
    const image = this.imagePool.pop() ?? this.scene.add.image(x, y, texture);
    this.activeImages.add(image);
    image.setTexture(texture).setActive(true).setVisible(true).setPosition(x, y).setDepth(depth);
    image.setOrigin(0.5).setAlpha(1).setScale(1).setRotation(0).setFlip(false, false);
    image.clearTint().setBlendMode(Phaser.BlendModes.NORMAL);
    return image;
  }

  private releaseImage(image: Phaser.GameObjects.Image): void {
    if (!this.activeImages.delete(image) || !image.active) return;
    image.setActive(false).setVisible(false);
    if (this.imagePool.length < MAX_IMAGE_POOL) this.imagePool.push(image);
    else image.destroy();
  }

  private careerTexture(state?: EntityStateLike): string | undefined {
    if (!state || state.kind === "boss") return undefined;
    const careerId = state.careerId ?? "berserker";
    return CAREER_EFFECT_TEXTURES[careerId as keyof typeof CAREER_EFFECT_TEXTURES];
  }

  careerColor(state?: EntityStateLike): number {
    return CAREERS[state?.careerId ?? ""]?.color ?? 0x74d7ff;
  }
}
