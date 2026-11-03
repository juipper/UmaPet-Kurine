# -*- coding: utf-8 -*-
"""赛马娘桌宠 - Windows 安装向导（tkinter）

构建方式见 scripts/build_windows.py：
  PyInstaller --onefile --windowed --add-data "payload.zip;." ...
"""
import os
import queue
import shutil
import subprocess
import sys
import tempfile
import threading
import time
import winreg
import zipfile

import tkinter as tk
from tkinter import ttk, filedialog, messagebox

APP_NAME = "赛马娘桌宠"
APP_VERSION = "1.0.0"
APP_ID = "UmaPetKurine"
EXE_NAME = "UmaPet.exe"
UNINST_NAME = "卸载.exe"
PUBLISHER = "Kurine Project"


def resource(name):
    base = getattr(sys, "_MEIPASS", os.path.dirname(os.path.abspath(__file__)))
    return os.path.join(base, name)


def default_target():
    base = os.environ.get("LOCALAPPDATA") or os.path.expanduser("~")
    return os.path.join(base, "Programs", "UmaPet")


def desktop_dir():
    d = os.path.join(os.path.expanduser("~"), "Desktop")
    if not os.path.isdir(d):
        d = os.path.join(os.path.expanduser("~"), "桌面")
    return d


def start_menu_dir():
    base = os.environ.get("APPDATA") or os.path.expanduser("~")
    return os.path.join(base, "Microsoft", "Windows", "Start Menu", "Programs")


def make_shortcut(lnk_path, target, workdir, icon, desc):
    """通过临时 PowerShell 脚本创建 .lnk（避免中文命令行编码问题）"""
    ps = (
        "$W = New-Object -ComObject WScript.Shell\n"
        "$s = $W.CreateShortcut('%s')\n"
        "$s.TargetPath = '%s'\n"
        "$s.WorkingDirectory = '%s'\n"
        "$s.IconLocation = '%s'\n"
        "$s.Description = '%s'\n"
        "$s.Save()\n"
    ) % (lnk_path.replace("'", "''"), target.replace("'", "''"),
         workdir.replace("'", "''"), icon.replace("'", "''"), desc.replace("'", "''"))
    fd, path = tempfile.mkstemp(suffix=".ps1")
    os.close(fd)
    with open(path, "w", encoding="utf-8-sig") as f:
        f.write(ps)
    try:
        subprocess.run(["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass",
                        "-File", path], capture_output=True, creationflags=0x08000000)
    finally:
        try:
            os.remove(path)
        except Exception:
            pass


def write_uninstall_reg(target, size_kb):
    key_path = r"Software\Microsoft\Windows\CurrentVersion\Uninstall\%s" % APP_ID
    with winreg.CreateKey(winreg.HKEY_CURRENT_USER, key_path) as k:
        winreg.SetValueEx(k, "DisplayName", 0, winreg.REG_SZ, APP_NAME)
        winreg.SetValueEx(k, "DisplayVersion", 0, winreg.REG_SZ, APP_VERSION)
        winreg.SetValueEx(k, "Publisher", 0, winreg.REG_SZ, PUBLISHER)
        winreg.SetValueEx(k, "DisplayIcon", 0, winreg.REG_SZ, os.path.join(target, EXE_NAME))
        winreg.SetValueEx(k, "InstallLocation", 0, winreg.REG_SZ, target)
        winreg.SetValueEx(k, "UninstallString", 0, winreg.REG_SZ,
                          '"%s" --uninstall' % os.path.join(target, UNINST_NAME))
        winreg.SetValueEx(k, "NoModify", 0, winreg.REG_DWORD, 1)
        winreg.SetValueEx(k, "NoRepair", 0, winreg.REG_DWORD, 1)
        winreg.SetValueEx(k, "EstimatedSize", 0, winreg.REG_DWORD, int(size_kb))


