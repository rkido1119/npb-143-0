#!/usr/bin/env python3
"""抽選箱イラスト(ユーザー提供JPEG)を透過PNG化して src/assets/ に出力。

- 外枠フレームをクロップ → 暗い背景(緑の縞)を外周からの連結成分で除去
  (箱の投入口の黒は内部なので残る)
- 最大連結成分(箱)だけ残して右下のスパークル等を除去
- 2枚の箱サイズを揃えて(箱幅基準でスケール)、同一キャンバスに底辺中央合わせ
  → ホバーで重ね替えてもズレない

usage: python3 scripts/make_box_assets.py <plain.jpeg> <paper.jpeg>
"""
import sys
from collections import deque

import numpy as np
from PIL import Image, ImageFilter

ROOT = __file__.rsplit("/scripts/", 1)[0]
OUT_PLAIN = f"{ROOT}/src/assets/lottery-box.png"
OUT_PAPER = f"{ROOT}/src/assets/lottery-box-paper.png"

FRAME_CROP = 48  # 外枠フレームを落とす
CANVAS = 560  # 出力キャンバス(正方形)
BOX_W = 360  # 揃える箱の幅
BOTTOM_PAD = 30


def flood_background(dark: np.ndarray) -> np.ndarray:
    """外周に接する dark 領域を BFS で背景としてマーク。"""
    h, w = dark.shape
    bg = np.zeros_like(dark, dtype=bool)
    q = deque()
    for x in range(w):
        for y in (0, h - 1):
            if dark[y, x] and not bg[y, x]:
                bg[y, x] = True
                q.append((y, x))
    for y in range(h):
        for x in (0, w - 1):
            if dark[y, x] and not bg[y, x]:
                bg[y, x] = True
                q.append((y, x))
    while q:
        y, x = q.popleft()
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            ny, nx = y + dy, x + dx
            if 0 <= ny < h and 0 <= nx < w and dark[ny, nx] and not bg[ny, nx]:
                bg[ny, nx] = True
                q.append((ny, nx))
    return bg


def largest_component(keep: np.ndarray) -> np.ndarray:
    """keep マスクの最大連結成分のみ残す(スパークル等の除去)。"""
    h, w = keep.shape
    labels = np.zeros((h, w), dtype=np.int32)
    best_label, best_size = 0, 0
    cur = 0
    for sy in range(h):
        for sx in range(w):
            if keep[sy, sx] and labels[sy, sx] == 0:
                cur += 1
                size = 0
                q = deque([(sy, sx)])
                labels[sy, sx] = cur
                while q:
                    y, x = q.popleft()
                    size += 1
                    for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                        ny, nx = y + dy, x + dx
                        if (
                            0 <= ny < h
                            and 0 <= nx < w
                            and keep[ny, nx]
                            and labels[ny, nx] == 0
                        ):
                            labels[ny, nx] = cur
                            q.append((ny, nx))
                if size > best_size:
                    best_size, best_label = size, cur
    return labels == best_label


def cutout(path: str) -> Image.Image:
    img = Image.open(path).convert("RGB")
    img = img.crop((FRAME_CROP, FRAME_CROP, img.width - FRAME_CROP, img.height - FRAME_CROP))
    # 処理を軽くするため一旦縮小
    img.thumbnail((640, 640), Image.LANCZOS)
    a = np.asarray(img).astype(np.int16)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    # 暗い緑系(縞含む)を背景候補に
    dark = (r < 120) & (b < 120) & (g < 135)
    bg = flood_background(dark)
    keep = largest_component(~bg)
    # 縁の緑ハロを1px削る
    k = keep.copy()
    nbg = ~k
    halo = k & (
        np.roll(nbg, 1, 0) | np.roll(nbg, -1, 0) | np.roll(nbg, 1, 1) | np.roll(nbg, -1, 1)
    )
    k = k & ~halo
    alpha = (k * 255).astype(np.uint8)
    out = Image.fromarray(np.dstack([a.astype(np.uint8), alpha]))
    # アルファを軽くぼかしてアンチエイリアス
    al = out.getchannel("A").filter(ImageFilter.GaussianBlur(0.8))
    out.putalpha(al)
    bbox = out.getbbox()
    return out.crop(bbox)


def box_metrics(img: Image.Image):
    """下半分(=箱本体)の最大幅と中心X、底辺Yを返す。"""
    al = np.asarray(img.getchannel("A")) > 40
    h = al.shape[0]
    lower = al[h // 2 :, :]
    cols = lower.any(axis=0)
    xs = np.where(cols)[0]
    width = xs[-1] - xs[0] + 1
    cx = (xs[0] + xs[-1]) / 2
    rows = np.where(al.any(axis=1))[0]
    bottom = rows[-1]
    return width, cx, bottom


def compose(img: Image.Image) -> Image.Image:
    w, cx, bottom = box_metrics(img)
    scale = BOX_W / w
    img = img.resize((round(img.width * scale), round(img.height * scale)), Image.LANCZOS)
    w2, cx2, bottom2 = box_metrics(img)
    canvas = Image.new("RGBA", (CANVAS, CANVAS), (0, 0, 0, 0))
    x = round(CANVAS / 2 - cx2)
    y = round(CANVAS - BOTTOM_PAD - bottom2)
    canvas.paste(img, (x, y), img)
    return canvas


def main():
    plain_src, paper_src = sys.argv[1], sys.argv[2]
    plain = compose(cutout(plain_src))
    paper = compose(cutout(paper_src))
    plain.save(OUT_PLAIN)
    paper.save(OUT_PAPER)
    print(f"saved {OUT_PLAIN} {plain.size}")
    print(f"saved {OUT_PAPER} {paper.size}")


if __name__ == "__main__":
    main()
