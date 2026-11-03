# -*- coding: utf-8 -*-
"""开机自启：Windows 注册表 Run 项 / macOS LaunchAgents"""
import os
import sys

RUN_KEY = r"Software\Microsoft\Windows\CurrentVersion\Run"
APP_KEY = "UmaPetKurine"


def _exe_cmd():
    if getattr(sys, "frozen", False):
        return f'"{sys.executable}"'
    main_py = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "main.py")
    pyw = sys.executable.replace("python.exe", "pythonw.exe")
    if os.path.exists(pyw):
        pyw_path = pyw
    else:
        pyw_path = sys.executable
    return f'"{pyw_path}" "{main_py}"'


def set_autostart(enable):
    try:
        if sys.platform.startswith("win"):
            import winreg
            key = winreg.OpenKey(winreg.HKEY_CURRENT_USER, RUN_KEY, 0, winreg.KEY_ALL_ACCESS)
            try:
                if enable:
                    winreg.SetValueEx(key, APP_KEY, 0, winreg.REG_SZ, _exe_cmd())
                else:
                    try:
                        winreg.DeleteValue(key, APP_KEY)
                    except FileNotFoundError:
                        pass
            finally:
                winreg.CloseKey(key)
            return True

        if sys.platform == "darwin":
            plist_dir = os.path.expanduser("~/Library/LaunchAgents")
            plist = os.path.join(plist_dir, "com.umapet.kurine.plist")
            if enable:
                os.makedirs(plist_dir, exist_ok=True)
                if getattr(sys, "frozen", False):
                    target = sys.executable
                else:
                    target = _exe_cmd().split('"')[1]
                body = (
                    '<?xml version="1.0" encoding="UTF-8"?>\n'
                    '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" '
                    '"http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n'
                    '<plist version="1.0"><dict>'
                    '<key>Label</key><string>com.umapet.kurine</string>'
                    '<key>ProgramArguments</key><array><string>%s</string></array>'
                    '<key>RunAtLoad</key><true/>'
                    '</dict></plist>\n' % target
                )
                with open(plist, "w", encoding="utf-8") as f:
                    f.write(body)
            else:
                if os.path.exists(plist):
                    os.remove(plist)
            return True
        return False
    except Exception:
        return False


def is_autostart():
    try:
        if sys.platform.startswith("win"):
            import winreg
            key = winreg.OpenKey(winreg.HKEY_CURRENT_USER, RUN_KEY, 0, winreg.KEY_READ)
            try:
                winreg.QueryValueEx(key, APP_KEY)
                return True
            finally:
                winreg.CloseKey(key)
        if sys.platform == "darwin":
            return os.path.exists(os.path.expanduser("~/Library/LaunchAgents/com.umapet.kurine.plist"))
    except Exception:
        return False
    return False
