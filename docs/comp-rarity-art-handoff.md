# 아트 담당(Codex) 전달 — 뽑기 동료 등급별 외형 요청

> **적용 완료 (2026-11-13).** 36장 검사 전부 통과 · 팔레트 압축 1.81MB → 0.69MB(38%, 평균 오차 최대 1.65/255).
> 들이기: `node tools/make-comp-rarity.mjs <폴더>` → `assets/comp/<키>_r2.png` · `_r2_2.png` …, 매니페스트 `comp.<키>.rar = [2,3,4]`.
> 하늘 동료(`companions.compImage`)와 뽑기 탭(`ui-gacha.iconOf`)이 `sprites.rarSuffix` 로 등급 이하에서 가장 높은 변형을 쓴다.
> 제안과 다르게 온 것(허용 범위): 도깨비불 신화는 불꽃 색을 유지하고 장미·왕관을 달았고, 그림자 신화는 장미 뿔이다.

뽑기 동료 6종은 **등급(일반·희귀·영웅·전설·신화)이 달라도 그림이 똑같습니다.**
등급은 코드 연출로만 구별합니다. 2026-11-13 에 연출을 키웠습니다(아래 "이미 들어간 것").

연출만으로도 구별은 되지만, 그림 자체는 그대로라 "신화를 뽑았다" 는 느낌이 약합니다.
**영웅 · 전설 · 신화** 세 등급에 장식을 더한 그림을 받으려고 합니다. 일반·희귀는 지금 그림을 그대로 씁니다.

## 이미 들어간 것 (코드 연출) — 그림에 다시 그리지 마세요

| 등급 | 색 | 연출 |
|---|---|---|
| 일반 | 회색 `#9aa7c7` | 얇은 발밑 고리 |
| 희귀 | 파랑 `#4a9dff` | 두꺼운 고리 · 크기 +7.5% |
| 영웅 | 보라 `#b06bff` | + 숨 쉬는 후광 · 윤곽 빛 · 크기 +15% |
| 전설 | 금 `#ffcf3a` | + 도는 빛줄기 8줄 · 크기 +22.5% |
| 신화 | 장미빛 빨강 `#ff5c7a` | + 빛줄기 12줄 · 반짝이는 별가루 · 크기 +30% |

빛줄기 · 후광 · 고리 · 별가루 · 크기 차이는 게임이 그립니다. **그림에는 넣지 마세요** — 두 번 그려집니다.
그림에서 바꿀 것은 **몸에 붙은 장식**뿐입니다(왕관 · 보석 · 금테 · 날개 · 수정 · 빛나는 눈).

## 만들 것 — 6종 × 3등급 × 2장 = **36장**

| 등급 | 접미사 | 장식 방향 |
|---|---|---|
| 영웅 | `r2` | **보라 포인트 하나** — 작은 보라 보석·부적, 외곽선 가장자리에 옅은 보라 빛 |
| 전설 | `r3` | **금 장식** — 작은 금관·금테·금띠, 따뜻한 금빛 가장자리, 금 반짝임 한 점 |
| 신화 | `r4` | **가장 특별하게** — 장미빛 빨강 + 금 장식에 작은 날개·수정 볏·불꽃 볏, 더 밝게 빛나는 눈 |

장마다 `idle_1`(기본 자세)과 `idle_2`(깜빡임·날갯짓) 두 장입니다. 게임이 둘을 번갈아 씁니다.

### 동료별 장식 (제안 — 더 나은 생각이 있으면 바꿔도 됩니다)

| 키 | 이름 | 영웅 r2 | 전설 r3 | 신화 r4 |
|---|---|---|---|---|
| `slimelet` | 작은 슬라임 | 머리 위에 박힌 작은 보라 보석 | 머리 위 작은 금관 | 장미빛 보석이 박힌 금관 + 양옆 위로 뻗은 작은 장미빛 수정 날개 |
| `bats` | 박쥐 떼 | 앞 박쥐의 작은 보라 부적 · 날개 끝 보라 | 날개 가장자리 금테 · 가운데 박쥐 작은 금관 | 장미빛 날개 + 금테 · 빛나는 장미빛 눈 · 가운데 박쥐 금관 |
| `spore` | 버섯 포자 | 갓의 점이 보라로 빛남 | 갓 테두리 금띠 · 금빛 점 | 장미빛 갓에 금빛 별 무늬 · 갓 위를 도는 작은 수정 포자 2~3개 |
| `wisp` | 도깨비불 | 속 심지가 보라 | 금빛 심지 · 불꽃 끝 금빛 | 장미빛·흰 불꽃 두 갈래 꼬리 · 꼭대기 작은 금관 불씨 |
| `shard` | 돌조각 | 가는 보라 수정 결 | 금 상감 결 · 작은 금 보석 | 위로 자라난 장미빛 수정 무리 · 금 상감 |
| `shade` | 그림자 | 눈이 보라로 빛남 · 가장자리 옅은 보라 | 금빛 눈 · 가는 금빛 테 | 장미빛으로 빛나는 눈 · 그림자 불꽃 뿔(끝이 장미빛) |

