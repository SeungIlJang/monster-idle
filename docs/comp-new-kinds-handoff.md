# 아트 담당(Codex) 전달 — 뽑기 동료 2종 추가 (불씨 용 · 해골새)

> **상태: 그림 기다리는 중 (2026-11-16).** 코드는 준비돼 있습니다. 그림이 들어오는 날부터 뽑기에 저절로 섞입니다.

동료 장착 슬롯이 6칸에서 **8칸**이 됐습니다(2,000 · 7,000층 해금). 그런데 동료가 6종뿐이라
하늘에 **같은 동료가 최소 둘은 겹쳐** 뜹니다. 2종을 더해 8종으로 맞추면 8마리가 전부 다르게 뜰 수 있습니다.

| 키 | 이름 (ko / en / ja) | 색 | 쏘는 것 |
|---|---|---|---|
| `ember` | 불씨 용 / Emberling / ひのこドラゴン | 차분한 주황 | 주황 불꽃 (`flame`) |
| `bonebird` | 해골새 / Bonebird / ほねどり | 상아색 | 뼈다귀 (`bone` — 새로 넣음) |

지금 6종의 색(세이지 초록 · 보라 회색 · 장미 · 청록 · 회색 돌 · 숯색)과 겹치지 않게 골랐고,
둘 다 **원래 날아다니는 생물**이라 하늘에 떠 있어도 어색하지 않습니다.

## 이미 되어 있는 것 (이쪽)

- 동료 목록에 2종이 들어가 있습니다(`src/gacha.js` CATALOG.comp) — 이름 3개 언어, 아이콘, 쏘는 탄 모양까지.
- **그림이 매니페스트에 없으면 뽑기에서 안 나옵니다**(`gacha.pullable`). 그래서 코드를 먼저 배포해도 그림 없는 동료가 뽑히지 않습니다.
  2,000번 뽑아 확인했습니다 — 새 2종 0번.
- 시뮬도 매니페스트의 동료 수를 셉니다. 6 → 8종이면 융합 재료가 흩어져 30일 최고가 약 −0.9%(16,225 → 16,087)입니다.
- 임시 그림(작은 슬라임·박쥐 떼를 새 키 이름으로)으로 들이기 → 뽑기 → 하늘 8종 → 뽑기 탭 8칸까지 끝까지 돌려 봤고, 되돌려 두었습니다.

## 만들 것 — 2종 × 8장 = **16장**

종마다:

| 파일 | 내용 |
|---|---|
| `comp_<키>_idle_1.png` | **기본 그림** (일반·희귀가 이걸 씁니다) |
| `comp_<키>_idle_2.png` | 기본 그림의 둘째 프레임 (깜빡임·날갯짓) |
| `comp_<키>_r2_idle_1.png` · `_r2_idle_2.png` | 영웅 외형 |
| `comp_<키>_r3_idle_1.png` · `_r3_idle_2.png` | 전설 외형 |
| `comp_<키>_r4_idle_1.png` · `_r4_idle_2.png` | 신화 외형 |

**기본 그림을 먼저** 만들어 주세요. 등급 외형은 기본 그림을 참고 그림으로 넣고 만듭니다.
기본 두 장만 먼저 보내셔도 됩니다 — 그것만으로 뽑기에 섞이고, 등급 외형이 오기 전에는 코드 연출(고리·후광·빛줄기·크기)만 붙습니다.

## 규격

### 기본 그림 (`idle_1`) — 기존 6종과 같은 자리에 서야 합니다

- 캔버스 **240×240**, RGBA PNG, 배경 완전 투명(바닥 그림자·발판 없음)
- **발 행(내용 맨 아래) = 231**
- **가로 중심 = 119.5** (±1.8)
- 내용의 **긴 변 140~216px** — 권장 170~200px. 기존 6종은 이렇게 섭니다:

  | 키 | 내용 경계 | 크기 |
  |---|---|---|
  | `slimelet` | 12,88 ~ 227,231 | 216×144 |
  | `bats` | 12,86 ~ 227,231 | 216×146 |
  | `spore` | 12,35 ~ 227,231 | 216×197 |
  | `wisp` | 44,16 ~ 195,231 | 152×216 |
  | `shard` | 12,33 ~ 227,231 | 216×199 |
  | `shade` | 12,87 ~ 227,231 | 216×145 |

