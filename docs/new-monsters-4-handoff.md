# 아트 담당(Codex) 전달 — 신규 몬스터 4종 (루트링 · 그리플링 · 요툰 · 임피)

> **1차 적용 완료 (2026-11-16).** 16장 검사 전부 통과 · 육안 검수 통과(화풍·방향·기존 종과 안 겹침) → 4종이 게임에 나왔다.
> 들이기: `node tools/make-mon.mjs <폴더>` → `node tools/normalize-sprites.mjs`. 시뮬 16종: 30일 16,573 · 365일 36,352.
> **2차(진화 · 동작 68장)는 `docs/new-monsters-4-phase2-handoff.md`.**

스포어링(100층)과 본가드(200층) 사이에 플레이어 몬스터 4종을 넣습니다.
모두의 타워디펜스의 월드 보스 4종을 **꼬마 몬스터로** 옮긴 것입니다 — 기존 12종이나 그 진화 모습과 겹치지 않는 종만 골랐습니다
(킹 슬라임은 글룹 Lv50 왕관과, 새끼 드래곤은 이그나리온과 겹쳐서 뺐습니다).

| 키 | 이름 | 해금 | 바탕 (타워디펜스) | 속성 | 능력 (리드일 때) | 포인트 색 · 탄 |
|---|---|---|---|---|---|---|
| `treant` | **루트링** | 120층 | 고대 나무 거인 | 자연 | **뿌리** — 최대체력 +30%, 웨이브 회복 +60%, 피해 −12% | 잎 초록 `#8fd16a` · 조각 |
| `griffin` | **그리플링** | 140층 | 폭풍 그리폰 | 바람 | **돌풍** — 공격속도 +15%, 더블샷 +10%p, 보스 피해 −20% | 노랑 `#ffe08a` · 바람 줄기 |
| `frostgiant` | **요툰** | 160층 | 서리 거인 | 얼음 | **빙갑** — 받는 피해 −20%, 최대체력 +20%, 공격속도 −12% | 얼음 하늘 `#9fe0ff` · 조각 |
| `imp` | **임피** | 180층 | 마왕 | 암흑 | **악의** — 치명확률 +8%p, 치명피해 +25%, 최대체력 −25% | 장미 `#ff5f7e` · 불꽃 |

능력은 전부 사이드그레이드입니다. 30일 시뮬에서 리드로 세웠을 때 16,000~16,302층 — 기존 12종(15,834~16,412) 안에 들어갑니다.

## 화풍 — 타워디펜스 그림을 그대로 쓰지 않습니다

타워디펜스는 **픽셀 아트**, 무럭무럭 몬스터는 **두꺼운 외곽선 + 플랫 셀 셰이딩의 귀여운 카툰**입니다.
타워디펜스 그림(`share-tower-defense/public/sprites/ancient_treant.png` · `storm_griffin.png` · `frost_giant.png` · `demon_king.png`)은
**어떤 생물인지 참고만** 하고, 화풍·비율은 `assets/mon/<기존 키>/idle_1.png` 를 따릅니다. 보스가 아니라 **꼬마**입니다 — 기존 몬스터와 덩치가 같아야 합니다.

- 전부 **플레이어 편**입니다. 적(인간 용사)처럼 보이면 안 됩니다 — 특히 요툰은 사람이 아니라 **푸른 피부·얼음 뿔의 생물**로.
- 오른쪽(적 쪽)을 봅니다.
- 기존 몬스터와 겹치지 않게: 루트링에 버섯 갓 X(스포어링), 임피는 초록 피부 X(그릭), 그리플링은 박쥐 날개 X(나이트윙).

## 나눠서 받습니다

| 차수 | 내용 | 장수 |
|---|---|---|
| **1차 (지금)** | 기본 포즈 4장 × 4종 — `idle` · `attack` · `hit` · `dead` | **16장** |
| 2차 (1차를 들인 뒤) | 진화 2·3단계 각 4포즈 × 4종 (`docs/new-monsters-evo-handoff.md` 규칙 그대로) | 32장 |
| 2차 | 동작 프레임 — 단계마다 `idle_2` · `attack_windup` · `attack_follow` × 3단계 × 4종 (`docs/anim-frames-handoff.md`) | 36장 |

