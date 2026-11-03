# -*- coding: utf-8 -*-
"""设置对话框"""
from PySide6.QtCore import Qt
from PySide6.QtWidgets import (QDialog, QVBoxLayout, QHBoxLayout, QLabel, QCheckBox,
                               QPushButton, QSpinBox, QFormLayout, QGroupBox)

from . import config


class SettingsDialog(QDialog):
    def __init__(self, pet):
        super().__init__(pet, Qt.Dialog | Qt.WindowStaysOnTopHint)
        self.pet = pet
        self.setWindowTitle("栗音的设置")
        self.setMinimumWidth(340)
        self.setStyleSheet(f"""
            QDialog{background:#FFF9FB;}
            QLabel{color:#48301F;font-family:'{config.FONT_FAMILY}';font-size:12px;}
            QGroupBox{color:#3A4A8F;font-weight:bold;border:1px solid #FFD6E3;border-radius:8px;margin-top:10px;padding:8px;}
            QGroupBox::title{subcontrol-origin:margin;left:10px;}
            QCheckBox{color:#48301F;font-family:'{config.FONT_FAMILY}';font-size:12px;spacing:6px;}
            QPushButton{background:#FF8FB1;color:white;border:none;border-radius:8px;padding:6px 16px;
                        font-family:'{config.FONT_FAMILY}';font-size:12px;}
            QPushButton:hover{background:#8A5CF6;}
        """)
        s = pet.state.settings
        root = QVBoxLayout(self)

        grp1 = QGroupBox("交互")
        f1 = QVBoxLayout(grp1)
        self.cb_click = QCheckBox("空白区域点击穿透（不挡桌面）")
        self.cb_click.setChecked(bool(s.get("click_through", True)))
        f1.addWidget(self.cb_click)
        self.cb_dnd = QCheckBox("夜间免打扰（23:00 - 08:00 不主动说话）")
        self.cb_dnd.setChecked(bool(s.get("dnd_night", True)))
        f1.addWidget(self.cb_dnd)
        self.cb_sit = QCheckBox(f"久坐提醒（每 {config.SIT_REMIND_MINUTES} 分钟）")
        self.cb_sit.setChecked(bool(s.get("sit_remind", True)))
        f1.addWidget(self.cb_sit)
        self.cb_auto = QCheckBox("开机自动启动")
        self.cb_auto.setChecked(bool(s.get("autostart", False)))
        f1.addWidget(self.cb_auto)
        root.addWidget(grp1)

        grp2 = QGroupBox("番茄钟")
        f2 = QFormLayout(grp2)
        self.sp_work = QSpinBox()
        self.sp_work.setRange(5, 90)
        self.sp_work.setValue(config.POMODORO_WORK // 60)
        self.sp_work.setSuffix(" 分钟")
        self.sp_break = QSpinBox()
        self.sp_break.setRange(1, 30)
        self.sp_break.setValue(config.POMODORO_BREAK // 60)
        self.sp_break.setSuffix(" 分钟")
        f2.addRow(QLabel("专注时长"), self.sp_work)
        f2.addRow(QLabel("休息时长"), self.sp_break)
        root.addWidget(grp2)

        lv = pet.state.level()
        info = QLabel(f"好感度 {int(pet.state.affection)} / 100　当前关系：{lv[1]}\n"
                      f"今日摸头 {pet.state.data.get('pet_today', 0)} 次　累计番茄钟 {pet.state.data.get('pomodoro_done', 0)} 个")
        info.setWordWrap(True)
        root.addWidget(info)

        btns = QHBoxLayout()
        btns.addStretch(1)
        b_cancel = QPushButton("取消")
        b_cancel.setStyleSheet("QPushButton{background:#C9CEDC;}")
        b_ok = QPushButton("保存")
        b_cancel.clicked.connect(self.reject)
        b_ok.clicked.connect(self._save)
        btns.addWidget(b_cancel)
        btns.addWidget(b_ok)
        root.addLayout(btns)

    def _save(self):
        pet = self.pet
        pet.state.set_setting("click_through", self.cb_click.isChecked())
        pet.state.set_setting("dnd_night", self.cb_dnd.isChecked())
        pet.state.set_setting("sit_remind", self.cb_sit.isChecked())
        pet._apply_click_through()
        if self.cb_auto.isChecked() != bool(pet.state.settings.get("autostart", False)):
            pet.act_auto.setChecked(self.cb_auto.isChecked())
            pet._toggle_autostart(self.cb_auto.isChecked())
        config.POMODORO_WORK = self.sp_work.value() * 60
        config.POMODORO_BREAK = self.sp_break.value() * 60
        self.accept()
