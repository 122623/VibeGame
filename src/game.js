import { CAREERS, SLOT_KEYS, displayKey, getCareer, getSkill } from "./config.js";

const WORLD = { width: 2400, height: 1600 };
const TAU = Math.PI * 2;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const lerp = (a, b, t) => a + (b - a) * t;
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const random = (min, max) => min + Math.random() * (max - min);
const formatTime = (seconds) => `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;

const BOT_NAMES = ["夜雨", "赤刃", "无名", "白鸦", "北辰", "铁锈", "灰烬", "零度", "残月", "断弦", "渡鸦"];
const QUALITIES = [
  { name: "普通", color: "#c3cbd4", power: 1 },
  { name: "稀有", color: "#4ea4ed", power: 1.35 },
  { name: "史诗", color: "#a968e8", power: 1.75 },
];

const WEAPONS = ["旧制长剑", "裂纹太刀", "军团巨刃", "波动短剑"];
const ARMORS = ["皮革护肩", "战术胸甲", "鬼纹长袍", "合金护甲"];

function pointSegmentDistance(point, start, end) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy || 1;
  const t = clamp(((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared, 0, 1);
  return Math.hypot(point.x - (start.x + dx * t), point.y - (start.y + dy * t));
}

function createObstacles() {
  return [
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
  ];
}

function createPreparationObstacles() {
  return [
    { x: 420, y: 250, w: 280, h: 150, label: "补给仓" },
    { x: 420, y: 1130, w: 280, h: 150, label: "医疗站" },
    { x: 980, y: 260, w: 430, h: 120, label: "领主祭坛" },
    { x: 980, y: 1220, w: 430, h: 120, label: "破碎回廊" },
    { x: 1670, y: 360, w: 260, h: 180, label: "传送前厅" },
    { x: 1670, y: 1060, w: 260, h: 180, label: "传送前厅" },
  ];
}

function makeLoot(x, y, forcedType, forcedQuality) {
  const type = forcedType || (Math.random() < 0.3 ? "potion" : Math.random() < 0.55 ? "weapon" : "armor");
  if (type === "potion") return { x, y, type, name: "生命药剂", color: "#57d99a", quality: QUALITIES[0], amount: 1 };
  const roll = Math.random();
  const quality = forcedQuality || (roll > 0.9 ? QUALITIES[2] : roll > 0.52 ? QUALITIES[1] : QUALITIES[0]);
  const list = type === "weapon" ? WEAPONS : ARMORS;
  return {
    x, y, type, quality, color: quality.color,
    name: `${quality.name}·${list[Math.floor(Math.random() * list.length)]}`,
    value: Math.round((type === "weapon" ? 8 : 6) * quality.power),
  };
}

export class BattleGame {
  constructor(canvas, config, hooks = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.config = config;
    this.hooks = hooks;
    this.running = false;
    this.paused = false;
    this.lastTime = 0;
    this.elapsed = 0;
    this.hudTick = 0;
    this.keys = new Set();
    this.projectiles = [];
    this.effects = [];
    this.loot = [];
    this.obstacles = createPreparationObstacles();
    this.entities = [];
    this.stage = "preparation";
    this.battleElapsed = 0;
    this.preparation = { timer: 60, bossDamage: 0, rewarded: false };
    this.portal = { x: 2150, y: WORLD.height / 2, radius: 64 };
    this.zone = { x: WORLD.width / 2, y: WORLD.height / 2, radius: 1050, phase: 0, label: "安全区稳定", timer: 35 };
    this.camera = { x: 0, y: 0 };
    this.stats = { kills: 0, damage: 0, startedAt: 0, rank: 12 };
    this.mouse = { x: 0, y: 0 };

    this.onKeyDown = (event) => this.handleKeyDown(event);
    this.onKeyUp = (event) => this.keys.delete(event.code);
    this.onMouseMove = (event) => this.handleMouseMove(event);
    this.onMouseDown = (event) => {
      if (event.button === 0 && this.running && !this.paused) this.basicAttack(this.player);
    };
    this.onResize = () => this.resize();
  }

  start() {
    this.resize();
    this.setupPreparation();
    this.running = true;
    this.stats.startedAt = performance.now();
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("mousemove", this.onMouseMove);
    this.canvas.addEventListener("mousedown", this.onMouseDown);
    window.addEventListener("resize", this.onResize);
    this.lastTime = performance.now();
    requestAnimationFrame((time) => this.loop(time));
  }

  destroy() {
    this.running = false;
    this.keys.clear();
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("mousemove", this.onMouseMove);
    this.canvas.removeEventListener("mousedown", this.onMouseDown);
    window.removeEventListener("resize", this.onResize);
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const width = Math.max(1000, window.innerWidth);
    const height = Math.max(620, window.innerHeight);
    this.canvas.width = Math.round(width * dpr);
    this.canvas.height = Math.round(height * dpr);
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.viewWidth = width;
    this.viewHeight = height;
  }

  setupPreparation() {
    const career = getCareer(this.config.careerId);
    const skillIds = this.config.skillsByCareer[career.id];
    this.player = this.createFighter({
      id: "player", name: "你", career, skillIds, x: 260, y: WORLD.height / 2, isPlayer: true,
    });
    this.entities.push(this.player);

    const bossCareer = CAREERS[0];
    this.boss = this.createFighter({
      id: "prep-boss", name: "裂隙领主", career: bossCareer,
      skillIds: bossCareer.skills.slice(0, 4).map((skill) => skill.id),
      x: 1180, y: WORLD.height / 2,
    });
    Object.assign(this.boss, { isBoss: true, radius: 42, speed: 112, health: 720, maxHealth: 720 });
    this.boss.ai.skillDelay = 4;
    this.entities.push(this.boss);

    for (let i = 0; i < 14; i += 1) {
      const point = this.openPoint();
      const forcedType = i < 4 ? "potion" : undefined;
      this.loot.push(makeLoot(point.x, point.y, forcedType));
    }
    this.hooks.onFeed?.("独立发育区已开启：60 秒后自动进入主战场");
    this.hooks.onFeed?.("可挑战裂隙领主，也可前往右侧传送门直接离开");
  }

  enterBattlefield(reason = "portal") {
    if (this.stage !== "preparation") return;
    this.grantBossReward();
    this.stage = "battle";
    this.battleElapsed = 0;
    this.projectiles = [];
    this.effects = [];
    this.loot = [];
    this.obstacles = createObstacles();
    this.entities = [this.player];
    this.player.x = 320;
    this.player.y = WORLD.height / 2;
    this.player.invulnerable = 1.5;
    this.player.attackCooldown = 0;
    this.player.cooldowns = this.player.cooldowns.map(() => 0);
    this.camera.x = 0;
    this.camera.y = 0;
    this.zone = { x: WORLD.width / 2, y: WORLD.height / 2, radius: 1050, phase: 0, label: "安全区稳定", timer: 35 };

    BOT_NAMES.forEach((name, index) => {
      const botCareer = CAREERS[index % CAREERS.length];
      const angle = (index / BOT_NAMES.length) * TAU;
      const radius = random(480, 900);
      this.entities.push(this.createFighter({
        id: `bot-${index}`, name, career: botCareer,
        skillIds: botCareer.skills.slice(0, 4).map((skill) => skill.id),
        x: this.zone.x + Math.cos(angle) * radius,
        y: this.zone.y + Math.sin(angle) * radius,
      }));
    });

    for (let i = 0; i < 38; i += 1) {
      const point = this.openPoint();
      this.loot.push(makeLoot(point.x, point.y));
    }
    this.hooks.onFeed?.(reason === "timeout" ? "发育时间结束，已传送至主战场" : "已主动进入主战场");
    this.hooks.onFeed?.("战场已开启，寻找物资并进入安全区");
  }

  grantBossReward() {
    if (this.preparation.rewarded || this.preparation.bossDamage <= 0) return null;
    this.preparation.rewarded = true;
    const ratio = clamp(this.preparation.bossDamage / this.boss.maxHealth, 0, 1);
    const quality = ratio >= 0.67 ? QUALITIES[2] : ratio >= 0.3 ? QUALITIES[1] : QUALITIES[0];
    const type = Math.random() < 0.55 ? "weapon" : "armor";
    const reward = makeLoot(this.player.x, this.player.y, type, quality);
    if (type === "weapon") this.player.gear.weapon = reward;
    else this.player.gear.armor = reward;
    this.hooks.onFeed?.(`Boss 贡献 ${Math.round(ratio * 100)}%，获得 ${reward.name}`);
    return reward;
  }

  createFighter({ id, name, career, skillIds, x, y, isPlayer = false }) {
    return {
      id, name, career, isPlayer, x: clamp(x, 60, WORLD.width - 60), y: clamp(y, 60, WORLD.height - 60),
      radius: 23, facing: { x: 1, y: 0 }, speed: isPlayer ? 235 : random(175, 205),
      health: 100, maxHealth: 100, shield: 0, alive: true, kills: 0, damage: 0,
      attackCooldown: 0, dodgeCooldown: 0, invulnerable: 0, flash: 0, slowTimer: 0,
      buffTimer: 0, cooldowns: [0, 0, 0, 0], skills: skillIds.map((skillId) => getSkill(career, skillId)),
      gear: { weapon: null, armor: null }, potions: isPlayer ? 1 : 0,
      ai: { think: random(0.1, 0.5), target: null, roamAngle: random(0, TAU), skillDelay: random(1.5, 4) },
    };
  }

  openPoint() {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const point = { x: random(90, WORLD.width - 90), y: random(90, WORLD.height - 90) };
      if (!this.obstacles.some((rect) => this.circleRectOverlap(point.x, point.y, 35, rect))) return point;
    }
    return { x: WORLD.width / 2, y: WORLD.height / 2 };
  }

  handleKeyDown(event) {
    const usedCodes = new Set([...Object.values(this.config.bindings), "Escape"]);
    if (usedCodes.has(event.code)) event.preventDefault();
    if (event.repeat) return;
    if (event.code === "Escape") return this.togglePause();
    if (!this.running || this.paused || !this.player.alive) return;
    this.keys.add(event.code);
    const bindings = this.config.bindings;
    const skillIndex = [bindings.skill1, bindings.skill2, bindings.skill3, bindings.skill4].indexOf(event.code);
    if (skillIndex >= 0) this.castSkill(this.player, skillIndex);
    if (event.code === bindings.attack) this.basicAttack(this.player);
    if (event.code === bindings.interact) this.pickupNearest();
    if (event.code === bindings.dodge) this.dodge(this.player);
    if (event.code === bindings.potion) this.usePotion();
  }

  handleMouseMove(event) {
    const rect = this.canvas.getBoundingClientRect();
    this.mouse.x = event.clientX - rect.left;
    this.mouse.y = event.clientY - rect.top;
    if (!this.player?.alive) return;
    const dx = this.mouse.x + this.camera.x - this.player.x;
    const dy = this.mouse.y + this.camera.y - this.player.y;
    const length = Math.hypot(dx, dy);
    if (length > 12) this.player.facing = { x: dx / length, y: dy / length };
  }

  togglePause(force) {
    if (!this.running) return;
    this.paused = typeof force === "boolean" ? force : !this.paused;
    this.hooks.onPause?.(this.paused);
    if (!this.paused) {
      this.lastTime = performance.now();
      requestAnimationFrame((time) => this.loop(time));
    }
  }

  loop(time) {
    if (!this.running || this.paused) return;
    const dt = Math.min((time - this.lastTime) / 1000, 0.033);
    this.lastTime = time;
    this.update(dt);
    this.draw();
    if (this.running) requestAnimationFrame((nextTime) => this.loop(nextTime));
  }

  update(dt) {
    this.elapsed += dt;
    if (this.stage === "preparation") {
      this.preparation.timer = Math.max(0, this.preparation.timer - dt);
      if (this.preparation.timer <= 0) this.enterBattlefield("timeout");
    } else {
      this.battleElapsed += dt;
      this.updateZone();
    }
    this.updatePlayer(dt);
    this.entities.forEach((entity) => {
      if (!entity.alive) return;
      this.updateTimers(entity, dt);
      if (!entity.isPlayer) this.updateBot(entity, dt);
      if (this.stage === "battle") this.applyZoneDamage(entity, dt);
    });
    this.updateProjectiles(dt);
    this.updateEffects(dt);
    this.updateCamera();
    this.updatePickupPrompt();

    this.hudTick -= dt;
    if (this.hudTick <= 0) {
      this.hudTick = 0.1;
      this.emitHud();
    }
  }

  updateTimers(entity, dt) {
    entity.attackCooldown = Math.max(0, entity.attackCooldown - dt);
    entity.dodgeCooldown = Math.max(0, entity.dodgeCooldown - dt);
    entity.invulnerable = Math.max(0, entity.invulnerable - dt);
    entity.flash = Math.max(0, entity.flash - dt);
    entity.slowTimer = Math.max(0, entity.slowTimer - dt);
    entity.buffTimer = Math.max(0, entity.buffTimer - dt);
    entity.cooldowns = entity.cooldowns.map((cooldown) => Math.max(0, cooldown - dt));
  }

  updatePlayer(dt) {
    if (!this.player.alive) return;
    const b = this.config.bindings;
    let dx = Number(this.keys.has(b.moveRight)) - Number(this.keys.has(b.moveLeft));
    let dy = Number(this.keys.has(b.moveDown)) - Number(this.keys.has(b.moveUp));
    const length = Math.hypot(dx, dy);
    if (length) {
      dx /= length; dy /= length;
      if (this.mouse.x === 0 && this.mouse.y === 0) this.player.facing = { x: dx, y: dy };
      const speed = this.player.speed * (this.player.slowTimer > 0 ? 0.55 : 1) * (this.player.buffTimer > 0 ? 1.28 : 1);
      this.moveEntity(this.player, dx * speed * dt, dy * speed * dt);
    }
  }

  updateBot(bot, dt) {
    bot.ai.think -= dt;
    bot.ai.skillDelay -= dt;
    if (bot.ai.think <= 0) {
      bot.ai.think = random(0.28, 0.48);
      const candidates = this.entities.filter((entity) => entity.alive && entity !== bot && distance(entity, bot) < 560);
      bot.ai.target = candidates.sort((a, b) => distance(a, bot) - distance(b, bot))[0] || null;
      if (!bot.ai.target) bot.ai.roamAngle += random(-1, 1);
    }

    const target = bot.ai.target;
    let dx;
    let dy;
    if (target?.alive) {
      const dist = distance(bot, target);
      dx = (target.x - bot.x) / (dist || 1);
      dy = (target.y - bot.y) / (dist || 1);
      bot.facing = { x: dx, y: dy };
      if (dist < (bot.isBoss ? 125 : 95)) this.basicAttack(bot);
      if (bot.ai.skillDelay <= 0 && dist < 440) {
        const available = bot.cooldowns.map((cooldown, index) => cooldown <= 0 ? index : -1).filter((index) => index >= 0);
        if (available.length) this.castSkill(bot, available[Math.floor(Math.random() * available.length)]);
        bot.ai.skillDelay = random(2.5, 5);
      }
      if (dist < 72) { dx *= -0.35; dy *= -0.35; }
    } else {
      dx = Math.cos(bot.ai.roamAngle);
      dy = Math.sin(bot.ai.roamAngle);
    }

    const zoneDistance = Math.hypot(bot.x - this.zone.x, bot.y - this.zone.y);
    if (this.stage === "battle" && zoneDistance > this.zone.radius - 90) {
      const towardZone = Math.atan2(this.zone.y - bot.y, this.zone.x - bot.x);
      dx = Math.cos(towardZone); dy = Math.sin(towardZone);
    }
    const speed = bot.speed * (bot.slowTimer > 0 ? 0.55 : 1) * (bot.buffTimer > 0 ? 1.22 : 1);
    this.moveEntity(bot, dx * speed * dt, dy * speed * dt);
  }

  moveEntity(entity, dx, dy) {
    const nextX = clamp(entity.x + dx, entity.radius, WORLD.width - entity.radius);
    if (!this.obstacles.some((rect) => this.circleRectOverlap(nextX, entity.y, entity.radius, rect))) entity.x = nextX;
    const nextY = clamp(entity.y + dy, entity.radius, WORLD.height - entity.radius);
    if (!this.obstacles.some((rect) => this.circleRectOverlap(entity.x, nextY, entity.radius, rect))) entity.y = nextY;
  }

  circleRectOverlap(x, y, radius, rect) {
    const closestX = clamp(x, rect.x, rect.x + rect.w);
    const closestY = clamp(y, rect.y, rect.y + rect.h);
    return (x - closestX) ** 2 + (y - closestY) ** 2 < radius ** 2;
  }

  basicAttack(attacker) {
    if (!attacker.alive || attacker.attackCooldown > 0) return;
    attacker.attackCooldown = attacker.isBoss ? 1.15 : attacker.buffTimer > 0 ? 0.29 : 0.44;
    const attackRange = attacker.isBoss ? 132 : 92;
    const origin = { x: attacker.x + attacker.facing.x * (attacker.isBoss ? 62 : 45), y: attacker.y + attacker.facing.y * (attacker.isBoss ? 62 : 45) };
    this.effects.push({ type: "slash", x: origin.x, y: origin.y, angle: Math.atan2(attacker.facing.y, attacker.facing.x), color: attacker.career.color, life: 0.2, maxLife: 0.2 });
    const damage = (attacker.isBoss ? 24 : 17) + (attacker.gear.weapon?.value || 0);
    this.targetsOf(attacker).forEach((target) => {
      const dx = target.x - attacker.x;
      const dy = target.y - attacker.y;
      const dist = Math.hypot(dx, dy);
      if (dist <= attackRange && (dx * attacker.facing.x + dy * attacker.facing.y) / (dist || 1) > 0.2) {
        this.damageEntity(target, damage, attacker, { knockback: attacker.isBoss ? 85 : 45 });
      }
    });
  }

  castSkill(caster, index) {
    const skill = caster.skills[index];
    if (!skill || caster.cooldowns[index] > 0 || !caster.alive) return;
    caster.cooldowns[index] = skill.cooldown;
    const damageMultiplier = caster.buffTimer > 0 ? 1.3 : 1;
    const damage = (skill.damage + (caster.gear.weapon?.value || 0) * 0.65) * damageMultiplier;
    const angle = Math.atan2(caster.facing.y, caster.facing.x);

    if (skill.kind === "melee") {
      this.effects.push({ type: "skillSlash", x: caster.x, y: caster.y, angle, radius: skill.range, color: skill.color, life: 0.42, maxLife: 0.42 });
      this.targetsOf(caster).forEach((target) => {
        const dx = target.x - caster.x;
        const dy = target.y - caster.y;
        const dist = Math.hypot(dx, dy);
        if (dist <= skill.range && (dx * caster.facing.x + dy * caster.facing.y) / (dist || 1) > -0.05) {
          const dealt = this.damageEntity(target, damage, caster, { knockback: skill.knockback || 55, slow: skill.slow });
          if (skill.lifesteal) caster.health = Math.min(caster.maxHealth, caster.health + dealt * skill.lifesteal);
        }
      });
    } else if (skill.kind === "aoe") {
      this.effects.push({ type: "ring", x: caster.x, y: caster.y, radius: skill.range, color: skill.color, life: 0.55, maxLife: 0.55 });
      this.targetsOf(caster).filter((target) => distance(target, caster) <= skill.range).forEach((target) => {
        this.damageEntity(target, damage, caster, { knockback: skill.knockback || 45, slow: skill.slow });
      });
    } else if (skill.kind === "projectile") {
      this.projectiles.push({
        x: caster.x + caster.facing.x * 35, y: caster.y + caster.facing.y * 35,
        vx: caster.facing.x * 540, vy: caster.facing.y * 540, radius: 14,
        distanceLeft: skill.range, owner: caster, damage, color: skill.color,
        pierce: skill.pierce, hit: new Set(), slow: skill.slow,
      });
    } else if (skill.kind === "dash") {
      const start = { x: caster.x, y: caster.y };
      const steps = 12;
      for (let step = 0; step < steps; step += 1) {
        this.moveEntity(caster, caster.facing.x * skill.range / steps, caster.facing.y * skill.range / steps);
      }
      const end = { x: caster.x, y: caster.y };
      caster.invulnerable = 0.22;
      this.effects.push({ type: "dash", x: start.x, y: start.y, endX: end.x, endY: end.y, color: skill.color, life: 0.35, maxLife: 0.35 });
      this.targetsOf(caster).filter((target) => pointSegmentDistance(target, start, end) < target.radius + 30).forEach((target) => {
        this.damageEntity(target, damage, caster, { knockback: 60 });
      });
    } else if (skill.kind === "shield") {
      caster.shield = Math.max(caster.shield, skill.shield);
      this.effects.push({ type: "shield", target: caster, color: skill.color, life: 1, maxLife: 1 });
    } else if (skill.kind === "buff") {
      caster.buffTimer = skill.duration;
      caster.health = Math.min(caster.maxHealth, caster.health + 12);
      this.effects.push({ type: "buff", target: caster, color: skill.color, life: 1, maxLife: 1 });
    } else if (skill.kind === "nova") {
      this.effects.push({ type: "pulseZone", x: caster.x, y: caster.y, owner: caster, damage, radius: skill.range, color: skill.color, life: (skill.pulses || 3) * 0.34, maxLife: (skill.pulses || 3) * 0.34, nextPulse: 0, pulses: skill.pulses || 3, hitWave: 0 });
    }

    if (caster.isPlayer) this.hooks.onFeed?.(`${skill.name}！`);
  }

  dodge(entity) {
    if (entity.dodgeCooldown > 0 || !entity.alive) return;
    entity.dodgeCooldown = 4;
    entity.invulnerable = 0.34;
    const start = { x: entity.x, y: entity.y };
    for (let i = 0; i < 8; i += 1) this.moveEntity(entity, entity.facing.x * 18, entity.facing.y * 18);
    this.effects.push({ type: "dash", x: start.x, y: start.y, endX: entity.x, endY: entity.y, color: "#e8edf5", life: 0.25, maxLife: 0.25 });
  }

  usePotion() {
    if (this.player.potions <= 0 || this.player.health >= this.player.maxHealth || !this.player.alive) return;
    this.player.potions -= 1;
    this.player.health = Math.min(this.player.maxHealth, this.player.health + 42);
    this.effects.push({ type: "ring", x: this.player.x, y: this.player.y, radius: 55, color: "#55db9b", life: 0.55, maxLife: 0.55 });
    this.hooks.onFeed?.("使用生命药剂，恢复 42 点生命");
  }

  targetsOf(entity) {
    return this.entities.filter((target) => target.alive && target !== entity);
  }

  damageEntity(target, amount, attacker, options = {}) {
    if (!target.alive || target.invulnerable > 0) return 0;
    const reduction = clamp((target.gear.armor?.value || 0) * 0.025, 0, 0.35);
    let damage = amount * (1 - reduction);
    if (target.shield > 0) {
      const absorbed = Math.min(target.shield, damage);
      target.shield -= absorbed;
      damage -= absorbed;
    }
    if (damage <= 0) return 0;
    damage = Math.min(damage, target.health);
    target.health -= damage;
    target.flash = 0.1;
    if (options.slow) target.slowTimer = Math.max(target.slowTimer, 2.4);
    if (options.knockback) {
      const dx = target.x - attacker.x;
      const dy = target.y - attacker.y;
      const length = Math.hypot(dx, dy) || 1;
      const force = target.isBoss ? options.knockback * 0.12 : options.knockback;
      this.moveEntity(target, dx / length * force, dy / length * force);
    }
    if (attacker !== target) {
      attacker.damage += damage;
      if (attacker.isPlayer) this.stats.damage += damage;
    }
    if (this.stage === "preparation" && target.isBoss && attacker.isPlayer) {
      this.preparation.bossDamage = Math.min(target.maxHealth, this.preparation.bossDamage + damage);
    }
    this.effects.push({ type: "damage", x: target.x, y: target.y - 28, text: Math.round(damage), color: options.zone ? "#cf73ff" : "#fff", life: 0.65, maxLife: 0.65 });
    if (target.health <= 0) this.eliminate(target, attacker);
    return damage;
  }

  eliminate(target, attacker) {
    if (!target.alive) return;
    if (this.stage === "preparation" && target.isPlayer) {
      target.health = 35;
      target.x = 260;
      target.y = WORLD.height / 2;
      target.invulnerable = 2.5;
      this.hooks.onFeed?.("你被裂隙领主击退，已在入口恢复 35 点生命");
      return;
    }
    if (this.stage === "preparation" && target.isBoss) {
      target.alive = false;
      target.health = 0;
      this.effects.push({ type: "death", x: target.x, y: target.y, color: "#f0b35b", life: 1.2, maxLife: 1.2 });
      const reward = this.grantBossReward();
      this.hooks.onFeed?.(`裂隙领主已被击败${reward ? `，${reward.name} 已装备` : ""}`);
      return;
    }
    target.alive = false;
    target.health = 0;
    if (attacker && attacker !== target) {
      attacker.kills += 1;
      if (attacker.isPlayer) this.stats.kills += 1;
    }
    this.loot.push(makeLoot(target.x + random(-18, 18), target.y + random(-18, 18), target.gear.weapon ? "weapon" : undefined));
    this.loot.push(makeLoot(target.x + random(-22, 22), target.y + random(-22, 22), "potion"));
    this.effects.push({ type: "death", x: target.x, y: target.y, color: target.career.color, life: 0.8, maxLife: 0.8 });
    const killerName = attacker && attacker !== target ? attacker.name : "危险区";
    this.hooks.onFeed?.(`${killerName} 击败了 ${target.name}`);
    const alive = this.entities.filter((entity) => entity.alive).length;
    if (target.isPlayer) {
      this.stats.rank = alive + 1;
      setTimeout(() => this.finish(false), 650);
    } else if (this.player.alive && alive === 1) {
      this.stats.rank = 1;
      setTimeout(() => this.finish(true), 500);
    }
  }

  pickupNearest() {
    if (!this.player.alive) return;
    if (this.stage === "preparation" && distance(this.player, this.portal) < 96) {
      this.enterBattlefield("portal");
      return;
    }
    let nearestIndex = -1;
    let nearestDistance = Infinity;
    this.loot.forEach((item, index) => {
      const dist = distance(this.player, item);
      if (dist < 76 && dist < nearestDistance) { nearestIndex = index; nearestDistance = dist; }
    });
    if (nearestIndex < 0) return;
    const [item] = this.loot.splice(nearestIndex, 1);
    if (item.type === "potion") this.player.potions += item.amount;
    if (item.type === "weapon") this.player.gear.weapon = item;
    if (item.type === "armor") this.player.gear.armor = item;
    this.hooks.onFeed?.(`拾取 ${item.name}`);
  }

  updatePickupPrompt() {
    if (this.stage === "preparation" && distance(this.player, this.portal) < 96) {
      this.hooks.onPickup?.({ portal: true, item: { name: "进入主战场" }, key: displayKey(this.config.bindings.interact) });
      return;
    }
    const nearest = this.loot.filter((item) => distance(this.player, item) < 76).sort((a, b) => distance(this.player, a) - distance(this.player, b))[0];
    this.hooks.onPickup?.(nearest ? { item: nearest, key: displayKey(this.config.bindings.interact) } : null);
  }

  updateProjectiles(dt) {
    this.projectiles = this.projectiles.filter((projectile) => {
      const stepX = projectile.vx * dt;
      const stepY = projectile.vy * dt;
      projectile.x += stepX; projectile.y += stepY;
      projectile.distanceLeft -= Math.hypot(stepX, stepY);
      if (projectile.x < 0 || projectile.y < 0 || projectile.x > WORLD.width || projectile.y > WORLD.height || projectile.distanceLeft <= 0) return false;
      if (this.obstacles.some((rect) => this.circleRectOverlap(projectile.x, projectile.y, projectile.radius, rect))) return false;
      for (const target of this.targetsOf(projectile.owner)) {
        if (!projectile.hit.has(target.id) && distance(projectile, target) < projectile.radius + target.radius) {
          projectile.hit.add(target.id);
          this.damageEntity(target, projectile.damage, projectile.owner, { knockback: 40, slow: projectile.slow });
          if (!projectile.pierce) return false;
        }
      }
      return true;
    });
  }

  updateEffects(dt) {
    this.effects = this.effects.filter((effect) => {
      effect.life -= dt;
      if (effect.type === "pulseZone") {
        effect.nextPulse -= dt;
        if (effect.nextPulse <= 0 && effect.pulses > 0) {
          effect.nextPulse = 0.34;
          effect.pulses -= 1;
          this.targetsOf(effect.owner).filter((target) => distance(target, effect) <= effect.radius).forEach((target) => {
            this.damageEntity(target, effect.damage, effect.owner, { knockback: 28 });
          });
        }
      }
      return effect.life > 0;
    });
  }

  updateZone() {
    const timeline = [
      { start: 0, end: 35, from: 1050, to: 1050, label: "安全区稳定" },
      { start: 35, end: 55, from: 1050, to: 780, label: "第 1 次收缩" },
      { start: 55, end: 80, from: 780, to: 780, label: "安全区稳定" },
      { start: 80, end: 100, from: 780, to: 560, label: "第 2 次收缩" },
      { start: 100, end: 120, from: 560, to: 560, label: "安全区稳定" },
      { start: 120, end: 140, from: 560, to: 350, label: "第 3 次收缩" },
      { start: 140, end: 155, from: 350, to: 350, label: "决赛区即将收缩" },
      { start: 155, end: 178, from: 350, to: 145, label: "决赛区收缩" },
      { start: 178, end: 230, from: 145, to: 55, label: "裂隙正在吞噬战场" },
    ];
    const segment = timeline.find((item) => this.battleElapsed >= item.start && this.battleElapsed < item.end) || timeline[timeline.length - 1];
    const progress = clamp((this.battleElapsed - segment.start) / (segment.end - segment.start), 0, 1);
    this.zone.radius = lerp(segment.from, segment.to, progress);
    this.zone.phase = timeline.indexOf(segment);
    this.zone.label = segment.label;
    this.zone.timer = Math.max(0, segment.end - this.battleElapsed);
  }

  applyZoneDamage(entity, dt) {
    if (distance(entity, this.zone) <= this.zone.radius) return;
    entity.zoneDamageTimer = (entity.zoneDamageTimer || 0) - dt;
    if (entity.zoneDamageTimer <= 0) {
      entity.zoneDamageTimer = 0.5;
      const damage = (3 + Math.floor(this.zone.phase / 2) * 2) * 0.5;
      this.damageEntity(entity, damage, entity, { zone: true });
    }
  }

  updateCamera() {
    const targetX = clamp(this.player.x - this.viewWidth / 2, 0, Math.max(0, WORLD.width - this.viewWidth));
    const targetY = clamp(this.player.y - this.viewHeight / 2, 0, Math.max(0, WORLD.height - this.viewHeight));
    this.camera.x = lerp(this.camera.x, targetX, 0.12);
    this.camera.y = lerp(this.camera.y, targetY, 0.12);
  }

  emitHud() {
    const bossRatio = this.boss ? clamp(this.preparation.bossDamage / this.boss.maxHealth, 0, 1) : 0;
    this.hooks.onHud?.({
      health: this.player.health, maxHealth: this.player.maxHealth, shield: this.player.shield,
      career: this.player.career, skills: this.player.skills, cooldowns: this.player.cooldowns,
      stage: this.stage, alive: this.stage === "preparation" ? 1 : this.entities.filter((entity) => entity.alive).length, kills: this.stats.kills,
      weapon: this.player.gear.weapon, armor: this.player.gear.armor, potions: this.player.potions,
      zoneLabel: this.stage === "preparation" ? "独立发育阶段" : this.zone.label,
      zoneTimer: formatTime(this.stage === "preparation" ? this.preparation.timer : this.zone.timer), bindings: this.config.bindings,
      boss: this.stage === "preparation" ? {
        alive: this.boss.alive, health: this.boss.health, maxHealth: this.boss.maxHealth,
        contribution: bossRatio, reward: bossRatio >= 0.67 ? "史诗" : bossRatio >= 0.3 ? "稀有" : bossRatio > 0 ? "普通" : "未参与",
      } : null,
    });
  }

  finish(victory) {
    if (!this.running) return;
    const result = {
      victory, rank: victory ? 1 : this.stats.rank, kills: this.stats.kills,
      damage: Math.round(this.stats.damage), time: formatTime(this.elapsed),
    };
    this.destroy();
    this.hooks.onFinish?.(result);
  }

  draw() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.viewWidth, this.viewHeight);
    ctx.save();
    ctx.translate(-this.camera.x, -this.camera.y);
    this.drawWorld(ctx);
    if (this.stage === "preparation") this.drawPortal(ctx);
    this.drawLoot(ctx);
    this.drawProjectiles(ctx);
    this.entities.filter((entity) => entity.alive).sort((a, b) => a.y - b.y).forEach((entity) => this.drawFighter(ctx, entity));
    this.drawEffects(ctx);
    if (this.stage === "battle") this.drawZone(ctx);
    ctx.restore();
    this.drawMinimap(ctx);
  }

  drawWorld(ctx) {
    ctx.fillStyle = this.stage === "preparation" ? "#1b1820" : "#18201e";
    ctx.fillRect(0, 0, WORLD.width, WORLD.height);
    ctx.strokeStyle = "rgba(187, 211, 194, .045)";
    ctx.lineWidth = 1;
    for (let x = 0; x <= WORLD.width; x += 80) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, WORLD.height); ctx.stroke(); }
    for (let y = 0; y <= WORLD.height; y += 80) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(WORLD.width, y); ctx.stroke(); }

    const patches = this.stage === "preparation"
      ? [[120,140,690,420,"#25202b"],[850,160,720,1220,"#241d27"],[1590,200,690,1200,"#1e222b"]]
      : [[190,180,560,330,"#202925"],[1380,120,800,390,"#1d2522"],[180,1090,620,360,"#1c2625"],[1370,1050,820,390,"#222720"]];
    patches.forEach(([x, y, w, h, color]) => { ctx.fillStyle = color; ctx.fillRect(x, y, w, h); });

    this.obstacles.forEach((rect) => {
      ctx.fillStyle = "rgba(0,0,0,.25)"; ctx.fillRect(rect.x + 12, rect.y + 14, rect.w, rect.h);
      ctx.fillStyle = "#303638"; ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
      ctx.strokeStyle = "#454d50"; ctx.lineWidth = 3; ctx.strokeRect(rect.x + 4, rect.y + 4, rect.w - 8, rect.h - 8);
      ctx.fillStyle = "rgba(8,12,13,.32)";
      for (let x = rect.x + 24; x < rect.x + rect.w - 24; x += 55) ctx.fillRect(x, rect.y + 18, 24, rect.h - 36);
      ctx.fillStyle = "rgba(226,232,224,.26)"; ctx.font = "700 12px sans-serif"; ctx.fillText(rect.label, rect.x + 12, rect.y - 8);
    });
    ctx.strokeStyle = "rgba(240,180,91,.35)"; ctx.lineWidth = 4; ctx.strokeRect(3, 3, WORLD.width - 6, WORLD.height - 6);
  }

  drawPortal(ctx) {
    const pulse = 1 + Math.sin(this.elapsed * 3) * 0.08;
    ctx.save();
    ctx.translate(this.portal.x, this.portal.y);
    ctx.scale(pulse, pulse);
    ctx.shadowColor = "#54d7ee";
    ctx.shadowBlur = 28;
    ctx.strokeStyle = "rgba(96, 224, 244, .9)";
    ctx.lineWidth = 7;
    ctx.beginPath(); ctx.ellipse(0, 0, 48, 78, 0, 0, TAU); ctx.stroke();
    ctx.strokeStyle = "rgba(171, 112, 242, .75)";
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.ellipse(0, 0, 34, 62, 0, 0, TAU); ctx.stroke();
    ctx.fillStyle = "rgba(78, 205, 235, .2)";
    ctx.beginPath(); ctx.ellipse(0, 0, 31, 58, 0, 0, TAU); ctx.fill();
    ctx.restore();
    ctx.fillStyle = "rgba(230, 247, 255, .9)";
    ctx.font = "700 13px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("进入主战场", this.portal.x, this.portal.y - 96);
    ctx.font = "10px sans-serif";
    ctx.fillStyle = "rgba(230, 247, 255, .6)";
    ctx.fillText("无需击败 Boss", this.portal.x, this.portal.y - 80);
  }

  drawLoot(ctx) {
    this.loot.forEach((item) => {
      const pulse = 1 + Math.sin(this.elapsed * 4 + item.x) * 0.08;
      ctx.save(); ctx.translate(item.x, item.y); ctx.scale(pulse, pulse); ctx.rotate(Math.PI / 4);
      ctx.shadowColor = item.color; ctx.shadowBlur = 14; ctx.fillStyle = item.color; ctx.globalAlpha = 0.9; ctx.fillRect(-8, -8, 16, 16);
      ctx.globalAlpha = 1; ctx.strokeStyle = "#fff"; ctx.lineWidth = 1; ctx.strokeRect(-8, -8, 16, 16); ctx.restore();
    });
  }

  drawFighter(ctx, entity) {
    ctx.save(); ctx.translate(entity.x, entity.y);
    if (entity.isBoss) ctx.scale(1.55, 1.55);
    ctx.globalAlpha = entity.invulnerable > 0 && Math.floor(this.elapsed * 18) % 2 ? 0.45 : 1;
    ctx.fillStyle = "rgba(0,0,0,.35)"; ctx.beginPath(); ctx.ellipse(0, 17, 27, 11, 0, 0, TAU); ctx.fill();
    if (entity.shield > 0) { ctx.strokeStyle = "rgba(117,206,255,.7)"; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, -3, 31, 0, TAU); ctx.stroke(); }
    if (entity.buffTimer > 0) { ctx.shadowColor = entity.career.color; ctx.shadowBlur = 18; }
    ctx.rotate(Math.atan2(entity.facing.y, entity.facing.x));
    ctx.strokeStyle = entity.flash > 0 ? "#fff" : "#dadde3"; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(3, -2); ctx.lineTo(34, -5); ctx.stroke();
    ctx.lineWidth = 2; ctx.strokeStyle = "#5e3d2d"; ctx.beginPath(); ctx.moveTo(4, 0); ctx.lineTo(20, 0); ctx.stroke();
    ctx.rotate(-Math.atan2(entity.facing.y, entity.facing.x));
    ctx.fillStyle = entity.flash > 0 ? "#fff" : entity.career.color; ctx.beginPath(); ctx.moveTo(-17, 13); ctx.lineTo(-12, -15); ctx.lineTo(11, -19); ctx.lineTo(18, 13); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#d8c5b2"; ctx.beginPath(); ctx.arc(0, -23, 9, 0, TAU); ctx.fill();
    ctx.fillStyle = "#1c2028"; ctx.beginPath(); ctx.arc(-1, -27, 10, Math.PI, TAU); ctx.fill();
    ctx.fillStyle = "#fff"; ctx.font = "900 8px sans-serif"; ctx.textAlign = "center"; ctx.fillText(entity.career.mark, 0, 4);
    ctx.restore();

    const barWidth = entity.isBoss ? 100 : 52;
    const barY = entity.y - (entity.isBoss ? 76 : 45);
    ctx.fillStyle = "rgba(0,0,0,.65)"; ctx.fillRect(entity.x - barWidth / 2, barY, barWidth, entity.isBoss ? 8 : 5);
    ctx.fillStyle = entity.isPlayer ? "#57d59a" : entity.isBoss ? "#f0a34d" : "#e45154"; ctx.fillRect(entity.x - barWidth / 2, barY, barWidth * clamp(entity.health / entity.maxHealth, 0, 1), entity.isBoss ? 8 : 5);
    ctx.fillStyle = "rgba(255,255,255,.82)"; ctx.font = entity.isBoss ? "700 13px sans-serif" : "10px sans-serif"; ctx.textAlign = "center"; ctx.fillText(entity.name, entity.x, barY - 6);
  }

  drawProjectiles(ctx) {
    this.projectiles.forEach((projectile) => {
      ctx.save(); ctx.translate(projectile.x, projectile.y); ctx.rotate(Math.atan2(projectile.vy, projectile.vx));
      ctx.shadowColor = projectile.color; ctx.shadowBlur = 18; ctx.fillStyle = projectile.color;
      ctx.beginPath(); ctx.moveTo(20, 0); ctx.lineTo(-12, -8); ctx.lineTo(-5, 0); ctx.lineTo(-12, 8); ctx.closePath(); ctx.fill(); ctx.restore();
    });
  }

  drawEffects(ctx) {
    this.effects.forEach((effect) => {
      const progress = 1 - effect.life / effect.maxLife;
      ctx.save(); ctx.globalAlpha = clamp(1 - progress, 0, 1); ctx.strokeStyle = effect.color; ctx.fillStyle = effect.color;
      if (effect.type === "slash") {
        ctx.lineWidth = 7 * (1 - progress); ctx.beginPath(); ctx.arc(effect.x, effect.y, 42 + progress * 20, effect.angle - 0.8, effect.angle + 0.8); ctx.stroke();
      } else if (effect.type === "skillSlash") {
        ctx.lineWidth = 12 * (1 - progress); ctx.beginPath(); ctx.arc(effect.x, effect.y, effect.radius * (.65 + progress * .45), effect.angle - 1, effect.angle + 1); ctx.stroke();
      } else if (effect.type === "ring" || effect.type === "death") {
        ctx.lineWidth = effect.type === "death" ? 10 : 6; ctx.beginPath(); ctx.arc(effect.x, effect.y, effect.radius ? effect.radius * progress : 35 + progress * 70, 0, TAU); ctx.stroke();
      } else if (effect.type === "dash") {
        ctx.lineWidth = 16 * (1 - progress); ctx.beginPath(); ctx.moveTo(effect.x, effect.y); ctx.lineTo(effect.endX, effect.endY); ctx.stroke();
      } else if (effect.type === "damage") {
        ctx.font = "800 16px sans-serif"; ctx.textAlign = "center"; ctx.fillText(effect.text, effect.x, effect.y - progress * 30);
      } else if (effect.type === "shield" || effect.type === "buff") {
        if (effect.target.alive) { ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(effect.target.x, effect.target.y, 28 + progress * 18, 0, TAU); ctx.stroke(); }
      } else if (effect.type === "pulseZone") {
        ctx.globalAlpha = .45; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(effect.x, effect.y, effect.radius * (.85 + Math.sin(this.elapsed * 16) * .1), 0, TAU); ctx.stroke();
      }
      ctx.restore();
    });
  }

  drawZone(ctx) {
    const screenRect = { x: this.camera.x, y: this.camera.y, w: this.viewWidth, h: this.viewHeight };
    ctx.save(); ctx.fillStyle = "rgba(88,24,114,.31)"; ctx.beginPath(); ctx.rect(screenRect.x, screenRect.y, screenRect.w, screenRect.h); ctx.arc(this.zone.x, this.zone.y, this.zone.radius, 0, TAU, true); ctx.fill("evenodd");
    ctx.strokeStyle = "rgba(213,115,255,.82)"; ctx.lineWidth = 5; ctx.shadowColor = "#c35dec"; ctx.shadowBlur = 16; ctx.beginPath(); ctx.arc(this.zone.x, this.zone.y, this.zone.radius, 0, TAU); ctx.stroke(); ctx.restore();
  }

  drawMinimap(ctx) {
    const w = 190; const h = 128; const x = 22; const y = 22; const sx = w / WORLD.width; const sy = h / WORLD.height;
    ctx.save(); ctx.fillStyle = "rgba(5,8,12,.78)"; ctx.fillRect(x, y, w, h); ctx.strokeStyle = "rgba(255,255,255,.15)"; ctx.strokeRect(x, y, w, h);
    if (this.stage === "battle") {
      ctx.strokeStyle = "#bd5de6"; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(x + this.zone.x * sx, y + this.zone.y * sy, this.zone.radius * sx, this.zone.radius * sy, 0, 0, TAU); ctx.stroke();
    } else {
      ctx.fillStyle = "#5adbed"; ctx.beginPath(); ctx.arc(x + this.portal.x * sx, y + this.portal.y * sy, 3, 0, TAU); ctx.fill();
    }
    this.entities.filter((entity) => entity.alive).forEach((entity) => { ctx.fillStyle = entity.isPlayer ? "#fff" : "#e25355"; ctx.beginPath(); ctx.arc(x + entity.x * sx, y + entity.y * sy, entity.isPlayer ? 3 : 1.8, 0, TAU); ctx.fill(); });
    ctx.fillStyle = "rgba(255,255,255,.5)"; ctx.font = "8px sans-serif"; ctx.fillText("战术地图", x + 7, y + h - 7); ctx.restore();
  }
}
