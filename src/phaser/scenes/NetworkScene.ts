import Phaser from "phaser";
import type { Room } from "@colyseus/sdk";
import {
  BATTLE,
  BATTLE_OBSTACLES,
  PORTAL,
  PREPARATION_OBSTACLES,
  WORLD,
  isActionMessage,
  isOwnedBy,
  type ActionMessage,
  type EffectMessage,
  type FeedMessage,
  type InputMessage,
  type MatchEndMessage,
} from "../../shared/protocol";
import {
  CAREERS,
  DEFAULT_CAREER,
  SKILL_NAMES,
  TEXTURES,
} from "../constants";
import { displayKey, emitGameEvent, formatClock } from "../events";
import {
  DEFAULT_BINDINGS,
  SCENE_BRIDGE_KEY,
  type BattleStateLike,
  type EntityStateLike,
  type GameStage,
  type LootStateLike,
  type PhaserClientConfig,
  type PhaserSceneHandle,
  type ProjectileStateLike,
  type SceneBridge,
  type SchemaMapLike,
  type ZoneStateLike,
} from "../types";
import { EntityView } from "../views/EntityView";
import { LootView, parseColor, ProjectileView } from "../views/WorldObjectViews";

const INPUT_INTERVAL_MS = 1000 / 30;
const PLAYER_SPEED_FALLBACK = 235;
const SLOW_SPEED_MULTIPLIER = 0.55;
const BUFF_SPEED_MULTIPLIER = 1.18;
const PICKUP_RANGE = 76;

