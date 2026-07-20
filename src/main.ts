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
import { PhaserGameController } from "./phaser/PhaserGameController";

type GameController = {
  start(rootId: string): Promise<void> | void;
  destroy(): Promise<void> | void;
  setPaused?: (paused: boolean) => void;
};

type DynamicRecord = Record<string, any>;

declare global {
  interface Window {
    __vibeGame?: GameController | null;
  }
}

function select<T extends Element = HTMLElement>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`缺少页面元素：${selector}`);
  return element;
}

const lobby = select<HTMLElement>("#lobby");
const gameScreen = select<HTMLElement>("#game-screen");
const resultScreen = select<HTMLElement>("#result-screen");
const careerList = select<HTMLElement>("#career-list");
const skillSlots = select<HTMLElement>("#skill-slots");
const skillList = select<HTMLElement>("#skill-list");
const bindingList = select<HTMLElement>("#binding-list");
const saveStatus = select<HTMLElement>("#save-status");
const gameRoot = select<HTMLElement>("#game-root");
const startButton = select<HTMLButtonElement>("#start-game");
const connectionPanel = select<HTMLElement>("#connection-panel");
const connectionTitle = select<HTMLElement>("#connection-title");
const connectionMessage = select<HTMLElement>("#connection-message");
const pausePanel = select<HTMLElement>("#pause-panel");
const startButtonContent = startButton.innerHTML;

let config: DynamicRecord = normalizeConfig();
let selectedSlot = 0;
let listeningAction: string | null = null;
let game: GameController | null = null;
let startGeneration = 0;
let starting = false;
const disposedControllers = new WeakSet<object>();

function activeCareer(): DynamicRecord {
  return getCareer(config.careerId);
}

function renderLobby(): void {
  renderCareers();
  renderSkills();
  renderBindings();
}

