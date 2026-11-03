# -*- coding: utf-8 -*-
"""
栗音 Kurine - 赛马娘桌宠形象帧生成器
Pillow 4x 超采样绘制 Q 版原创马娘，输出各状态动画帧 PNG + 应用图标。
用法: python tools/render_sprites.py
"""
import os
import math
from PIL import Image, ImageDraw, ImageFilter

S = 6                    # 超采样倍率
W, H = 600, 800          # 最终单帧尺寸（2x 高分辨率源，运行期逻辑尺寸 300x400）
SCALE = 2                # 相对逻辑尺寸的倍率
BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ASSETS = os.path.join(BASE, "assets")

# ---------------- 配色 ----------------
HAIR      = (110, 70, 48, 255)
HAIR_DARK = (78, 47, 32, 255)
HAIR_LT   = (152, 104, 72, 255)
SKIN      = (255, 227, 208, 255)
SKIN_SH   = (244, 198, 176, 255)
WHITE     = (255, 255, 255, 255)
WHITE_SH  = (224, 229, 243, 255)
PINK      = (255, 143, 177, 255)
PINK_DK   = (232, 104, 143, 255)
NAVY      = (58, 74, 143, 255)
NAVY_DK   = (42, 54, 106, 255)
GOLD      = (245, 197, 66, 255)
IRIS      = (138, 92, 246, 255)
IRIS_LT   = (180, 146, 255, 255)
IRIS_DK   = (76, 46, 158, 255)
BLUSH     = (255, 130, 145, 120)
LINE      = (72, 44, 30, 255)


def px(v):
    return int(round(v * S))


def layer():
    return Image.new("RGBA", (W * S, H * S), (0, 0, 0, 0))


def pts2(pts):
    return [(x * S, y * S) for x, y in pts]


def bez(p0, p1, p2, p3, n=40):
    out = []
    for i in range(n + 1):
        t = i / n
        u = 1 - t
        x = u**3*p0[0] + 3*u*u*t*p1[0] + 3*u*t*t*p2[0] + t**3*p3[0]
        y = u**3*p0[1] + 3*u*u*t*p1[1] + 3*u*t*t*p2[1] + t**3*p3[1]
        out.append((x, y))
    return out


def taper(d, path, w0, w1, color):
    """变宽笔触，用于发束/尾巴"""
    n = len(path)
    left, right = [], []
    for i, (x, y) in enumerate(path):
        t = i / max(1, n - 1)
        w = w0 + (w1 - w0) * t
        if i < n - 1:
            nx, ny = path[i+1][0] - x, path[i+1][1] - y
        else:
            nx, ny = x - path[i-1][0], y - path[i-1][1]
        ln = math.hypot(nx, ny) or 1.0
        ox, oy = -ny/ln*w/2, nx/ln*w/2
        left.append((x+ox, y+oy))
        right.append((x-ox, y-oy))
    d.polygon(pts2(left + right[::-1]), fill=color)


# ---------------- 部件 ----------------
def draw_horse_tail(d, swing=0.0):
    off = 20 * swing
    base = (152, 268)
    taper(d, bez(base, (116+off, 292), (70+off*1.3, 302), (50+off*1.7, 344)), 26, 7, HAIR_DARK)
    taper(d, bez((150, 274), (118+off, 302), (86+off, 322), (72+off*1.5, 356)), 15, 5, HAIR)


def draw_ponytail(d, swing=0.0, lift=0.0):
    off = 20 * swing
    taper(d, bez((184, 96), (240+off, 100-lift), (258+off, 168-lift), (214+off*1.2, 226)), 40, 8, HAIR_DARK)
    taper(d, bez((186, 104), (232+off, 110), (248+off, 168), (210+off, 214)), 26, 5, HAIR)
    taper(d, bez((190, 112), (224+off, 122), (234+off, 158), (206+off, 192)), 9, 3, HAIR_LT)


def draw_head_back(d):
    d.ellipse((px(86), px(58), px(214), px(202)), fill=HAIR_DARK)
    d.ellipse((px(90), px(62), px(210), px(196)), fill=HAIR)