def install_core(target, want_desktop, want_autostart, progress=None):
    """安装核心逻辑：解压 + 快捷方式 + 注册表"""
    def tick(v, msg):
        if progress:
            progress(v, msg)

    payload = resource("payload.zip")
    if not os.path.exists(payload):
        raise RuntimeError("安装包数据缺失（payload.zip）")
    if os.path.isdir(target) and os.listdir(target):
        for name in os.listdir(target):
            p = os.path.join(target, name)
            if os.path.isdir(p):
                shutil.rmtree(p, ignore_errors=True)
            else:
                try:
                    os.remove(p)
                except Exception:
                    pass
    os.makedirs(target, exist_ok=True)

    with zipfile.ZipFile(payload) as zf:
        names = zf.namelist()
        total = max(1, len(names))
        for i, n in enumerate(names):
            zf.extract(n, target)
            if i % 15 == 0:
                tick(100.0 * i / total, "正在解压文件 %d/%d" % (i, total))

    tick(96, "正在创建快捷方式…")
    exe = os.path.join(target, EXE_NAME)
    icon = os.path.join(target, "assets", "ui", "icon.ico")
    if not os.path.exists(icon):
        icon = exe
    if want_desktop:
        make_shortcut(os.path.join(desktop_dir(), APP_NAME + ".lnk"), exe, target, icon, APP_NAME)
    sm = os.path.join(start_menu_dir(), APP_NAME)
    os.makedirs(sm, exist_ok=True)
    make_shortcut(os.path.join(sm, APP_NAME + ".lnk"), exe, target, icon, APP_NAME)

    size_kb = sum(os.path.getsize(os.path.join(dp2, f))
                  for dp2, dn2, fn2 in os.walk(target) for f in fn2) // 1024
    write_uninstall_reg(target, size_kb)
    if want_autostart:
        set_run_key(exe, True)
    return target


def set_run_key(exe, enable):
    try:
        key = winreg.OpenKey(winreg.HKEY_CURRENT_USER,
                             r"Software\Microsoft\Windows\CurrentVersion\Run", 0,
                             winreg.KEY_ALL_ACCESS)
        if enable:
            winreg.SetValueEx(key, APP_ID, 0, winreg.REG_SZ, '"%s"' % exe)
        else:
            try:
                winreg.DeleteValue(key, APP_ID)
            except FileNotFoundError:
                pass
        winreg.CloseKey(key)
    except Exception:
        pass


