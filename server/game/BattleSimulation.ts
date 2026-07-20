import { CAREERS, getCareer, getSkill } from "../../src/config.js";
import {
  BATTLE,
  BATTLE_OBSTACLES,
  PORTAL,
  PREPARATION,
  PREPARATION_OBSTACLES,
  WORLD,
  ZONE_TIMELINE,
  type ActionMessage,
  type EffectMessage,
  type FeedMessage,
  type InputMessage,
  type JoinOptions,
  type LootKind,
  type LootQuality,
  type MatchEndMessage,
  type WorldObstacle,
} from "../../src/shared/protocol.js";
import { BattleState, EntityState, LootState, ProjectileState } from "../state/BattleState.js";

const TAU = Math.PI * 2;
const BOT_NAMES = ["夜雨", "赤刃", "无名", "白鸦", "北辰", "铁锤", "灰烬", "零度", "残月", "断弦", "渡鸦"];
const WEAPONS = ["旧制长剑", "裂纹太刀", "军团巨刃", "波动短剑"];
const ARMORS = ["皮革护肩", "战术胸甲", "鬼纹长袍", "合金护甲"];

interface QualityDefinition {
  name: LootQuality;
  color: string;
  power: number;
}

const QUALITIES: readonly QualityDefinition[] = [
  { name: "普通", color: "#c3cbd4", power: 1 },
  { name: "稀有", color: "#4ea4ed", power: 1.35 },
  { name: "史诗", color: "#a968e8", power: 1.75 },
];

interface PlayerControl {
  seq: number;
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  angle: number;
}

interface DamageOptions {
  knockback?: number;
  slow?: number;
  zone?: boolean;
}

export interface SimulationEvents {
  feed?: (message: FeedMessage, targetPlayerId?: string) => void;
  effect?: (message: EffectMessage) => void;
  matchEnd?: (message: MatchEndMessage, targetPlayerId?: string) => void;
}

export interface BattleSimulationOptions {
  state?: BattleState;
  random?: () => number;
  events?: SimulationEvents;
}

const clamp = (value: number, minimum: number, maximum: number) => Math.max(minimum, Math.min(maximum, value));
const distance = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);
const lerp = (a: number, b: number, amount: number) => a + (b - a) * amount;

