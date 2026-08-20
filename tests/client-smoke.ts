import assert from "node:assert/strict";
import { DEFAULT_BINDINGS, getProfileId, normalizeConfig } from "../src/config.js";
import { BASIC_ATTACK_ANIMATION, BLOOD_SLASH_ANIMATION } from "../src/phaser/constants.js";
import { getActionPresentation, shouldAlignEffectToImpact } from "../src/phaser/combatPresentation.js";
import { isActionMessage } from "../src/shared/protocol.js";

const migrated = normalizeConfig({ bindings: { attack: "KeyJ" } });
assert.equal(migrated.bindings.attack, "KeyX", "legacy J bindings migrate to X");
assert.equal(migrated.bindings.jump, "Space", "Space is the default jump binding");
assert.equal(DEFAULT_BINDINGS.jump, "Space");
assert.equal(isActionMessage({ type: "jump" }), true, "jump is part of the validated action protocol");
assert.equal(isActionMessage({ type: "jump", index: 0 }), false, "jump rejects unrelated payload fields");
assert.equal(BASIC_ATTACK_ANIMATION.frameDurations.length, 6, "basic attack registers six animation frames");
assert.equal(
  BASIC_ATTACK_ANIMATION.frameDurations.reduce((total, duration) => total + duration, 0),
  BASIC_ATTACK_ANIMATION.totalDurationMs,
  "basic attack frame timing matches the 300ms clip duration",
);
assert.equal(
  BASIC_ATTACK_ANIMATION.frameDurations.slice(0, BASIC_ATTACK_ANIMATION.impactFrame).reduce((total, duration) => total + duration, 0),
  BASIC_ATTACK_ANIMATION.impactDelayMs,
  "basic attack impact timing begins on frame three",
);
assert.equal(BLOOD_SLASH_ANIMATION.frameDurations.length, 8, "blood slash registers eight animation frames");
assert.equal(
  BLOOD_SLASH_ANIMATION.frameDurations.reduce((total, duration) => total + duration, 0),
  BLOOD_SLASH_ANIMATION.totalDurationMs,
  "blood slash frame timing matches the 470ms clip duration",
);
assert.equal(
  BLOOD_SLASH_ANIMATION.frameDurations.slice(0, BLOOD_SLASH_ANIMATION.impactFrame).reduce((total, duration) => total + duration, 0),
  BLOOD_SLASH_ANIMATION.impactDelayMs,
  "blood slash impact timing begins on frame four",
);

for (const actionId of [
  "basic-attack",
  "dodge",
  "blood-slash",
  "rage-burst",
  "triple-cut",
  "sword-wave",
  "blade-storm",
  "ice-field",
  "phantom-array",
  "thunder",
  "mind-eye",
]) {
  const presentation = getActionPresentation(actionId);
  assert.ok(presentation.impactDelayMs > 0, `${actionId} has a visible anticipation phase`);
  assert.ok(presentation.windupMs <= presentation.impactDelayMs, `${actionId} completes its windup no later than impact`);
  assert.ok(presentation.impactDelayMs < presentation.totalDurationMs, `${actionId} leaves time for recovery after impact`);
  assert.ok(presentation.intensity > 0, `${actionId} has a positive feedback intensity`);
}
assert.equal(getActionPresentation("blade-storm").kind, "nova", "skill presentation derives its kind from the shared career config");
assert.equal(getActionPresentation("life-steal").motion, "thrust", "individual skills can override their base motion profile");
assert.equal(getActionPresentation("basic-attack").impactDelayMs, BASIC_ATTACK_ANIMATION.impactDelayMs, "basic attack VFX stays aligned with its authored hit frame");
assert.equal(getActionPresentation("blood-slash").impactDelayMs, BLOOD_SLASH_ANIMATION.impactDelayMs, "blood slash VFX stays aligned with its authored hit frame");
assert.equal(shouldAlignEffectToImpact("damage"), true, "damage feedback aligns to the action impact frame");
assert.equal(shouldAlignEffectToImpact("dash"), false, "dash trails render immediately from their authoritative start point");

const values = new Map<string, string>();
const storage = {
  getItem: (key: string) => values.get(key) ?? null,
  setItem: (key: string, value: string) => { values.set(key, value); },
};
const profileId = getProfileId(storage);
assert.match(profileId, /^[A-Za-z0-9_-]{8,64}$/);
assert.equal(getProfileId(storage), profileId, "profile ids remain stable for per-player server config");

console.log("Client smoke tests passed: config migration, phased combat presentation, animation timing, jump binding, protocol validation, and profile isolation.");
