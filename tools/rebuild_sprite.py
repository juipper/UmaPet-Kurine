# -*- coding: utf-8 -*-
"""从原始 1060x1120 立绘重建角色贴图 assets/sprites/deg_000.png。

用法：
    python tools/rebuild_sprite.py                # 原图取自 git 提交 69d0f6d
    python tools/rebuild_sprite.py path/to/src.png

为什么要有这个脚本：
    v2.3.1 的裁切流程对整幅图做了连通域 3x3 开闭运算，把左腿当成"边缘碎片"清掉了，
    贴图里只剩一条腿。本脚本只做三件事——按固定框裁切、清理 alpha<10 的弱毛边、
    对半透明边缘做色溢填充，绝不改动角色本体像素。改图后按 tools/sprite_crop.json
    同步 src/renderer/js/spritechar.js 的常量。
"""

import io
import os
import subprocess
import sys

import numpy as np
from PIL import Image
from scipy import ndimage as ndi

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "assets", "sprites", "deg_000.png")
SRC_REV = "69d0f6d"          # 首次提交里的原始立绘（裁剪前）
CROP = (320, 61, 937, 1031)  # left, top, right, bottom -> 617x970


def load_source():
    if len(sys.argv) > 1:
        return Image.open(sys.argv[1]).convert("RGBA")
    data = subprocess.run(
        ["git", "show", f"{SRC_REV}:assets/sprites/deg_000.png"],
        cwd=ROOT, capture_output=True, check=True
    ).stdout
    return Image.open(io.BytesIO(data)).convert("RGBA")


def main():
    src = load_source()
    if src.size != (1060, 1120):
        raise SystemExit(f"源图尺寸 {src.size} 与预期 (1060, 1120) 不符，请确认裁切框")

    a = np.array(src.crop(CROP)).astype(np.uint8)
    alpha = a[:, :, 3].copy()
    alpha[alpha < 10] = 0

    # 色溢填充：把半透明边缘像素的 RGB 换成最近的不透明像素颜色，消除白边/灰边
    solid = alpha >= 128
    nearest = ndi.distance_transform_edt(~solid, return_distances=False, return_indices=True)
    filled = a[nearest[0], nearest[1], :3]
    edge = (~solid) & (alpha > 0)
    a[..., :3] = np.where(edge[..., None], filled, a[..., :3])
    a[:, :, 3] = alpha

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    Image.fromarray(a, "RGBA").save(OUT, optimize=True)

    ys, xs = np.where(alpha >= 128)
    rows = []
    for y in (900, 930, 960):
        idx = np.where(alpha[y] > 16)[0]
        segs = []
        if len(idx):
            start = prev = idx[0]
            for i in idx[1:]:
                if i - prev > 3:
                    segs.append((start, prev))
                    start = i
                prev = i
            segs.append((start, prev))
        rows.append(f"y={y}: {len(segs)} 段 {segs}")
    print(f"输出 {OUT} 尺寸 {a.shape[1]}x{a.shape[0]}")
    print(f"主体 bbox alpha>=128: x {xs.min()}-{xs.max()}, y {ys.min()}-{ys.max()}")
    print("腿部行分段（应为 2 段，两条腿都在）：")
    for r in rows:
        print("  " + r)


if __name__ == "__main__":
    main()
