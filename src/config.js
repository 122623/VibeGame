export const SLOT_KEYS = ["Q", "W", "E", "R"];

export const DEFAULT_BINDINGS = {
  moveUp: "ArrowUp",
  moveDown: "ArrowDown",
  moveLeft: "ArrowLeft",
  moveRight: "ArrowRight",
  attack: "KeyJ",
  skill1: "KeyQ",
  skill2: "KeyW",
  skill3: "KeyE",
  skill4: "KeyR",
  interact: "KeyF",
  dodge: "ShiftLeft",
  potion: "Digit1",
  inventory: "Tab",
};

export const BINDING_LABELS = {
  moveUp: "向上移动",
  moveDown: "向下移动",
  moveLeft: "向左移动",
  moveRight: "向右移动",
  attack: "普通攻击",
  skill1: "技能 Q",
  skill2: "技能 W",
  skill3: "技能 E",
  skill4: "技能 R",
  interact: "拾取 / 交互",
  dodge: "闪避",
  potion: "使用药剂",
  inventory: "背包",
};

const skills = {
  berserker: [
    { id: "blood-slash", name: "血刃斩", icon: "血", kind: "melee", damage: 34, range: 105, cooldown: 4, color: "#d83e45", description: "挥出高伤害血刃，命中恢复少量生命。", lifesteal: 0.22 },
    { id: "rage-burst", name: "怒气爆发", icon: "怒", kind: "aoe", damage: 28, range: 145, cooldown: 7, color: "#f05a47", description: "引爆周围怒气，击退近身敌人。", knockback: 90 },
    { id: "blood-charge", name: "暴走冲锋", icon: "冲", kind: "dash", damage: 25, range: 210, cooldown: 6, color: "#b92736", description: "向面朝方向突进并斩击沿途敌人。" },
    { id: "life-steal", name: "嗜魂之手", icon: "噬", kind: "melee", damage: 46, range: 82, cooldown: 9, color: "#8e2635", description: "抓取近身敌人并恢复生命。", lifesteal: 0.55 },
    { id: "frenzy", name: "血气唤醒", icon: "燃", kind: "buff", damage: 0, range: 0, cooldown: 18, color: "#ff725e", description: "8 秒内提高移速与攻击伤害。", duration: 8 },
  ],
  weaponMaster: [
    { id: "triple-cut", name: "三段斩", icon: "三", kind: "dash", damage: 24, range: 230, cooldown: 5, color: "#61aef4", description: "快速突进，穿过敌人并造成伤害。" },
    { id: "rising-slash", name: "上挑", icon: "挑", kind: "melee", damage: 31, range: 100, cooldown: 4, color: "#78c4ff", description: "快速上挑，强力击退目标。", knockback: 115 },
    { id: "sword-wave", name: "剑气", icon: "气", kind: "projectile", damage: 30, range: 520, cooldown: 6, color: "#4d91d1", description: "向前释放高速剑气。" },
    { id: "blade-storm", name: "猛龙断空", icon: "龙", kind: "nova", damage: 19, range: 160, cooldown: 11, color: "#3978b5", description: "连续旋斩，造成三次范围伤害。", pulses: 3 },
    { id: "sword-guard", name: "自动格挡", icon: "守", kind: "shield", damage: 0, range: 0, cooldown: 13, color: "#96ceff", description: "获得可吸收伤害的剑气护盾。", shield: 48 },
  ],
  soulBender: [
    { id: "ghost-slash", name: "鬼斩", icon: "鬼", kind: "melee", damage: 39, range: 112, cooldown: 5, color: "#9d6fe8", description: "附着鬼神之力的近距离斩击。" },
    { id: "dark-wave", name: "冥炎波", icon: "冥", kind: "projectile", damage: 32, range: 470, cooldown: 6, color: "#7951ba", description: "发射贯穿敌人的暗影波。", pierce: true },
    { id: "ice-field", name: "冰霜之萨亚", icon: "冰", kind: "aoe", damage: 24, range: 170, cooldown: 9, color: "#678de8", description: "冻结周围区域并使敌人减速。", slow: 0.48 },
    { id: "tombstone", name: "死亡墓碑", icon: "碑", kind: "nova", damage: 22, range: 190, cooldown: 12, color: "#5f438c", description: "召唤三轮墓碑轰击附近敌人。", pulses: 3 },
    { id: "ghost-step", name: "鬼影步", icon: "影", kind: "dash", damage: 20, range: 260, cooldown: 7, color: "#b393ef", description: "化为鬼影高速穿梭。" },
  ],
  ghostblade: [
    { id: "shadow-slash", name: "鬼人斩", icon: "斩", kind: "melee", damage: 37, range: 115, cooldown: 4, color: "#49c0ae", description: "与幻鬼同时挥斩近身目标。" },
    { id: "phantom-dash", name: "幻鬼步", icon: "闪", kind: "dash", damage: 28, range: 270, cooldown: 6, color: "#36a695", description: "瞬移般突进并攻击路径上的敌人。" },
    { id: "soul-pierce", name: "魂魄突刺", icon: "刺", kind: "projectile", damage: 35, range: 500, cooldown: 7, color: "#6bd7c8", description: "幻鬼向前突刺并贯穿敌人。", pierce: true },
    { id: "phantom-array", name: "共鸣乱舞", icon: "舞", kind: "nova", damage: 18, range: 180, cooldown: 10, color: "#278b83", description: "本体与幻鬼连续斩击三次。", pulses: 3 },
    { id: "execution", name: "冥灵断魂斩", icon: "断", kind: "melee", damage: 68, range: 90, cooldown: 14, color: "#7ce7d5", description: "短距离高风险终结斩击。" },
  ],
  asura: [
    { id: "wave-slash", name: "波动斩", icon: "波", kind: "melee", damage: 34, range: 118, cooldown: 4, color: "#efb24c", description: "释放近距离波动冲击。", knockback: 80 },
    { id: "fire-wave", name: "爆炎波动剑", icon: "炎", kind: "projectile", damage: 39, range: 500, cooldown: 8, color: "#e96a39", description: "发射高伤害火焰波动。" },
    { id: "ice-wave", name: "冰刃波动剑", icon: "霜", kind: "projectile", damage: 28, range: 460, cooldown: 7, color: "#6abfe5", description: "冰刃使命中的敌人减速。", slow: 0.5 },
    { id: "thunder", name: "邪光波动阵", icon: "雷", kind: "aoe", damage: 42, range: 165, cooldown: 11, color: "#d99f49", description: "在周身展开雷霆波动阵。", knockback: 70 },
    { id: "mind-eye", name: "心眼", icon: "心", kind: "shield", damage: 0, range: 0, cooldown: 14, color: "#f4cf74", description: "感知危险并获得波动护盾。", shield: 58 },
  ],
};