2차는 1차 그림을 기준으로 검사하므로 **1차가 게임에 들어간 뒤** 요청합니다. 1차만 들어가도 게임에 나오고, 진화·동작은 기본 그림으로 버팁니다.

## 1차 규격 — 기존 12종이 서 있는 자리 그대로

- 캔버스 **320×320**, RGBA PNG(색상타입 6), 배경 완전 투명. 팔레트로 줄이지 마세요 — 이쪽에서 압축합니다.
- **발(내용 맨 아래 행) = 309.** 포즈 4장 전부.
- **가로 중심 = 159.5 ± 1.5.**
- `idle` 내용 크기: 폭 **170~304**, 높이 **170~290** px. 기존 12종 실측:

  | 키 | idle 크기 | 키 | idle 크기 |
  |---|---|---|---|
  | goblin | 233×259 | ghost | 206×270 |
  | bat | 300×212 | orc | 230×247 |
  | mushroom | 300×256 | golem | 251×239 |
  | skeleton | 176×284 | dragon | 242×227 |
  | wolf | 246×229 | spider | 270×177 |

- 포즈 높이 / idle 높이: `attack` 0.8~1.2 · `hit` 0.65~1.05 · `dead` 0.3~0.7 (쓰러지면 납작하게).
- 가장자리에 닿으면 안 됩니다.

### 파일 이름 · 넘겨줄 곳

```
D:/AI/workspace/game/games/output/monster-idle/mon-new4-v1/
  mon_treant_idle_1.png · mon_treant_attack_1.png · mon_treant_hit_1.png · mon_treant_dead_1.png
  mon_griffin_idle_1.png · …
  mon_frostgiant_idle_1.png · …
  mon_imp_idle_1.png · …
```

한 종씩 보내셔도 됩니다. **한 종의 4장은 같이** 와야 합니다 — 한 장이라도 빠지면 검사에서 걸립니다.

## 프롬프트 (1차)

기존 몬스터와 같은 템플릿입니다(`assets/mon/sheets.json` 의 `promptTemplate`). 2048×2048 한 장에 2×2 로 네 포즈를 받은 뒤
**칸마다 잘라 위 규격(320×320 · 발 309 · 중심 159.5)으로 맞춰 주세요.** 참고 그림으로 `assets/mon/mushroom/idle_1.png` 와 `assets/mon/wolf/idle_1.png` 를 화풍 기준으로 넣습니다.

**템플릿**

```
Use case: stylized-concept. Asset: production transparent sprite sheet for 2D mobile idle RPG. Square 2048x2048 sheet, exact 2 by 2 equal square cells, NO visible grid, no labels. Render the SAME {identity} in four poses in ONE image, consistent identity, palette, volume, outline and light source across all cells. Top-left idle: {idle}. Top-right attack: {attack}. Bottom-left hit: {hit}. Bottom-right dead: {dead}. {palette}. Thick clean dark outlines, flat cel shading, saturated, simple bold silhouette readable at 64px, no intricate details. Slight 3/4 view toward viewer's RIGHT. Each pose entirely inside its own cell with ample transparent margin, same implied floor baseline at 85% down each cell, consistent body mass; idle occupies about 75% cell width. Fully transparent background, no shadows of any kind, no floor, no props, no scenery, no motion lines, no effects, no text, no letters, no numbers, no UI, no borders, no watermark. Only these four depictions of the same {noun}.
```

**루트링 `treant`** — noun: `sapling treant`

- identity: `small cheerful sapling treant, a stubby living tree stump with two leafy twig arms, root feet and a little tuft of fresh leaves on top`
- palette: `Warm brown bark body with a lighter tan face patch, bright leaf-green leaf tuft, a few small moss patches, ONE simple upper-left soft highlight`
- idle: `standing planted on its root feet, twig arms relaxed, leaf tuft perked up, gentle smile`
- attack: `lunging right whipping one long twig arm forward like a vine lash toward the right target, leaf tuft fluttering, determined face`
- hit: `recoiling left, bark body squashed, leaf tuft drooping, eyes squeezed shut`
- dead: `toppled flat on its back on the ground like a small fallen log, twig arms limp, leaves wilted, eyes as closed curved lines`

