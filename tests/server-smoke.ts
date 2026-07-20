import assert from "node:assert/strict";
import { BattleSimulation } from "../server/game/BattleSimulation.js";
import {
  BATTLE_OBSTACLES,
  PREPARATION_OBSTACLES,
  type EffectMessage,
  type FeedMessage,
  type MatchEndMessage,
  type WorldObstacle,
} from "../src/shared/protocol.js";

function seededRandom(seed = 0x12345678): () => number {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 0x1_0000_0000;
  };
}

function pointIsInsideObstacle(point: { x: number; y: number }, obstacles: readonly WorldObstacle[]): boolean {
  return obstacles.some((obstacle) => (
    point.x >= obstacle.x
    && point.x <= obstacle.x + obstacle.w
    && point.y >= obstacle.y
    && point.y <= obstacle.y + obstacle.h
  ));
}

const feeds: FeedMessage[] = [];
const effects: EffectMessage[] = [];
const results: MatchEndMessage[] = [];
const simulation = new BattleSimulation({
  random: seededRandom(),
  events: {
    feed: (message) => feeds.push(message),
    effect: (message) => effects.push(message),
    matchEnd: (message) => results.push(message),
  },
});

const player = simulation.addPlayer("alice", {
  name: "Alice",
  careerId: "weaponMaster",
  skillIds: ["triple-cut", "rising-slash", "sword-wave", "blade-storm"],
});
simulation.addPlayer("bob", { name: "Bob", careerId: "asura" });

assert.equal(player.stage, "preparation", "players must start in a preparation realm");
assert.equal(player.ownerId, "alice", "the preparation realm is partitioned by the player's session id");
assert.equal(player.prepTime, 60, "preparation lasts sixty seconds");
assert.ok(simulation.state.entities.has("boss:alice"), "each player receives a private boss");
assert.ok(simulation.state.entities.has("boss:bob"), "a second player receives an independent boss");
assert.equal([...simulation.state.loot.values()].filter((loot) => loot.ownerId === "alice").length, 14, "each realm receives fourteen loot items");
assert.equal([...simulation.state.loot.values()].filter((loot) => loot.ownerId === "bob").length, 14, "private loot must not be shared across preparation realms");
assert.ok(
  [...simulation.state.loot.values()].filter((loot) => loot.ownerId !== "").every((loot) => !pointIsInsideObstacle(loot, PREPARATION_OBSTACLES)),
  "preparation loot never spawns inside shared obstacles",
);

const startX = player.x;
assert.equal(simulation.setInput("alice", { seq: 1, up: false, down: false, left: false, right: true, angle: 0 }), true);
simulation.fixedUpdate(0.1);
assert.ok(player.x > startX, "the authoritative simulation consumes movement input");
assert.equal(simulation.setInput("alice", { seq: 1, up: false, down: false, left: true, right: false, angle: Math.PI }), false, "stale input sequences are rejected");

const preparationWall = PREPARATION_OBSTACLES[0];
player.x = preparationWall.x - player.radius - 1;
player.y = preparationWall.y + preparationWall.h / 2;
assert.equal(simulation.setInput("alice", { seq: 2, up: false, down: false, left: false, right: true, angle: 0 }), true);
simulation.fixedUpdate(0.1);
assert.ok(player.x <= preparationWall.x - player.radius, "server movement cannot pass through preparation obstacles");

const boss = simulation.state.entities.get("boss:alice");
assert.ok(boss);
const bossHealthBefore = boss.health;
const dealt = simulation.damageEntity(boss.id, 10_000, player.id);
assert.ok(dealt > 0 && boss.health < bossHealthBefore, "boss damage is resolved on the server");
assert.ok(player.bossDamage >= 500, "boss contribution belongs to the attacking player");
assert.equal(player.rewardQuality, "史诗", "dealing at least 67% boss health previews an epic reward");

assert.equal(boss.alive, false, "lethal boss damage defeats the private boss");
assert.equal(player.kills, 0, "defeating a boss does not increase PvP kills");