## 규격 — 기본 그림과 **같은 자리에 서야 합니다**

기준은 게임에 들어 있는 `assets/comp/<키>.png`(대기 1번) · `assets/comp/<키>_2.png`(대기 2번)입니다.
**이 두 장을 참고 그림으로 넣고 생성하세요.** 같은 생물이 장식만 달고 있어야 합니다(얼굴·몸 모양·자세·색 그대로).

- 캔버스 **240×240**, RGBA PNG, 배경 완전 투명(바닥 그림자·발판 없음)
- **발 행(내용 맨 아래) = 231** — 1px 만 달라도 등급이 바뀔 때 떠 보입니다
- **가로 중심 = 119.5** (±1.8)
- 몸 크기는 기본과 같게. 장식 때문에 커지는 건 내용 크기 **0.9~1.25배**까지 됩니다.
  **대부분 이미 폭이 216px(캔버스 거의 끝)이라 옆으로는 자리가 없습니다 — 장식은 위로 붙이세요.**
- 가장자리에 닿으면 안 됩니다(잘려 보임)

| 키 | 내용 경계 (x0,y0 ~ x1,y1) | 크기 | 위쪽 여유 |
|---|---|---|---|
| `slimelet` | 12,88 ~ 227,**231** | 216×144 | 88px |
| `bats` | 12,86 ~ 227,**231** | 216×146 | 86px |
| `spore` | 12,35 ~ 227,**231** | 216×197 | 35px |
| `wisp` | 44,16 ~ 195,**231** | 152×216 | 16px (옆으로 44px) |
| `shard` | 12,33 ~ 227,**231** | 216×199 | 33px |
| `shade` | 12,87 ~ 227,**231** | 216×145 | 87px |

### 작게 보입니다

전투 화면에서 동료는 **폰 기준 약 20~25px** 로 그려집니다(신화는 +30% 해서 약 30px).
가는 선·작은 무늬는 사라집니다. **장식은 큰 덩어리 한두 개**로, 색 대비가 분명하게 해 주세요.
판단이 안 서면 그림을 25px 로 줄여 보고 장식이 보이는지 확인하면 됩니다.

### idle_2

기본 그림의 `_2` 와 같은 식입니다 — 같은 그림에서 **눈을 감거나**(박쥐 떼는 날개를 살짝 접고, 도깨비불은 불꽃이 흔들림)
몸이 살짝 눌린 자세. 위치·크기는 거의 같고 윗변만 2~4px 내려갑니다. 장식은 1번과 같은 자리에 그대로 둡니다.

## 프롬프트

공통 앞부분 + 동료별 장면 + 등급 문장 + 공통 뒷부분입니다. 영어 그대로 붙여 넣으세요.
**참고 그림(`assets/comp/<키>.png`)을 반드시 같이 넣습니다.** 문장만으로는 같은 생물이 안 나옵니다.

**공통 앞부분**

```
2D mobile idle RPG sidekick sprite, cute chibi mascot, thick clean dark outline, flat cel shading, readable at very small size. RARITY VARIANT of the reference image: the exact same creature with the same face, body shape, pose, proportions, size and base colors — only add the tier decoration described below. Do not redesign the creature.
```

**공통 뒷부분**

```
The decoration must read at 25px tall: one or two bold simple shapes with strong color contrast, no fine lines, no small patterns. Put decorations on top of or above the body, not to the sides — the body already fills the frame width. Facing the viewer in a slight 3/4 turn toward the viewer's RIGHT, hovering just above an invisible ground line. Same framing as the reference: 240x240 square, feet on the same bottom row, horizontally centered, body the same size. Fully transparent background — no ground shadow, no platform, no backdrop, no glow halo, no light rays, no sparkles around the body (the game draws those). No text, no letters, no numbers, no UI, no frame, no border, no watermark. No humans.
```

**등급 문장**

- 영웅 r2: `HERO tier: add ONE small violet accent (#b06bff) — {장식}. A soft violet rim light along the outline edge. Otherwise identical to the reference.`
- 전설 r3: `LEGENDARY tier: add gold accents (#ffcf3a) — {장식}. Warm golden rim light on the outline, one tiny gold glint. Slightly richer colors than the reference.`
- 신화 r4: `MYTHIC tier: the most special version — rose-red (#ff5c7a) and gold ornament: {장식}. Eyes glow brighter. Still simple bold shapes.`

**동료별 장면 + 장식 `{장식}`** (장면은 `assets/comp/prompts.json` 의 원래 문장)

