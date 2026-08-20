import Phaser from "phaser";
import { CHARACTER_SPRITESHEET_ASSETS, CHARACTER_TEXTURE_ASSETS } from "../assets/characterAssets";
import { EFFECT_TEXTURE_ASSETS } from "../assets/effectAssets";
import { BASIC_ATTACK_ANIMATION, BLOOD_SLASH_ANIMATION, TEXTURES } from "../constants";

const CHARACTER_ANIMATIONS = [BASIC_ATTACK_ANIMATION, BLOOD_SLASH_ANIMATION] as const;

export class BootScene extends Phaser.Scene {
  constructor() {
    super("BootScene");
  }

  preload(): void {
    for (const asset of CHARACTER_TEXTURE_ASSETS) {
      this.load.image(asset.key, asset.url);
    }
    for (const asset of CHARACTER_SPRITESHEET_ASSETS) {
      this.load.spritesheet(asset.key, asset.url, {
        frameWidth: asset.frameWidth,
        frameHeight: asset.frameHeight,
      });
    }
    for (const asset of EFFECT_TEXTURE_ASSETS) {
      this.load.image(asset.key, asset.url);
    }
  }

  create(): void {
    // These generators are retained as local fallbacks if a bitmap fails to load.
    this.createFighterTextures();
    this.createBossTexture();
    this.createCharacterAnimations();
    this.createLootTextures();
    this.createProjectileTexture();
    this.createFxParticleTexture();
    this.createPortalTexture();
    this.createWallTexture();
    this.scene.start("NetworkScene");
  }

  private createCharacterAnimations(): void {
    for (const clip of CHARACTER_ANIMATIONS) {
      if (!this.textures.exists(clip.textureKey) || this.anims.exists(clip.key)) continue;
      this.anims.create({
        key: clip.key,
        frames: clip.frameDurations.map((duration, frame) => ({
          key: clip.textureKey,
          frame,
          duration,
        })),
        repeat: 0,
      });
    }
  }

  private graphics(): Phaser.GameObjects.Graphics {
    return this.add.graphics({ x: 0, y: 0 }).setVisible(false);
  }

  private createFighterTextures(): void {
    this.createFighter(TEXTURES.fighters.berserker, 0xc8353d, 0x641b25, "spikes");
    this.createFighter(TEXTURES.fighters.weaponMaster, 0x4e9fe3, 0x183c73, "ponytail");
    this.createFighter(TEXTURES.fighters.soulBender, 0x8054c7, 0x2b2148, "hood");
    this.createFighter(TEXTURES.fighters.ghostblade, 0x35ad9c, 0x124f52, "scarf");
    this.createFighter(TEXTURES.fighters.asura, 0xd89b35, 0x5d3a19, "blindfold");
  }

  private createFighter(key: string, primary: number, dark: number, style: string): void {
    if (this.textures.exists(key)) return;
    const g = this.graphics();
    if (style === "hood") {
      g.fillStyle(0x8c63d2, 0.25).fillRect(8, 28, 8, 36).fillRect(56, 28, 8, 36);
      g.fillStyle(dark).fillRect(19, 8, 34, 27).fillRect(15, 14, 8, 23).fillRect(49, 14, 8, 23);
    } else {
      g.fillStyle(style === "ponytail" ? 0xe8eef4 : dark).fillRect(22, 6, 31, 11).fillRect(17, 12, 39, 10);
      if (style === "spikes") g.fillTriangle(18, 13, 22, 1, 29, 14).fillTriangle(28, 10, 35, 0, 39, 13).fillTriangle(39, 11, 49, 2, 50, 15);
      if (style === "ponytail") g.fillRect(49, 13, 13, 7).fillRect(57, 18, 8, 17);
    }
    g.fillStyle(0xf1c49d).fillRect(23, 16, 29, 23).fillRect(19, 22, 6, 12).fillRect(51, 22, 6, 12);
    g.fillStyle(0x191b22).fillRect(28, 24, 5, 4).fillRect(43, 24, 5, 4);
    if (style === "blindfold") g.fillStyle(0xe8d6aa).fillRect(22, 21, 33, 9).fillStyle(0x4b3522).fillRect(25, 23, 27, 5);
    g.fillStyle(primary).fillRect(18, 39, 39, 29).fillRect(13, 44, 9, 21).fillRect(53, 44, 9, 21);
    g.fillStyle(dark).fillRect(24, 42, 27, 8).fillRect(18, 61, 39, 8);
    g.fillStyle(0xe7edf5).fillRect(10, 50, 7, 13).fillRect(58, 50, 7, 13);
    g.fillStyle(0x222936).fillRect(22, 68, 12, 15).fillRect(42, 68, 12, 15);
    g.fillStyle(primary).fillRect(18, 81, 17, 5).fillRect(41, 81, 17, 5);
    if (style === "scarf") g.fillStyle(0x76ead9).fillRect(18, 35, 39, 7).fillRect(11, 38, 12, 6).fillRect(6, 43, 11, 5);
    g.fillStyle(0xf4f7fb).fillRect(58, 14, 5, 48).fillRect(55, 10, 11, 8).fillRect(57, 6, 7, 7);
    g.fillStyle(0x9ba7b7).fillRect(59, 19, 3, 39);
    g.fillStyle(dark).fillRect(52, 58, 18, 6).fillRect(58, 63, 6, 8);
    g.generateTexture(key, 76, 88);
    g.destroy();
  }

