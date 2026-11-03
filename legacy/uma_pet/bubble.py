# -*- coding: utf-8 -*-
"""台词气泡窗"""
from . import config
from PySide6.QtCore import Qt, QTimer, QRectF, QPropertyAnimation, QEasingCurve
from PySide6.QtGui import QPainter, QPainterPath, QColor, QFont, QFontMetrics, QPen, QPolygonF
from PySide6.QtCore import QPointF
from PySide6.QtWidgets import QWidget


class Bubble(QWidget):
    MAXW = 250

    def __init__(self):
        super().__init__(None, Qt.FramelessWindowHint | Qt.Tool | Qt.WindowStaysOnTopHint | Qt.NoDropShadowWindowHint)
        self.setAttribute(Qt.WA_TranslucentBackground, True)
        self.setAttribute(Qt.WA_ShowWithoutActivating, True)
        self.setAttribute(Qt.WA_TransparentForMouseEvents, True)
        self.text = ""
        self.tail_x = 40
        self._font = QFont(config.FONT_FAMILY, 10) if True else QFont()
        self._font.setStyleStrategy(QFont.PreferAntialias)
        self._timer = QTimer(self)
        self._timer.setSingleShot(True)
        self._timer.timeout.connect(self.hide_anim)
        self._anim = QPropertyAnimation(self, b"windowOpacity", self)
        self._anim.setDuration(220)
        self.hide()

    def _layout(self):
        fm = QFontMetrics(self._font)
        rect = fm.boundingRect(0, 0, self.MAXW - 28, 400, Qt.TextWordWrap, self.text)
        w = max(120, rect.width() + 34)
        h = rect.height() + 26 + 14
        return w, h

    def show_text(self, text, anchor_rect, duration=3200):
        if not text:
            return
        self.text = text
        w, h = self._layout()
        sw = None
        if anchor_rect is not None:
            from PySide6.QtGui import QGuiApplication
            scr = QGuiApplication.screenAt(anchor_rect.center()) or QGuiApplication.primaryScreen()
            if scr is not None:
                sw = scr.availableGeometry()
        x = int(anchor_rect.center().x() - w / 2)
        y = int(anchor_rect.top() - h + 6)
        if sw is not None:
            x = max(sw.left() + 4, min(x, sw.right() - w - 4))
            if y < sw.top() + 4:
                y = int(anchor_rect.bottom() - 6)
        self.setGeometry(x, y, w, h)
        self.tail_x = max(18, min(w - 18, int(anchor_rect.center().x() - x)))
        self.setWindowOpacity(0.0)
        self.show()
        self.raise_()
        self._anim.stop()
        self._anim.setStartValue(0.0)
        self._anim.setEndValue(1.0)
        self._anim.start()
        self._timer.start(duration)

    def hide_anim(self):
        self._anim.stop()
        self._anim.setStartValue(self.windowOpacity())
        self._anim.setEndValue(0.0)
        try:
            self._anim.finished.disconnect()
        except Exception:
            pass
        self._anim.finished.connect(self._after_hide)
        self._anim.start()

    def _after_hide(self):
        try:
            self._anim.finished.disconnect(self._after_hide)
        except Exception:
            pass
        self.hide()

    def paintEvent(self, ev):
        p = QPainter(self)
        p.setRenderHint(QPainter.Antialiasing, True)
        w, h = self.width(), self.height()
        body_h = h - 12
        path = QPainterPath()
        path.addRoundedRect(QRectF(1, 1, w - 2, body_h - 2), 14, 14)
        tri = QPolygonF([QPointF(self.tail_x - 10, body_h - 2),
                         QPointF(self.tail_x + 8, body_h - 2),
                         QPointF(self.tail_x - 1, h - 1)])
        path.addPolygon(tri)
        path = path.simplified()
        p.setPen(QPen(QColor(255, 143, 177, 220), 2))
        p.setBrush(QColor(255, 252, 253, 246))
        p.drawPath(path)
        p.setFont(self._font)
        p.setPen(QColor(72, 44, 30))
        p.drawText(QRectF(15, 12, w - 30, body_h - 20), Qt.TextWordWrap | Qt.AlignLeft | Qt.AlignVCenter, self.text)
