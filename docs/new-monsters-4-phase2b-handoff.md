# 아트 담당(Codex) 전달 — 신규 몬스터 4종 2차-B (진화 단계 동작 프레임 24장)

> **적용 완료 (2026-11-16) — 신규 몬스터 그림 요청 전부 끝.** 24장 검사·육안 검수 통과 · `make-anim` 압축 2.09MB → 0.67MB(32%).
> 매니페스트 `stageFrames` t2_ · t3_ 모두 대기 2 · 공격 3 (아라크네와 같다). Lv 25 · 75 전투에서 재생 확인, 404 없음.
>
> (아래는 요청 당시 내용) 2차-A(진화 32 · 기본 동작 12)는 적용 완료.
> 이제 루트링 · 그리플링 · 요툰 · 임피가 Lv 25 · 75 에 모습이 바뀝니다. 다만 **진화한 모습은 대기·공격이 한 장씩**이라
> 기본 모습(대기 2장 · 공격 3장)보다 뻣뻣합니다 — 기존 12종은 진화 단계도 전부 3장씩 받았습니다.

이것으로 신규 몬스터 4종의 그림 요청이 끝납니다.

## 만들 것 — 4종 × 2단계 × 3장 = 24장

| 파일 | 순간 |
|---|---|
| `mon_<키>_t2_idle_2.png` · `mon_<키>_t3_idle_2.png` | 대기 둘째 (그 단계 `idle_1` 과 번갈아) |
| `mon_<키>_t2_attack_windup.png` · `mon_<키>_t3_attack_windup.png` | 공격 준비 (타격 바로 앞) |
| `mon_<키>_t2_attack_follow.png` · `mon_<키>_t3_attack_follow.png` | 마무리 (타격 바로 뒤) |

키: `treant` · `griffin` · `frostgiant` · `imp`. 타격 그림은 이미 있는 것을 씁니다 — 만들지 않습니다.

## 기준 그림 — 모습은 그 단계, 몸짓은 기본 단계

[docs/anim-frames-handoff.md](anim-frames-handoff.md) "2차 기준 그림" 과 같은 규칙입니다.

| 용도 | 파일 (`assets/mon/<키>/`) |
|---|---|
| **그 단계의 모습** (색 · 장식 · 형태) | `t2_idle_1.png` · `t2_attack_1.png` (3단계는 `t3_`) — 진화 단계의 타격 그림은 아직 `attack_1` 이름 그대로입니다 |
| **몸짓** (2차-A 에서 정한 동작) | `idle_2.png` · `attack_1.png`(준비) · `attack_3.png`(마무리) — 기본 단계 타격은 `attack_2.png` 로 옮겨졌습니다 |

같은 몬스터가 단계마다 **같은 몸짓**으로 움직여야 진화가 "같은 캐릭터가 화려해진 것" 으로 읽힙니다.
모습은 그 단계 그림을, 동작은 기본 단계 그림을 따라 주세요.

## 규격

- 캔버스 320×320 RGBA · 발 309 · 가로 중심 ±0.6 — **그 단계의** `idle_1` 과 같게.
- `idle_2` 는 내용 크기가 그 단계 `idle_1` 과 ±6px.
- 공격 두 장은 높이가 그 단계 idle 의 0.7~1.15배.
- 오른쪽(적 쪽)을 봅니다. 몸짓은 크게 — 기준 그림과 2% 이상 달라야 통과.

## 넘겨줄 곳 · 검사

```
D:/AI/workspace/game/games/output/monster-idle/mon-new4-anim-v2/
  mon_treant_t2_idle_2.png · mon_treant_t2_attack_windup.png · mon_treant_t2_attack_follow.png
  mon_treant_t3_idle_2.png · …
  mon_griffin_t2_… · mon_frostgiant_t2_… · mon_imp_t2_… (t3 도)
```

```
node tools/check-anim.mjs "D:/AI/workspace/game/games/output/monster-idle/mon-new4-anim-v2"
```

**"✅ 전부 통과했습니다. 보내 주세요."** 가 나오면 그대로 보내 주세요. 단계별로 끊어 보내셔도 됩니다(한 단계의 windup · follow 는 짝으로).

## 이쪽(Claude)에서 할 일

`node tools/make-anim.mjs <폴더>` → 팔레트 압축 · 진화 단계 타격 그림 `t2_attack_1 → t2_attack_2` 재배치 ·
매니페스트 `stageFrames` 기록 → Lv 25 · 75 에서 대기·공격 재생 확인 → 배포.
