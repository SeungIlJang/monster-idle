# 아트 담당(Codex) 전달 — 적 용사 4종 추가 (로완 · 토르빈 · 할든 · 그레타)

> **상태: 1차(기본 포즈 16장) 기다리는 중 (2026-11-16).** 데이터·이름(3개 언어)은 들어가 있습니다.
> **그림이 매니페스트에 올라가는 날 게임에 나타납니다** — 그 전에는 구역 순서에도 보스에도 안 나옵니다(`src/balance.js`).

숲을 침략하는 인간 용사(적)가 8종이라 구역 대표가 40층마다 같은 순서로 돌아옵니다.
모두의 타워디펜스의 아군 유닛 중 우리 게임에 없는 4종을 **적 용사로** 더해 12종(60층 주기)으로 늘립니다.

| 키 | 이름 | 바탕 (타워디펜스) | 진형 | 공격 | 실루엣의 핵심 하나 |
|---|---|---|---|---|---|
| `spear` | **로완** (Rowan Longreach) | 창병 | 2열 (궁수와) | 찌르기 · 청록 `#9fe8d8` | **키보다 훨씬 긴 창** + 작은 깃발 |
| `shield` | **토르빈** (Torvin Bulwark) | 방패병 | 앞줄 | 방패 치기 · 금 `#ffd27a` | **몸을 거의 다 가리는 사각 큰 방패** |
| `cavalry` | **할든** (Halden Swiftmane) | 기병 | 앞줄 | 돌격 · 주홍 `#ff7a6a` | **동글동글한 꼬마 말에 탄** 기사 |
| `cannon` | **그레타** (Greta Thunderbrass) | 대포병 | 3열 (마법사와) | 쇠공 · 쇳빛 `#5b6070` | **바퀴 달린 작은 청동 대포** |

구역 순서는 기존 8종 뒤에 붙습니다 — 41~45층 로완 · 46~50 토르빈(50층 보스) · 51~55 할든 · 56~60 그레타(60층 보스) → 61층부터 다시 카엘.
적 능력치는 층과 보스 여부로만 정해지므로 누가 나오든 밸런스는 그대로입니다(시뮬 30일 16,225 → 16,230 — 힐러 비율만 조금 바뀜).

## 화풍 · 기존 8종과 겹치지 않게

기존 적 용사 8종(`assets/hero/<키>/idle_1.png`)과 **같은 그림체**입니다 — 두꺼운 외곽선, 플랫 셀 셰이딩, 귀여운 카툰.
타워디펜스 그림(`share-tower-defense/public/sprites/spear.png` · `shield.png` · `cavalry.png` · `cannon.png`)은 **픽셀 아트라 인물 구상 참고만** 하세요.
기병은 캐릭터 팩의 고해상도 원본 `D:/AI/workspace/game/images/image/Hero_Mounted_Knight.png` 도 참고가 됩니다.

- **왼쪽을 봅니다** — 적 용사는 오른쪽에 서서 왼쪽(플레이어 몬스터)을 향합니다. 기존 8종과 같습니다.
- 겁나게 그리지 말고 "때려 주고 싶은" 자신만만한 모험가로(기존 프롬프트의 attitude).
- **토르빈은 알드릭과 달라야 합니다.** 알드릭은 은빛 갑옷·파란 깃털 투구·**연 모양** 방패입니다 → 토르빈은 **몸만 한 사각 방패**에 둥근 쇠 냄비 투구, 키가 작고 옆으로 넓게.
- 로완은 리나(궁수)와 같은 2열이라, 창이 확실히 보여야 합니다.

## 나눠서 받습니다

| 차수 | 내용 | 장수 |
|---|---|---|
| **1차 (지금)** | 기본 포즈 4장 × 4종 — `idle` · `attack` · `hit` · `dead` | **16장** |
| 2차 (1차를 들인 뒤) | 동작 프레임 — `idle_2` · `attack_windup` · `attack_follow` × 4종 (`docs/anim-frames-handoff.md`) | 12장 |

용사는 진화 단계가 없어서 몬스터보다 적습니다. 1차만 들어가도 게임에 나오고, 동작 프레임은 기본 그림으로 버팁니다.

## 1차 규격 — 기존 8종이 서 있는 자리 그대로

- 캔버스 **320×320**, RGBA PNG(색상타입 6), 배경 완전 투명. 팔레트로 줄이지 마세요.
- **발(내용 맨 아래 행) = 309.** 포즈 4장 전부.
- **가로 중심 = 159.5 ± 1.5.**
- `idle` 내용 크기: 폭 **190~304**, 높이 **200~304** px. 기존 8종 실측:

  | 키 | idle | 키 | idle |
  |---|---|---|---|
  | warrior 카엘 | 268×261 | cleric 엘리라 | 240×280 |
  | knight 알드릭 | 235×260 | archer 리나 | 244×300 |
  | rogue 사일러스 | 227×261 | emage 테라 | 224×254 |
  | mage 라이라 | 268×276 | dmage 닉스 | 275×225 |

  할든(말)·그레타(대포)는 옆으로 넓어지기 쉬우니 **폭 304 를 넘지 않게** 몸을 작게 잡아 주세요.