def draw_ear(d, side, angle=0.0):
    """side: -1 左 / 1 右；angle>0 前折，<0 后折"""
    root = (112, 82) if side < 0 else (188, 82)
    tip = (70, 24) if side < 0 else (230, 24)
    rad = math.radians(angle * side)
    dx, dy = tip[0]-root[0], tip[1]-root[1]
    bx = dx*math.cos(rad) - dy*math.sin(rad)
    by = dx*math.sin(rad) + dy*math.cos(rad)
    t = (root[0]+bx, root[1]+by)
    outer_c = (root[0] + side*36, root[1] + 20)
    d.polygon(pts2([root, t, outer_c]), fill=HAIR_DARK)
    d.polygon(pts2([(root[0]+side*4, root[1]-2), t, (outer_c[0]-side*6, outer_c[1]-4)]), fill=HAIR)
    d.ellipse((px(t[0]-9), px(t[1]-9), px(t[0]+9), px(t[1]+9)), fill=HAIR)
    # 内耳
    ir = (root[0]+side*6, root[1]+2)
    it = (root[0]+bx*0.66, root[1]+by*0.66)
    d.polygon(pts2([ir, it, (root[0]+side*24, root[1]+16)]), fill=(255, 196, 200, 255))
    # 耳罩
    d.rounded_rectangle((px(root[0]-18), px(root[1]-3), px(root[0]+18), px(root[1]+15)),
                        radius=px(7), fill=WHITE, outline=(222, 222, 234, 255), width=px(1))
    if side < 0:
        d.ellipse((px(root[0]-30), px(root[1]+1), px(root[0]-14), px(root[1]+15)), fill=PINK)
        d.ellipse((px(root[0]-26), px(root[1]+5), px(root[0]-18), px(root[1]+11)), fill=PINK_DK)


def draw_face(d):
    d.ellipse((px(92), px(66), px(208), px(196)), fill=SKIN)
    d.ellipse((px(104), px(146), px(196), px(200)), fill=SKIN)
    # 下巴阴影
    sh = layer()
    ImageDraw.Draw(sh).ellipse((px(100), px(160), px(200), px(206)), fill=SKIN_SH)
    sh = sh.filter(ImageFilter.GaussianBlur(px(9)))
    d.bitmap((0, 0), sh.split()[3], fill=SKIN_SH)


def draw_eye(d, cx, cy, expr="open", look=(0.0, 0.0)):
    lw = px(4)
    if expr in ("blink", "happy"):
        span = 12 if expr == "happy" else 9
        d.arc((px(cx-16), px(cy-10), px(cx+16), px(cy+span)), 200, 340, fill=LINE, width=lw)
        d.line(pts2([(cx-16, cy-6), (cx-21, cy-11)]), fill=LINE, width=lw)
        return
    d.ellipse((px(cx-15), px(cy-19), px(cx+15), px(cy+19)), fill=WHITE)
    ix = cx + look[0]*5
    iy = cy + look[1]*4
    d.ellipse((px(ix-12), px(iy-16), px(ix+12), px(iy+17)), fill=IRIS)
    d.ellipse((px(ix-12), px(iy+2), px(ix+12), px(iy+17)), fill=IRIS_LT)
    d.ellipse((px(ix-6), px(iy-5), px(ix+6), px(iy+9)), fill=IRIS_DK)
    d.ellipse((px(ix-9), px(iy-14), px(ix-1), px(iy-5)), fill=(255, 255, 255, 240))
    d.ellipse((px(ix+3), px(iy+4), px(ix+7), px(iy+9)), fill=(255, 255, 255, 190))
    d.arc((px(cx-16), px(cy-20), px(cx+16), px(cy+10)), 185, 355, fill=LINE, width=lw+px(1))
    d.line(pts2([(cx-16, cy-11), (cx-22, cy-17)]), fill=LINE, width=lw)
    d.line(pts2([(cx+16, cy-11), (cx+22, cy-16)]), fill=LINE, width=px(3))
    if expr == "half":
        d.rectangle((px(cx-18), px(cy-24), px(cx+18), px(cy-3)), fill=SKIN)
        d.arc((px(cx-16), px(cy-20), px(cx+16), px(cy+10)), 185, 355, fill=LINE, width=lw+px(1))


def draw_brow(d, cx, cy, mood):
    if mood == "angry":
        d.line(pts2([(cx-13, cy-3), (cx+11, cy+5)]), fill=HAIR_DARK, width=px(3))
    elif mood == "sad":
        d.line(pts2([(cx-13, cy+5), (cx+11, cy-3)]), fill=HAIR_DARK, width=px(3))
    else:
        d.arc((px(cx-13), px(cy-8), px(cx+13), px(cy+8)), 200, 340, fill=HAIR_DARK, width=px(3))