**그리플링 `griffin`** — noun: `griffin chick`

- identity: `small round griffin chick with an eagle head, a fluffy lion-cub body on four paws, stubby feathered wings and a tufted tail`
- palette: `Cream-white feathered head with a golden-yellow beak, sandy tan fur body, sky-blue feathered wing tips, ONE simple upper-left soft highlight`
- idle: `standing on four little paws, wings half-raised, chest puffed out proudly, beak slightly open`
- attack: `pouncing right with wings flared wide and front talons reaching toward the right target, feathers ruffled`
- hit: `recoiling left with wings clamped to its sides, feathers puffed up, eyes squeezed shut`
- dead: `flopped flat on its belly on the ground, wings spread limp, beak resting on the ground, eyes as closed curved lines`

**요툰 `frostgiant`** — noun: `little frost giant creature`

- identity: `small stocky frost giant creature — clearly a monster, not a human: pale blue skin, a big round snowy beard, chunky icy shoulder plates and two small ice-crystal horns`
- palette: `Pale ice-blue skin, snow-white beard and brows, frosted crystal-blue horns and shoulder plates, ONE simple upper-left soft highlight`
- idle: `standing wide and sturdy, big fists hanging low, beard puffed out, calm frown`
- attack: `stomping forward to the right swinging one huge ice-crusted fist toward the right target, mouth open in a roar`
- hit: `recoiling left, shoulders hunched up, beard squashed, eyes squeezed shut`
- dead: `slumped flat on its back on the ground, arms spread, beard flopped to one side, eyes as closed curved lines`

**임피 `imp`** — noun: `imp`

- identity: `small mischievous imp, a little demon with two curved horns, small bat-like wings, a pointed tail and a cheeky fanged grin`
- palette: `Crimson-red skin with a darker plum belly, violet wing membranes, black horns and claws, glowing golden eyes, ONE simple upper-left soft highlight`
- idle: `standing on tiptoes with wings half-spread, arms crossed, tail curled, smug grin`
- attack: `lunging right thrusting one clawed hand forward toward the right target, wings flared, wicked grin`
- hit: `recoiling left, wings folded tight, tail bristled, eyes squeezed shut`
- dead: `sprawled flat on its back on the ground, wings spread limp, tail limp, eyes as closed curved lines, tongue out comically`

## 보내기 전에 돌려 주세요

monster-idle 폴더에서:

```
node tools/check-anim.mjs "D:/AI/workspace/game/games/output/monster-idle/mon-new4-v1"
```

캔버스 · 발 행 309 · 가로 중심 · idle 크기 · 포즈 높이 비율 · idle 과의 차이 · 4장이 다 왔는지를 봅니다.
기존 12종의 기본 포즈를 이 규격으로 재 보면 11종이 통과합니다(글룹만 발이 311 이라 걸립니다 — 기존 예외).
**"✅ 전부 통과했습니다. 보내 주세요."** 가 나오면 그대로 보내 주세요.

## 이쪽(Claude)에서 할 일

1. `node tools/make-mon.mjs <폴더>` — 다시 검사하고 `assets/mon/<키>/{idle,attack,hit,dead}_1.png` 로 들입니다.
   매니페스트 `mon.<키>` 에 적는 순간 그 몬스터가 게임에 나타납니다(게임이 모르는 키는 막습니다).
2. `node tools/normalize-sprites.mjs` — 내용 경계(box) 계산.
3. `npm run sim` — 수집 몬스터 수가 매니페스트에서 자동으로 늘어납니다. 12 → 16종이면 30일 +2.1%, 365일 +5.9%
   (같은 조각으로 싼 저레벨이 늘어 총 레벨·마일스톤이 오른다).
4. 도감 · 전장 · 리드 교체 · 투사체를 실제 화면에서 확인하고 배포합니다.
5. 2차(진화 · 동작 프레임) 요청서를 씁니다.

임시 그림(그릭 · 팽울프 · 레이스 · 브락을 새 키 이름으로)으로 1 → 4 를 끝까지 돌려 봤고, 되돌려 두었습니다.
