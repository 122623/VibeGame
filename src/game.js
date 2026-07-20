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

function makeLoot(x, y, forcedType) {
  const type = forcedType || (Math.random() < 0.3 ? "potion" : Math.random() < 0.55 ? "weapon" : "armor");
  if (type === "potion") return { x, y, type, name: "生命药剂", color: "#57d99a", quality: QUALITIES[0], amount: 1 };
  const roll = Math.random();
  const quality = roll > 0.9 ? QUALITIES[2] : roll > 0.52 ? QUALITIES[1] : QUALITIES[0];
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
    this.obstacles = createObstacles();
    this.entities = [];
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
    this.setupMatch();
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

  setupMatch() {
    const career = getCareer(this.config.careerId);
    const skillIds = this.config.skillsByCareer[career.id];
    this.player = this.createFighter({
      id: "player", name: "你", career, skillIds, x: 320, y: WORLD.height / 2, isPlayer: true,
    });
    this.entities.push(this.player);

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
    this.hooks.onFeed?.("战场已开启，寻找物资并进入安全区");
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
    this.updateZone(dt);
    this.updatePlayer(dt);
    this.entities.forEach((entity) => {
      if (!entity.alive) return;
      this.updateTimers(entity, dt);
      if (!entity.isPlayer) this.updateBot(entity, dt);
      this.applyZoneDamage(entity, dt);
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
      if (dist < 95) this.basicAttack(bot);
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
    if (zoneDistance > this.zone.radius - 90) {
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
    attacker.attackCooldown = attacker.buffTimer > 0 ? 0.29 : 0.44;
    const origin = { x: attacker.x + attacker.facing.x * 45, y: attacker.y + attacker.facing.y * 45 };
    this.effects.push({ type: "slash", x: origin.x, y: origin.y, angle: Math.atan2(attacker.facing.y, attacker.facing.x), color: attacker.career.color, life: 0.2, maxLife: 0.2 });
    const damage = 17 + (attacker.gear.weapon?.value || 0);
    this.targetsOf(attacker).forEach((target) => {
      const dx = target.x - attacker.x;
      const dy = target.y - attacker.y;
      const dist = Math.hypot(dx, dy);
      if (dist <= 92 && (dx * attacker.facing.x + dy * attacker.facing.y) / (dist || 1) > 0.2) {
        this.damageEntity(target, damage, attacker, { knockback: 45 });
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
    target.health -= damage;
    target.flash = 0.1;
    if (options.slow) target.slowTimer = Math.max(target.slowTimer, 2.4);
    if (options.knockback) {
      const dx = target.x - attacker.x;
      const dy = target.y - attacker.y;
      const length = Math.hypot(dx, dy) || 1;
      this.moveEntity(target, dx / length * options.knockback, dy / length * options.knockback);
    }
    if (attacker !== target) {
      attacker.damage += damage;
      if (attacker.isPlayer) this.stats.damage += damage;
    }
    this.effects.push({ type: "damage", x: target.x, y: target.y - 28, text: Math.round(damage), color: options.zone ? "#cf73ff" : "#fff", life: 0.65, maxLife: 0.65 });
    if (target.health <= 0) this.eliminate(target, attacker);
    return damage;
  }

  eliminate(target, attacker) {
    if (!target.alive) return;
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
    const segment = timeline.find((item) => this.elapsed >= item.start && this.elapsed < item.end) || timeline[timeline.length - 1];
    const progress = clamp((this.elapsed - segment.start) / (segment.end - segment.start), 0, 1);
    this.zone.radius = lerp(segment.from, segment.to, progress);
    this.zone.phase = timeline.indexOf(segment);
    this.zone.label = segment.label;
    this.zone.timer = Math.max(0, segment.end - this.elapsed);
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
    this.hooks.onHud?.({
      health: this.player.health, maxHealth: this.player.maxHealth, shield: this.player.shield,
      career: this.player.career, skills: this.player.skills, cooldowns: this.player.cooldowns,
      alive: this.entities.filter((entity) => entity.alive).length, kills: this.stats.kills,
      weapon: this.player.gear.weapon, armor: this.player.gear.armor, potions: this.player.potions,
      zoneLabel: this.zone.label, zoneTimer: formatTime(this.zone.timer), bindings: this.config.bindings,
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
    this.drawLoot(ctx);
    this.drawProjectiles(ctx);
    this.entities.filter((entity) => entity.alive).sort((a, b) => a.y - b.y).forEach((entity) => this.drawFighter(ctx, entity));
    this.drawEffects(ctx);
    this.drawZone(ctx);
    ctx.restore();
    this.drawMinimap(ctx);
  }

  drawWorld(ctx) {
    ctx.fillStyle = "#18201e";
    ctx.fillRect(0, 0, WORLD.width, WORLD.height);
    ctx.strokeStyle = "rgba(187, 211, 194, .045)";
    ctx.lineWidth = 1;
    for (let x = 0; x <= WORLD.width; x += 80) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, WORLD.height); ctx.stroke(); }
    for (let y = 0; y <= WORLD.height; y += 80) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(WORLD.width, y); ctx.stroke(); }

    const patches = [[190,180,560,330,"#202925"],[1380,120,800,390,"#1d2522"],[180,1090,620,360,"#1c2625"],[1370,1050,820,390,"#222720"]];
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

    const barWidth = 52;
    ctx.fillStyle = "rgba(0,0,0,.65)"; ctx.fillRect(entity.x - barWidth / 2, entity.y - 45, barWidth, 5);
    ctx.fillStyle = entity.isPlayer ? "#57d59a" : "#e45154"; ctx.fillRect(entity.x - barWidth / 2, entity.y - 45, barWidth * clamp(entity.health / entity.maxHealth, 0, 1), 5);
    ctx.fillStyle = "rgba(255,255,255,.72)"; ctx.font = "10px sans-serif"; ctx.textAlign = "center"; ctx.fillText(entity.name, entity.x, entity.y - 51);
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
    ctx.strokeStyle = "#bd5de6"; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(x + this.zone.x * sx, y + this.zone.y * sy, this.zone.radius * sx, this.zone.radius * sy, 0, 0, TAU); ctx.stroke();
    this.entities.filter((entity) => entity.alive).forEach((entity) => { ctx.fillStyle = entity.isPlayer ? "#fff" : "#e25355"; ctx.beginPath(); ctx.arc(x + entity.x * sx, y + entity.y * sy, entity.isPlayer ? 3 : 1.8, 0, TAU); ctx.fill(); });
    ctx.fillStyle = "rgba(255,255,255,.5)"; ctx.font = "8px sans-serif"; ctx.fillText("战术地图", x + 7, y + h - 7); ctx.restore();
  }
}
