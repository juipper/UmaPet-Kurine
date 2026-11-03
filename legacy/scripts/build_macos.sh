#!/usr/bin/env bash
# macOS 构建脚本：生成 .app 与 .dmg（必须在 macOS 上运行）
set -euo pipefail

cd "$(dirname "$0")/.."
VERSION="1.0.0"
APP_NAME="UmaPet"
DISPLAY_NAME="赛马娘桌宠"

echo "==> 安装依赖"
python3 -m pip install --upgrade pip
python3 -m pip install -r requirements.txt

echo "==> 生成图标 (.icns)"
python3 - <<'PY'
import os
from PIL import Image
src = os.path.join("assets", "ui", "icon.png")
out = os.path.join("build", "icon.iconset")
os.makedirs(out, exist_ok=True)
im = Image.open(src).convert("RGBA")
for size in (16, 32, 64, 128, 256, 512, 1024):
    im.resize((size, size), Image.LANCZOS).save(os.path.join(out, f"icon_{size}x{size}.png"))
    if size <= 512:
        im.resize((size * 2, size * 2), Image.LANCZOS).save(
            os.path.join(out, f"icon_{size}x{size}@2x.png"))
PY
iconutil -c icns "build/icon.iconset" -o "build/icon.icns"

echo "==> PyInstaller 打包"
python3 -m PyInstaller --noconfirm --clean --windowed \
    --name "$APP_NAME" \
    --icon "build/icon.icns" \
    --add-data "assets:assets" \
    --osx-bundle-identifier "com.kurine.umapet" \
    main.py

APP="dist/${APP_NAME}.app"
PLIST="$APP/Contents/Info.plist"

echo "==> 写入 LSUIElement（不在 Dock 显示）"
/usr/libexec/PlistBuddy -c "Delete :LSUIElement" "$PLIST" 2>/dev/null || true
/usr/libexec/PlistBuddy -c "Add :LSUIElement bool true" "$PLIST"
/usr/libexec/PlistBuddy -c "Delete :CFBundleDisplayName" "$PLIST" 2>/dev/null || true
/usr/libexec/PlistBuddy -c "Add :CFBundleDisplayName string ${DISPLAY_NAME}" "$PLIST"

echo "==> 生成 DMG"
mkdir -p release
STAGE="build/dmg_stage"
rm -rf "$STAGE"
mkdir -p "$STAGE"
cp -R "$APP" "$STAGE/"
ln -s /Applications "$STAGE/应用程序"
hdiutil create -volname "${DISPLAY_NAME}" -srcfolder "$STAGE" -ov -format UDZO \
    "release/${DISPLAY_NAME}_v${VERSION}_macOS.dmg"

echo "==> 完成"
ls -lh release/
