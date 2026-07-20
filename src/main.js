import {
  BINDING_LABELS,
  CAREERS,
  DEFAULT_BINDINGS,
  SLOT_KEYS,
  displayKey,
  getCareer,
  getSkill,
  loadConfig,
  normalizeConfig,
  saveConfig,
} from "./config.js";
import { BattleGame } from "./game.js";

const $ = (selector) => document.querySelector(selector);
const lobby = $("#lobby");
const gameScreen = $("#game-screen");
const resultScreen = $("#result-screen");
const careerList = $("#career-list");
const skillSlots = $("#skill-slots");
const skillList = $("#skill-list");
const bindingList = $("#binding-list");
const saveStatus = $("#save-status");
const canvas = $("#game-canvas");

let config = normalizeConfig();
let selectedSlot = 0;
let listeningAction = null;
let game = null;
let lastResult = null;

function activeCareer() {
  return getCareer(config.careerId);
}

function renderLobby() {
  renderCareers();
  renderSkills();
  renderBindings();
}

function renderCareers() {
  careerList.replaceChildren(...CAREERS.map((career) => {
    const button = document.createElement("button");
    button.className = `career-card${career.id === config.careerId ? " active" : ""}`;
    button.style.setProperty("--career", career.color);
    button.innerHTML = `
      <span class="career-mark">${career.mark}</span>
      <span class="career-name"><strong>${career.name}</strong><span>${career.description}</span></span>
      <span class="career-role">${career.role}</span>`;
    button.addEventListener("click", () => {
      config.careerId = career.id;
      selectedSlot = 0;
      markDirty();
      renderCareers();
      renderSkills();
    });
    return button;
  }));
}

function renderSkills() {
  const career = activeCareer();
  const equippedIds = config.skillsByCareer[career.id];
  skillSlots.replaceChildren(...SLOT_KEYS.map((key, index) => {
    const skill = getSkill(career, equippedIds[index]);
    const button = document.createElement("button");
    button.className = `skill-slot${selectedSlot === index ? " active" : ""}`;
    button.innerHTML = `<span class="key">${key}</span><strong>${skill.name}</strong><small>${skill.cooldown} 秒</small>`;
    button.addEventListener("click", () => { selectedSlot = index; renderSkills(); });
    return button;
  }));

  skillList.replaceChildren(...career.skills.map((skill) => {
    const equippedAt = equippedIds.indexOf(skill.id);
    const button = document.createElement("button");
    button.className = `skill-option${equippedAt >= 0 ? " equipped" : ""}`;
    button.style.setProperty("--skill-color", skill.color);
    button.innerHTML = `
      <span class="skill-icon">${skill.icon}</span>
      <span class="skill-copy"><strong>${skill.name}</strong><span>${skill.description}</span></span>
      <small>${equippedAt >= 0 ? SLOT_KEYS[equippedAt] : `${skill.cooldown}s`}</small>`;
    button.addEventListener("click", () => equipSkill(skill.id));
    return button;
  }));
}

function equipSkill(skillId) {
  const ids = [...config.skillsByCareer[config.careerId]];
  const equippedAt = ids.indexOf(skillId);
  if (equippedAt >= 0) {
    [ids[selectedSlot], ids[equippedAt]] = [ids[equippedAt], ids[selectedSlot]];
  } else {
    ids[selectedSlot] = skillId;
  }
  config.skillsByCareer[config.careerId] = ids;
  selectedSlot = (selectedSlot + 1) % 4;
  markDirty();
  renderSkills();
}

function renderBindings() {
  bindingList.replaceChildren(...Object.entries(BINDING_LABELS).map(([action, label]) => {
    const row = document.createElement("div");
    row.className = "binding-row";
    const name = document.createElement("span");
    name.textContent = label;
    const button = document.createElement("button");
    button.className = `binding-key${listeningAction === action ? " listening" : ""}`;
    button.textContent = listeningAction === action ? "请按键…" : displayKey(config.bindings[action]);
    button.addEventListener("click", () => {
      listeningAction = action;
      renderBindings();
    });
    row.append(name, button);
    return row;
  }));
}

function handleBindingCapture(event) {
  if (!listeningAction) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  if (event.code === "Escape") {
    listeningAction = null;
    renderBindings();
    return;
  }
  config.bindings[listeningAction] = event.code;
  listeningAction = null;
  markDirty();
  renderBindings();
  const conflicts = bindingConflicts();
  if (conflicts.length) saveStatus.textContent = `按键冲突：${conflicts.join("、")}`;
}

function bindingConflicts() {
  const byCode = new Map();
  Object.entries(config.bindings).forEach(([action, code]) => {
    if (!byCode.has(code)) byCode.set(code, []);
    byCode.get(code).push(action);
  });
  return [...byCode.values()].filter((actions) => actions.length > 1).map((actions) => actions.map((action) => BINDING_LABELS[action]).join(" / "));
}

function markDirty() {
  saveStatus.textContent = "配置有修改，尚未保存";
}