export class NetworkScene extends Phaser.Scene implements PhaserSceneHandle {
  private config: PhaserClientConfig = {};
  private room?: Room;
  private sessionId = "";
  private paused = false;
  private stage: GameStage = "preparation";
  private sequence = 0;
  private inputAccumulator = 0;
  private pointerAngle = 0;
  private keys = new Set<string>();
  private entityViews = new Map<string, EntityView>();
  private lootViews = new Map<string, LootView>();
  private projectileViews = new Map<string, ProjectileView>();
  private localEntity?: EntityView;
  private mapGraphics!: Phaser.GameObjects.Graphics;
  private zoneGraphics!: Phaser.GameObjects.Graphics;
  private portal!: Phaser.GameObjects.Sprite;
  private wallGroup!: Phaser.Physics.Arcade.StaticGroup;
  private mapLabels: Phaser.GameObjects.Text[] = [];
  private localCollider?: Phaser.Physics.Arcade.Collider;
  private zone: ZoneStateLike = {
    x: BATTLE.zoneX,
    y: BATTLE.zoneY,
    radius: BATTLE.zoneRadius,
    phase: 0,
    timer: 0,
  };
  private lastPickupSignature = "";
  private intentionalDetach = false;

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (this.isBoundCode(event.code) || event.code === "Escape") event.preventDefault();
    if (event.code === "Escape" && !event.repeat) {
      this.setPaused(!this.paused);
      return;
    }
    if (this.paused) return;
    this.keys.add(event.code);
    if (!event.repeat) this.handleBoundAction(event.code);
  };

  private readonly onKeyUp = (event: KeyboardEvent): void => {
    this.keys.delete(event.code);
  };

  private readonly onPointerDown = (pointer: Phaser.Input.Pointer): void => {
    if (!this.paused && pointer.leftButtonDown()) this.sendAction({ type: "attack" });
  };

  constructor() {
    super("NetworkScene");
  }

  create(): void {
    const bridge = this.registry.get(SCENE_BRIDGE_KEY) as SceneBridge | undefined;
    if (!bridge) throw new Error("Phaser client bridge is missing.");
    this.config = bridge.config;

    this.mapGraphics = this.add.graphics().setDepth(-1000);
    this.zoneGraphics = this.add.graphics().setDepth(9000);
    this.wallGroup = this.physics.add.staticGroup();
    this.portal = this.add.sprite(PORTAL.x, PORTAL.y, TEXTURES.portal).setTint(0x57c7ff).setDepth(1200);
    this.tweens.add({
      targets: this.portal,
      scale: { from: 0.9, to: 1.08 },
      alpha: { from: 0.68, to: 1 },
      duration: 1050,
      ease: "Sine.InOut",
      yoyo: true,
      repeat: -1,
    });

    this.physics.world.setBounds(0, 0, WORLD.width, WORLD.height);
    this.cameras.main.setBounds(0, 0, WORLD.width, WORLD.height);
    this.cameras.main.setBackgroundColor(0x0d121b);
    this.buildMap(this.stage);

    const keyboard = this.input.keyboard;
    keyboard?.on("keydown", this.onKeyDown);
    keyboard?.on("keyup", this.onKeyUp);
    this.input.on("pointerdown", this.onPointerDown);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.shutdown, this);

    bridge.onSceneReady(this);
    if (bridge.room) this.attachRoom(bridge.room);
  }

  update(_time: number, delta: number): void {
    this.updatePointerAngle();

    for (const view of this.entityViews.values()) view.update(delta);
    for (const view of this.lootViews.values()) view.update(delta);
    for (const view of this.projectileViews.values()) view.update(delta);

    this.updateLocalPrediction();
    this.updatePickupPrompt();

    this.inputAccumulator += delta;
    if (this.room && this.inputAccumulator >= INPUT_INTERVAL_MS) {
      this.inputAccumulator %= INPUT_INTERVAL_MS;
      this.room.send("input", this.createInputMessage());
    }
  }

  attachRoom(room: Room): void {
    if (this.room === room) return;
    this.detachRoom();
    this.room = room;
    this.sessionId = room.sessionId;
    this.intentionalDetach = false;

    room.onStateChange((state: unknown) => {
      if (this.room !== room || !this.sys.isActive()) return;
      this.applyState(state as BattleStateLike);
    });
    room.onMessage("feed", (message: FeedMessage) => this.handleFeed(message));
    room.onMessage("effect", (message: EffectMessage) => this.handleEffect(message));
    room.onMessage("matchEnd", (message: MatchEndMessage) => this.handleMatchEnd(message));
    room.onError((code: number, message?: string) => {
      if (this.room !== room) return;
      emitGameEvent("feed", { text: `网络错误 ${code}：${message}`, tone: "danger" });
    });
    room.onLeave((code: number) => {
      if (this.room !== room || this.intentionalDetach) return;
      emitGameEvent("feed", { text: `与战斗服务器的连接已断开（${code}）`, tone: "danger" });
    });

    this.applyState(room.state as unknown as BattleStateLike);
    emitGameEvent("feed", { text: "已连接战斗房间", tone: "good" });
  }

  detachRoom(): void {
    this.intentionalDetach = true;
    this.room = undefined;
    this.sessionId = "";
    this.keys.clear();
  }

  setPaused(paused: boolean): void {
    if (this.paused === paused) return;
    this.paused = paused;
    this.keys.clear();
    if (paused) {
      this.physics.pause();
      this.localEntity?.sprite.setVelocity(0, 0);
    } else {
      this.physics.resume();
    }
    if (this.room) this.room.send("input", this.createInputMessage(true));
    emitGameEvent("pause", paused);
  }

  private shutdown(): void {
    this.detachRoom();
    this.input.keyboard?.off("keydown", this.onKeyDown);
    this.input.keyboard?.off("keyup", this.onKeyUp);
    this.input.off("pointerdown", this.onPointerDown);
    this.localCollider?.destroy();
    for (const view of this.entityViews.values()) view.destroy();
    for (const view of this.lootViews.values()) view.destroy();
    for (const view of this.projectileViews.values()) view.destroy();
    this.entityViews.clear();
    this.lootViews.clear();
    this.projectileViews.clear();
    emitGameEvent("pickup", null);
    emitGameEvent("pause", false);
  }

  private applyState(state: BattleStateLike): void {
    if (!state) return;
    this.reconcileEntities(state.entities);
    this.reconcileLoot(state.loot);
    this.reconcileProjectiles(state.projectiles);

    const nextStage = this.localEntity?.state.stage ?? this.stage;
    if (nextStage !== this.stage) {
      this.stage = nextStage;
      this.buildMap(this.stage);
      emitGameEvent("feed", {
        text: this.stage === "battle" ? "已进入主战场，缩圈即将开始" : "已进入独立发育区",
        tone: "info",
      });
    }

    if (state.zone || typeof state.zoneRadius === "number") {
      this.zone = copyZone(state.zone ?? {
        x: state.zoneX,
        y: state.zoneY,
        radius: state.zoneRadius,
        phase: state.zonePhase,
        timer: state.zoneTimer,
        label: state.zoneLabel,
      }, this.zone);
      this.drawZone();
    }
    this.emitHud(state);
  }

  private reconcileEntities(collection: SchemaMapLike<EntityStateLike> | undefined): void {
    const seen = new Set<string>();
    forEachSchema(collection, (rawState, key) => {
      const id = rawState.id || key;
      if (!this.isVisible(rawState.ownerId)) return;
      seen.add(id);
      const isLocal = this.isLocalState(id, rawState);
      let view = this.entityViews.get(id);
      if (view && view.isLocal !== isLocal) {
        view.destroy();
        this.entityViews.delete(id);
        view = undefined;
      }
      if (!view) {
        view = new EntityView(this, id, rawState, isLocal);
        this.entityViews.set(id, view);
      } else {
        view.applyState(rawState);
      }

      if (isLocal && this.localEntity !== view) this.setLocalEntity(view);
    });

    for (const [id, view] of this.entityViews) {
      if (seen.has(id)) continue;
      if (this.localEntity === view) {
        this.localEntity = undefined;
        this.cameras.main.stopFollow();
        this.localCollider?.destroy();
        this.localCollider = undefined;
      }
      view.destroy();
      this.entityViews.delete(id);
    }
  }

  private reconcileLoot(collection: SchemaMapLike<LootStateLike> | undefined): void {
    const seen = new Set<string>();
    forEachSchema(collection, (state, key) => {
      const id = state.id || key;
      if (!this.isVisible(state.ownerId)) return;
      seen.add(id);
      const view = this.lootViews.get(id);
      if (view) view.applyState(state);
      else this.lootViews.set(id, new LootView(this, id, state));
    });
    for (const [id, view] of this.lootViews) {
      if (seen.has(id)) continue;
      view.destroy();
      this.lootViews.delete(id);
    }
  }

  private reconcileProjectiles(collection: SchemaMapLike<ProjectileStateLike> | undefined): void {
    const seen = new Set<string>();
    forEachSchema(collection, (state, key) => {
      const id = state.id || key;
      if (!this.isVisible(state.ownerId)) return;
      seen.add(id);
      const view = this.projectileViews.get(id);
      if (view) view.applyState(state);
      else this.projectileViews.set(id, new ProjectileView(this, id, state));
    });
    for (const [id, view] of this.projectileViews) {
      if (seen.has(id)) continue;
      view.destroy();
      this.projectileViews.delete(id);
    }
  }

  private setLocalEntity(view: EntityView): void {
    this.localEntity = view;
    this.cameras.main.startFollow(view.sprite, false, 0.14, 0.14);
    this.cameras.main.setZoom(1);
    this.refreshLocalCollider();
  }

  private refreshLocalCollider(): void {
    this.localCollider?.destroy();
    this.localCollider = this.localEntity
      ? this.physics.add.collider(this.localEntity.sprite, this.wallGroup)
      : undefined;
  }

  private buildMap(stage: GameStage): void {
    this.mapGraphics.clear();
    for (const label of this.mapLabels) label.destroy();
    this.mapLabels = [];
    this.wallGroup.clear(true, true);

    const preparation = stage === "preparation";
    this.mapGraphics.fillStyle(preparation ? 0x121a24 : 0x11161f, 1).fillRect(0, 0, WORLD.width, WORLD.height);
    this.mapGraphics.lineStyle(1, preparation ? 0x355064 : 0x303b49, 0.22);
    for (let x = 0; x <= WORLD.width; x += 100) this.mapGraphics.lineBetween(x, 0, x, WORLD.height);
    for (let y = 0; y <= WORLD.height; y += 100) this.mapGraphics.lineBetween(0, y, WORLD.width, y);

    this.mapGraphics.lineStyle(6, preparation ? 0x4f7187 : 0x394656, 0.9).strokeRect(8, 8, WORLD.width - 16, WORLD.height - 16);

    const obstacles = preparation ? PREPARATION_OBSTACLES : BATTLE_OBSTACLES;
    for (const obstacle of obstacles) {
      this.mapGraphics.fillStyle(preparation ? 0x283846 : 0x29313c, 1)
        .fillRoundedRect(obstacle.x, obstacle.y, obstacle.w, obstacle.h, 14);
      this.mapGraphics.lineStyle(3, preparation ? 0x52748a : 0x485566, 0.9)
        .strokeRoundedRect(obstacle.x, obstacle.y, obstacle.w, obstacle.h, 14);

      const label = this.add.text(obstacle.x + obstacle.w / 2, obstacle.y + obstacle.h / 2, obstacle.label, {
        fontFamily: "system-ui, sans-serif",
        fontSize: "17px",
        color: preparation ? "#91afc0" : "#7f8d9f",
      }).setOrigin(0.5).setDepth(-900).setAlpha(0.65);
      this.mapLabels.push(label);

      const wall = this.wallGroup.create(
        obstacle.x + obstacle.w / 2,
        obstacle.y + obstacle.h / 2,
        TEXTURES.wall,
      ) as Phaser.Physics.Arcade.Image;
      wall.setDisplaySize(obstacle.w, obstacle.h).setAlpha(0.001).refreshBody();
    }

    this.portal.setVisible(preparation);
    this.portal.setActive(preparation);
    this.refreshLocalCollider();
    this.drawZone();
  }

  private drawZone(): void {
    this.zoneGraphics.clear();
    if (this.stage !== "battle") return;
    const x = finite(this.zone.x, WORLD.width / 2);
    const y = finite(this.zone.y, WORLD.height / 2);
    const radius = Math.max(20, finite(this.zone.radius, BATTLE.zoneRadius));
    this.zoneGraphics.lineStyle(14, 0x48c8ff, 0.12).strokeCircle(x, y, radius);
    this.zoneGraphics.lineStyle(4, 0x77ddff, 0.92).strokeCircle(x, y, radius);
    if (typeof this.zone.targetRadius === "number" && this.zone.targetRadius < radius) {
      this.zoneGraphics.lineStyle(2, 0xe7f8ff, 0.3).strokeCircle(
        finite(this.zone.targetX, x),
        finite(this.zone.targetY, y),
        Math.max(20, this.zone.targetRadius),
      );
    }
  }

  private updateLocalPrediction(): void {
    const local = this.localEntity;
    if (!local) return;
    if (this.paused || local.state.alive === false) {
      local.sprite.setVelocity(0, 0);
      return;
    }

    const bindings = this.bindings();
    const direction = new Phaser.Math.Vector2(
      Number(this.keys.has(bindings.moveRight)) - Number(this.keys.has(bindings.moveLeft)),
      Number(this.keys.has(bindings.moveDown)) - Number(this.keys.has(bindings.moveUp)),
    );
    if (direction.lengthSq() > 0) {
      const baseSpeed = Math.max(0, finite(local.state.speed, PLAYER_SPEED_FALLBACK));
      const slowMultiplier = finite(local.state.slowTime, 0) > 0 ? SLOW_SPEED_MULTIPLIER : 1;
      const buffMultiplier = finite(local.state.buffTime, 0) > 0 ? BUFF_SPEED_MULTIPLIER : 1;
      direction.normalize().scale(baseSpeed * slowMultiplier * buffMultiplier);
    }
    local.sprite.setVelocity(direction.x, direction.y);
  }

  private updatePointerAngle(): void {
    const local = this.localEntity;
    if (!local) return;
    const pointer = this.input.activePointer;
    const worldPoint = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
    this.pointerAngle = Phaser.Math.Angle.Between(local.sprite.x, local.sprite.y, worldPoint.x, worldPoint.y);
  }

  private createInputMessage(forceIdle = false): InputMessage {
    const bindings = this.bindings();
    const idle = forceIdle || this.paused || this.localEntity?.state.alive === false;
    return {
      seq: ++this.sequence,
      up: !idle && this.keys.has(bindings.moveUp),
      down: !idle && this.keys.has(bindings.moveDown),
      left: !idle && this.keys.has(bindings.moveLeft),
      right: !idle && this.keys.has(bindings.moveRight),
      angle: this.pointerAngle,
    };
  }

  private handleBoundAction(code: string): void {
    const bindings = this.bindings();
    if (code === bindings.attack) this.sendAction({ type: "attack" });
    else if (code === bindings.interact) this.sendAction({ type: "interact" });
    else if (code === bindings.dodge) this.sendAction({ type: "dodge" });
    else if (code === bindings.potion) this.sendAction({ type: "potion" });
    else {
      for (let index = 0; index < 4; index += 1) {
        if (code !== bindings[`skill${index + 1}` as "skill1" | "skill2" | "skill3" | "skill4"]) continue;
        this.sendAction({ type: "skill", index });
        break;
      }
    }
  }

  private sendAction(action: ActionMessage): void {
    if (!this.room || this.paused || this.localEntity?.state.alive === false) return;
    const payload: ActionMessage = action.type === "skill"
      ? { type: "skill", index: action.index }
      : { type: action.type };
    if (!isActionMessage(payload)) return;

    // Colyseus preserves message order, so the authoritative simulation receives the
    // latest aim before resolving an attack, skill or dodge action.
    this.updatePointerAngle();
    this.room.send("input", this.createInputMessage());
    this.room.send("action", payload);
  }

  private bindings(): Record<keyof typeof DEFAULT_BINDINGS, string> {
    return { ...DEFAULT_BINDINGS, ...this.config.bindings };
  }

  private isBoundCode(code: string): boolean {
    return Object.values(this.bindings()).includes(code);
  }

  private isVisible(ownerId: string | undefined): boolean {
    return isOwnedBy(ownerId ?? "", this.sessionId);
  }

  private isLocalState(id: string, state: EntityStateLike): boolean {
    return id === this.sessionId
      || state.id === this.sessionId
      || (state.ownerId === this.sessionId && (state.kind === "player" || state.kind === "fighter"));
  }

  private handleFeed(message: FeedMessage): void {
    if (message.ownerId && message.ownerId !== this.sessionId) return;
    emitGameEvent("feed", message);
  }

  private handleEffect(effect: EffectMessage): void {
    if (effect.ownerId && effect.ownerId !== this.sessionId) return;
    const color = parseColor(effect.color, effect.type === "damage" ? 0xff5d67 : 0x74d7ff);
    const radius = Math.max(12, finite(effect.radius, 54));
    const graphics = this.add.graphics({ x: effect.x, y: effect.y }).setDepth(8000);
    graphics.lineStyle(5, color, 0.9).strokeCircle(0, 0, radius);
    graphics.fillStyle(color, 0.12).fillCircle(0, 0, radius);
    this.tweens.add({
      targets: graphics,
      scale: 1.65,
      alpha: 0,
      duration: 330,
      ease: "Cubic.Out",
      onComplete: () => graphics.destroy(),
    });

    if (effect.text) {
      const text = this.add.text(effect.x, effect.y - radius, effect.text, {
        fontFamily: "system-ui, sans-serif",
        fontSize: "18px",
        fontStyle: "bold",
        color: `#${color.toString(16).padStart(6, "0")}`,
        stroke: "#090c12",
        strokeThickness: 4,
      }).setOrigin(0.5).setDepth(8100);
      this.tweens.add({
        targets: text,
        y: text.y - 34,
        alpha: 0,
        duration: 650,
        ease: "Cubic.Out",
        onComplete: () => text.destroy(),
      });
    }

    const local = this.localEntity;
    if (local && Phaser.Math.Distance.Between(local.sprite.x, local.sprite.y, effect.x, effect.y) < 240) {
      this.cameras.main.shake(75, 0.0035, true);
    }
  }

  private handleMatchEnd(message: MatchEndMessage): void {
    this.setPaused(true);
    emitGameEvent("finish", {
      ...message,
      timeSeconds: message.time,
      time: formatClock(message.time),
    });
  }

  private updatePickupPrompt(): void {
    const local = this.localEntity;
    if (!local || this.paused || local.state.alive === false) {
      this.setPickupPrompt(null, "");
      return;
    }

    const interactKey = displayKey(this.bindings().interact);
    let closest: LootView | undefined;
    let closestDistance = PICKUP_RANGE;
    for (const view of this.lootViews.values()) {
      const distance = Phaser.Math.Distance.Between(local.sprite.x, local.sprite.y, view.targetX, view.targetY);
      if (distance >= closestDistance) continue;
      closest = view;
      closestDistance = distance;
    }

    if (closest) {
      const name = closest.state.name || (closest.state.kind === "potion" ? "生命药剂" : "装备");
      this.setPickupPrompt({ key: interactKey, item: { name, kind: closest.state.kind, quality: closest.state.quality } }, `loot:${closest.id}`);
      return;
    }

    const portalRange = PORTAL.radius + finite(local.state.radius, 23);
    if (this.stage === "preparation" && Phaser.Math.Distance.Between(local.sprite.x, local.sprite.y, PORTAL.x, PORTAL.y) <= portalRange) {
      this.setPickupPrompt({ portal: true, key: interactKey, item: { name: "进入主战场" } }, "portal");
      return;
    }
    this.setPickupPrompt(null, "");
  }

  private setPickupPrompt(payload: unknown, signature: string): void {
    if (signature === this.lastPickupSignature) return;
    this.lastPickupSignature = signature;
    emitGameEvent("pickup", payload);
  }

  private emitHud(state: BattleStateLike): void {
    const local = this.localEntity?.state;
    if (!local) return;
    const career = CAREERS[local.careerId ?? this.config.careerId ?? ""] ?? DEFAULT_CAREER;
    const gear = {
      ...parseGear(local.gear),
      weapon: local.weaponName || parseGear(local.gear).weapon,
      armor: local.armorName || parseGear(local.gear).armor,
      potions: finite(local.potions, parseGear(local.gear).potions ?? 0),
      kills: finite(local.kills, parseGear(local.gear).kills ?? 0),
      damage: finite(local.damage, parseGear(local.gear).damage ?? 0),
    };
    const configuredSkills = this.config.skillsByCareer?.[career.id] ?? [];
    const skillIds = [local.skill0, local.skill1, local.skill2, local.skill3]
      .map((id, index) => id || configuredSkills[index])
      .filter((id): id is string => Boolean(id));
    const cooldowns = [local.cooldown0, local.cooldown1, local.cooldown2, local.cooldown3].map((value) => finite(value, 0));
    const boss = [...this.entityViews.values()].find((view) => view.kind === "boss")?.state;
    const bossMaximum = Math.max(1, finite(boss?.maxHealth, 1));
    const bossDamage = Math.max(0, finite(local.bossDamage, 0));
    const contribution = Phaser.Math.Clamp(bossDamage <= 1 ? bossDamage : bossDamage / bossMaximum, 0, 1);
    const derivedAlive = [...this.entityViews.values()].filter((view) =>
      view.kind !== "boss" && view.state.alive !== false && finite(view.state.health, 1) > 0,
    ).length;
    const alive = finite(state.aliveCount, derivedAlive);
    const preparation = local.stage === "preparation";

    emitGameEvent("hud", {
      alive,
      kills: finite(gear.kills, 0),
      damage: finite(gear.damage, 0),
      stage: local.stage ?? this.stage,
      prepTime: finite(local.prepTime, 0),
      zoneLabel: preparation ? "独立发育区" : this.zone.label || `安全区阶段 ${finite(this.zone.phase, 0) + 1}`,
      zoneTimer: formatClock(preparation ? finite(local.prepTime, 0) : finite(this.zone.timer, 0)),
      career,
      health: finite(local.health, 0),
      maxHealth: Math.max(1, finite(local.maxHealth, 100)),
      shield: finite(local.shield, 0),
      weapon: gear.weapon ? { name: gear.weapon } : undefined,
      armor: gear.armor ? { name: gear.armor } : undefined,
      potions: finite(gear.potions, 0),
      bindings: this.bindings(),
      skills: Array.from({ length: 4 }, (_, index) => {
        const id = skillIds[index] ?? `skill-${index + 1}`;
        return {
          id,
          name: SKILL_NAMES[id] ?? id,
          icon: ["Q", "W", "E", "R"][index],
          color: career.cssColor,
          cooldown: 0,
        };
      }),
      cooldowns,
      boss: boss ? {
        health: finite(boss.health, 0),
        maxHealth: bossMaximum,
        alive: boss.alive !== false && finite(boss.health, 0) > 0,
        contribution,
        reward: local.rewardQuality || "无",
      } : undefined,
    });
  }
}

