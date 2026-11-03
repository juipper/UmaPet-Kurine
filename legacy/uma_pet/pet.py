# -*- coding: utf-8 -*-
"""桌宠主窗口：透明无边框置顶、动画、拖拽抛掷、点击交互、托盘与行为调度"""
import os
import random
import time
import math

from PySide6.QtCore import Qt, QTimer, QPoint, QRect, Signal
from PySide6.QtGui import (QPainter, QPixmap, QRegion, QIcon, QColor, QAction,
                           QGuiApplication)
from PySide6.QtWidgets import QWidget, QSystemTrayIcon, QMenu, QApplication

from . import config, lines
from .anim import Animator, SpriteLib
from .bubble import Bubble
from .menu import RadialMenu
from .state import PetState

FOOT_Y = 352          # 角色脚底在窗口内的纵向位置（逻辑坐标）
HEAD_Y = 200          # 头部/身体分界


class PetWindow(QWidget):
    def __init__(self, app):
        super().__init__(None, Qt.FramelessWindowHint | Qt.Tool |
                         Qt.WindowStaysOnTopHint | Qt.NoDropShadowWindowHint)
        self.app = app
        self.state = PetState()
        self.setAttribute(Qt.WA_TranslucentBackground, True)
        self.setAttribute(Qt.WA_ShowWithoutActivating, True)
        self.setWindowTitle(config.PET_NAME)
        self.resize(config.LOGICAL_W, config.LOGICAL_H)
        self.setCursor(Qt.OpenHandCursor)

        self.anim = Animator(self)
        self.anim.frameChanged.connect(self._on_frame)
        self.anim.stateFinished.connect(self._on_state_finished)

        self.bubble = Bubble()
        self.radial = RadialMenu()
        self.radial.action_picked.connect(self._on_menu)

        self._cur_pix = None
        self._cur_mask_sig = None
        self._drag_from = None
        self._drag_origin = None
        self._moved = False
        self._press_t = 0
        self._press_global = QPoint()
        self._samples = []

        self.vx = 0.0
        self.vy = 0.0
        self.falling = False
        self.toss = QTimer(self)
        self.toss.setInterval(16)
        self.toss.timeout.connect(self._toss_tick)

        now = time.time()
        self.last_interact = now
        self.last_sit_remind = now
        self.last_affect_check = now
        self.sleeping = False
        self.sleepy_count = 0
        self.pomo_phase = None
        self.pomo_left = 0
        self.pomo_cycle = 0

        self.brain = QTimer(self)
        self.brain.setInterval(1000)
        self.brain.timeout.connect(self._brain_tick)

        self.life = QTimer(self)
        self.life.setInterval(20000)
        self.life.timeout.connect(self._life_tick)

        self._restore_pos()
        self._build_tray()
        self._apply_click_through()
        self.anim.set_state("idle", force=True)
        self.anim.start()
        self.brain.start()
        self.life.start()
        self.show()

        if self.state.is_night():
            QTimer.singleShot(4000, lambda: self.say(lines.pick(lines.NIGHT)))

    # ---------------- 位置 ----------------
    def _restore_pos(self):
        s = self.state.settings
        scr = QGuiApplication.primaryScreen().availableGeometry()
        x, y = s.get("x"), s.get("y")
        if x is None or y is None:
            x = scr.right() - config.LOGICAL_W - 60
            y = scr.bottom() - FOOT_Y - 8
        else:
            x = max(scr.left() - 40, min(int(x), scr.right() - 40))
            y = max(scr.top() - 40, min(int(y), scr.bottom() - 40))
        self.move(int(x), int(y))

    def _save_pos(self):
        s = self.state.settings
        s["x"] = self.x()
        s["y"] = self.y()
        self.state.save()

    # ---------------- 绘制 ----------------
    def _on_frame(self):
        pm = self.anim.frame()
        if pm is None:
            return
        self._cur_pix = pm
        self.update()
        self._update_mask()

    def _build_region(self, pm):
        tw, th = config.LOGICAL_W // 2, config.LOGICAL_H // 2
        img = pm.scaled(tw, th, Qt.IgnoreAspectRatio, Qt.SmoothTransformation).toImage()
        img = img.convertToFormat(img.Format_ARGB32)
        rects = []
        step = 3
        for gx in range(0, tw, step):
            for gy in range(0, th, step):
                v = img.pixel(gx + 1, gy + 1)
                if (v >> 24) & 0xFF > 24:
                    rects.append(QRect(gx * 2 - 4, gy * 2 - 4, step * 2 + 8, step * 2 + 8))
        return QRegion(*rects) if rects else QRegion(0, 0, config.LOGICAL_W, config.LOGICAL_H)

    def _update_mask(self):
        if not self.state.settings.get("click_through", True):
            self.clearMask()
            self._cur_mask_sig = None
            return
        sig = (self.anim.state, self.anim.index)
        if sig == self._cur_mask_sig or self._cur_pix is None:
            return
        self._cur_mask_sig = sig
        try:
            self.setMask(self._build_region(self._cur_pix))
        except Exception:
            self.clearMask()

    def _apply_click_through(self):
        self._cur_mask_sig = None
        self._update_mask()

    def paintEvent(self, ev):
        if self._cur_pix is None:
            return
        p = QPainter(self)
        p.setRenderHint(QPainter.SmoothPixmapTransform, True)
        p.setRenderHint(QPainter.Antialiasing, True)
        p.drawPixmap(QRect(0, 0, self.width(), self.height()), self._cur_pix)

    # ---------------- 状态 ----------------
    def set_state(self, st, say=None, force=False):
        self.anim.set_state(st, force=force)
        if say:
            self.say(say)

    def _on_state_finished(self, st):
        if self.sleeping and st not in ("sleep",):
            self.anim.set_state("sleep", force=True)
            return
        if st == "land":
            self.anim.set_state("idle", force=True)
        elif st == "sleepy":
            if self.sleepy_count >= 1:
                self.go_sleep()
            else:
                self.sleepy_count += 1
                self.anim.set_state("idle", force=True)
        elif st in ("happy", "shy", "angry", "sad", "wave", "remind", "lonely", "blink"):
            self.anim.set_state("idle", force=True)

    def go_sleep(self):
        self.sleeping = True
        self.anim.set_state("sleep", force=True)
        self.say(lines.pick(lines.SLEEP), quiet_ok=True)

    def wake_up(self):
        if not self.sleeping:
            return
        self.sleeping = False
        self.sleepy_count = 0
        self.last_interact = time.time()
        self.anim.set_state("happy", force=True)
        self.say(lines.pick(lines.WAKE))

    def say(self, text, quiet_ok=False, duration=3200):
        if not text:
            return
        if not quiet_ok and self.state.is_quiet():
            return
        self.bubble.show_text(text, self.frameGeometry(), duration)

    # ---------------- 鼠标 ----------------
    def mousePressEvent(self, ev):
        if ev.button() == Qt.LeftButton:
            self._press_global = ev.globalPosition().toPoint()
            self._drag_origin = self.pos()
            self._moved = False
            self._press_t = time.time()
            self._samples = [(self._press_global, self._press_t)]
            self.setCursor(Qt.ClosedHandCursor)
            self.last_interact = time.time()

    def mouseMoveEvent(self, ev):
        if self._drag_origin is None:
            return
        gp = ev.globalPosition().toPoint()
        delta = gp - self._press_global
        if not self._moved and delta.manhattanLength() > 6:
            self._moved = True
            self.toss.stop()
            self.falling = False
            if self.sleeping:
                self.sleeping = False
            self.anim.set_state("drag", force=True)
            if random.random() < 0.35:
                self.say(lines.pick(lines.DRAG), quiet_ok=False, duration=1600)
        if self._moved:
            self.move(self._drag_origin + delta)
            t = time.time()
            self._samples.append((gp, t))
            self._samples = [s for s in self._samples if t - s[1] < 0.12][-6:]

    def mouseReleaseEvent(self, ev):
        self.setCursor(Qt.OpenHandCursor)
        if self._drag_origin is None:
            return
        was_drag = self._moved
        self._drag_origin = None
        if was_drag:
            # 计算抛出速度
            vx = vy = 0.0
            if len(self._samples) >= 2:
                (p0, t0), (p1, t1) = self._samples[0], self._samples[-1]
                dt = max(0.016, t1 - t0)
                vx = (p1.x() - p0.x()) / dt
                vy = (p1.y() - p0.y()) / dt
            self.vx = max(-2600, min(2600, vx))
            self.vy = max(-2600, min(2600, vy))
            self.falling = True
            self.toss.start()
        else:
            self._on_click(ev.position().toPoint())
        self._samples = []

    def mouseDoubleClickEvent(self, ev):
        self.last_interact = time.time()
        self.set_state("wave", say=self._line_any(force=True))

    def contextMenuEvent(self, ev):
        self.last_interact = time.time()
        lv = self.state.level()
        self.radial.popup_at(ev.globalPos(), f"{lv[1]}\n{int(self.state.affection)}")

    def _line_any(self, force=False):
        pool = lines.pick([lines.IDLE, lines.CLICK_BODY, lines.HAPPY])
        return lines.pick(pool)

    def _on_click(self, pos):
        self.last_interact = time.time()
        if self.sleeping:
            self.wake_up()
            return
        if pos.y() < HEAD_Y:
            ok, aff = self.state.pet_head()
            if ok:
                self.anim.set_state("happy", force=True)
                self.say(lines.pick(lines.HEADPAT))
            else:
                self.anim.set_state("shy", force=True)
                self.say(lines.pick(lines.HEADPAT_MAX))
        else:
            r = random.random()
            if r < 0.25:
                self.anim.set_state("shy", force=True)
            elif r < 0.45:
                self.anim.set_state("angry", force=True)
            else:
                self.anim.set_state("wave", force=True)
            self.say(lines.pick(lines.CLICK_BODY))

    # ---------------- 抛掷物理 ----------------
    def _toss_tick(self):
        dt = 0.016
        scr = self.screen().availableGeometry()
        self.vy += 2400 * dt
        nx = self.x() + self.vx * dt
        ny = self.y() + self.vy * dt
        if nx < scr.left() - 30:
            nx = scr.left() - 30
            self.vx = abs(self.vx) * 0.45
        if nx + config.LOGICAL_W > scr.right() + 30:
            nx = scr.right() + 30 - config.LOGICAL_W
            self.vx = -abs(self.vx) * 0.45
        floor_y = scr.bottom() - FOOT_Y
        landed = False
        if ny >= floor_y:
            ny = floor_y
            if abs(self.vy) > 500:
                self.vy = -self.vy * 0.32
                self.vx *= 0.7
            else:
                landed = True
        if ny < scr.top() - 120:
            ny = scr.top() - 120
            self.vy = abs(self.vy) * 0.3
        self.move(int(nx), int(ny))
        if landed:
            self.toss.stop()
            self.falling = False
            self.vx = self.vy = 0.0
            self.anim.set_state("land", force=True)
            self._save_pos()
            if random.random() < 0.3:
                self.say(lines.pick(lines.LAND), duration=1800)

    # ---------------- 行为 ----------------
    def _brain_tick(self):
        now = time.time()
        # 番茄钟
        if self.pomo_phase:
            self.pomo_left -= 1
            if self.pomo_left <= 0:
                self._pomo_finish()
        # 孤独与睡眠
        if not self.sleeping and not self.falling and self.anim.state in ("idle", "blink"):
            idle_since = now - self.last_interact
            threshold = 60 if self.state.is_night() else config.IDLE_SLEEP_SECONDS
            if idle_since > threshold:
                self.sleepy_count = 0
                self.anim.set_state("sleepy", force=True)
                self.say(lines.pick(lines.SLEEPY), quiet_ok=True, duration=2400)
            elif idle_since > 60 and random.random() < 0.05:
                self.anim.set_state("lonely", force=True)
        # 好感度衰减
        if now - self.last_affect_check > 3600:
            self.last_affect_check = now
            if now - self.last_interact > 3600:
                self.state.idle_penalty(1)

    def _life_tick(self):
        now = time.time()
        if self.sleeping:
            if random.random() < 0.3:
                self.say(lines.pick(lines.SLEEP), quiet_ok=True, duration=2600)
            return
        if self.anim.state not in ("idle",):
            return
        r = random.random()
        if r < 0.45:
            self.anim.set_state("blink", force=True)
        elif r < 0.62:
            self.say(lines.pick(lines.IDLE))
        elif r < 0.74:
            self.anim.set_state("walk", force=True)
            QTimer.singleShot(2600, self._back_idle)
        elif r < 0.84:
            self.anim.set_state("wave", force=True)
        elif r < 0.92:
            self.anim.set_state("happy", force=True)
        # 久坐提醒
        if self.state.settings.get("sit_remind", True) and not self.state.is_quiet():
            if now - self.last_sit_remind > config.SIT_REMIND_MINUTES * 60:
                self.last_sit_remind = now
                self.anim.set_state("remind", force=True)
                self.say(lines.pick(lines.SIT_REMIND), duration=6000)

    def _back_idle(self):
        if self.anim.state in ("walk", "wave") and not self.sleeping:
            self.anim.set_state("idle", force=True)

    # ---------------- 菜单动作 ----------------
    def _on_menu(self, key):
        self.last_interact = time.time()
        if key == "pet":
            ok, _ = self.state.pet_head()
            self.anim.set_state("happy" if ok else "shy", force=True)
            self.say(lines.pick(lines.HEADPAT if ok else lines.HEADPAT_MAX))
        elif key == "feed":
            self.state.add_affection(2)
            self.anim.set_state("happy", force=True)
            self.say(lines.pick(lines.FEED))
        elif key == "pomo":
            self.toggle_pomodoro()
        elif key == "quiet":
            self._quiet_menu()
        elif key == "talk":
            self.anim.set_state("wave", force=True)
            lv = self.state.level()
            self.say(lv[2] if random.random() < 0.5 else lines.pick(lines.IDLE), duration=4000)
        elif key == "setting":
            self._open_settings()

    def _quiet_menu(self):
        m = QMenu()
        a1 = m.addAction("安静 10 分钟")
        a2 = m.addAction("安静 1 小时")
        a3 = m.addAction("取消安静")
        a = m.exec(self.radial.mapToGlobal(self.radial.rect().center()))
        now = time.time()
        if a == a1:
            self.state.set_setting("quiet_until", now + 600)
            self.say("唔姆，那本马娘先安静一会儿。", quiet_ok=True)
        elif a == a2:
            self.state.set_setting("quiet_until", now + 3600)
            self.say("一小时，本马娘不说话。", quiet_ok=True)
        elif a == a3:
            self.state.set_setting("quiet_until", 0)
            self.say("唔姆，恢复说话了。", quiet_ok=True)

    def toggle_pomodoro(self):
        if self.pomo_phase:
            self.pomo_phase = None
            self.pomo_left = 0
            self.say("番茄钟停了。……随你。", quiet_ok=True)
            return
        self.start_pomodoro()

    def start_pomodoro(self):
        self.pomo_phase = "work"
        self.pomo_left = config.POMODORO_WORK
        self.anim.set_state("remind", force=True)
        self.say(lines.pick(lines.POMODORO_START), quiet_ok=True, duration=4000)

    def _pomo_finish(self):
        if self.pomo_phase == "work":
            self.pomo_cycle += 1
            self.state.data["pomodoro_done"] = int(self.state.data.get("pomodoro_done", 0)) + 1
            self.state.add_affection(3)
            self.pomo_phase = "break"
            self.pomo_left = config.POMODORO_BREAK
            self.anim.set_state("happy", force=True)
            self.say(lines.pick(lines.POMODORO_DONE), quiet_ok=True, duration=6000)
        else:
            self.pomo_phase = None
            self.pomo_left = 0
            self.anim.set_state("remind", force=True)
            self.say(lines.pick(lines.POMODORO_BREAK_END), quiet_ok=True, duration=5000)

    def _open_settings(self):
        from .settings import SettingsDialog
        dlg = SettingsDialog(self)
        dlg.exec()

    # ---------------- 托盘 ----------------
    def _build_tray(self):
        icon_path = os.path.join(config.ASSETS, "ui", "icon.png")
        self.icon = QIcon(icon_path) if os.path.exists(icon_path) else QIcon()
        self.tray = QSystemTrayIcon(self.icon, self)
        self.tray.setToolTip(f"{config.APP_NAME} - {config.PET_NAME}")
        m = QMenu()
        act_show = QAction("显示 / 隐藏", self)
        act_show.triggered.connect(self._toggle_show)
        m.addAction(act_show)
        m.addSeparator()
        act_pet = QAction("摸摸头", self)
        act_pet.triggered.connect(lambda: self._on_menu("pet"))
        m.addAction(act_pet)
        act_feed = QAction("喂胡萝卜", self)
        act_feed.triggered.connect(lambda: self._on_menu("feed"))
        m.addAction(act_feed)
        act_pomo = QAction("开始 / 停止番茄钟", self)
        act_pomo.triggered.connect(self.toggle_pomodoro)
        m.addAction(act_pomo)
        act_quiet = QAction("安静 1 小时", self)
        act_quiet.triggered.connect(lambda: self.state.set_setting("quiet_until", time.time() + 3600))
        m.addAction(act_quiet)
        m.addSeparator()
        self.act_auto = QAction("开机自启", self, checkable=True)
        self.act_auto.setChecked(bool(self.state.settings.get("autostart", False)))
        self.act_auto.triggered.connect(self._toggle_autostart)
        m.addAction(self.act_auto)
        act_set = QAction("设置", self)
        act_set.triggered.connect(self._open_settings)
        m.addAction(act_set)
        act_about = QAction("关于栗音", self)
        act_about.triggered.connect(self._about)
        m.addAction(act_about)
        m.addSeparator()
        act_quit = QAction("退出", self)
        act_quit.triggered.connect(self._quit)
        m.addAction(act_quit)
        self.tray.setContextMenu(m)
        self.tray.activated.connect(self._tray_activated)
        self.tray.show()

    def _tray_activated(self, reason):
        if reason == QSystemTrayIcon.Trigger:
            self._toggle_show()

    def _toggle_show(self):
        if self.isVisible():
            self.hide()
            self.bubble.hide()
        else:
            self.show()
            self.raise_()

    def _toggle_autostart(self, checked):
        from .autostart import set_autostart
        ok = set_autostart(bool(checked))
        if not ok:
            self.act_auto.setChecked(False)
            self.say("自启设置失败了，检查一下权限。", quiet_ok=True)
            return
        self.state.set_setting("autostart", bool(checked))
        self.say("好，下次开机会见到本马娘。" if checked else "唔姆，不自启了。", quiet_ok=True)

    def _about(self):
        lv = self.state.level()
        self.say(f"好感度 {int(self.state.affection)}｜{lv[1]}｜今天被摸 {self.state.data.get('pet_today', 0)} 次",
                 quiet_ok=True, duration=5000)

    def _quit(self):
        self._save_pos()
        self.state.save()
        self.tray.hide()
        self.bubble.hide()
        self.close()
        self.app.quit()

    def closeEvent(self, ev):
        self._save_pos()
        self.state.save()
        super().closeEvent(ev)
