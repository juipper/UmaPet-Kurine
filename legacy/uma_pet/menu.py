# -*- coding: utf-8 -*-
"""右键环形菜单"""
from . import config
from PySide6.QtCore import Qt, QRectF, Signal, QPoint
from PySide6.QtGui import QPainter, QColor, QPen, QFont, QPainterPath
from PySide6.QtWidgets import QWidget, QPushButton


class RadialMenu(QWidget):
    action_picked = Signal(str)

    ITEMS = [
        ("pet", "摸头"),
        ("feed", "喂食"),
        ("pomo", "番茄"),
        ("quiet", "安静"),
        ("talk", "说话"),
        ("setting", "设置"),
    ]

    SIZE = 250
    R = 92

    def __init__(self, parent=None):
        super().__init__(parent, Qt.Popup | Qt.FramelessWindowHint | Qt.NoDropShadowWindowHint)
        self.setAttribute(Qt.WA_TranslucentBackground, True)
        self.resize(self.SIZE, self.SIZE)
        self.buttons = []
        import math
        n = len(self.ITEMS)
        for i, (key, label) in enumerate(self.ITEMS):
            b = QPushButton(label, self)
            b.setCursor(Qt.PointingHandCursor)
            b.setStyleSheet(
                "QPushButton{border-radius:23px;border:2px solid #FF8FB1;background:rgba(255,252,253,246);"
                "color:#3A4A8F;font-family:"' + config.FONT_FAMILY + '";font-size:12px;}"
                "QPushButton:hover{background:#FFE3D0;border-color:#8A5CF6;}"
                "QPushButton:pressed{background:#FF8FB1;color:white;}"
            )
            b.setFixedSize(46, 46)
            ang = -90 + i * (360.0 / n)
            rad = math.radians(ang)
            cx = self.SIZE / 2 + self.R * math.cos(rad) - 23
            cy = self.SIZE / 2 + self.R * math.sin(rad) - 23
            b.move(int(cx), int(cy))
            b.clicked.connect(lambda _=False, k=key: self._pick(k))
            self.buttons.append(b)
        self.center_text = ""

    def _pick(self, key):
        self.hide()
        self.action_picked.emit(key)

    def popup_at(self, global_pos: QPoint, center_text=""):
        self.center_text = center_text
        self.move(global_pos.x() - self.SIZE // 2, global_pos.y() - self.SIZE // 2)
        self.update()
        self.show()

    def paintEvent(self, ev):
        p = QPainter(self)
        p.setRenderHint(QPainter.Antialiasing, True)
        path = QPainterPath()
        path.addEllipse(QRectF(6, 6, self.SIZE - 12, self.SIZE - 12))
        p.setPen(QPen(QColor(255, 143, 177, 170), 2))
        p.setBrush(QColor(255, 250, 252, 205))
        p.drawPath(path)
        p.setPen(QColor(58, 74, 143))
        f = QFont(config.FONT_FAMILY, 10)
        f.setBold(True)
        p.setFont(f)
        p.drawText(QRectF(0, 0, self.SIZE, self.SIZE), Qt.AlignCenter, self.center_text)