async function persistConfig() {
  const conflicts = bindingConflicts();
  if (conflicts.length) throw new Error(`请先解决按键冲突：${conflicts.join("、")}`);
  saveStatus.textContent = "正在保存…";
  config = await saveConfig(config);
  saveStatus.textContent = "已保存到服务器";
}

function showScreen(screen) {
  [lobby, gameScreen, resultScreen].forEach((element) => element.classList.toggle("hidden", element !== screen));
}

async function startGame() {
  const conflicts = bindingConflicts();
  if (conflicts.length) {
    saveStatus.textContent = `无法开始：${conflicts.join("、")}`;
    return;
  }
  try { await persistConfig(); } catch (error) {
    saveStatus.textContent = `${error.message}，将使用本地配置开始`;
    localStorage.setItem("vibegame-config", JSON.stringify(config));
  }
  showScreen(gameScreen);
  $("#feed").replaceChildren();
  $("#pause-panel").classList.add("hidden");
  game?.destroy();
  game = new BattleGame(canvas, config, {
    onHud: updateHud,
    onFeed: addFeed,
    onPickup: updatePickup,
    onPause: (paused) => $("#pause-panel").classList.toggle("hidden", !paused),
    onFinish: showResult,
  });
  window.__vibeGame = game;
  game.start();
}

function updateHud(state) {
  $("#alive-count").textContent = state.alive;
  $("#kill-count").textContent = state.kills;
  $("#zone-label").textContent = state.zoneLabel;
  $("#zone-timer").textContent = state.zoneTimer;
  $("#hud-career").textContent = state.career.name;
  $("#hud-avatar").textContent = state.career.mark;
  $("#hud-avatar").style.background = `linear-gradient(140deg, ${state.career.color}, #1a202b)`;
  const healthPercent = Math.max(0, state.health / state.maxHealth * 100);
  $("#health-fill").style.width = `${healthPercent}%`;
  $("#health-text").textContent = `${Math.ceil(state.health)} / ${state.maxHealth}${state.shield > 0 ? ` + ${Math.ceil(state.shield)}` : ""}`;
  $("#weapon-text").textContent = state.weapon?.name || "训练长剑";
  $("#armor-text").textContent = `${state.armor?.name || "无防具"} · 药剂 ${state.potions}`;

  const skillHud = $("#skill-hud");
  if (skillHud.children.length !== 4) {
    skillHud.replaceChildren(...state.skills.map(() => document.createElement("div")));
  }
  [...skillHud.children].forEach((element, index) => {
    const skill = state.skills[index];
    const cooldown = state.cooldowns[index];
    element.className = "hud-skill";
    element.style.setProperty("--skill-color", skill.color);
    element.innerHTML = `<span class="hotkey">${displayKey(state.bindings[`skill${index + 1}`])}</span><span class="visual">${skill.icon}</span>${cooldown > 0 ? `<span class="cooldown">${cooldown.toFixed(1)}</span>` : ""}<span class="skill-name">${skill.name}</span>`;
  });
}

function addFeed(message) {
  const feed = $("#feed");
  const item = document.createElement("div");
  item.className = "feed-item";
  item.textContent = message;
  feed.prepend(item);
  while (feed.children.length > 6) feed.lastElementChild.remove();
  setTimeout(() => item.remove(), 6000);
}

function updatePickup(payload) {
  const prompt = $("#pickup-prompt");
  prompt.classList.toggle("hidden", !payload);
  if (payload) prompt.innerHTML = `<b>${payload.key}</b> 拾取 ${payload.item.name}`;
}

function showResult(result) {
  lastResult = result;
  showScreen(resultScreen);
  $("#result-kicker").textContent = result.victory ? "LAST SURVIVOR" : "BATTLE COMPLETE";
  $("#result-title").textContent = result.victory ? "裂隙幸存者" : "试炼结束";
  $("#result-subtitle").textContent = result.victory ? "你击败了所有对手，成为最后的幸存者。" : "战斗失败，但下一次你会走得更远。";
  $("#result-rank").textContent = `#${result.rank}`;
  $("#result-kills").textContent = result.kills;
  $("#result-damage").textContent = result.damage;
  $("#result-time").textContent = result.time;
}

function returnLobby() {
  game?.destroy();
  game = null;
  showScreen(lobby);
  renderLobby();
}

$("#save-config").addEventListener("click", async () => {
  try { await persistConfig(); } catch (error) { saveStatus.textContent = error.message; }
});
$("#reset-bindings").addEventListener("click", () => {
  config.bindings = { ...DEFAULT_BINDINGS };
  markDirty();
  renderBindings();
});
$("#start-game").addEventListener("click", startGame);
$("#resume-game").addEventListener("click", () => game?.togglePause(false));
$("#quit-game").addEventListener("click", returnLobby);
$("#play-again").addEventListener("click", startGame);
$("#back-lobby").addEventListener("click", returnLobby);
window.addEventListener("keydown", handleBindingCapture, true);

try {
  config = await loadConfig();
  saveStatus.textContent = "已加载服务器配置";
} catch {
  config = normalizeConfig();
  saveStatus.textContent = "使用默认配置";
}
renderLobby();

if (new URLSearchParams(window.location.search).get("autostart") === "1") {
  setTimeout(startGame, 50);
}