| 키 | 장면 | r2 장식 | r3 장식 | r4 장식 |
|---|---|---|---|---|
| `slimelet` | a tiny jelly blob, muted sage green, a simple smooth dome, two dot eyes, one small highlight, no arms | a tiny glowing violet gem set into the top of the dome | a small gold crown sitting on top of the dome | a gold crown with a rose-red jewel on top, plus two small rose-pink crystal wings angled upward from the upper sides |
| `bats` | three tiny bats flying in a loose cluster, dusty violet-grey, simple triangular wings, dot eyes, small triangle formation | the front bat wears a tiny violet charm, wing tips tinted violet | wings edged in gold, the middle bat wears a tiny gold crown | rose-red wings with gold edges, glowing rose eyes, the middle bat wears a tiny gold crown |
| `spore` | a tiny round mushroom sprite, dull rose cap with two cream dots, stubby pale stalk, two dot eyes | the cap dots glow violet | a gold band around the cap rim, the cap dots turn gold | a rose-red cap with gold star-shaped dots, two or three small crystal spores floating just above the cap |
| `wisp` | a small floating flame spirit, soft teal-blue glow with a paler core, teardrop flame with a wispy trailing tail, two dot eyes in the core | the inner core turns violet | a golden core and gold-tipped flame edges | a rose-red and white flame split into two tails, a tiny gold crown-shaped spark at the very top |
| `shard` | a small floating rock fragment, warm grey stone, one chipped flat face, thin moss streak, blocky angular shape, two carved dot eyes | a thin glowing violet crystal vein across the front face | a gold inlay vein and one small gold gem on the front face | a cluster of rose-pink crystals growing from the top, gold inlay on the front face |
| `shade` | a small shadow creature, flat charcoal-grey silhouette with soft ragged edges, simple hunched blob shape, two pale glowing dot eyes | the eyes glow violet, a faint violet edge on the silhouette | golden glowing eyes, a thin gold rim on the silhouette | rose-red glowing eyes and two small shadow-flame horns with rose-red tips on top |

`idle_2` 는 같은 등급 `idle_1` 을 참고 그림으로 넣고 이 문장을 덧붙입니다:

```
Second idle frame of the same image: eyes closed in a blink (bats: wings slightly folded; wisp: flame flickered), body very slightly squashed — top edge 2 to 4 pixels lower. Same position, same size, decorations in exactly the same place.
```

## 파일 이름 · 넘겨줄 곳

```
D:/AI/workspace/game/games/output/monster-idle/comp-rarity-v1/
  comp_slimelet_r2_idle_1.png · comp_slimelet_r2_idle_2.png
  comp_slimelet_r3_idle_1.png · comp_slimelet_r3_idle_2.png
  comp_slimelet_r4_idle_1.png · comp_slimelet_r4_idle_2.png
  comp_bats_r2_idle_1.png · …
```

**나눠서 보내셔도 됩니다.** 한 동료 한 등급씩 와도 그 등급만 바로 들어갑니다.
`idle_1` 과 `idle_2` 는 **짝으로** 와야 합니다.

추천 순서는 눈에 띄는 것부터 — **신화 r4 6종 → 전설 r3 → 영웅 r2** 입니다.

## 보내기 전에 돌려 주세요

monster-idle 폴더에서:

```
node tools/check-anim.mjs "D:/AI/workspace/game/games/output/monster-idle/comp-rarity-v1"
```

캔버스 · 발 행 · 가로 중심 · 크기 배율 · 기본 그림과의 차이(8% 이상 달라야 함) · `idle_1`↔`idle_2` 짝을 봅니다.
**"✅ 전부 통과했습니다. 보내 주세요." 가 나오면 그대로 보내 주세요.**

## 이쪽(Claude)에서 할 일

1. `check-anim.mjs` 로 다시 검사하고 25px 로 줄여 장식이 보이는지 봅니다.
2. 팔레트 압축(`tools/png-quant.mjs`) 후 `assets/comp/<키>_r2.png` · `<키>_r2_2.png` … 로 들입니다.
3. 매니페스트 `comp.<키>.rar` 에 받은 등급을 적고, `companions.compImage` 가 **자기 등급 이하에서 가장 높은 변형**을 쓰게 합니다
   (예: 신화인데 r4 가 아직 없으면 r3 → r2 → 기본). 뽑기 탭 그림(`ui-gacha.iconOf`)도 같은 규칙을 씁니다.
4. 코드 연출(빛줄기 · 후광 · 고리 · 크기)은 그대로 위에 얹습니다.
5. 실제 화면에서 확인하고 배포합니다.

## 참고

- 화풍 기준: `docs/art-direction.md` · 동료 원래 프롬프트: `assets/comp/prompts.json`
- 지금 연출 비교 그림(커밋 안 됨): `.tmp/rarity/7-sky-same-forest.png` · `9-sky-mix-phone360.png`