assert.equal(simulation.enterBattlefield(player.id, "portal"), true, "players may leave preparation early");
assert.equal(player.stage, "battle");
assert.equal(player.ownerId, "", "the owner id is cleared on the public battlefield");
assert.ok(player.weaponPower > 0 || player.armorPower > 0, "boss contribution grants exactly one equipped reward");
assert.equal(simulation.state.entities.has("boss:alice"), false, "private boss state is cleaned up after transition");
assert.equal(simulation.state.entities.get("bob")?.stage, "preparation", "another player's preparation realm remains independent");
assert.equal([...simulation.state.entities.values()].filter((entity) => entity.kind === "bot").length, 11, "the main battlefield contains eleven bots");
assert.equal([...simulation.state.loot.values()].filter((loot) => loot.ownerId === "").length, 38, "the main battlefield starts with public loot");
assert.equal(simulation.state.aliveCount, 12, "the entering player and eleven bots are alive");
assert.ok(
  [...simulation.state.loot.values()].filter((loot) => loot.ownerId === "").every((loot) => !pointIsInsideObstacle(loot, BATTLE_OBSTACLES)),
  "battlefield loot never spawns inside shared obstacles",
);

const battleWall = BATTLE_OBSTACLES[0];
player.x = battleWall.x - player.radius - 1;
player.y = battleWall.y + battleWall.h / 2;
assert.equal(simulation.setInput("alice", { seq: 3, up: false, down: false, left: false, right: true, angle: 0 }), true);
simulation.fixedUpdate(0.1);
assert.ok(player.x <= battleWall.x - player.radius, "server movement cannot pass through battlefield obstacles");

player.x = battleWall.x - player.radius - 14;
player.y = battleWall.y + battleWall.h / 2;
assert.equal(simulation.setInput("alice", { seq: 4, up: false, down: false, left: false, right: false, angle: 0 }), true);
player.cooldown2 = 0;
assert.equal(simulation.handleAction(player.id, { type: "skill", index: 2 }), true, "configured career skills can be cast");
assert.equal(simulation.state.projectiles.size, 1, "projectile skills create authoritative projectile state");
assert.ok(player.cooldown2 > 0, "skills enter cooldown after use");
const wallBoundProjectileId = [...simulation.state.projectiles.keys()][0];
simulation.fixedUpdate(0.1);
assert.equal(simulation.state.projectiles.has(wallBoundProjectileId), false, "projectiles are destroyed when they hit shared obstacles");

const firstPublicLoot = [...simulation.state.loot.values()].find((loot) => loot.ownerId === "");
assert.ok(firstPublicLoot);
player.x = firstPublicLoot.x;
player.y = firstPublicLoot.y;
const publicLootBeforePickup = [...simulation.state.loot.values()].filter((loot) => loot.ownerId === "").length;
assert.equal(simulation.handleAction(player.id, { type: "interact" }), true, "players can pick up nearby public loot");
assert.equal([...simulation.state.loot.values()].filter((loot) => loot.ownerId === "").length, publicLootBeforePickup - 1);

simulation.state.battleElapsed = 39.9;
player.x = player.radius;
player.y = player.radius;
player.health = player.maxHealth;
player.invulnerable = 0;
for (let index = 0; index < 6; index += 1) simulation.fixedUpdate(0.1);
assert.ok(simulation.state.zoneRadius < 1050, "the shared safe zone shrinks according to the timeline");
assert.ok(player.health < player.maxHealth, "the authoritative server applies danger-zone damage");

const victim = [...simulation.state.entities.values()].find((entity) => entity.kind === "bot" && entity.alive);
assert.ok(victim);
victim.weaponName = "测试长剑";
victim.weaponPower = 12;
victim.armorName = "测试护甲";
victim.armorPower = 9;
victim.potions = 2;
const lootBeforeElimination = simulation.state.loot.size;
simulation.damageEntity(victim.id, 10_000, player.id);
assert.equal(victim.alive, false, "lethal damage eliminates a battlefield entity");
assert.ok(simulation.state.loot.size >= lootBeforeElimination + 3, "eliminated entities drop weapon, armor, and consumables");