- **위쪽 여유 30px 이상(권장 60px)** — 전설·신화의 왕관·볏이 위로 붙습니다. 기존 동료 몇은 옆이 캔버스 끝까지 차서 장식을 위로만 붙일 수 있었습니다.
- 가장자리에 닿으면 안 됩니다(잘려 보임)

### 둘째 프레임 (`idle_2`)

`idle_1` 과 발 행 · 가로 중심(±0.6) · 크기(±6px)가 같고, **눈을 감거나 날개를 살짝 접은** 그림입니다. 윗변만 2~4px 내려갑니다.

### 등급 외형 (`r2` · `r3` · `r4`)

[docs/comp-rarity-art-handoff.md](comp-rarity-art-handoff.md) 의 규격 그대로입니다 — 기본 그림과 발 행 · 가로 중심이 같고,
내용 크기 0.9~1.25배, 기본 그림과 8% 이상 달라야 합니다. 빛줄기 · 후광 · 고리 · 별가루는 게임이 그리니 **그림에 넣지 마세요.**

### 작게 보입니다

화면에서 동료는 **폰 기준 약 20~25px** 입니다(신화는 +30%). 실루엣 하나로 읽혀야 하고, 색은 한두 가지, 눈은 점 두 개.

## 프롬프트

### 기본 그림 — 영어 그대로

**참고 그림으로 `assets/comp/slimelet.png` 와 `assets/comp/wisp.png` 를 화풍 기준으로만 넣습니다**(외곽선 굵기 · 음영 · 채도). 다른 생물입니다.

**불씨 용 `ember`**

```
2D mobile idle RPG sidekick sprite, cute chibi mascot, thick clean dark outline, flat cel shading, readable at very small size. Use the reference images as STYLE reference only (outline weight, shading, soft muted palette) — this is a different creature. A tiny round baby dragon, muted ember-orange body with a pale peach belly, two stubby rounded wings, two tiny nub horns, a short tail ending in a small soft flame tip, two dot eyes, hovering with wings slightly spread. A small helper creature, clearly smaller and simpler than a main character. Soft, rounded, non-threatening. It should look like it is following someone rather than leading. VERY simple bold silhouette — this is drawn at roughly 60px tall and eight of them share the screen at once, so it must read instantly as one shape. One or two colors only. Eyes are two small dots or short curved lines. No fine detail, no small props, no patterns. Facing the viewer in a slight 3/4 turn toward the viewer's RIGHT. Full body, hovering just above an invisible ground line at the bottom edge. Single creature, centered, filling about 65% of the frame height, leaving clear empty space above the head. Square frame. Fully transparent background — no ground shadow, no platform, no backdrop. No text, no letters, no numbers, no UI, no frame, no border, no watermark. No humans. Muted, slightly desaturated colors so the lead monster stays the brightest thing on screen.
```

**해골새 `bonebird`**

```
2D mobile idle RPG sidekick sprite, cute chibi mascot, thick clean dark outline, flat cel shading, readable at very small size. Use the reference images as STYLE reference only (outline weight, shading, soft muted palette) — this is a different creature. A tiny cute bird made of smooth ivory bones: a round skull-like head with two large dark round eye holes, each holding a small pale-cyan dot glow, a short rounded beak, a simple rounded ribcage body, two small bony wings spread, hovering. Friendly and toy-like, not scary. A small helper creature, clearly smaller and simpler than a main character. Soft, rounded, non-threatening. It should look like it is following someone rather than leading. VERY simple bold silhouette — this is drawn at roughly 60px tall and eight of them share the screen at once, so it must read instantly as one shape. One or two colors only. No fine detail, no small props, no patterns. Facing the viewer in a slight 3/4 turn toward the viewer's RIGHT. Full body, hovering just above an invisible ground line at the bottom edge. Single creature, centered, filling about 65% of the frame height, leaving clear empty space above the head. Square frame. Fully transparent background — no ground shadow, no platform, no backdrop. No text, no letters, no numbers, no UI, no frame, no border, no watermark. No humans. Muted, slightly desaturated colors so the lead monster stays the brightest thing on screen.
```

**넣지 말 것 (공통)**

```
human, knight, armor, text, letters, numbers, UI, HUD, frame, border, watermark, background, scenery, ground shadow, platform, multiple creatures, busy detail, intricate patterns, photorealistic, gore, blood, horror, creepy, large imposing creature, heroic pose, bright saturated hero colors
```

