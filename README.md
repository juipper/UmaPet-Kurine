# 赛马娘桌宠 · 正面视角贴图版

常驻桌面的透明无边框桌宠，Electron + three.js 实现，全本地运行、不联网。

形象使用用户提供的角色截图抠图得到的**正面贴图**为唯一素材，不含二次重绘，因此与原图逐像素一致。

![platform](https://img.shields.io/badge/platform-Windows-8A5CF6)
![electron](https://img.shields.io/badge/electron-45.x-3A4A8F)

## 形象实现

固定正面视角：场景内单个平面承载 `assets/sprites/deg_000.png`，正对相机，**不做朝向切换、不做透视旋转、不做多贴图交叉擦除**。所有表演都由「弹簧驱动的轻微位移 / 倾斜 / 非等比缩放 + 逐帧贴图不动」完成，因此不存在转身重影、侧身闭眼错位一类问题。

贴图规格 1060×1120 PNG（RGBA），开启 mipmap + 各向异性过滤，并对半透明边缘做了预乘色扩散修复，去除抠图白边与灰雾薄边。

### 闭眼

`assets/sprites/blink/deg_000_eye.png` 为与正面贴图逐像素对齐的闭眼贴片（重绘眼睑像素 + 单条眼弧），叠在身体平面上方（renderOrder=6，depthWrite/depthTest=false），由眨眼 / 睡眠 / 打哈欠三个来源取最大值控制 `opacity`。

## 功能

- **14 种自主行为**：idle / wander / peek / sit / sleep / stretch / groom / hop / giggle / shy / nod / wave / doze / lookAround
- **8 处部位点击反馈**：耳朵 / 脸 / 帽子 / 头发 / 身体 / 裙子 / 尾巴 / 腿，各自独立冲量、台词与表情反应
- **好感度系统**：0–100 四档（陌生 / 熟悉 / 亲近 / 信赖），摸头累加，升档有专属提示
- **表情层**：眨眼、睡眠闭眼、害羞脸红，三层独立驱动
- **交互**：左键点击反应、按住拖拽移动（带惯性落地）、双击害羞、右键菜单
- **鼠标穿透**：角色外空白区域不拦截鼠标
- **托盘菜单**：显示/隐藏、窗口置顶、空白处鼠标穿透、60% / 80% / 100% / 125% / 150% 五档缩放、回到屏幕右下角、重新加载外观、退出
- **生物钟**：夜间自动犯困、夜深问候
- **久坐提醒**：定时提醒站起来活动

## 点击反馈幅度

点击/摸头的位移来自弹簧速度冲量（`src/renderer/js/spriteanimator.js` 的 `REACT` 表），不再是硬编码的大幅摆动：

| 弹簧 | 刚度 k / 阻尼 c | 峰值 ≈ 冲量 × | 单次受力收敛 |
| --- | --- | --- | --- |
| bob（上下） | 210 / 26 | 0.017 | — |
| leanZ / leanX（侧倾） | 105 / 16 | 1.65° | 约 0.3 s |
| scaleY（挤压） | 165 / 21 | 0.011 | — |

当前冲量（leanZ）：耳朵 2.6、裙子 2.2、头发 2.2、帽子 −2.2、腿 2.0、脸 1.9、尾巴 −1.8、身体 1.4、躯干 1.3，实测峰值 **1.3°–4.8°**，0.2–0.4 s 内回稳。旧版 leanZ 冲量 42（峰值约 70°）、yawVel 冲量 ±74，是「拍一下就整个人甩出去还晃半天」的原因。

## 运行

```bash
npm install          # 首次
npm start            # 直接运行
npm run dev          # 重建渲染层后运行
```

## 构建

```bash
npm run dist         # 生成便携版 exe → release/UmaPet-Portable-<version>.exe
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
npx electron tools/smoke.js       # 22 项结构 / 表情 / 命中 / 点击反馈幅度断言 + 各状态截图
```

产物：`tools/shots/*.png`（12 个状态 + 6 帧点击连拍）与 `tools/shots/smoke-result.json`；全部通过时退出码 0，否则 2。

## 目录结构

```
├─ package.json
├─ assets/
│  ├─ icon.ico / icon.png
│  └─ sprites/
│     ├─ deg_000.png              正面贴图（唯一在用）
│     └─ blink/deg_000_eye.png    正面闭眼贴片
├─ src/
│  ├─ main/
│  │  ├─ main.js           窗口、托盘、缩放、穿透、位置持久化
│  │  └─ preload.js        渲染层与主进程桥接
│  └─ renderer/
│     ├─ index.html / style.css
│     ├─ bundle.js         esbuild 产物（改 src 后必须 npm run build:renderer）
│     └─ js/
│        ├─ app.js             场景装配、指针交互、部位命中
│        ├─ spritechar.js      贴图角色构建、闭眼贴片
│        ├─ spriteanimator.js  弹簧姿态、动作关键帧、表情驱动
│        ├─ behavior.js        自主行为状态机
│        └─ ui.js              气泡、好感度
└─ tools/
   └─ smoke.js      冒烟验证（结构断言 + 截图）
```

## 数据

好感度与窗口位置通过渲染层 localStorage 持久化，重开自动恢复。