  private createBossTexture(): void {
    if (this.textures.exists(TEXTURES.boss)) return;
    const graphics = this.graphics();

    graphics.fillStyle(0xd8c49c).fillRect(8, 14, 24, 10).fillRect(96, 14, 24, 10);
    graphics.fillTriangle(4, 14, 34, 10, 29, 30).fillTriangle(124, 14, 94, 10, 99, 30);
    graphics.fillStyle(0x323944).fillRect(29, 10, 70, 39).fillRect(20, 27, 88, 18);
    graphics.fillStyle(0x687382).fillRect(36, 13, 56, 33).fillRect(45, 41, 38, 18);
    graphics.fillStyle(0xe8453f).fillRect(39, 28, 13, 7).fillRect(76, 28, 13, 7);
    graphics.fillStyle(0x161a20).fillRect(53, 43, 22, 12).fillRect(58, 48, 5, 5).fillRect(68, 48, 5, 5);
    graphics.fillStyle(0x404a57).fillRect(27, 56, 74, 38).fillRect(14, 61, 17, 35).fillRect(97, 61, 17, 35);
    graphics.fillStyle(0x707c8c).fillRect(36, 61, 56, 25).fillRect(8, 67, 14, 23).fillRect(106, 67, 14, 23);
    graphics.fillStyle(0xf05245).fillRect(55, 65, 19, 15).fillStyle(0xffb24c).fillRect(60, 68, 9, 9);
    graphics.fillStyle(0x242a34).fillRect(34, 88, 22, 25).fillRect(72, 88, 22, 25);
    graphics.fillStyle(0x7d8795).fillRect(29, 106, 31, 8).fillRect(68, 106, 31, 8);
    graphics.fillStyle(0xe2e8ef).fillRect(15, 91, 7, 16).fillRect(106, 91, 7, 16);
    graphics.generateTexture(TEXTURES.boss, 128, 116);
    graphics.destroy();
  }

  private createLootTextures(): void {
    if (!this.textures.exists(TEXTURES.weaponLoot)) {
      const graphics = this.graphics();
      graphics.fillStyle(0xf5f7fb).fillRect(16, 2, 6, 23).fillRect(13, 5, 12, 5);
      graphics.fillStyle(0x9aa9bb).fillRect(18, 7, 3, 17);
      graphics.fillStyle(0x334155).fillRect(10, 23, 18, 5).fillRect(16, 28, 6, 7);
      graphics.generateTexture(TEXTURES.weaponLoot, 36, 36);
      graphics.destroy();
    }

    if (!this.textures.exists(TEXTURES.armorLoot)) {
      const graphics = this.graphics();
      graphics.fillStyle(0xcbd5e1).fillRect(8, 7, 20, 23).fillRect(4, 11, 8, 12).fillRect(24, 11, 8, 12);
      graphics.fillStyle(0x475569).fillRect(13, 10, 10, 17).fillRect(8, 25, 20, 6);
      graphics.fillStyle(0xf1f5f9).fillRect(11, 8, 14, 4);
      graphics.generateTexture(TEXTURES.armorLoot, 36, 36);
      graphics.destroy();
    }

    if (!this.textures.exists(TEXTURES.potion)) {
      const graphics = this.graphics();
      graphics.fillStyle(0x111827, 0.45).fillEllipse(16, 29, 22, 7);
      graphics.fillStyle(0xffffff).fillRoundedRect(7, 10, 18, 19, 6);
      graphics.fillStyle(0xdce7f5).fillRect(11, 4, 10, 8);
      graphics.fillStyle(0xffffff).fillRect(9, 2, 14, 4);
      graphics.generateTexture(TEXTURES.potion, 32, 34);
      graphics.destroy();
    }
  }

  private createProjectileTexture(): void {
    if (this.textures.exists(TEXTURES.projectile)) return;
    const graphics = this.graphics();
    graphics.fillStyle(0xffffff, 0.25).fillEllipse(14, 6, 27, 11);
    graphics.fillStyle(0xffffff).fillRoundedRect(4, 3, 27, 6, 3);
    graphics.fillTriangle(30, 1, 38, 6, 30, 11);
    graphics.generateTexture(TEXTURES.projectile, 40, 12);
    graphics.destroy();
  }

  private createFxParticleTexture(): void {
    if (this.textures.exists(TEXTURES.fxParticle)) return;
    const graphics = this.graphics();
    graphics.fillStyle(0xffffff, 0.3).fillCircle(8, 8, 8);
    graphics.fillStyle(0xffffff, 0.9).fillCircle(8, 8, 4);
    graphics.fillStyle(0xffffff).fillCircle(8, 8, 2);
    graphics.generateTexture(TEXTURES.fxParticle, 16, 16);
    graphics.destroy();
  }

  private createPortalTexture(): void {
    if (this.textures.exists(TEXTURES.portal)) return;
    const graphics = this.graphics();
    graphics.fillStyle(0x65d8ff, 0.12).fillCircle(48, 48, 45);
    graphics.lineStyle(6, 0xffffff, 0.85).strokeCircle(48, 48, 35);
    graphics.lineStyle(2, 0xffffff, 0.45).strokeCircle(48, 48, 44);
    graphics.fillStyle(0xffffff, 0.24).fillCircle(48, 48, 23);
    graphics.generateTexture(TEXTURES.portal, 96, 96);
    graphics.destroy();
  }

  private createWallTexture(): void {
    if (this.textures.exists(TEXTURES.wall)) return;
    const graphics = this.graphics();
    graphics.fillStyle(0xffffff).fillRect(0, 0, 16, 16);
    graphics.generateTexture(TEXTURES.wall, 16, 16);
    graphics.destroy();
  }
}