function forEachSchema<T>(collection: SchemaMapLike<T> | undefined, callback: (value: T, key: string) => void): void {
  if (!collection || typeof collection.forEach !== "function") return;
  collection.forEach((value, key) => callback(value, String(key)));
}

function finite(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function copyZone(zone: ZoneStateLike, fallback: ZoneStateLike): ZoneStateLike {
  return {
    x: finite(zone.x, finite(fallback.x, WORLD.width / 2)),
    y: finite(zone.y, finite(fallback.y, WORLD.height / 2)),
    radius: finite(zone.radius, finite(fallback.radius, BATTLE.zoneRadius)),
    targetX: finite(zone.targetX, finite(zone.x, finite(fallback.x, WORLD.width / 2))),
    targetY: finite(zone.targetY, finite(zone.y, finite(fallback.y, WORLD.height / 2))),
    targetRadius: finite(zone.targetRadius, finite(zone.radius, finite(fallback.radius, BATTLE.zoneRadius))),
    phase: finite(zone.phase, finite(fallback.phase, 0)),
    timer: finite(zone.timer, finite(fallback.timer, 0)),
    label: zone.label ?? fallback.label,
    damage: finite(zone.damage, finite(fallback.damage, 0)),
  };
}

interface GearPresentation {
  weapon?: string;
  armor?: string;
  potions?: number;
  kills?: number;
  damage?: number;
}

function parseGear(value: unknown): GearPresentation {
  if (!value) return {};
  let parsed: unknown = value;
  if (typeof value === "string") {
    try {
      parsed = JSON.parse(value) as unknown;
    } catch {
      return value ? { weapon: value } : {};
    }
  }
  if (typeof parsed !== "object" || parsed === null) return {};
  const gear = parsed as Record<string, unknown>;
  return {
    weapon: gearName(gear.weapon),
    armor: gearName(gear.armor),
    potions: finite(gear.potions, 0),
    kills: finite(gear.kills, 0),
    damage: finite(gear.damage, 0),
  };
}

function gearName(value: unknown): string | undefined {
  if (typeof value === "string") return value || undefined;
  if (typeof value === "object" && value !== null && typeof (value as { name?: unknown }).name === "string") {
    return (value as { name: string }).name;
  }
  return undefined;
}
