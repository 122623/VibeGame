export const TEXTURES = {
  fighter: "vibegame:fighter-placeholder",
  boss: "vibegame:boss-placeholder",
  loot: "vibegame:loot-placeholder",
  potion: "vibegame:potion-placeholder",
  projectile: "vibegame:projectile-placeholder",
  portal: "vibegame:portal-placeholder",
  wall: "vibegame:wall-placeholder",
} as const;

export interface CareerPresentation {
  id: string;
  name: string;
  mark: string;
  color: number;
  cssColor: string;
}

export const CAREERS: Record<string, CareerPresentation> = {
  berserker: { id: "berserker", name: "狂战", mark: "狂", color: 0xef4e4e, cssColor: "#ef4e4e" },
  weaponMaster: { id: "weaponMaster", name: "剑魂", mark: "剑", color: 0x5db3f6, cssColor: "#5db3f6" },
  soulBender: { id: "soulBender", name: "鬼泣", mark: "鬼", color: 0x9d70eb, cssColor: "#9d70eb" },
  ghostblade: { id: "ghostblade", name: "剑影", mark: "影", color: 0x4bc6b5, cssColor: "#4bc6b5" },
  asura: { id: "asura", name: "阿修罗", mark: "修", color: 0xefb64f, cssColor: "#efb64f" },
};

export const DEFAULT_CAREER = CAREERS.berserker;

export const SKILL_NAMES: Record<string, string> = {
  "blood-slash": "血刃斩",
  "rage-burst": "怒气爆发",
  "blood-charge": "暴走冲锋",
  "life-steal": "噬魂之手",
  frenzy: "血气唤醒",
  "triple-cut": "三段斩",
  "rising-slash": "上挑",
  "sword-wave": "剑气",
  "blade-storm": "猛龙断空",
  "sword-guard": "自动格挡",
  "ghost-slash": "鬼斩",
  "dark-wave": "冥炎波",
  "ice-field": "冰霜之萨亚",
  tombstone: "死亡墓碑",
  "ghost-step": "鬼影步",
  "shadow-slash": "鬼人斩",
  "phantom-dash": "幻鬼步",
  "soul-pierce": "魂魄突刺",
  "phantom-array": "共鸣乱舞",
  execution: "冥灵断魂斩",
  "wave-slash": "波动斩",
  "fire-wave": "爆炎波动剑",
  "ice-wave": "冰刃波动剑",
  thunder: "邪光波动阵",
  "mind-eye": "心眼",
};

export const QUALITY_COLORS: Record<string, number> = {
  common: 0xc3cbd4,
  normal: 0xc3cbd4,
  rare: 0x4ea4ed,
  epic: 0xa968e8,
  普通: 0xc3cbd4,
  稀有: 0x4ea4ed,
  史诗: 0xa968e8,
};