function pointSegmentDistance(
  point: { x: number; y: number },
  start: { x: number; y: number },
  end: { x: number; y: number },
): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy || 1;
  const t = clamp(((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared, 0, 1);
  return Math.hypot(point.x - (start.x + dx * t), point.y - (start.y + dy * t));
}

function angleDifference(a: number, b: number): number {
  return Math.atan2(Math.sin(a - b), Math.cos(a - b));
}

function circleIntersectsObstacle(x: number, y: number, radius: number, obstacle: WorldObstacle): boolean {
  const nearestX = clamp(x, obstacle.x, obstacle.x + obstacle.w);
  const nearestY = clamp(y, obstacle.y, obstacle.y + obstacle.h);
  const dx = x - nearestX;
  const dy = y - nearestY;
  return dx * dx + dy * dy < radius * radius;
}

function safeName(input: unknown): string {
  if (typeof input !== "string") return "玩家";
  const value = input.trim().replace(/[\u0000-\u001f]/g, "").slice(0, 16);
  return value || "玩家";
}

export class BattleSimulation {
  readonly state: BattleState;

  private readonly random: () => number;
  private readonly events: SimulationEvents;
  private readonly controls = new Map<string, PlayerControl>();
  private readonly rewardedPlayers = new Set<string>();
  private readonly zoneDamageTimers = new Map<string, number>();
  private readonly projectileHits = new Map<string, Set<string>>();
  private readonly resultSent = new Set<string>();
  private battlefieldStarted = false;
  private matchFinished = false;
  private serial = 0;

  constructor(options: BattleSimulationOptions = {}) {
    this.state = options.state ?? new BattleState();
    this.random = options.random ?? Math.random;
    this.events = options.events ?? {};
  }

  addPlayer(playerId: string, options: JoinOptions = {}): EntityState {
    this.removePlayer(playerId);

    const career = getCareer(options.careerId);
    const requestedSkills = options.skillIds ?? options.skillsByCareer?.[career.id] ?? [];
    const skillIds = this.normalizeSkills(career, requestedSkills);
    const player = this.createEntity({
      id: playerId,
      name: safeName(options.name),
      kind: "player",
      ownerId: playerId,
      stage: "preparation",
      career,
      skillIds,
      x: PREPARATION.spawnX,
      y: PREPARATION.spawnY,
    });
    player.prepTime = PREPARATION.duration;
    player.potions = 1;
    this.state.entities.set(player.id, player);
    this.controls.set(playerId, { seq: -1, up: false, down: false, left: false, right: false, angle: 0 });

    const bossCareer = CAREERS[0];
    const boss = this.createEntity({
      id: this.bossId(playerId),
      name: "裂隙领主",
      kind: "boss",
      ownerId: playerId,
      stage: "preparation",
      career: bossCareer,
      skillIds: bossCareer.skills.slice(0, 4).map((skill: { id: string }) => skill.id),
      x: PREPARATION.bossX,
      y: PREPARATION.bossY,
    });
    boss.radius = 42;
    boss.speed = 112;
    boss.health = PREPARATION.bossHealth;
    boss.maxHealth = PREPARATION.bossHealth;
    boss.attackCooldown = 1.5;
    boss.cooldown0 = 4;
    this.state.entities.set(boss.id, boss);

    for (let index = 0; index < PREPARATION.lootCount; index += 1) {
      const point = this.randomPoint("preparation");
      this.addLoot(playerId, point.x, point.y, index < 4 ? "potion" : undefined);
    }

    this.emitFeed("独立发育区已开启，60 秒后自动进入主战场。", "info", playerId, playerId);
    this.emitFeed("挑战 Boss 可按伤害贡献获得装备，也可前往右侧传送门直接离开。", "info", playerId, playerId);
    return player;
  }

  removePlayer(playerId: string): void {
    const player = this.state.entities.get(playerId);
    if (!player) return;

    if (player.stage === "battle" && player.alive) this.dropEquipment(player);
    this.cleanupRealm(playerId, playerId);
    this.state.entities.delete(playerId);
    this.controls.delete(playerId);
    this.rewardedPlayers.delete(playerId);
    this.zoneDamageTimers.delete(playerId);
    this.resultSent.delete(playerId);
    this.updateAliveCount();
  }

  setInput(playerId: string, input: InputMessage): boolean {
    const player = this.state.entities.get(playerId);
    const current = this.controls.get(playerId);
    if (this.matchFinished || !player || player.kind !== "player" || !current || input.seq <= current.seq) return false;

    this.controls.set(playerId, {
      seq: input.seq,
      up: input.up,
      down: input.down,
      left: input.left,
      right: input.right,
      angle: Math.atan2(Math.sin(input.angle), Math.cos(input.angle)),
    });
    player.angle = input.angle;
    return true;
  }

  handleAction(playerId: string, action: ActionMessage): boolean {
    const player = this.state.entities.get(playerId);
    if (this.matchFinished || !player || player.kind !== "player" || !player.alive) return false;

    switch (action.type) {
      case "attack":
        return this.basicAttack(player);
      case "skill":
        return this.castSkill(player, clamp(Math.trunc(action.index ?? -1), -1, 3));
      case "interact":
        return this.interact(player);
      case "dodge":
        return this.dodge(player);
      case "potion":
        return this.usePotion(player);
      default:
        return false;
    }
  }

  fixedUpdate(deltaSeconds: number): void {
    if (this.matchFinished) return;
    const dt = clamp(deltaSeconds, 0, 0.1);
    if (dt <= 0) return;

    if (this.battlefieldStarted && !this.matchFinished) {
      this.state.battleElapsed += dt;
      this.updateZone();
    }

    const entities = [...this.state.entities.values()];
    for (const entity of entities) this.updateTimers(entity, dt);

    for (const entity of entities) {
      if (!entity.alive) continue;
      if (entity.kind === "player") this.updatePlayer(entity, dt);
      else if (entity.kind === "boss") this.updateBoss(entity, dt);
      else if (entity.kind === "bot") this.updateBot(entity, dt);
    }

    this.updateProjectiles(dt);
    this.updateAliveCount();
    this.checkForWinner();
  }

  enterBattlefield(playerId: string, reason: "portal" | "timeout" = "portal"): boolean {
    const player = this.state.entities.get(playerId);
    if (this.matchFinished || !player || player.kind !== "player" || player.stage !== "preparation") return false;

    const realmId = player.ownerId;
    const droppedBossReward = this.grantBossReward(player);
    this.cleanupRealm(realmId, player.id);
    this.ensureBattlefield();

    player.ownerId = "";
    player.stage = "battle";
    player.prepTime = 0;
    player.x = BATTLE.spawnX + this.random() * 80;
    player.y = BATTLE.spawnY + (this.random() - 0.5) * 220;
    player.angle = 0;
    player.health = Math.max(1, player.health);
    player.alive = true;
    player.invulnerable = 1.5;
    player.attackCooldown = 0;
    player.cooldown0 = 0;
    player.cooldown1 = 0;
    player.cooldown2 = 0;
    player.cooldown3 = 0;

    if (droppedBossReward) {
      droppedBossReward.ownerId = "";
      droppedBossReward.x = player.x;
      droppedBossReward.y = player.y;
      this.state.loot.set(droppedBossReward.id, droppedBossReward);
    }

    const text = reason === "timeout" ? "发育时间结束，已传送至主战场。" : "已主动进入主战场。";
    this.emitFeed(text, "good", "", player.id);
    this.emitFeed("战场已开启：搜寻物资，并留在安全区内。", "info", "", player.id);
    this.updateAliveCount();
    return true;
  }

  /** Public for deterministic server-side tests and future scripted map events. */
  damageEntity(targetId: string, amount: number, attackerId?: string, options: DamageOptions = {}): number {
    if (this.matchFinished) return 0;
    const target = this.state.entities.get(targetId);
    const attacker = attackerId ? this.state.entities.get(attackerId) : undefined;
    if (!target || !target.alive || amount <= 0 || target.invulnerable > 0) return 0;
    if (attacker && !this.canInteract(attacker, target)) return 0;

    const armorMultiplier = 100 / (100 + Math.max(0, target.armorPower) * 4);
    let remaining = Math.max(1, amount * armorMultiplier);
    const shieldDamage = Math.min(target.shield, remaining);
    target.shield -= shieldDamage;
    remaining -= shieldDamage;
    const healthBefore = target.health;
    target.health = Math.max(0, target.health - remaining);
    const healthDamage = healthBefore - target.health;
    const totalDamage = shieldDamage + healthDamage;

    if (attacker && attacker.id !== target.id) {
      attacker.damage += totalDamage;
      if (target.kind === "boss" && attacker.kind === "player") {
        attacker.bossDamage = Math.min(target.maxHealth, attacker.bossDamage + healthDamage);
        this.updateRewardQuality(attacker, target.maxHealth);
      }
    }

    if (options.slow && options.slow > 0) target.slowTime = Math.max(target.slowTime, 2.2);
    if (options.knockback && attacker && target.kind !== "boss") {
      const angle = Math.atan2(target.y - attacker.y, target.x - attacker.x);
      this.moveEntity(target, Math.cos(angle) * options.knockback, Math.sin(angle) * options.knockback);
    }

    this.events.effect?.({
      type: "damage",
      x: target.x,
      y: target.y,
      text: String(Math.round(totalDamage)),
      color: options.zone ? "#c35dec" : "#ffffff",
      ownerId: target.ownerId,
    });

    if (target.health <= 0) this.eliminate(target, attacker, options.zone === true);
    return totalDamage;
  }

  private updatePlayer(player: EntityState, dt: number): void {
    if (player.stage === "preparation") {
      player.prepTime = Math.max(0, player.prepTime - dt);
      if (player.prepTime <= 0) {
        this.enterBattlefield(player.id, "timeout");
        return;
      }
    }

    const control = this.controls.get(player.id);
    if (control) {
      player.angle = control.angle;
      let dx = Number(control.right) - Number(control.left);
      let dy = Number(control.down) - Number(control.up);
      const length = Math.hypot(dx, dy);
      if (length > 0) {
        dx /= length;
        dy /= length;
        const slowMultiplier = player.slowTime > 0 ? 0.55 : 1;
        const buffMultiplier = player.buffTime > 0 ? 1.18 : 1;
        this.moveEntity(player, dx * player.speed * slowMultiplier * buffMultiplier * dt, dy * player.speed * slowMultiplier * buffMultiplier * dt);
      }
    }

    if (player.stage === "battle") this.applyZoneDamage(player, dt);
  }

  private updateBoss(boss: EntityState, dt: number): void {
    const player = this.state.entities.get(boss.ownerId);
    if (!player || player.stage !== "preparation" || !player.alive) return;

    const dx = player.x - boss.x;
    const dy = player.y - boss.y;
    const length = Math.hypot(dx, dy) || 1;
    boss.angle = Math.atan2(dy, dx);
    if (length > 100) this.moveEntity(boss, (dx / length) * boss.speed * dt, (dy / length) * boss.speed * dt);
    if (length <= 112 && boss.attackCooldown <= 0) {
      boss.attackCooldown = 1.25;
      this.damageEntity(player.id, 13, boss.id, { knockback: 35 });
      this.emitEffect("slash", boss, "#f0a34d", 80);
    }
    if (length <= 180 && boss.cooldown0 <= 0) {
      boss.cooldown0 = 5;
      this.damageEntity(player.id, 20, boss.id, { knockback: 65, slow: 0.35 });
      this.emitEffect("ring", boss, "#d86b4f", 180);
    }
  }

  private updateBot(bot: EntityState, dt: number): void {
    const target = this.nearestTarget(bot);
    if (!target) return;
    const dx = target.x - bot.x;
    const dy = target.y - bot.y;
    const length = Math.hypot(dx, dy) || 1;
    bot.angle = Math.atan2(dy, dx);

    if (length > 82) {
      const strafe = Math.sin(this.state.battleElapsed * 0.7 + bot.id.length) * 0.18;
      const speed = bot.speed * (bot.slowTime > 0 ? 0.55 : 1);
      this.moveEntity(bot, ((dx / length) - (dy / length) * strafe) * speed * dt, ((dy / length) + (dx / length) * strafe) * speed * dt);
    }
    if (length <= 102 && bot.attackCooldown <= 0) this.basicAttack(bot);
    if (length <= 460 && bot.cooldown0 <= 0 && this.random() < dt * 0.45) this.castSkill(bot, Math.floor(this.random() * 4));
    if (bot.health < bot.maxHealth * 0.42 && bot.potions > 0) this.usePotion(bot);
    this.pickupNearest(bot, 42);
    this.applyZoneDamage(bot, dt);
  }

  private updateTimers(entity: EntityState, dt: number): void {
    entity.cooldown0 = Math.max(0, entity.cooldown0 - dt);
    entity.cooldown1 = Math.max(0, entity.cooldown1 - dt);
    entity.cooldown2 = Math.max(0, entity.cooldown2 - dt);
    entity.cooldown3 = Math.max(0, entity.cooldown3 - dt);
    entity.attackCooldown = Math.max(0, entity.attackCooldown - dt);
    entity.dodgeCooldown = Math.max(0, entity.dodgeCooldown - dt);
    entity.invulnerable = Math.max(0, entity.invulnerable - dt);
    entity.buffTime = Math.max(0, entity.buffTime - dt);
    entity.slowTime = Math.max(0, entity.slowTime - dt);
  }

  private basicAttack(attacker: EntityState): boolean {
    if (!attacker.alive || attacker.attackCooldown > 0) return false;
    attacker.attackCooldown = attacker.kind === "boss" ? 1.2 : 0.52;
    const damage = (13 + attacker.weaponPower * 1.1) * (attacker.buffTime > 0 ? 1.25 : 1);
    const range = attacker.kind === "boss" ? 125 : 105;
    for (const target of this.targetsFor(attacker)) {
      if (distance(attacker, target) > range + target.radius) continue;
      const targetAngle = Math.atan2(target.y - attacker.y, target.x - attacker.x);
      if (Math.abs(angleDifference(targetAngle, attacker.angle)) > 1.05) continue;
      this.damageEntity(target.id, damage, attacker.id, { knockback: 38 });
    }
    this.emitEffect("slash", attacker, attacker.color, range);
    return true;
  }

  private castSkill(attacker: EntityState, index: number): boolean {
    if (index < 0 || index > 3 || !attacker.alive) return false;
    const cooldownKey = `cooldown${index}` as "cooldown0" | "cooldown1" | "cooldown2" | "cooldown3";
    if (attacker[cooldownKey] > 0) return false;

    const career = getCareer(attacker.careerId);
    const skillId = attacker[`skill${index}` as "skill0" | "skill1" | "skill2" | "skill3"];
    const skill = getSkill(career, skillId);
    if (!skill) return false;
    attacker[cooldownKey] = Number(skill.cooldown) || 1;
    const baseDamage = (Number(skill.damage) + attacker.weaponPower * 0.8) * (attacker.buffTime > 0 ? 1.25 : 1);
    const range = Number(skill.range) || 0;
    const color = String(skill.color || attacker.color);

    if (skill.kind === "shield") {
      attacker.shield = Math.min(120, attacker.shield + Number(skill.shield || 45));
      this.emitEffect("shield", attacker, color, 52);
      return true;
    }
    if (skill.kind === "buff") {
      attacker.buffTime = Number(skill.duration || 8);
      this.emitEffect("buff", attacker, color, 58);
      return true;
    }
    if (skill.kind === "projectile") {
      this.spawnProjectile(attacker, baseDamage, range || 500, color, Boolean(skill.pierce), Number(skill.slow || 0));
      return true;
    }
    if (skill.kind === "dash") {
      const start = { x: attacker.x, y: attacker.y };
      const dashDistance = Math.min(range || 220, 280);
      this.moveEntity(attacker, Math.cos(attacker.angle) * dashDistance, Math.sin(attacker.angle) * dashDistance);
      const end = { x: attacker.x, y: attacker.y };
      attacker.invulnerable = Math.max(attacker.invulnerable, 0.22);
      for (const target of this.targetsFor(attacker)) {
        if (pointSegmentDistance(target, start, end) <= target.radius + 30) this.damageEntity(target.id, baseDamage, attacker.id, { knockback: 55 });
      }
      this.events.effect?.({ type: "dash", x: start.x, y: start.y, radius: dashDistance, angle: attacker.angle, color, ownerId: attacker.ownerId });
      return true;
    }

    const radius = range || (skill.kind === "melee" ? 110 : 165);
    const multiplier = skill.kind === "nova" ? Math.max(1, Number(skill.pulses || 3) * 0.65) : 1;
    for (const target of this.targetsFor(attacker)) {
      if (distance(attacker, target) > radius + target.radius) continue;
      if (skill.kind === "melee") {
        const targetAngle = Math.atan2(target.y - attacker.y, target.x - attacker.x);
        if (Math.abs(angleDifference(targetAngle, attacker.angle)) > 1.18) continue;
      }
      const dealt = this.damageEntity(target.id, baseDamage * multiplier, attacker.id, {
        knockback: Number(skill.knockback || 0),
        slow: Number(skill.slow || 0),
      });
      if (dealt > 0 && skill.lifesteal) attacker.health = Math.min(attacker.maxHealth, attacker.health + dealt * Number(skill.lifesteal));
    }
    this.emitEffect(skill.kind === "melee" ? "skillSlash" : "ring", attacker, color, radius);
    return true;
  }

  private dodge(entity: EntityState): boolean {
    if (entity.dodgeCooldown > 0) return false;
    entity.dodgeCooldown = 3.2;
    entity.invulnerable = 0.38;
    const startX = entity.x;
    const startY = entity.y;
    this.moveEntity(entity, Math.cos(entity.angle) * 125, Math.sin(entity.angle) * 125);
    this.events.effect?.({ type: "dash", x: startX, y: startY, radius: 125, angle: entity.angle, color: "#d7e5ef", ownerId: entity.ownerId });
    return true;
  }

  private usePotion(entity: EntityState): boolean {
    if (entity.potions <= 0 || entity.health >= entity.maxHealth) return false;
    entity.potions -= 1;
    entity.health = Math.min(entity.maxHealth, entity.health + 45);
    this.emitEffect("heal", entity, "#57d99a", 48);
    return true;
  }

  private interact(player: EntityState): boolean {
    if (player.stage === "preparation" && distance(player, PORTAL) <= PORTAL.radius + player.radius) {
      return this.enterBattlefield(player.id, "portal");
    }
    return this.pickupNearest(player, 76);
  }

  private pickupNearest(entity: EntityState, range: number): boolean {
    let nearest: LootState | undefined;
    let nearestDistance = range;
    for (const loot of this.state.loot.values()) {
      if (loot.ownerId !== entity.ownerId) continue;
      const currentDistance = distance(entity, loot);
      if (currentDistance <= nearestDistance) {
        nearest = loot;
        nearestDistance = currentDistance;
      }
    }
    if (!nearest) return false;

    if (nearest.type === "weapon") {
      entity.weaponName = nearest.name;
      entity.weaponPower = nearest.value;
    } else if (nearest.type === "armor") {
      entity.armorName = nearest.name;
      entity.armorPower = nearest.value;
    } else {
      entity.potions = Math.min(9, entity.potions + nearest.amount);
    }
    this.state.loot.delete(nearest.id);
    this.emitFeed(`获得 ${nearest.name}`, "good", entity.ownerId, entity.kind === "player" ? entity.id : undefined);
    return true;
  }

  private spawnProjectile(source: EntityState, damage: number, range: number, color: string, pierce: boolean, slow: number): void {
    const projectile = new ProjectileState();
    projectile.id = this.nextId("projectile");
    projectile.ownerId = source.ownerId;
    projectile.sourceId = source.id;
    projectile.x = source.x + Math.cos(source.angle) * (source.radius + 12);
    projectile.y = source.y + Math.sin(source.angle) * (source.radius + 12);
    projectile.vx = Math.cos(source.angle) * 620;
    projectile.vy = Math.sin(source.angle) * 620;
    projectile.damage = damage;
    projectile.maxDistance = range;
    projectile.color = color;
    projectile.pierce = pierce;
    projectile.slow = slow;
    this.state.projectiles.set(projectile.id, projectile);
    this.projectileHits.set(projectile.id, new Set());
    this.events.effect?.({ type: "projectile", x: projectile.x, y: projectile.y, angle: source.angle, color, ownerId: source.ownerId });
  }

  private updateProjectiles(dt: number): void {
    const removals: string[] = [];
    for (const projectile of this.state.projectiles.values()) {
      const source = this.state.entities.get(projectile.sourceId);
      if (!source || !source.alive) {
        removals.push(projectile.id);
        continue;
      }
      const dx = projectile.vx * dt;
      const dy = projectile.vy * dt;
      const movementSteps = Math.max(1, Math.ceil(Math.hypot(dx, dy) / Math.max(1, projectile.radius)));
      let hitObstacle = false;
      for (let step = 0; step <= movementSteps; step += 1) {
        const progress = step / movementSteps;
        if (this.collidesWithObstacle(source.stage, projectile.x + dx * progress, projectile.y + dy * progress, projectile.radius)) {
          hitObstacle = true;
          break;
        }
      }
      projectile.x += dx;
      projectile.y += dy;
      projectile.travelled += Math.hypot(dx, dy);
      if (hitObstacle || projectile.travelled >= projectile.maxDistance || projectile.x < 0 || projectile.y < 0 || projectile.x > WORLD.width || projectile.y > WORLD.height) {
        removals.push(projectile.id);
        continue;
      }

      const hits = this.projectileHits.get(projectile.id) ?? new Set<string>();
      for (const target of this.targetsFor(source)) {
        if (hits.has(target.id) || distance(projectile, target) > projectile.radius + target.radius) continue;
        hits.add(target.id);
        this.damageEntity(target.id, projectile.damage, source.id, { knockback: 40, slow: projectile.slow });
        if (!projectile.pierce) {
          removals.push(projectile.id);
          break;
        }
      }
      this.projectileHits.set(projectile.id, hits);
    }
    for (const id of removals) {
      this.state.projectiles.delete(id);
      this.projectileHits.delete(id);
    }
  }

  private eliminate(target: EntityState, attacker?: EntityState, fromZone = false): void {
    if (target.kind === "player" && target.stage === "preparation") {
      target.health = Math.max(1, target.maxHealth * 0.7);
      target.shield = 0;
      target.x = PREPARATION.spawnX;
      target.y = PREPARATION.spawnY;
      target.invulnerable = 2;
      this.emitFeed("你在发育区倒下，被送回入口并恢复了部分生命。", "danger", target.ownerId, target.id);
      return;
    }

    target.alive = false;
    target.health = 0;
    if (target.kind !== "boss" && attacker && attacker.id !== target.id) attacker.kills += 1;
    if (target.kind === "boss") {
      const owner = this.state.entities.get(target.ownerId);
      if (owner) {
        owner.bossDamage = target.maxHealth;
        owner.rewardQuality = "史诗";
      }
      this.emitFeed("裂隙领主已被击败，史诗奖励已锁定。", "good", target.ownerId, target.ownerId);
    } else {
      this.dropEquipment(target);
      const killerName = attacker && attacker.id !== target.id ? attacker.name : fromZone ? "危险区" : "未知力量";
      this.emitFeed(`${killerName} 击败了 ${target.name}`, "danger", target.ownerId);
      if (target.kind === "player" && !this.resultSent.has(target.id)) {
        this.resultSent.add(target.id);
        this.events.matchEnd?.({
          victory: false,
          rank: this.countPublicAlive() + 1,
          kills: target.kills,
          damage: Math.round(target.damage),
          time: this.state.battleElapsed,
        }, target.id);
      }
    }
    this.events.effect?.({ type: "death", x: target.x, y: target.y, color: target.color, radius: 90, ownerId: target.ownerId });
  }

  private grantBossReward(player: EntityState): LootState | undefined {
    if (this.rewardedPlayers.has(player.id) || player.bossDamage <= 0) return undefined;
    this.rewardedPlayers.add(player.id);
    const ratio = clamp(player.bossDamage / PREPARATION.bossHealth, 0, 1);
    const quality = ratio >= 0.67 ? QUALITIES[2] : ratio >= 0.3 ? QUALITIES[1] : QUALITIES[0];
    const type: LootKind = this.random() < 0.55 ? "weapon" : "armor";
    const reward = this.makeLoot(player.ownerId, player.x, player.y, type, quality);
    let equipped = false;
    if (type === "weapon") {
      if (reward.value > player.weaponPower) {
        player.weaponName = reward.name;
        player.weaponPower = reward.value;
        equipped = true;
      }
    } else {
      if (reward.value > player.armorPower) {
        player.armorName = reward.name;
        player.armorPower = reward.value;
        equipped = true;
      }
    }
    player.rewardQuality = quality.name;
    this.emitFeed(`Boss 贡献 ${Math.round(ratio * 100)}%，获得 ${reward.name}`, "good", player.ownerId, player.id);
    return equipped ? undefined : reward;
  }

  private updateRewardQuality(player: EntityState, bossMaxHealth: number): void {
    const ratio = clamp(player.bossDamage / bossMaxHealth, 0, 1);
    player.rewardQuality = ratio >= 0.67 ? "史诗" : ratio >= 0.3 ? "稀有" : ratio > 0 ? "普通" : "未参与";
  }

  private ensureBattlefield(): void {
    if (this.battlefieldStarted) return;
    this.battlefieldStarted = true;
    this.state.battleElapsed = 0;
    this.state.zoneX = BATTLE.zoneX;
    this.state.zoneY = BATTLE.zoneY;
    this.state.zoneRadius = BATTLE.zoneRadius;
    this.state.zonePhase = 0;
    this.state.zoneLabel = ZONE_TIMELINE[0].label;
    this.state.zoneTimer = ZONE_TIMELINE[0].end;

    for (let index = 0; index < BATTLE.botCount; index += 1) {
      const career = CAREERS[index % CAREERS.length];
      const angle = (index / BATTLE.botCount) * TAU;
      const radius = 480 + this.random() * 420;
      const bot = this.createEntity({
        id: `bot-${index}`,
        name: BOT_NAMES[index],
        kind: "bot",
        ownerId: "",
        stage: "battle",
        career,
        skillIds: career.skills.slice(0, 4).map((skill: { id: string }) => skill.id),
        x: BATTLE.zoneX + Math.cos(angle) * radius,
        y: BATTLE.zoneY + Math.sin(angle) * radius,
      });
      bot.speed = 175 + this.random() * 30;
      bot.potions = this.random() < 0.5 ? 1 : 0;
      bot.cooldown0 = 1 + this.random() * 3;
      this.state.entities.set(bot.id, bot);
    }
    for (let index = 0; index < BATTLE.initialLootCount; index += 1) {
      const point = this.randomPoint("battle");
      this.addLoot("", point.x, point.y);
    }
  }

  private updateZone(): void {
    const elapsed = this.state.battleElapsed;
    const index = ZONE_TIMELINE.findIndex((item) => elapsed >= item.start && elapsed < item.end);
    const phase = index >= 0 ? index : ZONE_TIMELINE.length - 1;
    const segment = ZONE_TIMELINE[phase];
    const progress = elapsed >= segment.end ? 1 : clamp((elapsed - segment.start) / (segment.end - segment.start), 0, 1);
    this.state.zoneRadius = lerp(segment.from, segment.to, progress);
    this.state.zonePhase = phase;
    this.state.zoneLabel = segment.label;
    this.state.zoneTimer = Math.max(0, segment.end - elapsed);
  }

  private applyZoneDamage(entity: EntityState, dt: number): void {
    if (entity.stage !== "battle" || entity.ownerId !== "" || !entity.alive) return;
    if (distance(entity, { x: this.state.zoneX, y: this.state.zoneY }) <= this.state.zoneRadius) {
      this.zoneDamageTimers.set(entity.id, 0);
      return;
    }
    const timer = (this.zoneDamageTimers.get(entity.id) ?? 0) + dt;
    if (timer < 0.5) {
      this.zoneDamageTimers.set(entity.id, timer);
      return;
    }
    this.zoneDamageTimers.set(entity.id, timer - 0.5);
    const damage = (3 + Math.floor(this.state.zonePhase / 2) * 2) * 0.5;
    this.damageEntity(entity.id, damage, undefined, { zone: true });
  }

  private checkForWinner(): void {
    if (!this.battlefieldStarted || this.matchFinished) return;
    const hasPendingPlayer = [...this.state.entities.values()].some(
      (entity) => entity.kind === "player" && entity.stage === "preparation" && entity.alive,
    );
    if (hasPendingPlayer) return;
    const alive = [...this.state.entities.values()].filter((entity) => entity.ownerId === "" && entity.stage === "battle" && entity.alive && entity.kind !== "boss");
    if (alive.length > 1) return;
    this.matchFinished = true;
    const winner = alive[0];
    if (!winner) return;
    this.emitFeed(`${winner.name} 成为最后的幸存者！`, "good", "");
    if (winner.kind === "player" && !this.resultSent.has(winner.id)) {
      this.resultSent.add(winner.id);
      this.events.matchEnd?.({
        victory: true,
        rank: 1,
        kills: winner.kills,
        damage: Math.round(winner.damage),
        time: this.state.battleElapsed,
        winnerName: winner.name,
      }, winner.id);
    }
  }

  private updateAliveCount(): void {
    this.state.aliveCount = this.countPublicAlive();
  }

  private countPublicAlive(): number {
    let count = 0;
    for (const entity of this.state.entities.values()) {
      if (entity.ownerId === "" && entity.stage === "battle" && entity.kind !== "boss" && entity.alive) count += 1;
    }
    return count;
  }

  private nearestTarget(source: EntityState): EntityState | undefined {
    let nearest: EntityState | undefined;
    let nearestDistance = Number.POSITIVE_INFINITY;
    for (const target of this.targetsFor(source)) {
      const currentDistance = distance(source, target);
      if (currentDistance < nearestDistance) {
        nearest = target;
        nearestDistance = currentDistance;
      }
    }
    return nearest;
  }

  private targetsFor(source: EntityState): EntityState[] {
    const targets: EntityState[] = [];
    for (const target of this.state.entities.values()) {
      if (target.id === source.id || !target.alive || !this.canInteract(source, target)) continue;
      if (source.kind === "boss" && target.kind !== "player") continue;
      if (source.kind === "player" && source.stage === "preparation" && target.kind !== "boss") continue;
      targets.push(target);
    }
    return targets;
  }

  private canInteract(source: EntityState, target: EntityState): boolean {
    return source.ownerId === target.ownerId && source.stage === target.stage;
  }

  private dropEquipment(entity: EntityState): void {
    if (entity.ownerId !== "") return;
    if (entity.weaponPower > 0) {
      const item = new LootState();
      item.id = this.nextId("loot");
      item.ownerId = "";
      item.x = entity.x - 18;
      item.y = entity.y;
      item.type = "weapon";
      item.name = entity.weaponName;
      item.quality = this.qualityFromValue(entity.weaponPower, 8).name;
      item.color = this.qualityFromValue(entity.weaponPower, 8).color;
      item.value = entity.weaponPower;
      this.state.loot.set(item.id, item);
    }
    if (entity.armorPower > 0) {
      const item = new LootState();
      item.id = this.nextId("loot");
      item.ownerId = "";
      item.x = entity.x + 18;
      item.y = entity.y;
      item.type = "armor";
      item.name = entity.armorName;
      item.quality = this.qualityFromValue(entity.armorPower, 6).name;
      item.color = this.qualityFromValue(entity.armorPower, 6).color;
      item.value = entity.armorPower;
      this.state.loot.set(item.id, item);
    }
    if (entity.potions > 0) this.addLoot("", entity.x, entity.y + 24, "potion", undefined, entity.potions);
  }

  private qualityFromValue(value: number, base: number): QualityDefinition {
    const ratio = value / base;
    return ratio >= 1.65 ? QUALITIES[2] : ratio >= 1.25 ? QUALITIES[1] : QUALITIES[0];
  }

  private addLoot(ownerId: string, x: number, y: number, forcedType?: LootKind, forcedQuality?: QualityDefinition, amount = 1): LootState {
    const loot = this.makeLoot(ownerId, x, y, forcedType, forcedQuality, amount);
    this.state.loot.set(loot.id, loot);
    return loot;
  }

  private makeLoot(ownerId: string, x: number, y: number, forcedType?: LootKind, forcedQuality?: QualityDefinition, amount = 1): LootState {
    const loot = new LootState();
    loot.id = this.nextId("loot");
    loot.ownerId = ownerId;
    loot.x = clamp(x, 35, WORLD.width - 35);
    loot.y = clamp(y, 35, WORLD.height - 35);
    const type = forcedType ?? (this.random() < 0.3 ? "potion" : this.random() < 0.55 ? "weapon" : "armor");
    loot.type = type;
    if (type === "potion") {
      loot.name = "生命药剂";
      loot.quality = "普通";
      loot.color = "#57d99a";
      loot.amount = clamp(Math.trunc(amount), 1, 9);
      return loot;
    }
    const roll = this.random();
    const quality = forcedQuality ?? (roll > 0.9 ? QUALITIES[2] : roll > 0.52 ? QUALITIES[1] : QUALITIES[0]);
    const list = type === "weapon" ? WEAPONS : ARMORS;
    loot.quality = quality.name;
    loot.color = quality.color;
    loot.name = `${quality.name}·${list[Math.floor(this.random() * list.length)]}`;
    loot.value = Math.round((type === "weapon" ? 8 : 6) * quality.power);
    return loot;
  }

  private randomPoint(stage: "preparation" | "battle"): { x: number; y: number } {
    const marginX = stage === "preparation" ? 120 : 90;
    const marginY = stage === "preparation" ? 110 : 90;
    const clearance = 28;
    for (let attempt = 0; attempt < 64; attempt += 1) {
      const point = {
        x: marginX + this.random() * (WORLD.width - marginX * 2),
        y: marginY + this.random() * (WORLD.height - marginY * 2),
      };
      if (!this.collidesWithObstacle(stage, point.x, point.y, clearance)) return point;
    }

    for (let y = marginY; y <= WORLD.height - marginY; y += 64) {
      for (let x = marginX; x <= WORLD.width - marginX; x += 64) {
        if (!this.collidesWithObstacle(stage, x, y, clearance)) return { x, y };
      }
    }

    return stage === "preparation"
      ? { x: PREPARATION.spawnX, y: PREPARATION.spawnY }
      : { x: BATTLE.spawnX, y: BATTLE.spawnY };
  }

  private createEntity(options: {
    id: string;
    name: string;
    kind: "player" | "bot" | "boss";
    ownerId: string;
    stage: "preparation" | "battle";
    career: any;
    skillIds: string[];
    x: number;
    y: number;
  }): EntityState {
    const entity = new EntityState();
    entity.id = options.id;
    entity.name = options.name;
    entity.kind = options.kind;
    entity.ownerId = options.ownerId;
    entity.stage = options.stage;
    entity.careerId = options.career.id;
    entity.careerName = options.career.name;
    entity.color = options.career.color;
    entity.skill0 = options.skillIds[0] ?? "";
    entity.skill1 = options.skillIds[1] ?? "";
    entity.skill2 = options.skillIds[2] ?? "";
    entity.skill3 = options.skillIds[3] ?? "";
    entity.x = clamp(options.x, entity.radius, WORLD.width - entity.radius);
    entity.y = clamp(options.y, entity.radius, WORLD.height - entity.radius);
    entity.speed = options.kind === "player" ? 235 : 190;
    entity.prepTime = options.stage === "preparation" ? PREPARATION.duration : 0;
    return entity;
  }

  private normalizeSkills(career: any, requested: unknown): string[] {
    const validIds = new Set<string>(career.skills.map((skill: { id: string }) => skill.id));
    const selected = Array.isArray(requested)
      ? requested.filter((id): id is string => typeof id === "string" && validIds.has(id)).filter((id, index, list) => list.indexOf(id) === index).slice(0, 4)
      : [];
    const defaults = career.skills.map((skill: { id: string }) => skill.id);
    return [...selected, ...defaults.filter((id: string) => !selected.includes(id))].slice(0, 4);
  }

  private moveEntity(entity: EntityState, dx: number, dy: number): void {
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / Math.max(1, entity.radius)));
    const stepX = dx / steps;
    const stepY = dy / steps;
    for (let step = 0; step < steps; step += 1) {
      const nextX = clamp(entity.x + stepX, entity.radius, WORLD.width - entity.radius);
      if (!this.collidesWithObstacle(entity.stage, nextX, entity.y, entity.radius)) entity.x = nextX;

      const nextY = clamp(entity.y + stepY, entity.radius, WORLD.height - entity.radius);
      if (!this.collidesWithObstacle(entity.stage, entity.x, nextY, entity.radius)) entity.y = nextY;
    }
  }

  private collidesWithObstacle(stage: string, x: number, y: number, radius: number): boolean {
    const obstacles = stage === "preparation" ? PREPARATION_OBSTACLES : BATTLE_OBSTACLES;
    return obstacles.some((obstacle) => circleIntersectsObstacle(x, y, radius, obstacle));
  }

  private cleanupRealm(ownerId: string, exceptEntityId?: string): void {
    for (const [id, entity] of this.state.entities.entries()) {
      if (entity.ownerId === ownerId && id !== exceptEntityId) this.state.entities.delete(id);
    }
    for (const [id, loot] of this.state.loot.entries()) {
      if (loot.ownerId === ownerId) this.state.loot.delete(id);
    }
    for (const [id, projectile] of this.state.projectiles.entries()) {
      if (projectile.ownerId === ownerId) {
        this.state.projectiles.delete(id);
        this.projectileHits.delete(id);
      }
    }
  }

  private bossId(playerId: string): string {
    return `boss:${playerId}`;
  }

  private nextId(prefix: string): string {
    this.serial += 1;
    return `${prefix}:${this.serial}`;
  }

  private emitFeed(text: string, tone: FeedMessage["tone"], ownerId = "", targetPlayerId?: string): void {
    this.events.feed?.({ text, tone, ownerId }, targetPlayerId);
  }

  private emitEffect(type: string, source: EntityState, color: string, radius: number): void {
    this.events.effect?.({ type, x: source.x, y: source.y, angle: source.angle, color, radius, ownerId: source.ownerId });
  }
}