function renderCareers(): void {
  careerList.replaceChildren(...CAREERS.map((career: DynamicRecord) => {
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

function renderSkills(): void {
  const career = activeCareer();
  const equippedIds: string[] = config.skillsByCareer[career.id];
  skillSlots.replaceChildren(...SLOT_KEYS.map((key: string, index: number) => {
    const skill = getSkill(career, equippedIds[index]);
    const button = document.createElement("button");
    button.className = `skill-slot${selectedSlot === index ? " active" : ""}`;
    button.innerHTML = `<span class="key">${key}</span><strong>${skill.name}</strong><small>${skill.cooldown} 秒</small>`;
    button.addEventListener("click", () => {
      selectedSlot = index;
      renderSkills();
    });
    return button;
  }));

  skillList.replaceChildren(...career.skills.map((skill: DynamicRecord) => {
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

function equipSkill(skillId: string): void {
  const ids: string[] = [...config.skillsByCareer[config.careerId]];
  const equippedAt = ids.indexOf(skillId);
  if (equippedAt >= 0) {
    [ids[selectedSlot], ids[equippedAt]] = [ids[equippedAt], ids[selectedSlot]];
  } else {
    ids[selectedSlot] = skillId;
  }
  config.skillsByCareer[config.careerId] = ids;
  selectedSlot = (selectedSlot + 1) % SLOT_KEYS.length;
  markDirty();
  renderSkills();
}

function renderBindings(): void {
  const labels = BINDING_LABELS as Record<string, string>;
  bindingList.replaceChildren(...Object.entries(labels).map(([action, label]) => {
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

function handleBindingCapture(event: KeyboardEvent): void {
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
  if (conflicts.length) saveStatus.textContent = `按键冲突：${conflicts.join("；")}`;
}

function bindingConflicts(): string[] {
  const labels = BINDING_LABELS as Record<string, string>;
  const byCode = new Map<string, string[]>();
  Object.entries(config.bindings as Record<string, string>).forEach(([action, code]) => {
    if (!byCode.has(code)) byCode.set(code, []);
    byCode.get(code)?.push(action);
  });
  return [...byCode.values()]
    .filter((actions) => actions.length > 1)
    .map((actions) => actions.map((action) => labels[action]).join(" / "));
}

function markDirty(): void {
  saveStatus.textContent = "配置有修改，尚未保存";
}

async function persistConfig(): Promise<void> {
  const conflicts = bindingConflicts();
  if (conflicts.length) throw new Error(`请先解决按键冲突：${conflicts.join("；")}`);
  saveStatus.textContent = "正在保存…";
  config = await saveConfig(config);
  saveStatus.textContent = "已保存到服务器";
}

function showScreen(screen: HTMLElement): void {
  [lobby, gameScreen, resultScreen].forEach((element) => {
    element.classList.toggle("hidden", element !== screen);
  });
}

function setStartingState(value: boolean): void {
  starting = value;
  startButton.disabled = value;
  startButton.innerHTML = value ? "正在连接…" : startButtonContent;
}

function showConnection(title: string, message: string): void {
  connectionTitle.textContent = title;
  connectionMessage.textContent = message;
  connectionPanel.classList.remove("hidden");
}

function hideConnection(): void {
  connectionPanel.classList.add("hidden");
}

function describeError(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return "未知连接错误";
}

async function disposeController(controller: GameController | null): Promise<void> {
  if (!controller || disposedControllers.has(controller as object)) return;
  disposedControllers.add(controller as object);
  try {
    await controller.destroy();
  } catch (error) {
    console.warn("销毁游戏连接时发生错误", error);
  }
}

async function startGame(): Promise<void> {
  if (starting) return;
  const conflicts = bindingConflicts();
  if (conflicts.length) {
    saveStatus.textContent = `无法开始：${conflicts.join("；")}`;
    return;
  }

  setStartingState(true);
  try {
    await persistConfig();
  } catch (error) {
    config = normalizeConfig(config);
    localStorage.setItem("vibegame-config", JSON.stringify(config));
    saveStatus.textContent = `${describeError(error)}，将使用本地配置进入对局`;
  }

  const generation = ++startGeneration;
  const previousGame = game;
  game = null;
  window.__vibeGame = null;
  await disposeController(previousGame);
  gameRoot.replaceChildren();

  if (generation !== startGeneration) return;

  showScreen(gameScreen);
  select<HTMLElement>("#feed").replaceChildren();
  select<HTMLElement>("#pickup-prompt").classList.add("hidden");
  pausePanel.classList.add("hidden");
  showConnection("正在连接战场", "正在加入 Colyseus 对局，请稍候……");

  const nextGame: GameController = new PhaserGameController(config);
  game = nextGame;
  window.__vibeGame = nextGame;

  try {
    await nextGame.start("game-root");
    if (generation !== startGeneration) {
      await disposeController(nextGame);
      return;
    }
    hideConnection();
  } catch (error) {
    await disposeController(nextGame);
    if (generation !== startGeneration) return;
    game = null;
    window.__vibeGame = null;
    gameRoot.replaceChildren();
    hideConnection();
    showScreen(lobby);
    saveStatus.textContent = `连接游戏服务器失败：${describeError(error)}`;
  } finally {
    if (generation === startGeneration) setStartingState(false);
  }
}

function updateHud(state: DynamicRecord): void {
  if (!state?.career) return;
  select("#alive-count").textContent = String(state.alive);
  select("#alive-label").textContent = state.stage === "preparation" ? "发育区" : "存活";
  select("#kill-count").textContent = String(state.kills);
  select("#zone-label").textContent = state.zoneLabel;
  select("#zone-timer").textContent = state.zoneTimer;
  select("#hud-career").textContent = state.career.name;
  select("#hud-avatar").textContent = state.career.mark;
  (select<HTMLElement>("#hud-avatar")).style.background = `linear-gradient(140deg, ${state.career.color}, #1a202b)`;

  const healthPercent = Math.max(0, state.health / state.maxHealth * 100);
  (select<HTMLElement>("#health-fill")).style.width = `${healthPercent}%`;
  select("#health-text").textContent = `${Math.ceil(state.health)} / ${state.maxHealth}${state.shield > 0 ? ` + ${Math.ceil(state.shield)}` : ""}`;
  select("#weapon-text").textContent = state.weapon?.name || "训练长剑";
  select("#armor-text").textContent = `${state.armor?.name || "无防具"} · 药剂 ${state.potions}`;

  const bossHud = select<HTMLElement>("#boss-hud");
  bossHud.classList.toggle("hidden", !state.boss);
  if (state.boss) {
    (select<HTMLElement>("#boss-health-fill")).style.width = `${Math.max(0, state.boss.health / state.boss.maxHealth * 100)}%`;
    select("#boss-health-text").textContent = state.boss.alive ? `${Math.ceil(state.boss.health)} / ${state.boss.maxHealth}` : "已击败";
    select("#boss-reward").textContent = `贡献 ${Math.round(state.boss.contribution * 100)}% · ${state.boss.reward}奖励`;
  }

  const skills: DynamicRecord[] = state.skills || [];
  const skillHud = select<HTMLElement>("#skill-hud");
  if (skillHud.children.length !== skills.length) {
    skillHud.replaceChildren(...skills.map(() => document.createElement("div")));
  }
  [...skillHud.children].forEach((element, index) => {
    const skill = skills[index];
    if (!skill) return;
    const cooldown = Number(state.cooldowns?.[index] || 0);
    const binding = state.bindings?.[`skill${index + 1}`] || config.bindings[`skill${index + 1}`];
    const htmlElement = element as HTMLElement;
    htmlElement.className = "hud-skill";
    htmlElement.style.setProperty("--skill-color", skill.color);
    htmlElement.innerHTML = `<span class="hotkey">${displayKey(binding)}</span><span class="visual">${skill.icon}</span>${cooldown > 0 ? `<span class="cooldown">${cooldown.toFixed(1)}</span>` : ""}<span class="skill-name">${skill.name}</span>`;
  });
}

function addFeed(payload: unknown): void {
  const message = typeof payload === "string"
    ? payload
    : (payload as DynamicRecord | null)?.message ?? (payload as DynamicRecord | null)?.text;
  if (!message) return;
  const feed = select<HTMLElement>("#feed");
  const item = document.createElement("div");
  item.className = "feed-item";
  item.textContent = String(message);
  feed.prepend(item);
  while (feed.children.length > 6) feed.lastElementChild?.remove();
  window.setTimeout(() => item.remove(), 6000);
}

function updatePickup(payload: DynamicRecord | null): void {
  const prompt = select<HTMLElement>("#pickup-prompt");
  prompt.classList.toggle("hidden", !payload);
  if (!payload) return;
  prompt.innerHTML = payload.portal
    ? `<b>${payload.key}</b> ${payload.item.name}`
    : `<b>${payload.key}</b> 拾取 ${payload.item.name}`;
}

function showResult(result: DynamicRecord): void {
  if (!result) return;
  ++startGeneration;
  setStartingState(false);
  hideConnection();
  pausePanel.classList.add("hidden");
  const completedGame = game;
  game = null;
  window.__vibeGame = null;
  void disposeController(completedGame);

  showScreen(resultScreen);
  select("#result-kicker").textContent = result.victory ? "LAST SURVIVOR" : "BATTLE COMPLETE";
  select("#result-title").textContent = result.victory ? "裂隙幸存者" : "试炼结束";
  select("#result-subtitle").textContent = result.victory
    ? "你击败了所有对手，成为最后的幸存者。"
    : "战斗失败，但下一次你会走得更远。";
  select("#result-rank").textContent = `#${result.rank}`;
  select("#result-kills").textContent = String(result.kills);
  select("#result-damage").textContent = String(result.damage);
  const resultTime = typeof result.time === "number"
    ? `${String(Math.floor(result.time / 60)).padStart(2, "0")}:${String(Math.floor(result.time % 60)).padStart(2, "0")}`
    : result.time;
  select("#result-time").textContent = resultTime;
}

function setLocalMenu(open: boolean, notifyController: boolean): void {
  pausePanel.classList.toggle("hidden", !open);
  if (notifyController) game?.setPaused?.(open);
}

async function returnLobby(): Promise<void> {
  ++startGeneration;
  setStartingState(false);
  hideConnection();
  pausePanel.classList.add("hidden");
  const currentGame = game;
  game = null;
  window.__vibeGame = null;
  await disposeController(currentGame);
  gameRoot.replaceChildren();
  showScreen(lobby);
  renderLobby();
}

function detailOf<T>(event: Event): T {
  return (event as CustomEvent<T>).detail;
}

window.addEventListener("vibegame:hud", (event) => {
  if (game) updateHud(detailOf<DynamicRecord>(event));
});
window.addEventListener("vibegame:feed", (event) => {
  if (game) addFeed(detailOf<unknown>(event));
});
window.addEventListener("vibegame:pickup", (event) => {
  if (game) updatePickup(detailOf<DynamicRecord | null>(event));
});
window.addEventListener("vibegame:finish", (event) => {
  if (game) showResult(detailOf<DynamicRecord>(event));
});
window.addEventListener("vibegame:pause", (event) => {
  if (!game) return;
  const detail = detailOf<boolean | DynamicRecord>(event);
  const open = typeof detail === "boolean" ? detail : Boolean(detail?.paused ?? detail?.open);
  setLocalMenu(open, false);
});

select<HTMLButtonElement>("#save-config").addEventListener("click", async () => {
  try {
    await persistConfig();
  } catch (error) {
    saveStatus.textContent = describeError(error);
  }
});

select<HTMLButtonElement>("#reset-bindings").addEventListener("click", () => {
  config.bindings = { ...DEFAULT_BINDINGS };
  markDirty();
  renderBindings();
});

startButton.addEventListener("click", () => void startGame());
select<HTMLButtonElement>("#cancel-connection").addEventListener("click", () => void returnLobby());
select<HTMLButtonElement>("#resume-game").addEventListener("click", () => setLocalMenu(false, true));
select<HTMLButtonElement>("#quit-game").addEventListener("click", () => void returnLobby());
select<HTMLButtonElement>("#play-again").addEventListener("click", () => void startGame());
select<HTMLButtonElement>("#back-lobby").addEventListener("click", () => void returnLobby());
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
  window.setTimeout(() => void startGame(), 50);
}
