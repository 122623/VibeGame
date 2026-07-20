import { MapSchema, Schema, type, view } from "@colyseus/schema";
import { BATTLE } from "../../src/shared/protocol.js";

export class EntityState extends Schema {
  @type("string") id = "";
  @type("string") name = "";
  @type("string") kind = "player";
  @type("string") ownerId = "";
  @type("string") careerId = "berserker";
  @type("string") careerName = "";
  @type("string") color = "#ef4e4e";
  @type("string") skill0 = "";
  @type("string") skill1 = "";
  @type("string") skill2 = "";
  @type("string") skill3 = "";

  @type("float32") x = 0;
  @type("float32") y = 0;
  @type("float32") angle = 0;
  @type("float32") health = 100;
  @type("float32") maxHealth = 100;
  @type("float32") shield = 0;
  @type("boolean") alive = true;
  @type("uint16") kills = 0;
  @type("float32") damage = 0;

  @type("string") weaponName = "无";
  @type("string") armorName = "无";
  @type("float32") weaponPower = 0;
  @type("float32") armorPower = 0;
  @type("uint8") potions = 1;

  @type("string") stage = "preparation";
  @type("float32") prepTime = 60;
  @type("float32") bossDamage = 0;
  @type("string") rewardQuality = "未参与";

  @type("float32") cooldown0 = 0;
  @type("float32") cooldown1 = 0;
  @type("float32") cooldown2 = 0;
  @type("float32") cooldown3 = 0;
  @type("float32") attackCooldown = 0;
  @type("float32") dodgeCooldown = 0;
  @type("float32") invulnerable = 0;
  @type("float32") buffTime = 0;
  @type("float32") slowTime = 0;
  @type("float32") speed = 220;
  @type("float32") radius = 23;
}

export class LootState extends Schema {
  @type("string") id = "";
  @type("string") ownerId = "";
  @type("float32") x = 0;
  @type("float32") y = 0;
  @type("string") type = "potion";
  @type("string") name = "";
  @type("string") quality = "普通";
  @type("string") color = "#c3cbd4";
  @type("float32") value = 0;
  @type("uint8") amount = 1;
}

export class ProjectileState extends Schema {
  @type("string") id = "";
  @type("string") ownerId = "";
  @type("string") sourceId = "";
  @type("float32") x = 0;
  @type("float32") y = 0;
  @type("float32") vx = 0;
  @type("float32") vy = 0;
  @type("float32") radius = 14;
  @type("float32") damage = 0;
  @type("float32") maxDistance = 500;
  @type("float32") travelled = 0;
  @type("string") color = "#ffffff";
  @type("boolean") pierce = false;
  @type("float32") slow = 0;
}

export class BattleState extends Schema {
  @view()
  @type({ map: EntityState }) entities = new MapSchema<EntityState>();
  @view()
  @type({ map: LootState }) loot = new MapSchema<LootState>();
  @view()
  @type({ map: ProjectileState }) projectiles = new MapSchema<ProjectileState>();

  @type("float32") zoneX: number = BATTLE.zoneX;
  @type("float32") zoneY: number = BATTLE.zoneY;
  @type("float32") zoneRadius: number = BATTLE.zoneRadius;
  @type("uint8") zonePhase = 0;
  @type("string") zoneLabel = "安全区稳定";
  @type("float32") zoneTimer = 35;
  @type("float32") battleElapsed = 0;
  @type("uint16") aliveCount = 0;
}