def draw_mouth(d, expr):
    cx, cy = 150, 180
    if expr == "smile":
        d.arc((px(cx-12), px(cy-8), px(cx+12), px(cy+8)), 20, 160, fill=PINK_DK, width=px(3))
    elif expr == "grin":
        d.chord((px(cx-14), px(cy-9), px(cx+14), px(cy+13)), 0, 180, fill=(176, 68, 90, 255))
        d.rectangle((px(cx-12), px(cy-9), px(cx+12), px(cy-4)), fill=WHITE)
    elif expr == "open":
        d.ellipse((px(cx-9), px(cy-5), px(cx+9), px(cy+13)), fill=(176, 68, 90, 255))
        d.ellipse((px(cx-6), px(cy+3), px(cx+6), px(cy+11)), fill=(240, 132, 142, 255))
    elif expr == "pout":
        d.arc((px(cx-10), px(cy+1), px(cx+10), px(cy+14)), 200, 340, fill=PINK_DK, width=px(3))
    elif expr == "flat":
        d.line(pts2([(cx-7, cy+4), (cx+7, cy+4)]), fill=PINK_DK, width=px(3))
    else:
        d.arc((px(cx-9), px(cy-6), px(cx+9), px(cy+7)), 20, 160, fill=PINK_DK, width=px(3))


def draw_bangs(d):
    body = [(88, 100), (88, 78), (106, 60), (150, 55), (194, 60), (212, 78), (212, 100),
            (202, 112), (190, 88), (176, 110), (162, 86), (150, 108), (136, 84),
            (122, 110), (110, 88), (98, 112)]
    d.polygon(pts2(body), fill=HAIR)
    d.arc((px(106), px(60), px(194), px(122)), 200, 340, fill=HAIR_LT, width=px(4))
    taper(d, bez((94, 96), (78, 152), (80, 190), (92, 216)), 22, 9, HAIR)
    taper(d, bez((206, 96), (222, 152), (220, 190), (208, 216)), 22, 9, HAIR)


def draw_body(d, pose="stand", dy=0.0, arm_up=False):
    # 腿
    if pose == "walk_a":
        legs = [(128, 292, 116, 334), (156, 292, 174, 330)]
    elif pose == "walk_b":
        legs = [(126, 292, 140, 332), (158, 292, 168, 336)]
    elif pose == "dangle":
        legs = [(126, 290, 118, 328), (158, 290, 168, 332)]
    elif pose == "crouch":
        legs = [(126, 292, 122, 326), (158, 292, 164, 326)]
    else:
        legs = [(127, 292, 130, 338), (157, 292, 160, 338)]
    for x1, y1, x2, y2 in legs:
        d.line(pts2([(x1, y1+dy), (x2, y2+dy)]), fill=SKIN, width=px(17))
        d.rounded_rectangle((px(x2-11), px(y2-10+dy), px(x2+11), px(y2+12+dy)), radius=px(5), fill=WHITE)
        d.rectangle((px(x2-11), px(y2-3+dy), px(x2+11), px(y2+2+dy)), fill=PINK)
        d.rounded_rectangle((px(x2-13), px(y2+7+dy), px(x2+13), px(y2+14+dy)), radius=px(3), fill=WHITE_SH)

    # 裙裤
    d.polygon(pts2([(108, 250+dy), (192, 250+dy), (204, 292+dy), (96, 292+dy)]), fill=NAVY)
    d.polygon(pts2([(108, 250+dy), (192, 250+dy), (197, 262+dy), (103, 262+dy)]), fill=NAVY_DK)

    # 上身
    d.rounded_rectangle((px(110), px(194+dy), px(190), px(262+dy)), radius=px(16), fill=WHITE)
    d.polygon(pts2([(132, 196+dy), (168, 196+dy), (150, 226+dy)]), fill=PINK)
    for side in (-1, 1):
        sx = 150 + side*40
        d.rounded_rectangle((px(sx-12), px(198+dy), px(sx+12), px(236+dy)), radius=px(9), fill=WHITE_SH)
        if arm_up and side > 0:
            d.line(pts2([(sx, 226+dy), (sx+16, 196+dy)]), fill=SKIN, width=px(15))
            d.ellipse((px(sx+10), px(186+dy), px(sx+28), px(204+dy)), fill=SKIN)
        else:
            d.line(pts2([(sx, 230+dy), (sx+side*4, 262+dy)]), fill=SKIN, width=px(15))
            d.ellipse((px(sx+side*4-9), px(256+dy), px(sx+side*4+9), px(272+dy)), fill=SKIN)
    d.ellipse((px(142), px(190+dy), px(158), px(204+dy)), fill=PINK_DK)
    for i in range(3):
        d.ellipse((px(146), px(222+i*12+dy), px(154), px(230+i*12+dy)), fill=GOLD)


