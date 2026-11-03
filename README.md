# 赛马娘桌宠 · 伪 3D 贴图版

常驻桌面的透明无边框桌宠，Electron + three.js 实现，全本地运行、不联网。

形象使用用户提供的 7 张角色截图为唯一素材（抠图 → 9 个朝向贴图），**不含二次重绘**，因此与原图逐像素一致。

![platform](https://img.shields.io/badge/platform-Windows-8A5CF6)
![electron](https://img.shields.io/badge/electron-45.x-3A4A8F)

## 形象实现

伪 3D：three.js 场景内用正对相机的双平面承载贴图，任意角度在相邻两张贴图之间交叉淡入，配合 yaw / 倾斜 / 缩放动画实现转身与呼吸感。

| 角度 | 贴图 |
| --- | --- |
| 0° | deg_000.png（正面） |
| 20° | deg_020.png |
| 45° | deg_045.png |
| 90° | deg_090.png（正侧） |
| 135° | deg_135.png |
| 180° | deg_180.png（正背） |
| 225° | deg_225.png（镜像） |
| 270° | deg_270.png（镜像正侧） |
| 315° | deg_315.png（镜像） |

贴图规格 1060×1120 PNG（RGBA），开启 mipmap + 各向异性过滤，并对半透明边缘做了预乘色扩散修复，去除抠图白边与灰雾薄边。

## 功能

- **14 种自主行为**：idle / wander / peek / sit / sleep / stretch / groom / hop / giggle / shy / nod / wave / doze / lookAround
- **8 处部位点击反馈**：耳朵 / 脸 / 帽子 / 头发 / 身体 / 裙子 / 尾巴 / 腿，各自独立台词与表情反应
- **好感度系统**：0–100 四档（陌生 / 熟悉 / 亲近 / 信赖），摸头累加，升档有专属提示
- **表情层**：眨眼、睡眠闭眼、害羞脸红，三层独立驱动，随视线角度自动收放
- **交互**：左键点击反应、按住拖拽移动（带惯性落地）、双击害羞、右键菜单
- **鼠标穿透**：角色外空白区域不拦截鼠标
- **托盘菜单**：显示/隐藏、窗口置顶、空白处鼠标穿透、60% / 80% / 100% / 125% / 150% 五档缩放、回到屏幕右下角、重新加载外观、退出
- **生物钟**：夜间自动犯困、夜深问候
- **久坐提醒**：定时提醒站起来活动

## 运行

```bash
npm install          # 首次
npm start            # 直接运行
npm run dev          # 重建渲染层后运行
```

## 构建

```bash
npm run dist         # 生成便携版 exe → release/UmaPet-Portable-2.2.0.exe
npm run pack:dir     # 只生成免安装目录 → release/win-unpacked
```

打包复用本地 Electron 运行时（`build.electronDist = electron_runtime`），无需联网下载 Electron 二进制。该目录缺失时，可从任意 Electron 45.2.1 发行包解压后放回，并把其中的可执行文件复制为 `electron.exe`。

首次在干净环境构建时，`winCodeSign` / `7zip` / `nsis` 仍需联网获取，可用镜像加速：

```bat
set ELECTRON_BUILDER_BINARIES_MIRROR=https://registry.npmmirror.com/-/binary/electron-builder-binaries/
npx electron-builder --win portable -c.electronDist=electron_runtime
```

## 自动化回归

```bash
npx electron tools/verify.js      # 32 项交互与功能回归
npx electron tools/shot.js        # 生成各状态截图到 tools/shots/
```

## 目录结构

```
├─ package.json
├─ assets/
│  ├─ icon.ico / icon.png
│  └─ sprites/deg_000.png … deg_315.png   9 个朝向贴图
├─ src/
│  ├─ main/
│  │  ├─ main.js           窗口、托盘、缩放、穿透、位置持久化
│  │  └─ preload.js        渲染层与主进程桥接
│  └─ renderer/
│     ├─ index.html / style.css
│     ├─ bundle.js         esbuild 产物
│     └─ js/
│        ├─ app.js             场景装配、指针交互、部位命中
│        ├─ spritechar.js      贴图角色构建、表情覆盖层
│        ├─ spriteanimator.js  朝向插值、动作、表情驱动
│        ├─ behavior.js        自主行为状态机
│        ├─ ui.js              气泡、好感度
│        └─ character.js 等    3D 版遗留，代码已不引用（保留作回退）
└─ tools/
   ├─ verify.js   功能回归
   ├─ shot.js     状态截图
   └─ shots/      截图输出
```

## 数据

好感度与窗口位置通过渲染层 localStorage 持久化，重开自动恢复。
