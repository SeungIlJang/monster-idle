#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""무럭무럭 몬스터 런처 아이콘 생성기.

왜 필요한가: res/mipmap-*/ 의 ic_launcher*.png 가 적응형·레거시 **둘 다**
Capacitor 기본 플레이스홀더(연한 하늘색 도형 + 흰 바탕)로 남아 있었다.
배경도 @color/ic_launcher_background = #FFFFFF 라 흰 바탕에 흰 그림이 되어
안드로이드 8 이상에서 아이콘이 없는 것처럼 보였다.

타워디펜스와 전략이 다른 이유:
  타워디펜스 아트는 가운데 방패 + 매끄러운 네이비 그라데이션이라
  '배경 재구성 + 원형 페더 전경'이 통했다. 이 아트는 방사형 광선이
  가장자리까지 꽉 차 있어서 배경을 매끈한 그라데이션으로 다시 만들면
  페더 경계에서 광선이 끊겨 보인다.
  그래서 여기선 전경 하나가 108dp 전체를 불투명하게 덮고,
  배경은 아이콘 가장자리와 같은 파랑 단색으로 둔다(시차 이동 때만 보인다).

안전영역: 108dp 중 지름 66dp '원'.
  슬라임은 프레임에서 크고 아래로 치우쳐 있다(중심 y=319/512).
  디자인을 108dp 에 꽉 채우면 최대반경이 40.9dp 로 마스크(36dp)에도 잘린다.
  가시영역 72dp 에 맞추고 20px(원본 기준) 위로 올리면 31.0dp 가 되어 들어간다.
  72dp 보다 줄면 가시영역을 못 덮으므로, 모자란 바깥쪽은 가장자리 픽셀을
  늘려 메운다(광선이 가장자리에서 거의 수직이라 티가 안 난다).
"""
import os
import sys
from PIL import Image, ImageDraw

SRC = sys.argv[1] if len(sys.argv) > 1 else 'store-assets/icon-512.png'
RES = sys.argv[2] if len(sys.argv) > 2 else 'android/app/src/main/res'

DENSITIES = {'mdpi': 1, 'hdpi': 1.5, 'xhdpi': 2, 'xxhdpi': 3, 'xxxhdpi': 4}
SHIFT_UP_SRC = 20          # 원본 512px 기준으로 위로 올리는 양
VISIBLE_DP = 72            # 디자인을 이 범위에 맞춘다
CANVAS_DP = 108

src = Image.open(SRC).convert('RGB')


def extend_edges(design, canvas_size, pos):
    """디자인 바깥을 가장자리 픽셀로 늘려 캔버스를 채운다."""
    w, h = design.size
    x0, y0 = pos
    out = Image.new('RGB', (canvas_size, canvas_size))
    # 네 변
    if y0 > 0:
        out.paste(design.crop((0, 0, w, 1)).resize((w, y0), Image.NEAREST), (x0, 0))
    if y0 + h < canvas_size:
        out.paste(design.crop((0, h - 1, w, h)).resize((w, canvas_size - y0 - h), Image.NEAREST),
                  (x0, y0 + h))
    if x0 > 0:
        out.paste(design.crop((0, 0, 1, h)).resize((x0, h), Image.NEAREST), (0, y0))
    if x0 + w < canvas_size:
        out.paste(design.crop((w - 1, 0, w, h)).resize((canvas_size - x0 - w, h), Image.NEAREST),
                  (x0 + w, y0))
    # 네 모서리 — 해당 꼭짓점 색으로 채운다
    px = design.load()
    for cx, cy, box in (
        (0, 0, (0, 0, x0, y0)),
        (w - 1, 0, (x0 + w, 0, canvas_size, y0)),
        (0, h - 1, (0, y0 + h, x0, canvas_size)),
        (w - 1, h - 1, (x0 + w, y0 + h, canvas_size, canvas_size)),
    ):
        if box[2] > box[0] and box[3] > box[1]:
            out.paste(px[cx, cy], box)
    out.paste(design, (x0, y0))
    return out


def foreground(size):
    span = int(size * VISIBLE_DP / CANVAS_DP)
    art = src.resize((span, span), Image.LANCZOS)
    off = (size - span) // 2
    dy = int(SHIFT_UP_SRC * span / 512)
    return extend_edges(art, size, (off, off - dy)).convert('RGBA')


def legacy(size, round_=False):
    img = src.resize((size, size), Image.LANCZOS).convert('RGBA')
    if not round_:
        return img.convert('RGB')
    m = Image.new('L', (size, size), 0)
    ImageDraw.Draw(m).ellipse((0, 0, size - 1, size - 1), fill=255)
    out = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    out.paste(img, (0, 0), m)
    return out


def edge_color():
    px = src.load()
    w, h = src.size
    pts = [px[x, y] for x in range(w) for y in range(h)
           if x < 4 or y < 4 or x > w - 5 or y > h - 5]
    n = len(pts)
    return tuple(sum(p[i] for p in pts) // n for i in range(3))


if __name__ == '__main__':
    r, g, b = edge_color()
    print(f'아이콘 가장자리 색 #{r:02X}{g:02X}{b:02X} '
          f'→ @color/ic_launcher_background / splash_background 에 쓴다')
    for d, m in DENSITIES.items():
        base = os.path.join(RES, f'mipmap-{d}')
        os.makedirs(base, exist_ok=True)
        fg = int(CANVAS_DP * m)
        lg = int(48 * m)
        foreground(fg).convert('RGB').save(os.path.join(base, 'ic_launcher_foreground.png'))
        legacy(lg).save(os.path.join(base, 'ic_launcher.png'))
        legacy(lg, True).save(os.path.join(base, 'ic_launcher_round.png'))
        print(f'{d}: foreground {fg}px, legacy {lg}px')
