import berserkerUrl from "../../assets/characters/combat/berserker.png";
import berserkerBasicAttackUrl from "../../assets/characters/combat/berserker-basic-attack.png";
import berserkerBloodSlashUrl from "../../assets/characters/combat/berserker-blood-slash.png";
import weaponMasterUrl from "../../assets/characters/combat/weapon-master.png";
import soulBenderUrl from "../../assets/characters/combat/soul-bender.png";
import ghostbladeUrl from "../../assets/characters/combat/ghostblade.png";
import asuraUrl from "../../assets/characters/combat/asura.png";
import mechanicalBullUrl from "../../assets/characters/combat/mechanical-bull.png";
import { TEXTURES } from "../constants";

export const CHARACTER_TEXTURE_ASSETS = [
  { key: TEXTURES.fighters.berserker, url: berserkerUrl },
  { key: TEXTURES.fighters.weaponMaster, url: weaponMasterUrl },
  { key: TEXTURES.fighters.soulBender, url: soulBenderUrl },
  { key: TEXTURES.fighters.ghostblade, url: ghostbladeUrl },
  { key: TEXTURES.fighters.asura, url: asuraUrl },
  { key: TEXTURES.boss, url: mechanicalBullUrl },
] as const;

export const CHARACTER_SPRITESHEET_ASSETS = [
  {
    key: TEXTURES.animations.berserkerBasicAttack,
    url: berserkerBasicAttackUrl,
    frameWidth: 128,
    frameHeight: 128,
  },
  {
    key: TEXTURES.animations.berserkerBloodSlash,
    url: berserkerBloodSlashUrl,
    frameWidth: 128,
    frameHeight: 128,
  },
] as const;
