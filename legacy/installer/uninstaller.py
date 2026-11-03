# -*- coding: utf-8 -*-
"""赛马娘桌宠 - 卸载程序"""
import os
import subprocess
import sys
import tkinter as tk
from tkinter import messagebox
import winreg

APP_NAME = "赛马娘桌宠"
APP_ID = "UmaPetKurine"
EXE_NAME = "UmaPet.exe"


def install_dir():
    return os.path.dirname(os.path.abspath(sys.executable if getattr(sys, "frozen", False) else __file__))


def desktop_dir():
    d = os.path.join(os.path.expanduser("~"), "Desktop")
    if not os.path.isdir(d):
        d = os.path.join(os.path.expanduser("~"), "桌面")
    return d


def start_menu_dir():
    base = os.environ.get("APPDATA") or os.path.expanduser("~")
    return os.path.join(base, "Microsoft", "Windows", "Start Menu", "Programs")


def _schedule_removal(target):
    """延迟删除安装目录：写 .bat 由独立 cmd 进程在卸载器退出后执行"""
    import tempfile
    tdir = tempfile.gettempdir()
    bat = os.path.join(tdir, "umapet_unins_%d.bat" % os.getpid())
    log = os.path.join(tdir, "umapet_unins.log")
    script = (
        "@echo off\r\n"
        "ping -n 4 127.0.0.1 >nul\r\n"
        "taskkill /IM %s /F >nul 2>&1\r\n"
        "ping -n 2 127.0.0.1 >nul\r\n"
        "rmdir /s /q \"%s\"\r\n"
        "echo EXIT=%%ERRORLEVEL%% >>\"%s\"\r\n"
        "if exist \"%s\" (echo STILL_THERE >>\"%s\") else (echo REMOVED >>\"%s\")\r\n"
        "del \"%%~f0\"\r\n"
    ) % (EXE_NAME, target, log, target, log, log)
    try:
        with open(bat, "w", encoding="mbcs", errors="replace") as f:
            f.write(script)
        subprocess.Popen(["cmd.exe", "/d", "/c", bat],
                         creationflags=0x00000008,  # DETACHED_PROCESS
                         close_fds=True)
    except Exception:
        try:
            subprocess.Popen('ping -n 4 127.0.0.1 >nul & rmdir /s /q "%s"' % target,
                             shell=True, creationflags=0x00000008, close_fds=True)
        except Exception:
            pass


def run_uninstall():
    silent = ("--silent" in sys.argv) or ("/S" in sys.argv)
    root = tk.Tk()
    root.withdraw()
    target = install_dir()
    if not silent:
        if not messagebox.askyesno("卸载 %s" % APP_NAME,
                                   "将从以下位置卸载 %s：\n%s\n\n个人数据（好感度存档）会被保留在\n%%APPDATA%%\\UmaPet\n\n确定继续？" % (APP_NAME, target)):
            root.destroy()
            return

    errors = []
    try:
        subprocess.run(["taskkill", "/IM", EXE_NAME, "/F"], capture_output=True,
                       creationflags=0x08000000)
    except Exception:
        pass

    for lnk in (os.path.join(desktop_dir(), APP_NAME + ".lnk"),
                os.path.join(start_menu_dir(), APP_NAME, APP_NAME + ".lnk")):
        try:
            if os.path.exists(lnk):
                os.remove(lnk)
        except Exception as e:
            errors.append(str(e))
    try:
        sm = os.path.join(start_menu_dir(), APP_NAME)
        if os.path.isdir(sm) and not os.listdir(sm):
            os.rmdir(sm)
    except Exception:
        pass

    try:
        winreg.DeleteKey(winreg.HKEY_CURRENT_USER,
                         r"Software\Microsoft\Windows\CurrentVersion\Uninstall\%s" % APP_ID)
    except Exception:
        pass
    try:
        key = winreg.OpenKey(winreg.HKEY_CURRENT_USER,
                             r"Software\Microsoft\Windows\CurrentVersion\Run", 0,
                             winreg.KEY_ALL_ACCESS)
        winreg.DeleteValue(key, APP_ID)
        winreg.CloseKey(key)
    except Exception:
        pass

    _schedule_removal(target)
    if not silent:
        messagebox.showinfo("卸载完成", "%s 已卸载。\n\n存档仍保留在 %%APPDATA%%\\UmaPet，如需彻底清除请手动删除该文件夹。" % APP_NAME)
    root.destroy()


if __name__ == "__main__":
    run_uninstall()
