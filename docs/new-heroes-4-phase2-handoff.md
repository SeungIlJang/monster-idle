# 아트 담당(Codex) 전달 — 적 용사 4종 2차 (동작 프레임 12장)

> **적용 완료 (2026-11-16) — 신규 용사 그림 요청 전부 끝.** 12장 검사·육안 검수 통과 · `make-anim` 압축 1.11MB → 0.34MB(30%).
> 이제 기존 8종과 같이 대기 2장 · 공격 3장이다.

용사는 진화 단계가 없어서 이것으로 끝입니다. 기존 8종이 받은 것과 같은 3장씩입니다.
원칙은 [docs/anim-frames-handoff.md](anim-frames-handoff.md) "세 장의 뜻" 그대로입니다.

| 파일 | 순간 | 그릴 것 |
|---|---|---|
| `hero_<키>_idle_2.png` | 대기 둘째 (`idle_1` 과 번갈아) | 숨 들이쉼 · 눈 깜빡임 · 망토·깃발·깃털이 한 박자 움직임 |
| `hero_<키>_attack_windup.png` | 공격 준비 (타격 바로 앞) | 무게를 뒤로 싣고 무기를 젖힘 |
| `hero_<키>_attack_follow.png` | 마무리 (타격 바로 뒤) | 찌른·휘두른 뒤 자세, 반동으로 앞(왼쪽)으로 쏠림 |

타격 그림(`attack_1`)은 이미 있는 것을 씁니다 — 만들지 않습니다. 기준은 `assets/hero/<키>/idle_1.png`(대기) · `attack_1.png`(타격)입니다.

키별 몸짓 힌트:

| 키 | 이름 | windup | follow |
|---|---|---|---|
| `spear` | 로완 | 창을 뒤로 길게 당겨 몸을 젖힘 | 창을 끝까지 내지른 뒤 앞발에 체중 |
| `shield` | 토르빈 | 방패를 어깨로 받치고 몸을 웅크림 | 방패로 밀어붙인 뒤 비틀 |
| `cavalry` | 할든 | 말이 앞발을 들고 창을 치켜듦 | 돌진을 마치고 말이 앞으로 쏠리며 멈춤 |
| `cannon` | 그레타 | 불붙인 막대를 심지에 대며 귀를 막을 준비 | 대포가 뒤로 밀리고 연기 한 줌, 그레타가 콜록 |

## 규격

- 캔버스 · 발 309 · 가로 중심(±0.6)이 기준 그림과 같아야 합니다.
- `idle_2` 는 내용 크기가 `idle_1` 과 ±6px — 숨쉬기 정도로만.
- 공격 두 장은 높이가 idle 의 0.7~1.15배.
- **왼쪽을 봅니다**(기본 그림과 같은 방향).
- 화면에서 작게 보이니 몸짓은 크게 — 기준 그림과 2% 이상 달라야 통과.

## 넘겨줄 곳 · 검사

```
D:/AI/workspace/game/games/output/monster-idle/hero-new4-anim-v1/
  hero_spear_idle_2.png · hero_spear_attack_windup.png · hero_spear_attack_follow.png
  hero_shield_… · hero_cavalry_… · hero_cannon_…
```

```
node tools/check-anim.mjs "D:/AI/workspace/game/games/output/monster-idle/hero-new4-anim-v1"
```

**"✅ 전부 통과했습니다. 보내 주세요."** 가 나오면 그대로 보내 주세요.

## 이쪽(Claude)에서 할 일

`node tools/make-anim.mjs <폴더>` → 팔레트 압축 · `attack_1/2/3` 재배치 → 대기·공격 재생 확인 → 배포.