for (const entity of simulation.state.entities.values()) {
  if (entity.kind === "bot" && entity.alive) simulation.damageEntity(entity.id, 10_000, player.id);
}
const victoriesBeforePendingPlayerCheck = results.filter((result) => result.victory).length;
simulation.fixedUpdate(1 / 60);
assert.equal(
  results.filter((result) => result.victory).length,
  victoriesBeforePendingPlayerCheck,
  "a public survivor is not declared winner while another living player remains in preparation",
);

const pendingPlayer = simulation.state.entities.get("bob");
assert.ok(pendingPlayer);
assert.equal(simulation.enterBattlefield(pendingPlayer.id, "portal"), true, "the pending player may still join the unfinished match");
pendingPlayer.invulnerable = 0;
simulation.damageEntity(pendingPlayer.id, 10_000, player.id);
simulation.fixedUpdate(1 / 60);
assert.ok(results.some((result) => result.victory && result.rank === 1), "the last surviving human receives matchEnd after preparation is empty");

assert.equal(simulation.setInput(player.id, { seq: 5, up: false, down: false, left: true, right: false, angle: Math.PI }), false, "finished matches reject input");
assert.equal(simulation.handleAction(player.id, { type: "attack" }), false, "finished matches reject actions");
assert.equal(simulation.damageEntity(player.id, 1, pendingPlayer.id), 0, "finished matches reject further damage");
pendingPlayer.stage = "preparation";
pendingPlayer.ownerId = pendingPlayer.id;
pendingPlayer.alive = true;
pendingPlayer.prepTime = 10;
assert.equal(simulation.enterBattlefield(pendingPlayer.id, "portal"), false, "finished matches reject battlefield transitions");
simulation.fixedUpdate(0.1);
assert.equal(pendingPlayer.prepTime, 10, "finished simulations no longer advance preparation transitions");
assert.ok(feeds.length > 0 && effects.length > 0, "gameplay emits feed and effect messages");

const guardedRewardSimulation = new BattleSimulation({ random: () => 0 });
const gearedPlayer = guardedRewardSimulation.addPlayer("geared", { careerId: "berserker" });
gearedPlayer.weaponName = "Existing epic weapon";
gearedPlayer.weaponPower = 14;
const guardedRewardBoss = guardedRewardSimulation.state.entities.get("boss:geared");
assert.ok(guardedRewardBoss);
guardedRewardSimulation.damageEntity(guardedRewardBoss.id, 100, gearedPlayer.id);
assert.equal(guardedRewardSimulation.enterBattlefield(gearedPlayer.id, "portal"), true);
assert.equal(gearedPlayer.weaponName, "Existing epic weapon", "a weaker boss reward never overwrites stronger equipment");
assert.equal(gearedPlayer.weaponPower, 14, "boss rewards only upgrade the equipped slot");
const deferredBossRewards = [...guardedRewardSimulation.state.loot.values()].filter((loot) => loot.ownerId === "" && loot.type === "weapon");
assert.equal(deferredBossRewards.length, 1, "a non-upgrade boss reward is issued as exactly one battlefield drop");
assert.equal(deferredBossRewards[0].value, 8, "the deferred drop preserves the rolled boss reward");

const timeoutSimulation = new BattleSimulation({ random: seededRandom(42) });
const timeoutPlayer = timeoutSimulation.addPlayer("timeout", { careerId: "berserker" });
for (let index = 0; index < 601 && timeoutPlayer.stage === "preparation"; index += 1) timeoutSimulation.fixedUpdate(0.1);
assert.equal(timeoutPlayer.stage, "battle", "players are automatically transferred when the sixty-second timer expires");

console.log("Server smoke tests passed: private preparation, boss reward, skills, loot, bots, shrinking zone, drops, and match end.");
