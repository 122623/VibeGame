import berserkerUrl from "../../assets/fx/careers/berserker.png";
import weaponMasterUrl from "../../assets/fx/careers/weapon-master.png";
import soulBenderUrl from "../../assets/fx/careers/soul-bender.png";
import ghostbladeUrl from "../../assets/fx/careers/ghostblade.png";
import asuraUrl from "../../assets/fx/careers/asura.png";
import { TEXTURES } from "../constants";

export const CAREER_EFFECT_TEXTURES = {
  berserker: TEXTURES.effects.berserker,
  weaponMaster: TEXTURES.effects.weaponMaster,
  soulBender: TEXTURES.effects.soulBender,
  ghostblade: TEXTURES.effects.ghostblade,
  asura: TEXTURES.effects.asura,
} as const;

export const EFFECT_TEXTURE_ASSETS = [
  { key: TEXTURES.effects.berserker, url: berserkerUrl },
  { key: TEXTURES.effects.weaponMaster, url: weaponMasterUrl },
  { key: TEXTURES.effects.soulBender, url: soulBenderUrl },
  { key: TEXTURES.effects.ghostblade, url: ghostbladeUrl },
  { key: TEXTURES.effects.asura, url: asuraUrl },
] as const;
