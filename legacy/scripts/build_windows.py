# -*- coding: utf-8 -*-
"""Windows 构建脚本：打包应用 → 打包卸载器 → 生成 payload → 生成安装包

用法: python scripts/build_windows.py
产物: release/赛马娘桌宠_Setup_v1.0.0.exe
      release/UmaPet-Windows-Portable.zip
"""
import os
import shutil
import subprocess
import sys
import zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BUILD = os.path.join(ROOT, "build")
DIST = os.path.join(ROOT, "dist")
RELEASE = os.path.join(ROOT, "release")
VERSION = "1.0.0"
APP_DIR_NAME = "UmaPet"
EXE_NAME = "UmaPet.exe"


def run(cmd, cwd=ROOT):
    print("[build]", " ".join(cmd[:6]), "...")
    p = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True, errors="replace")
    if p.returncode != 0:
        print(p.stdout[-3000:])
        print(p.stderr[-3000:])
        raise SystemExit("构建失败: %s" % cmd[:4])
    return p


def pyinstaller(args):
    return run([sys.executable, "-m", "PyInstaller", "--noconfirm", "--clean"] + args)


def build():
    os.makedirs(RELEASE, exist_ok=True)
    icon = os.path.join(ROOT, "assets", "ui", "icon.ico")

    # 1) 主程序
    print("=== 1/4 打包主程序 ===")
    pyinstaller(["--windowed", "--name", APP_DIR_NAME, "--icon", icon,
                 "--add-data", "assets;assets", "main.py"])
    app_dir = os.path.join(DIST, APP_DIR_NAME)
    exe = os.path.join(app_dir, EXE_NAME)
    if not os.path.exists(exe):
        raise SystemExit("主程序未生成")

    # 2) 卸载器
    print("=== 2/4 打包卸载器 ===")
    pyinstaller(["--onefile", "--windowed", "--name", "unins",
                 "--icon", icon,
                 "--distpath", os.path.join(BUILD, "unins_dist"),
                 "--workpath", os.path.join(BUILD, "unins_work"),
                 "--specpath", os.path.join(BUILD, "unins_spec"),
                 os.path.join("installer", "uninstaller.py")])
    unins = os.path.join(BUILD, "unins_dist", "unins.exe")
    shutil.copy2(unins, os.path.join(app_dir, "卸载.exe"))

    # 3) 便携版 + payload
    print("=== 3/4 生成 payload ===")
    payload = os.path.join(BUILD, "payload.zip")
    portable = os.path.join(RELEASE, "UmaPet-Windows-Portable.zip")
    for path in (payload, portable):
        if os.path.exists(path):
            os.remove(path)
    with zipfile.ZipFile(payload, "w", zipfile.ZIP_DEFLATED, compresslevel=6) as zf:
        for dp, dn, fn in os.walk(app_dir):
            for f in fn:
                full = os.path.join(dp, f)
                rel = os.path.relpath(full, app_dir)
                zf.write(full, rel)
    shutil.copy2(payload, portable)
    print("payload MB:", round(os.path.getsize(payload) / 1048576, 1))

    # 4) 安装包
    print("=== 4/4 打包安装程序 ===")
    work = os.path.join(BUILD, "setup_work")
    dist = os.path.join(BUILD, "setup_dist")
    pyinstaller(["--onefile", "--windowed", "--name", "UmaPetSetup",
                 "--icon", icon,
                 "--add-data", "%s;." % payload,
                 "--add-data", "%s;." % icon,
                 "--distpath", dist,
                 "--workpath", work,
                 "--specpath", os.path.join(BUILD, "setup_spec"),
                 os.path.join("installer", "installer.py")])
    setup_exe = os.path.join(dist, "UmaPetSetup.exe")
    final = os.path.join(RELEASE, "赛马娘桌宠_Setup_v%s.exe" % VERSION)
    shutil.copy2(setup_exe, final)
    print("=== 完成 ===")
    print(final, round(os.path.getsize(final) / 1048576, 1), "MB")
    print(portable, round(os.path.getsize(portable) / 1048576, 1), "MB")


if __name__ == "__main__":
    build()
