# -*- coding: utf-8 -*-
"""赛马娘桌宠 - 栗音 Kurine  程序入口"""
import os
import sys

# 允许源码方式直接运行
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from PySide6.QtCore import Qt, QSharedMemory
from PySide6.QtGui import QIcon, QFont
from PySide6.QtWidgets import QApplication, QMessageBox

from uma_pet import config
from uma_pet.pet import PetWindow


def main():
    app = QApplication(sys.argv)
    app.setApplicationName(config.APP_NAME)
    app.setApplicationDisplayName(config.APP_NAME)
    app.setQuitOnLastWindowClosed(False)
    try:
        app.setWindowIcon(QIcon(os.path.join(config.ASSETS, "ui", "icon.png")))
    except Exception:
        pass
    f = QFont(config.FONT_FAMILY, 9)
    app.setFont(f)

    # 单实例锁
    shared = QSharedMemory("UmaPetKurineSingleton")
    if not shared.create(1):
        QMessageBox.information(None, config.APP_NAME, "栗音已经在桌面上了。")
        return 1

    pet = PetWindow(app)          # noqa: F841
    return app.exec()


if __name__ == "__main__":
    sys.exit(main())