export const CAREERS = [
  { id: "berserker", name: "狂战", mark: "狂", role: "近战爆发 · 吸血", color: "#ef4e4e", description: "以生命与怒气换取强力压制", skills: skills.berserker },
  { id: "weaponMaster", name: "剑魂", mark: "剑", role: "高速连击 · 剑气", color: "#5db3f6", description: "灵活突进与稳定的剑术输出", skills: skills.weaponMaster },
  { id: "soulBender", name: "鬼泣", mark: "鬼", role: "范围控制 · 鬼神", color: "#9d70eb", description: "操纵鬼神领域削弱敌人", skills: skills.soulBender },
  { id: "ghostblade", name: "剑影", mark: "影", role: "机动突袭 · 幻鬼", color: "#4bc6b5", description: "与幻鬼配合高速切入战场", skills: skills.ghostblade },
  { id: "asura", name: "阿修罗", mark: "修", role: "远程波动 · 控场", color: "#efb64f", description: "感知战场并释放元素波动", skills: skills.asura },
];

export const DEFAULT_CONFIG = {
  careerId: CAREERS[0].id,
  skillsByCareer: Object.fromEntries(CAREERS.map((career) => [career.id, career.skills.slice(0, 4).map((skill) => skill.id)])),
  bindings: { ...DEFAULT_BINDINGS },
};

export function getCareer(id) {
  return CAREERS.find((career) => career.id === id) || CAREERS[0];
}

export function getSkill(career, id) {
  return career.skills.find((skill) => skill.id === id) || career.skills[0];
}

export function displayKey(code) {
  const names = {
    ArrowUp: "↑", ArrowDown: "↓", ArrowLeft: "←", ArrowRight: "→",
    ShiftLeft: "Shift", ShiftRight: "Shift", Space: "Space", Tab: "Tab",
    Escape: "Esc", Enter: "Enter",
  };
  return names[code] || code.replace(/^Key/, "").replace(/^Digit/, "");
}

export function normalizeConfig(input = {}) {
  const careerId = CAREERS.some((career) => career.id === input.careerId) ? input.careerId : DEFAULT_CONFIG.careerId;
  const skillsByCareer = { ...DEFAULT_CONFIG.skillsByCareer };

  for (const career of CAREERS) {
    const valid = Array.isArray(input.skillsByCareer?.[career.id])
      ? input.skillsByCareer[career.id].filter((id, index, list) => career.skills.some((skill) => skill.id === id) && list.indexOf(id) === index).slice(0, 4)
      : [];
    skillsByCareer[career.id] = [...valid, ...DEFAULT_CONFIG.skillsByCareer[career.id].filter((id) => !valid.includes(id))].slice(0, 4);
  }

  const bindings = { ...DEFAULT_BINDINGS };
  for (const action of Object.keys(bindings)) {
    if (typeof input.bindings?.[action] === "string") bindings[action] = input.bindings[action];
  }

  return { careerId, skillsByCareer, bindings };
}

export async function loadConfig() {
  const cached = localStorage.getItem("vibegame-config");
  let config = cached ? normalizeConfig(JSON.parse(cached)) : normalizeConfig();
  try {
    const response = await fetch("/api/player/config");
    if (response.ok) {
      const serverConfig = await response.json();
      if (serverConfig) config = normalizeConfig(serverConfig);
    }
  } catch {
    // Static hosting can still run the game with the local cache.
  }
  return config;
}

export async function saveConfig(config) {
  const normalized = normalizeConfig(config);
  localStorage.setItem("vibegame-config", JSON.stringify(normalized));
  const response = await fetch("/api/player/config", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(normalized),
  });
  if (!response.ok) throw new Error("服务器保存失败");
  return normalized;
}
