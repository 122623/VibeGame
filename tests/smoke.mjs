import assert from "node:assert/strict";
import { DEFAULT_CONFIG, normalizeConfig } from "../src/config.js";
import { BattleGame } from "../src/game.js";

const canvas = { getContext: () => ({}) };
const game = new BattleGame(canvas, normalizeConfig(DEFAULT_CONFIG));
game.viewWidth = 1280;
game.viewHeight = 720;
game.setupPreparation();

assert.equal(game.stage, "preparation", "对局应从独立发育区开始");
assert.equal(game.entities.length, 2, "发育区应只包含玩家和 Boss");
assert.equal(game.loot.length, 14, "发育区应生成初始装备和消耗品");

const firstLoot = game.loot[0];
firstLoot.x = game.player.x;
firstLoot.y = game.player.y;
game.pickupNearest();
assert.equal(game.loot.length, 13, "玩家应能拾取附近物资");

const target = game.boss;
target.x = game.player.x + 60;
target.y = game.player.y;
game.player.facing = { x: 1, y: 0 };
const healthBeforeAttack = target.health;
game.basicAttack(game.player);
assert.ok(target.health < healthBeforeAttack, "普通攻击应对 Boss 造成伤害");
assert.ok(game.preparation.bossDamage > 0, "应记录玩家削减的 Boss 血量");

game.player.cooldowns[0] = 0;
game.castSkill(game.player, 0);
assert.ok(game.player.cooldowns[0] > 0, "释放技能后应进入冷却");

game.enterBattlefield("portal");
assert.equal(game.stage, "battle", "玩家应能提前进入主战场");
assert.equal(game.entities.length, 12, "主战场应包含玩家和 11 名机器人");
assert.ok(game.player.gear.weapon || game.player.gear.armor, "造成 Boss 伤害后应获得一件贡献装备");

game.player.x = 0;
game.player.y = 0;
game.zone.radius = 50;
game.zone.x = 1200;
game.zone.y = 800;
game.player.invulnerable = 0;
const healthBeforeZone = game.player.health;
game.applyZoneDamage(game.player, 0.6);
assert.ok(game.player.health < healthBeforeZone, "危险区应持续造成伤害");

console.log("Smoke tests passed: preparation map, boss contribution reward, battlefield transition and zone damage.");