def add_heart(img, cx, cy, s=10, alpha=235):
    d = ImageDraw.Draw(img)
    col = (255, 105, 140, alpha)
    d.ellipse((px(cx-s), px(cy-s*0.6), px(cx), px(cy+s*0.4)), fill=col)
    d.ellipse((px(cx), px(cy-s*0.6), px(cx+s), px(cy+s*0.4)), fill=col)
    d.polygon(pts2([(cx-s*0.95, cy+s*0.1), (cx+s*0.95, cy+s*0.1), (cx, cy+s)]), fill=col)


def add_zzz(img, cx, cy, alpha=225):
    d = ImageDraw.Draw(img)
    for i, (dx, dyy, sc) in enumerate([(0, 0, 1.0), (18, -20, 0.78), (33, -38, 0.58)]):
        s = sc * 9
        col = (118, 138, 226, int(alpha * (1 - i*0.22)))
        d.line(pts2([(cx+dx-s, cy+dyy-s), (cx+dx+s, cy+dyy-s),
                     (cx+dx-s, cy+dyy+s), (cx+dx+s, cy+dyy+s)]), fill=col, width=px(3))


def add_mark(img, cx, cy, kind="excl"):
    d = ImageDraw.Draw(img)
    if kind == "excl":
        d.rounded_rectangle((px(cx-4), px(cy-19), px(cx+4), px(cy+3)), radius=px(4), fill=(255, 194, 58, 255))
        d.ellipse((px(cx-5), px(cy+7), px(cx+5), px(cy+17)), fill=(255, 194, 58, 255))
    elif kind == "moon":
        d.ellipse((px(cx-13), px(cy-13), px(cx+13), px(cy+13)), fill=(255, 244, 190, 240))
        d.ellipse((px(cx-4), px(cy-18), px(cx+20), px(cy+8)), fill=(0, 0, 0, 0))


# ---------------- 渲染 ----------------
def render(ear_l=0.0, ear_r=0.0, eye="open", mouth="smile", blush=False,
           dy=0.0, pose="stand", tail=0.0, pony=0.0, arm_up=False,
           hearts=0, zzz=False, mark=None, tilt=0.0, look=(0.0, 0.0), mood="normal"):
    img = layer()
    d = ImageDraw.Draw(img)

    draw_horse_tail(d, tail)
    draw_ponytail(d, pony, lift=dy*2)
    draw_head_back(d)

    body = layer()
    draw_body(ImageDraw.Draw(body), pose, dy, arm_up)

    head = layer()
    dh = ImageDraw.Draw(head)
    draw_face(dh)
    draw_ear(dh, -1, ear_l)
    draw_ear(dh, 1, ear_r)
    draw_eye(dh, 124, 142, eye, look)
    draw_eye(dh, 176, 142, eye, look)
    draw_brow(dh, 124, 120, mood)
    draw_brow(dh, 176, 120, mood)
    if blush:
        ov = layer()
        do = ImageDraw.Draw(ov)
        do.ellipse((px(96), px(158), px(126), px(176)), fill=BLUSH)
        do.ellipse((px(174), px(158), px(204), px(176)), fill=BLUSH)
        head.alpha_composite(ov.filter(ImageFilter.GaussianBlur(px(4))))
        dh = ImageDraw.Draw(head)
    draw_mouth(dh, mouth)
    draw_bangs(dh)

    if abs(tilt) > 0.1:
        head = head.rotate(tilt, resample=Image.BICUBIC, center=(px(150), px(210)))

    img.alpha_composite(body)
    img.alpha_composite(head)

    for i in range(hearts):
        add_heart(img, 214 + i*14, 58 - i*22, 9, 240 - i*40)
    if zzz:
        add_zzz(img, 214, 74)
    if mark:
        add_mark(img, 240, 62, mark)

    return img.resize((W, H), Image.LANCZOS)


# ---------------- 帧定义 ----------------
FRAMES = {}

# idle: 呼吸 4 帧
for i, dy in enumerate([0, 1.4, 2.4, 1.4]):
    FRAMES[f"idle/{i}"] = dict(dy=dy, tail=0.18*math.sin(i*1.2), pony=0.15*math.sin(i*1.2+0.6))

