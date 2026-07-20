# VibeGame

一个使用 Phaser 4 和 Colyseus 制作的 2D 动作大逃杀网页游戏原型。

## 当前玩法

- 方向键控制角色移动，`J` 或鼠标左键普通攻击。
- `Q`、`W`、`E`、`R` 释放赛前配置的职业技能。
- 狂战、剑魂、鬼泣、剑影、阿修罗五个可选转职。
- 每个转职拥有独立技能池，只能装备本职业技能。
- 11 名机器人参与战斗，也会互相攻击和争夺安全区。
- 开局进入 60 秒独立发育地图，可挑战 Boss 获取按伤害贡献分档的一件装备，也可随时通过传送门跳过 Boss。
- 地图物资、武器、防具、药剂和玩家死亡掉落。
- 多阶段缩圈、圈外伤害、击杀统计与最终结算。
- 自定义按键和技能配置通过服务器接口保存。
- Phaser 客户端提供即时移动预测、远端角色插值、摄像机和战斗特效。
- Colyseus 权威服务端负责移动校验、碰撞、技能、伤害、掉落、Boss、机器人、缩圈和胜负。

角色画面为程序化绘制的原创剑士占位造型，没有使用第三方游戏素材。

## 启动方法

需要 Node.js 20.19+ 或 22.12+。首次运行先安装依赖：

```bash
npm install
```

同时启动 Vite 客户端和 Colyseus 服务端：

```bash
npm run dev
```

然后访问：

```text
http://127.0.0.1:4317
```

开发环境端口：

- Phaser/Vite 客户端：`4317`
- Colyseus WebSocket 与 API：`2567`

玩家配置由服务端保存到 `.data/player-config.json`。本地 DNF 素材放在 `assets/dnf/`；配置数据、素材、构建产物和测试截图均不会提交到 Git。

## 项目结构

```text
server/
  game/            权威对局模拟
  rooms/           Colyseus 房间与网络视图
  state/           Colyseus Schema
src/
  phaser/          Phaser 场景、视图和网络控制器
  shared/          客户端与服务端共享协议/地图常量
  main.ts          大厅、配置、HUD 和结算界面
```

## 检查代码

```bash
npm run check
npm test
npm run build
```

详细玩法设计参见 [GAMEPLAY.md](./GAMEPLAY.md)。