class Installer(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title("%s 安装程序 v%s" % (APP_NAME, APP_VERSION))
        self.geometry("560x360")
        self.resizable(False, False)
        self.configure(bg="#FFF9FB")
        try:
            ico = resource("icon.ico")
            if os.path.exists(ico):
                self.iconbitmap(ico)
        except Exception:
            pass

        self.q = queue.Queue()
        self.target_var = tk.StringVar(value=default_target())
        self.desktop_var = tk.BooleanVar(value=True)
        self.launch_var = tk.BooleanVar(value=True)
        self.autostart_var = tk.BooleanVar(value=False)
        self.installing = False

        self._build_ui()
        self.after(80, self._poll)

    # ---------- UI ----------
    def _build_ui(self):
        head = tk.Frame(self, bg="#FF8FB1", height=86)
        head.pack(fill="x")
        head.pack_propagate(False)
        tk.Label(head, text=APP_NAME, bg="#FF8FB1", fg="white",
                 font=("Microsoft YaHei UI", 20, "bold")).pack(anchor="w", padx=22, pady=(16, 0))
        tk.Label(head, text="栗音 Kurine · 桌面马娘 v%s" % APP_VERSION, bg="#FF8FB1", fg="#FFF0F5",
                 font=("Microsoft YaHei UI", 10)).pack(anchor="w", padx=24)

        body = tk.Frame(self, bg="#FFF9FB")
        body.pack(fill="both", expand=True, padx=22, pady=14)

        tk.Label(body, text="安装位置", bg="#FFF9FB", fg="#48301F",
                 font=("Microsoft YaHei UI", 10)).pack(anchor="w")
        row = tk.Frame(body, bg="#FFF9FB")
        row.pack(fill="x", pady=(4, 10))
        tk.Entry(row, textvariable=self.target_var, font=("Microsoft YaHei UI", 9),
                 relief="solid", bd=1).pack(side="left", fill="x", expand=True, ipady=4)
        tk.Button(row, text="浏览", command=self._browse, font=("Microsoft YaHei UI", 9),
                  bg="#E7EAF3", relief="flat", width=6).pack(side="left", padx=(8, 0))

        for text, var in (("创建桌面快捷方式", self.desktop_var),
                          ("安装完成后立即启动栗音", self.launch_var),
                          ("开机自动启动", self.autostart_var)):
            tk.Checkbutton(body, text=text, variable=var, bg="#FFF9FB", fg="#48301F",
                           activebackground="#FFF9FB", font=("Microsoft YaHei UI", 9),
                           anchor="w").pack(fill="x")

        self.bar = ttk.Progressbar(body, mode="determinate", maximum=100)
        self.bar.pack(fill="x", pady=(14, 6))

        self.status = tk.Label(body, text="准备就绪，点击下方按钮开始安装。", bg="#FFF9FB",
                               fg="#7A6A60", font=("Microsoft YaHei UI", 9), anchor="w")
        self.status.pack(fill="x")

        bottom = tk.Frame(self, bg="#FFF9FB")
        bottom.pack(fill="x", padx=22, pady=(0, 16))
        self.btn = tk.Button(bottom, text="开始安装", command=self._start,
                             bg="#8A5CF6", fg="white", relief="flat",
                             font=("Microsoft YaHei UI", 11, "bold"), width=14, height=1)
        self.btn.pack(side="right", ipady=4)
        tk.Button(bottom, text="取消", command=self.destroy, bg="#E7EAF3", fg="#48301F",
                  relief="flat", font=("Microsoft YaHei UI", 10), width=8).pack(side="right", padx=8, ipady=4)

    def _browse(self):
        d = filedialog.askdirectory(initialdir=self.target_var.get() or os.path.expanduser("~"))
        if d:
            self.target_var.set(os.path.join(d, "UmaPet"))

    # ---------- 安装 ----------
    def _start(self):
        if self.installing:
            return
        self.installing = True
        self.btn.config(state="disabled", text="安装中…")
        t = threading.Thread(target=self._install_worker,
                             args=(self.target_var.get(), self.desktop_var.get(),
                                   self.autostart_var.get()), daemon=True)
        t.start()

    def _install_worker(self, target, want_desktop, want_autostart):
        try:
            install_core(target, want_desktop, want_autostart,
                         lambda v, m: self.q.put(("p", v, m)))
            self.q.put(("done", 100, target))
        except Exception as e:
            self.q.put(("err", 0, str(e)))

    def _poll(self):
        try:
            while True:
                kind, val, msg = self.q.get_nowait()
                if kind == "p":
                    self.bar["value"] = val
                    self.status.config(text=msg)
                elif kind == "done":
                    self.bar["value"] = 100
                    self.status.config(text="安装完成")
                    self.btn.config(text="完成", state="normal", command=self._finish, bg="#FF8FB1")
                    self.target_dir = msg
                elif kind == "err":
                    self.installing = False
                    self.btn.config(text="重试", state="normal", bg="#8A5CF6")
                    self.status.config(text="安装失败")
                    messagebox.showerror("安装失败", msg)
        except queue.Empty:
            pass
        self.after(80, self._poll)

    def _finish(self):
        if self.launch_var.get():
            try:
                subprocess.Popen([os.path.join(self.target_dir, EXE_NAME)],
                                 cwd=self.target_dir, close_fds=True)
            except Exception:
                pass
        self.destroy()


def main():
    args = sys.argv[1:]
    if "--silent" in args or "/S" in args:
        target = default_target()
        if "--target" in args:
            i = args.index("--target")
            if i + 1 < len(args):
                target = args[i + 1]
        try:
            install_core(target, "--no-desktop" not in args, "--autostart" in args)
            log = os.path.join(os.environ.get("LOCALAPPDATA") or tempfile.gettempdir(), "UmaPet_setup.log")
            with open(log, "w", encoding="utf-8") as f:
                f.write("OK\n%s\n" % target)
        except Exception as e:
            log = os.path.join(os.environ.get("LOCALAPPDATA") or tempfile.gettempdir(), "UmaPet_setup.log")
            with open(log, "w", encoding="utf-8") as f:
                f.write("ERR\n%s\n" % e)
        return
    app = Installer()
    app.mainloop()


if __name__ == "__main__":
    main()
