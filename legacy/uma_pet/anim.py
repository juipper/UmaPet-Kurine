# -*- coding: utf-8 -*-
"""帧加载与动画状态机"""
import os

from PySide6.QtCore import QObject, QTimer, Signal
from PySide6.QtGui import QPixmap, QRegion

from . import config


class SpriteLib:
    """帧缓存（含按 DPR 生成的 mask 区域）"""
    _pix = {}
    _mask = {}

    @classmethod
    def frames(cls, state):
        if state in cls._pix:
            return cls._pix[state]
        d = os.path.join(config.ASSETS, state)
        out = []
        if os.path.isdir(d):
            for name in sorted(os.listdir(d)):
                if name.lower().endswith(".png"):
                    pm = QPixmap(os.path.join(d, name))
                    if not pm.isNull():
                        out.append(pm)
        if not out:
            fb = os.path.join(config.ASSETS, "idle")
            if state != "idle" and os.path.isdir(fb):
                return cls.frames("idle")
        cls._pix[state] = out
        return out

    @classmethod
    def mask_region(cls, state, idx, w, h):
        key = (state, idx, w, h)
        if key in cls._mask:
            return cls._mask[key]
        frames = cls.frames(state)
        if not frames:
            return QRegion(0, 0, w, h)
        pm = frames[idx % len(frames)].scaled(w, h)
        region = QRegion(pm.mask())
        cls._mask[key] = region
        return region


class Animator(QObject):
    frameChanged = Signal()
    stateFinished = Signal(str)

    def __init__(self, parent=None):
        super().__init__(parent)
        self.state = "idle"
        self.index = 0
        self.elapsed = 0.0
        self._timer = QTimer(self)
        self._timer.setInterval(33)          # 30fps 节拍，仅换帧时重绘
        self._timer.timeout.connect(self._tick)
        self._last_emit = None

    def start(self):
        self._timer.start()

    def stop(self):
        self._timer.stop()

    # ---------- 状态切换 ----------
    def set_state(self, state, force=False):
        if state == self.state and not force:
            return
        if state not in config.STATES:
            state = "idle"
        self.state = state
        self.index = 0
        self.elapsed = 0.0
        self._last_emit = None
        self.frameChanged.emit()

    def fps(self):
        return config.STATES.get(self.state, {}).get("fps", 8)

    def frame(self):
        frames = SpriteLib.frames(self.state)
        if not frames:
            return None
        return frames[self.index % len(frames)]

    def frame_count(self):
        return max(1, len(SpriteLib.frames(self.state)))

    # ---------- 节拍 ----------
    def _tick(self):
        dt = self._timer.interval() / 1000.0
        self.elapsed += dt
        info = config.STATES.get(self.state, {})
        frames = self.frame_count()
        step = max(1, int(round(30.0 / max(1, info.get("fps", 8)))))
        new_index = int(self.elapsed * info.get("fps", 8)) % frames

        if info.get("loop", True):
            if new_index != self.index:
                self.index = new_index
                self.frameChanged.emit()
            else:
                self._maybe_finish(False)
        else:
            if new_index != self.index:
                self.index = new_index
                self.frameChanged.emit()
            if self.index >= frames - 1 and self.elapsed >= frames / max(1, info.get("fps", 8)):
                self._maybe_finish(True)

    def _maybe_finish(self, looped_end):
        if self.state in config.TRANSIENT:
            min_s = config.STATES.get(self.state, {}).get("min_s", 0.0)
            if self.elapsed >= min_s:
                self.stateFinished.emit(self.state)