- 포즈 높이 / idle 높이: `attack` 0.8~1.2 · `hit` 0.65~1.05 · `dead` 0.3~0.7.
- 가장자리에 닿으면 안 됩니다.

### 파일 이름 · 넘겨줄 곳

```
D:/AI/workspace/game/games/output/monster-idle/hero-new4-v1/
  hero_spear_idle_1.png · hero_spear_attack_1.png · hero_spear_hit_1.png · hero_spear_dead_1.png
  hero_shield_idle_1.png · …
  hero_cavalry_idle_1.png · …
  hero_cannon_idle_1.png · …
```

한 종씩 보내셔도 됩니다. **한 종의 4장은 같이** 와야 합니다.

## 프롬프트 (1차)

기존 용사와 같은 템플릿입니다(`assets/hero/prompts.json` 의 `promptTemplate` · `common` · `poses`). 2048×2048 한 장에 2×2 로 네 포즈를 받은 뒤
**칸마다 잘라 위 규격(320×320 · 발 309 · 중심 159.5)으로 맞춰 주세요.** 참고 그림으로 `assets/hero/knight/idle_1.png` 와 `assets/hero/archer/idle_1.png` 를 화풍 기준으로 넣습니다.

`{item.scene}` 에 아래 장면을, `{pose.*}` 에 `prompts.json` 의 `poses` 문장을 넣습니다. **할든 · 그레타는 포즈 문장을 아래 것으로 바꿉니다.**

**로완 `spear`**

```
a lanky young spearman with messy teal hair, a light winged open helmet, a teal tabard over leather armour, holding an extra-long spear with a small pennant near the tip — the spear is much taller than he is and is his one defining shape
```

**토르빈 `shield`**

```
a short, very broad shieldbearer almost hidden behind a huge rectangular tower shield painted with a gold lion — only a round iron pot helmet on top and stubby boots underneath peek out; the shield is clearly bigger and squarer than a knight's kite shield
```

**할든 `cavalry`**

```
a dashing young cavalier riding a small round chibi pony with crimson barding and a tiny plume, a red cape, holding a short blunt-tipped lance upright — rider and pony together read as one compact shape
```

포즈 (바꿔 넣기):
- idle: `the pony standing still, the rider sitting tall with the lance upright, smug smile`
- attack: `the pony charging to the viewer's LEFT mid-gallop, the lance lowered forward toward the left target, cape streaming back`
- hit: `the pony rearing back to the viewer's RIGHT, the rider leaning away with eyes squeezed shut, lance wobbling`
- dead: `the pony sitting down dizzy and the rider slumped forward over its neck, both with eyes as closed curved lines, comical not gruesome`

**그레타 `cannon`**

```
a stocky gunner girl with goggles pushed up on a brimmed cap, rolled-up sleeves and a soot-smudged apron, standing behind a small chunky bronze cannon on two wooden wheels; the cannon muzzle points to the viewer's LEFT
```

포즈 (바꿔 넣기):
- idle: `standing beside the cannon with one hand resting proudly on the barrel, smug grin`
- attack: `the cannon jolting back on its wheels as it fires to the viewer's LEFT, Greta leaning in with a lit match, a small round puff at the muzzle`
- hit: `Greta recoiling to the viewer's RIGHT, cap knocked askew, the cannon tipped back on its wheels`
- dead: `Greta sprawled on the ground next to the toppled cannon, eyes as closed curved lines, comical not gruesome`

## 보내기 전에 돌려 주세요

monster-idle 폴더에서:

```
node tools/check-anim.mjs "D:/AI/workspace/game/games/output/monster-idle/hero-new4-v1"
```

캔버스 · 발 행 309 · 가로 중심 · idle 크기 · 포즈 높이 비율 · idle 과의 차이 · 4장이 다 왔는지를 봅니다.
기존 8종의 기본 포즈를 이 규격으로 재 보면 8종 모두 통과합니다. **"✅ 전부 통과했습니다. 보내 주세요."** 가 나오면 그대로 보내 주세요.

## 이쪽(Claude)에서 할 일

1. `node tools/make-mon.mjs <폴더>` — 다시 검사하고 `assets/hero/<키>/{idle,attack,hit,dead}_1.png` 로 들입니다.
   매니페스트 `hero.<키>` 에 적는 순간 그 용사가 구역 순서에 들어갑니다(게임이 모르는 키는 막습니다).
2. `node tools/normalize-sprites.mjs` — 내용 경계(box) 계산.
3. 41~60층 편성 · 50·60층 보스 · 진형(앞줄/2열/3열) · 투사체를 실제 화면에서 확인하고 배포합니다.
4. 2차(동작 프레임 12장) 요청서를 씁니다.

임시 그림(리나 · 알드릭 · 카엘 · 라이라를 새 키 이름으로)으로 1 → 3 을 끝까지 돌려 봤고, 되돌려 두었습니다.
