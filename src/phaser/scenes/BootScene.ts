import Phaser from "phaser";
import { TEXTURES } from "../constants";

export class BootScene extends Phaser.Scene {
  constructor() {
    super("BootScene");
  }

  create(): void {
    this.createFighterTexture();
    this.createBossTexture();
    this.createLootTextures();
    this.createProjectileTexture();
    this.createPortalTexture();
    this.createWallTexture();
    this.scene.start("NetworkScene");
  }

  private graphics(): Phaser.GameObjects.Graphics {
    return this.add.graphics({ x: 0, y: 0 }).setVisible(false);
  }

  private createFighterTexture(): void {
    if (this.textures.exists(TEXTURES.fighter)) return;
    const graphics = this.graphics();

    graphics.fillStyle(0x111827, 0.45).fillEllipse(32, 72, 46, 12);
    graphics.fillStyle(0xf2d3b1).fillCircle(31, 19, 11);
    graphics.fillStyle(0xffffff).fillRoundedRect(17, 29, 29, 33, 7);
    graphics.fillStyle(0xdce7f5).fillTriangle(17, 30, 8, 54, 22, 48);
    graphics.fillStyle(0x253247).fillRect(20, 60, 9, 13).fillRect(35, 60, 9, 13);
    graphics.fillStyle(0xe9f3ff).fillRoundedRect(47, 15, 5, 42, 2);
    graphics.fillStyle(0x26364d).fillRect(43, 50, 14, 5);
    graphics.lineStyle(2, 0xffffff, 0.55).strokeRoundedRect(17, 29, 29, 33, 7);

    graphics.generateTexture(TEXTURES.fighter, 64, 80);
    graphics.destroy();
  }

  private createBossTexture(): void {
    if (this.textures.exists(TEXTURES.boss)) return;
    const graphics = this.graphics();

    graphics.fillStyle(0x05070b, 0.55).fillEllipse(55, 102, 86, 18);
    graphics.fillStyle(0xf1c9a5).fillCircle(55, 25, 17);
    graphics.fillStyle(0xffffff).fillRoundedRect(26, 42, 59, 52, 12);
    graphics.fillStyle(0x20293a).fillTriangle(28, 46, 8, 87, 38, 75);
    graphics.fillTriangle(82, 46, 102, 87, 72, 75);
    graphics.fillStyle(0x151b27).fillRect(35, 91, 15, 17).fillRect(61, 91, 15, 17);
    graphics.fillStyle(0xffffff).fillTriangle(37, 13, 45, 0, 50, 16);
    graphics.fillTriangle(61, 16, 67, 0, 74, 15);
    graphics.lineStyle(4, 0xffffff, 0.7).strokeRoundedRect(26, 42, 59, 52, 12);

    graphics.generateTexture(TEXTURES.boss, 110, 112);
    graphics.destroy();
  }

  private createLootTextures(): void {
    if (!this.textures.exists(TEXTURES.loot)) {
      const graphics = this.graphics();
      graphics.fillStyle(0x111827, 0.45).fillEllipse(18, 31, 29, 8);
      graphics.fillStyle(0xffffff).fillRoundedRect(4, 10, 28, 19, 4);
      graphics.fillStyle(0xd5deeb).fillRoundedRect(5, 5, 26, 12, 5);
      graphics.fillStyle(0x253247).fillRect(15, 14, 6, 9);
      graphics.lineStyle(2, 0xffffff, 0.7).strokeRoundedRect(4, 10, 28, 19, 4);
      graphics.generateTexture(TEXTURES.loot, 36, 36);
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

