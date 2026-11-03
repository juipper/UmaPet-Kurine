# -*- coding: utf-8 -*-
"""状态持久化与好感度系统"""
import json
import os
import time
import datetime

from . import config


class PetState:
    def __init__(self):
        self.data = {
            "affection": 30.0,
            "last_pet_date": "",
            "pet_today": 0,
            "last_seen": time.time(),
            "total_days": 1,
            "first_run": datetime.date.today().isoformat(),
            "pomodoro_done": 0,
            "settings": dict(config.DEFAULT_SETTINGS),
        }
        self.load()

    # ---------- 读写 ----------
    def load(self):
        path = config.STATE_FILE
        if os.path.exists(path):
            try:
                with open(path, "r", encoding="utf-8") as f:
                    saved = json.load(f)
                if isinstance(saved, dict):
                    for k, v in saved.items():
                        if k == "settings" and isinstance(v, dict):
                            merged = dict(config.DEFAULT_SETTINGS)
                            merged.update(v)
                            self.data["settings"] = merged
                        else:
                            self.data[k] = v
            except Exception:
                pass
        self._roll_day(False)

    def save(self):
        try:
            tmp = config.STATE_FILE + ".tmp"
            with open(tmp, "w", encoding="utf-8") as f:
                json.dump(self.data, f, ensure_ascii=False, indent=2)
            os.replace(tmp, config.STATE_FILE)
        except Exception:
            pass

    def _roll_day(self, persist=True):
        today = datetime.date.today().isoformat()
        if self.data.get("last_pet_date") != today:
            if self.data.get("last_pet_date"):
                self.data["total_days"] = int(self.data.get("total_days", 1)) + 1
            self.data["last_pet_date"] = today
            self.data["pet_today"] = 0
            if persist:
                self.save()

    # ---------- 好感度 ----------
    @property
    def affection(self):
        return float(self.data.get("affection", 0.0))

    def add_affection(self, delta):
        self._roll_day()
        v = max(0.0, min(100.0, self.affection + delta))
        self.data["affection"] = round(v, 1)
        self.save()
        return self.data["affection"]

    def pet_head(self):
        """摸头 +1，日上限 20"""
        self._roll_day()
        left = config.HEADSHAKE_DAILY_LIMIT - int(self.data.get("pet_today", 0))
        if left <= 0:
            return False, self.affection
        self.data["pet_today"] = int(self.data.get("pet_today", 0)) + 1
        return True, self.add_affection(+1)

    def idle_penalty(self, hours):
        if hours <= 0:
            return
        self.add_affection(-min(3.0, float(hours)))

    def level(self):
        return config.affection_level(self.affection)

    # ---------- 设置 ----------
    @property
    def settings(self):
        s = self.data.get("settings")
        if not isinstance(s, dict):
            s = dict(config.DEFAULT_SETTINGS)
            self.data["settings"] = s
        for k, v in config.DEFAULT_SETTINGS.items():
            s.setdefault(k, v)
        return s

    def set_setting(self, key, value):
        self.settings[key] = value
        self.save()

    def is_quiet(self):
        if time.time() < float(self.settings.get("quiet_until", 0) or 0):
            return True
        if self.settings.get("dnd_night", True):
            h = datetime.datetime.now().hour
            if config.DND_START <= h or h < config.DND_END:
                return True
        return False

    def is_night(self):
        h = datetime.datetime.now().hour
        return h >= config.SLEEP_START or h < config.SLEEP_END