**기본 그림의 `idle_2`** — `idle_1` 을 참고 그림으로 넣고:

```
Second idle frame of the same image: eyes closed in a blink (bonebird: the eye glows dim to thin lines; ember: wings slightly folded), body very slightly squashed — top edge 2 to 4 pixels lower. Same position, same size.
```

### 등급 외형

[docs/comp-rarity-art-handoff.md](comp-rarity-art-handoff.md) 의 **공통 앞부분 + 등급 문장 + 공통 뒷부분**에 아래 `{장식}` 을 넣습니다.
**참고 그림은 이번에 만든 기본 그림(`comp_<키>_idle_1.png`)** 입니다.

| 키 | 영웅 r2 | 전설 r3 | 신화 r4 |
|---|---|---|---|
| `ember` | 이마에 작은 보라 보석 | 두 뿔 사이 작은 금관 · 날개 끝 금빛 | 머리에서 등으로 이어진 장미빛 불꽃 갈기 · 장미빛 보석 금관 · 꼬리 불꽃이 장미빛으로 더 밝게 |
| `bonebird` | 목에 작은 보라 부적 · 눈빛이 보라 | 날개 가장자리 금테 · 머리에 작은 금관 | 장미빛 불꽃 꼬리깃 · 장미빛 보석 금관 · 눈빛이 장미빛으로 더 밝게 |

영어 `{장식}`:

- `ember` r2: `a small glowing violet gem on its forehead`
- `ember` r3: `a small gold crown between its nub horns and gold-tipped wing edges`
- `ember` r4: `a rose-red flame mane running from the head down the back, a gold crown with a rose-red jewel, and the tail flame turned rose-red and brighter`
- `bonebird` r2: `a small violet charm hanging at its neck, and the eye glows turn violet`
- `bonebird` r3: `gold-trimmed wing edges and a tiny gold crown on top of the skull`
- `bonebird` r4: `rose-red flame tail feathers, a gold crown with a rose-red jewel, and the eye glows turn rose-red and brighter`

등급 외형의 `idle_2` 는 rarity 문서의 idle_2 문장 그대로입니다.

## 파일 이름 · 넘겨줄 곳

```
D:/AI/workspace/game/games/output/monster-idle/comp-new-v1/
  comp_ember_idle_1.png      · comp_ember_idle_2.png
  comp_ember_r2_idle_1.png   · comp_ember_r2_idle_2.png
  comp_ember_r3_idle_1.png   · comp_ember_r3_idle_2.png
  comp_ember_r4_idle_1.png   · comp_ember_r4_idle_2.png
  comp_bonebird_idle_1.png   · …
```

나눠서 보내셔도 됩니다. **`idle_1` 과 `idle_2` 는 짝으로** 와야 합니다. 추천 순서: **기본 그림 2종 → 신화 → 전설 → 영웅**.

## 보내기 전에 돌려 주세요

monster-idle 폴더에서:

```
node tools/check-anim.mjs "D:/AI/workspace/game/games/output/monster-idle/comp-new-v1"
```

새 동료 기본 그림은 위 규격(캔버스 · 발 행 231 · 가로 중심 119.5 · 긴 변 140~216 · 위쪽 여유 30px)으로,
등급 외형은 **같은 폴더의 기본 그림**과 견줘 검사합니다. **"✅ 전부 통과했습니다. 보내 주세요."** 가 나오면 그대로 보내 주세요.

## 이쪽(Claude)에서 할 일

1. `node tools/make-comp-rarity.mjs <폴더>` — 다시 검사 → 팔레트 압축 → `assets/comp/<키>.png` · `_2.png` · `_r2.png` … 로 들이고,
   매니페스트 `comp.<키>` = `{ box, idle: 2, rar }` 를 적습니다. 이 순간부터 뽑기에 섞입니다.
   (게임이 모르는 키는 막습니다 — `src/gacha.js` CATALOG.comp 에 있어야 합니다.)
2. `npm run sim` — 동료 8종으로 30일 · 365일을 다시 봅니다.
3. 25px 로 줄여 실루엣이 읽히는지, 하늘 8자리에서 겹쳐 보이지 않는지 실제 화면으로 확인합니다.
4. 배포합니다.

## 참고

- 화풍 기준: `docs/art-direction.md` · 동료 원래 프롬프트: `assets/comp/prompts.json`
- 하늘 8자리 배치: `src/companions.js` 의 `SKY`
