# -*- coding: utf-8 -*-
"""全局配置：路径、角色参数、状态表"""
import os
import sys

APP_NAME = "赛马娘桌宠"
PET_NAME = "栗音"
PET_NAME_FULL = "栗音（Kurine）"

if sys.platform == "darwin":
    FONT_FAMILY = "PingFang SC"
elif sys.platform.startswith("win"):
    FONT_FAMILY = "Microsoft YaHei UI"
else:
    FONT_FAMILY = "Noto Sans CJK SC"

LOGICAL_W, LOGICAL_H = 300, 400      # 逻辑尺寸（帧源为 2 倍）
SRC_W, SRC_H = 600, 800

# ---------- 路径 ----------
def _base_dir():
    if getattr(sys, "frozen", False):
        return getattr(sys, "_MEIPASS", os.path.dirname(sys.executable))
    return os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


RES_DIR = _base_dir()
ASSETS = os.path.join(RES_DIR, "assets")


def data_dir():
    if sys.platform == "darwin":
        d = os.path.expanduser("~/Library/Application Support/UmaPet")
    elif sys.platform.startswith("win"):
        d = os.path.join(os.environ.get("APPDATA", os.path.expanduser("~")), "UmaPet")
    else:
        d = os.path.expanduser("~/.umapet")
    os.makedirs(d, exist_ok=True)
    return d


STATE_FILE = os.path.join(data_dir(), "state.json")

# ---------- 动画状态 → (目录, fps, 循环, 最短停留秒) ----------
STATES = {
    "idle":   dict(fps=8,  loop=True,  min_s=0.0),
    "blink":  dict(fps=12, loop=False, min_s=0.16),
    "happy":  dict(fps=10, loop=True,  min_s=1.6),
    "shy":    dict(fps=8,  loop=True,  min_s=1.8),
    "angry":  dict(fps=8,  loop=True,  min_s=1.5),
    "sad":    dict(fps=6,  loop=True,  min_s=2.2),
    "sleepy": dict(fps=5,  loop=True,  min_s=2.4),
    "sleep":  dict(fps=4,  loop=True,  min_s=0.0),
    "drag":   dict(fps=10, loop=True,  min_s=0.0),
    "land":   dict(fps=12, loop=False, min_s=0.34),
    "walk":   dict(fps=10, loop=True,  min_s=0.0),
    "wave":   dict(fps=8,  loop=True,  min_s=1.4),
    "remind": dict(fps=6,  loop=True,  min_s=2.6),
    "lonely": dict(fps=6,  loop=True,  min_s=2.2),
}

# 动作完成后自动回落的临时状态
TRANSIENT = {"blink", "happy", "shy", "angry", "sad", "sleepy", "land", "wave", "remind", "lonely"}

# ---------- 好感度 ----------
AFFECTION_LEVELS = [
    (0,   "陌生", "「……干嘛。本马娘只是刚好站在这儿。」"),
    (25,  "熟悉", "「唔姆，你又来了。……也不是不欢迎啦。」"),
    (55,  "亲近", "「哼唧，今天也一起加油吧？本马娘勉强陪你。」"),
    (80,  "信赖", "「好好看着吧——本马娘，会一直在这里的。」"),
]

HEADSHAKE_DAILY_LIMIT = 20     # 摸头每日上限


def affection_level(v):
    lv = AFFECTION_LEVELS[0]
    for item in AFFECTION_LEVELS:
        if v >= item[0]:
            lv = item
    return lv


# ---------- 行为参数 ----------
SLEEP_START = 22          # 22:00 后犯困
SLEEP_END = 7
DND_START = 23            # 免打扰
DND_END = 8
IDLE_SLEEP_SECONDS = 180  # 3 分钟无操作 → 打哈欠 → 睡觉
SIT_REMIND_MINUTES = 45   # 久坐提醒
POMODORO_WORK = 25 * 60
POMODORO_BREAK = 5 * 60

DEFAULT_SETTINGS = {
    "x": None,
    "y": None,
    "sound": True,             # 预留
    "quiet_until": 0,          # 免打扰截止时间戳
    "click_through": True,     # 空白区域点击穿透
    "autostart": False,
    "dnd_night": True,
    "sit_remind": True,
    "pomodoro_total": 0,
    "llm_enabled": False,      # LLM 对话插件，默认关闭
}