# blink 2
for i in range(2):
    FRAMES[f"blink/{i}"] = dict(eye="blink", dy=1.0, tail=0.1, pony=0.1)

# happy 6
for i in range(6):
    FRAMES[f"happy/{i}"] = dict(ear_l=30, ear_r=30, eye="happy", mouth="grin", blush=True,
                                dy=1.0 + (1.2 if i % 2 else 0), tail=0.5, pony=0.4,
                                hearts=min(3, i // 2 + 1), arm_up=(i >= 2))

# shy 3
for i in range(3):
    FRAMES[f"shy/{i}"] = dict(ear_l=18, ear_r=-4, eye="open", mouth="pout", blush=True,
                              dy=1.0, tail=0.3, pony=0.15, look=(0.7, 0.2))

# angry 3
for i in range(3):
    FRAMES[f"angry/{i}"] = dict(ear_l=-42, ear_r=-42, eye="open", mouth="pout", blush=False,
                                dy=0.6, tail=0.6, pony=0.5, mood="angry", look=(0, 0))

# sad 2
for i in range(2):
    FRAMES[f"sad/{i}"] = dict(ear_l=-30, ear_r=-30, eye="open", mouth="flat", dy=1.6,
                              tail=-0.2, pony=-0.15, mood="sad", look=(0, 0.6))

# sleepy 3
for i in range(3):
    FRAMES[f"sleepy/{i}"] = dict(ear_l=-16, ear_r=-16, eye="half", mouth="open" if i == 1 else "flat",
                                 dy=0.4, tail=0.05, pony=0.05, mood="sad")

# sleep 2
for i in range(2):
    FRAMES[f"sleep/{i}"] = dict(ear_l=-22, ear_r=-22, eye="blink", mouth="flat", dy=0.8 + i*0.8,
                                tail=0.05, pony=0.05, zzz=True)

# drag 2
for i in range(2):
    FRAMES[f"drag/{i}"] = dict(eye="open", mouth="open", pose="dangle", ear_l=-12, ear_r=-12,
                               tail=0.7*(-1)**i, pony=0.55*(-1)**i, look=(0, 0.5))

# land 2
FRAMES["land/0"] = dict(eye="blink", mouth="open", pose="crouch", dy=7, ear_l=-6, ear_r=-6)
FRAMES["land/1"] = dict(eye="open", mouth="smile", pose="stand", dy=2, ear_l=4, ear_r=4)

# walk 4
for i, pose in enumerate(["walk_a", "stand", "walk_b", "stand"]):
    FRAMES[f"walk/{i}"] = dict(pose=pose, dy=(0.6 if i % 2 else 0), tail=0.35*math.sin(i), pony=0.3*math.sin(i))

# wave 3
for i in range(3):
    FRAMES[f"wave/{i}"] = dict(ear_l=16, ear_r=10, eye="open", mouth="smile", arm_up=True,
                               dy=0.8 + 0.8*(i % 2), tail=0.3, pony=0.2)

# remind 2
for i in range(2):
    FRAMES[f"remind/{i}"] = dict(ear_l=22, ear_r=22, eye="open", mouth="open", mark="excl",
                                 dy=0.5 + i*1.5, tail=0.4, pony=0.3)

# lonely 2
for i in range(2):
    FRAMES[f"lonely/{i}"] = dict(ear_l=-34, ear_r=-34, eye="open", mouth="flat", dy=1.8,
                                 tail=-0.15, pony=-0.1, mood="sad", look=(0, 0.7))


def build():
    total = 0
    for key, kw in FRAMES.items():
        name, idx = key.split("/")
        outdir = os.path.join(ASSETS, name)
        os.makedirs(outdir, exist_ok=True)
        img = render(**kw)
        img.save(os.path.join(outdir, f"{int(idx):02d}.png"))
        total += 1
    print(f"[OK] {total} frames -> {ASSETS}")

    # 应用图标
    os.makedirs(os.path.join(ASSETS, "ui"), exist_ok=True)
    icon = render(ear_l=25, ear_r=25, eye="open", mouth="smile", blush=True, look=(0, 0))
    bbox = icon.split()[3].getbbox()
    if bbox:
        head_box = (60, 20, 240, 230)
        crop = icon.crop(head_box).resize((256, 256), Image.LANCZOS)
        crop.save(os.path.join(ASSETS, "ui", "icon.png"))
        crop.save(os.path.join(ASSETS, "ui", "icon.ico"), sizes=[(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
    print("[OK] icon")


if __name__ == "__main__":
    build()
