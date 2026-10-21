# 생성용 프롬프트

바로 붙여넣을 수 있게 펼쳐 둔 것이다. **몬스터 원본은 `assets/mon/sheets.json`, 배경 원본은 `assets/bg/prompts.json`** 이고 이 폴더는 그걸
펼친 결과다 — 고칠 일이 있으면 해당 원본 JSON 을 고치고 다시 뽑는다.

```bash
node tools/print-mon-prompts.mjs --out docs/prompts/mon   # 전부 다시 뽑기
node tools/print-mon-prompts.mjs goblin                    # 한 종만 화면에
```

## 몬스터 9종 (`mon/`)

슬라임은 완료. 나머지 9종이 들어 있다.

| 파일 | 몬스터 | 해금 |
|---|---|---|
| `goblin.txt` | 그릭 | 10 |
| `bat.txt` | 나이트윙 | 40 |
| `mushroom.txt` | 스포어링 | 100 |
| `skeleton.txt` | 본가드 | 200 |
| `wolf.txt` | 팽울프 | 400 |
| `ghost.txt` | 레이스 | 700 |
| `orc.txt` | 브락 | 1200 |
| `golem.txt` | 그래니트 | 2000 |
| `dragon.txt` | 이그나리온 | 3000 |

## 쓰는 법

1. **한 종을 한 장으로** 생성한다. 2048×2048 에 2×2 셀, 네 포즈가 한 이미지에 들어간다.
   네 포즈를 따로 받으면 색·비율·광원이 어긋나 전투 중에 프레임이 튄다 — 슬라임도 한 장으로 받았다.
2. 셀 네 개를 잘라 아래 모양으로 둔다. **네 포즈를 같은 배율·하단 중앙 기준으로** 자를 것 —
   렌더는 종마다 `box` 를 idle 하나만 쓰므로, 배율이 다르면 납작한 dead 가 늘어나 버린다.
   ```
   <준비폴더>/assets/mon/<key>/idle_1.png
                              attack_1.png
                              hit_1.png
                              dead_1.png
   ```
3. 들인다.
   ```bash
   node tools/make-mon.mjs "<준비폴더>"
   node tools/normalize-sprites.mjs
   ```
   `make-mon` 이 검사 → 축소(필요시) → 복사 → 매니페스트 → **defringe 건너뛰기 등록**까지 한다.
   마지막이 중요하다: 생성해서 받은 투명 PNG 는 투명 픽셀이 (0,0,0) 이라, 가장자리 보정을
   돌리면 안티에일리어싱된 테두리가 망가진다.
4. 게임에서 확인한다. 특정 몬스터를 선두로 세우려면 성장 → 몬스터 → 타일 → 선두로.

## 확인할 것

- **dead 가 납작한가.** 세워서 그려지면 쓰러진 게 아니라 그냥 작아 보인다
- **attack 은 오른쪽, hit 은 왼쪽.** 적이 오른쪽에 있다
- **무서워지지 않았는가.** 해골·유령·드래곤이 특히 쉽게 무서워지는데, 이들은 플레이어 편이다
- **도감에서 나란히 봤을 때** 열 종이 실루엣만으로 구별되는가 (성장 → 몬스터)

## 용사 8종

`assets/hero/prompts.json` 에 있다. 아직 시트 형식으로 펼치지 않았다 —
몬스터 10종을 끝낸 뒤에 같은 방식으로 뽑는다. 용사는 **왼쪽**을 보게 그려야 한다(몬스터와 반대).

## 배경 9장 (`bg/`)

원본은 **`assets/bg/prompts.json`** 이다. `common` · `zones[].scene` · `promptTemplate` 을
펼친 결과가 아래 파일들이다. 파일 전체를 복사해 한 지역에 한 장씩 생성한다.
문구를 바꿀 때는 원본 JSON 을 고치고 다시 뽑는다.

```bash
node tools/print-bg-prompts.mjs --out docs/prompts/bg  # 미완료 9개를 파일로
node tools/print-bg-prompts.mjs swamp                 # 한 지역만 화면에
node tools/print-bg-prompts.mjs cave lava             # 여러 지역만 화면에
node tools/print-bg-prompts.mjs --all                 # 완료한 숲까지 10개 전부
```

기본 출력은 `generated` 에 없는 지역이다. 완료된 `forest` 는 기본에서 제외하며,
`forest` 키를 직접 지정하거나 `--all` 을 주면 다시 출력할 수 있다.
프롬프트 내보내기는 생성 완료 기록을 변경하지 않는다.

| 파일 | 지역 |
|---|---|
| `swamp.txt` | 버섯 늪 |
| `highland.txt` | 바람 언덕 |
| `cave.txt` | 해골 동굴 |
| `canyon.txt` | 불타는 협곡 |
| `frost.txt` | 서리 평원 |
| `shadow.txt` | 그림자 숲 |
| `ruins.txt` | 폐허 마을 |
| `lava.txt` | 용암 지대 |
| `sky.txt` | 하늘 성채 |

### 생성 → 들이기

1. `.txt` 하나를 통째로 복사해 **가로 9:5 배경 한 장**을 생성한다. 캐릭터나 UI 는 넣지 않는다.
2. 중앙·오른쪽 중앙이 비어 있고, 화면 하단 30% 가 캐릭터가 설 지면인지 확인한다.
   동굴·그림자 숲·용암 지대도 캐릭터가 잘 보이는 밝기와 대비를 유지한다.
3. 원본을 보관하고 아래처럼 지역 키로 들인다.
   ```bash
   node tools/make-bg.mjs "<생성한 원본 PNG 경로>" swamp
   ```
   도구가 9:5 로 자르고 게임용 `assets/bg/swamp.png` 로 저장한다(1080×600).
4. 게임에서 지면 위치·캐릭터 대비·중앙 가림을 확인하고, 실제 생성 설정과 결과를
   `assets/bg/prompts.json` 의 `generated` 에 기록한다.

