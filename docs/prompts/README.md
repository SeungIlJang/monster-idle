# 생성용 프롬프트

바로 붙여넣을 수 있게 펼쳐 둔 것이다. **원본은 `assets/*/prompts.json` 과 `assets/mon/sheets.json`**
이고 이 폴더는 그걸 펼친 결과다 — 고칠 일이 있으면 원본을 고치고 다시 뽑는다.

**왜 그렇게 그리는지와 겪어서 아는 함정은 [docs/art-direction.md](../art-direction.md) 에 있다.**
JSON 에는 코드가 읽는 데이터만 둔다.

```bash
node tools/print-prompts.mjs <그룹>                  # 아직 생성 안 한 것만
node tools/print-prompts.mjs mon goblin bat          # 일부만 (화면에)
node tools/print-prompts.mjs hero --out docs/prompts/hero
node tools/print-prompts.mjs bg --all                # 완료한 것까지 전부
```

그룹은 `bg` · `mon` · `comp` · `hero` 넷이다.

기본 출력은 원본의 `generated` 에 **없는** 것만이다. 지금은 넷 다 완료라 기본 출력이 0개이고,
다시 뽑으려면 키를 직접 주거나 `--all` 을 준다. 프롬프트를 뽑는 것은 `generated` 를 바꾸지 않는다.

## 들어 있는 것

| 폴더 | 수량 | 원본 | 형식 |
|---|---|---|---|
| `mon/` | 9 | `assets/mon/sheets.json` | 4포즈 시트 1장 |
| `hero/` | 8 | `assets/hero/prompts.json` | 4포즈 시트 1장 |
| `comp/` | 6 | `assets/comp/prompts.json` | idle 1장 |
| `bg/` | 9 | `assets/bg/prompts.json` | 배경 1장 |

`mon/` 에 슬라임이 없는 이유: 슬라임은 이 형식을 만들기 전에 생성했다. 실제 쓴 프롬프트는
생성 폴더의 `generation.json` 에 남아 있다. `bg/` 에 `forest` 가 없는 것도 같은 이유다.

## 생성 → 들이기

### 캐릭터 (몬스터 · 용사 · 동료)

1. `.txt` 하나를 통째로 복사해 생성한다.
   - 몬스터·용사는 **한 장(2048×2048, 2×2 셀)에 네 포즈**가 들어간다. 따로 받으면 색·비율·광원이
     어긋나 전투 중에 프레임이 튄다.
   - 동료는 idle 한 장이면 된다.
2. 셀을 잘라 아래 모양으로 둔다. **네 포즈를 같은 배율·하단 중앙 기준으로** 자를 것 —
   렌더는 종마다 `box` 를 idle 하나만 쓰므로, 배율이 다르면 납작한 dead 가 늘어난다.
   ```
   <폴더>/assets/mon/<key>/{idle,attack,hit,dead}_1.png
   <폴더>/assets/hero/<key>/{idle,attack,hit,dead}_1.png
   <폴더>/assets/comp/<id>.png
   ```
3. 들인다.
   ```bash
   node tools/make-mon.mjs "<폴더>"
   node tools/normalize-sprites.mjs
   ```
4. 게임에서 확인하고, 실제 쓴 설정을 원본 JSON 의 `generated` 에 기록한다.

### 배경

```bash
node tools/make-bg.mjs "<생성한 원본 PNG>" swamp
```

9:5 로 자르고 1080×600 · 256색으로 저장한다.

## 확인할 것

- **dead 가 납작한가.** 세워져 있으면 쓰러진 게 아니라 작아진 것처럼 보인다
- **몬스터는 attack 오른쪽 / hit 왼쪽, 용사는 반대** (용사가 왼쪽을 본다)
- **도감에서 나란히 봤을 때** 실루엣만으로 구별되는가 (성장 → 몬스터)
- **어두운 지역**(해골 동굴·그림자 숲·용암 지대)에서 어두운 캐릭터가 묻히지 않는가
- **배경**: 캐릭터 발 높이(70%)가 지면 위에 떨어지는가, 중앙이 비어 있는가
