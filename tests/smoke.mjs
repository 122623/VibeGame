import assert from "node:assert/strict";
import { DEFAULT_CONFIG, normalizeConfig } from "../src/config.js";
import { BattleGame } from "../src/game.js";

const canvas = { getContext: () => ({}) };
const game = new BattleGame(canvas, normalizeConfig(DEFAULT_CONFIG));
game.viewWidth = 1280;
game.viewHeight = 720;
game.setupMatch();

assert.equal(game.entities.length, 12, "对局应包含玩家和 11 名机器人");
assert.equal(game.loot.length, 38, "地图应生成初始物资");

const firstLoot = game.loot[0];
firstLoot.x = game.player.x;
firstLoot.y = game.player.y;
game.pickupNearest();
assert.equal(game.loot.length, 37, "玩家应能拾取附近物资");

const target = game.entities[1];
target.x = game.player.x + 60;
target.y = game.player.y;
game.player.facing = { x: 1, y: 0 };
const healthBeforeAttack = target.health;
game.basicAttack(game.player);
assert.ok(target.health < healthBeforeAttack, "普通攻击应对面前目标造成伤害");

game.player.cooldowns[0] = 0;
game.castSkill(game.player, 0);
assert.ok(game.player.cooldowns[0] > 0, "释放技能后应进入冷却");

game.player.x = 0;
game.player.y = 0;
game.zone.radius = 50;
game.zone.x = 1200;
game.zone.y = 800;
game.player.invulnerable = 0;
const healthBeforeZone = game.player.health;
game.applyZoneDamage(game.player, 0.6);
assert.ok(game.player.health < healthBeforeZone, "危险区应持续造成伤害");

console.log("Smoke tests passed: entities, loot, attack, skill cooldown and zone damage.");
