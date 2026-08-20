import { CAREERS as GAME_CAREERS } from "../config.js";
import type { AnimationCueKind } from "../shared/protocol";

export type ActionMotion = "slash" | "thrust" | "cast" | "burst" | "guard" | "dash";
export type SkillKind = "attack" | "melee" | "aoe" | "nova" | "dash" | "projectile" | "shield" | "buff";

export interface ActionPresentation {
  actionId: string;
  kind: SkillKind;
  motion: ActionMotion;
  windupMs: number;
  impactDelayMs: number;
  totalDurationMs: number;
  intensity: number;
  shakeDurationMs: number;
  shakeIntensity: number;
  flashAlpha: number;
}

interface SkillDefinitionLike {
  id: string;
  kind: Exclude<SkillKind, "attack">;
}

interface CareerDefinitionLike {
  id: string;
  skills: SkillDefinitionLike[];
}

type ProfileTemplate = Omit<ActionPresentation, "actionId">;

const PROFILES: Record<SkillKind, ProfileTemplate> = {
  attack: {
    kind: "attack",
    motion: "slash",
    windupMs: 70,
    impactDelayMs: 90,
    totalDurationMs: 300,
    intensity: 0.72,
    shakeDurationMs: 55,
    shakeIntensity: 0.0022,
    flashAlpha: 0,
  },
  melee: {
    kind: "melee",
    motion: "slash",
    windupMs: 115,
    impactDelayMs: 145,
    totalDurationMs: 410,
    intensity: 1.05,
    shakeDurationMs: 80,
    shakeIntensity: 0.0038,
    flashAlpha: 0.05,
  },
  aoe: {
    kind: "aoe",
    motion: "burst",
    windupMs: 165,
    impactDelayMs: 205,
    totalDurationMs: 520,
    intensity: 1.18,
    shakeDurationMs: 105,
    shakeIntensity: 0.0045,
    flashAlpha: 0.08,
  },
  nova: {
    kind: "nova",
    motion: "burst",
    windupMs: 210,
    impactDelayMs: 255,
    totalDurationMs: 680,
    intensity: 1.35,
    shakeDurationMs: 130,
    shakeIntensity: 0.0052,
    flashAlpha: 0.1,
  },
  dash: {
    kind: "dash",
    motion: "dash",
    windupMs: 45,
    impactDelayMs: 60,
    totalDurationMs: 300,
    intensity: 1.08,
    shakeDurationMs: 70,
    shakeIntensity: 0.0032,
    flashAlpha: 0,
  },
  projectile: {
    kind: "projectile",
    motion: "cast",
    windupMs: 55,
    impactDelayMs: 70,
    totalDurationMs: 320,
    intensity: 1,
    shakeDurationMs: 60,
    shakeIntensity: 0.0026,
    flashAlpha: 0.03,
  },
  shield: {
    kind: "shield",
    motion: "guard",
    windupMs: 130,
    impactDelayMs: 165,
    totalDurationMs: 500,
    intensity: 0.94,
    shakeDurationMs: 0,
    shakeIntensity: 0,
    flashAlpha: 0.035,
  },
  buff: {
    kind: "buff",
    motion: "guard",
    windupMs: 120,
    impactDelayMs: 155,
    totalDurationMs: 480,
    intensity: 1,
    shakeDurationMs: 0,
    shakeIntensity: 0,
    flashAlpha: 0.04,
  },
};

const ACTION_OVERRIDES: Record<string, Partial<ProfileTemplate>> = {
  "boss-smash": { kind: "aoe", motion: "burst", windupMs: 190, impactDelayMs: 230, totalDurationMs: 590, intensity: 1.45 },
  dodge: { kind: "dash", motion: "dash", windupMs: 30, impactDelayMs: 45, totalDurationMs: 250, intensity: 0.82 },
  "blood-slash": { impactDelayMs: 145, totalDurationMs: 470, intensity: 1.28 },
  "life-steal": { motion: "thrust", impactDelayMs: 185, totalDurationMs: 520, intensity: 1.35 },
  execution: { motion: "thrust", windupMs: 190, impactDelayMs: 235, totalDurationMs: 620, intensity: 1.58 },
  "rising-slash": { motion: "thrust", impactDelayMs: 125, totalDurationMs: 370 },
  "soul-pierce": { motion: "thrust", impactDelayMs: 85, totalDurationMs: 350 },
  "blade-storm": { totalDurationMs: 720, intensity: 1.46 },
  tombstone: { windupMs: 245, impactDelayMs: 285, totalDurationMs: 760, intensity: 1.5 },
  "phantom-array": { totalDurationMs: 720, intensity: 1.45 },
  thunder: { windupMs: 225, impactDelayMs: 270, totalDurationMs: 690, intensity: 1.55 },
};

const SKILLS_BY_ID = new Map<string, SkillDefinitionLike>();
for (const career of GAME_CAREERS as CareerDefinitionLike[]) {
  for (const skill of career.skills) SKILLS_BY_ID.set(skill.id, skill);
}

export function getActionPresentation(
  actionId: string,
  cueKind: AnimationCueKind = actionId === "basic-attack" ? "attack" : "skill",
): ActionPresentation {
  const skillKind = cueKind === "attack" ? "attack" : SKILLS_BY_ID.get(actionId)?.kind ?? "melee";
  const base = PROFILES[skillKind];
  return {
    actionId,
    ...base,
    ...ACTION_OVERRIDES[actionId],
  };
}

export function shouldAlignEffectToImpact(effectType: string): boolean {
  return effectType !== "dash" && effectType !== "jump" && effectType !== "projectileImpact";
}
