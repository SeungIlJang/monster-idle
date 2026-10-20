# 무럭무럭 몬스터

방치형 RPG. **인간 용사들이 몬스터의 숲을 침략했고, 플레이어는 몬스터가 되어 용사를 사냥한다.**
레전드 오브 슬라임을 모티브로 하되, 슬라임 한 마리를 꾸미는 대신 **몬스터 10종이 각각 플레이어블**이다.

웹(캔버스)으로 돌아가고, Capacitor 로 안드로이드 앱으로 감싼다. 런타임 의존성은 없다 — 순수 ES 모듈.

## 실행

```bash
npm install
npm run dev        # http://localhost:5180
```

안드로이드:

```bash
npm run android    # build → cap sync → Android Studio 열기
```

## 설계 문서

**[DESIGN.md](DESIGN.md) 가 이 프로젝트의 중심이다.** 수식·상수·레이어 구조와 더불어
**무엇이 시뮬레이션으로 검증됐고 무엇이 아직 아닌지**를 구분해 적어두었다.

- [docs/reference-legend-of-slime.md](docs/reference-legend-of-slime.md) — 모티브 게임 화면 분석과 적용 우선순위.
  무엇을 가져오고 **무엇을 가져오지 않을지**를 이유와 함께 적었다.

이 프로젝트의 규칙 하나: **시뮬레이터에서 판정을 받은 뒤에 게임에 구현한다.**
`tools/design-sim.cjs` 와 게임은 `src/balance.json` 하나를 같이 읽으므로, 상수를 고치면
양쪽이 동시에 바뀐다. 상수를 손봤으면 구현 전에 검증부터 돌린다.

```bash
npm run sim        # 30일
npm run sim:long   # 365일
```

통과해야 하는 판정 5가지: 벽 없음 · 로그 곡선 · 사망률 · 첫 30일 중위 클리어 · 골드성장 > 적체력성장.

## 구조

```
src/            게임 — balance.json 이 단일 진실 공급원
  balance.json  모든 상수. 시뮬레이터와 공유한다
  combat.js     실시간 전투
  render.js     캔버스 렌더 (배경·스프라이트·이펙트)
  mine.js       광산 타일 미니게임
  ads.js        리워드 광고 (보상은 광고 완료 후에만 지급)
tools/          빌드 시점 전용. 런타임에서는 쓰지 않는다
  design-sim.cjs      로그공간 기대값 시뮬레이터
  make-bg.mjs         배경 원본 → 9:5 1080x600 PNG
  normalize-sprites.mjs  프레임 선별 · bbox · 테두리 정리
  png.mjs             최소 PNG 디코더/인코더 (node:zlib 만)
assets/         가공이 끝난 아트. 원본 에셋팩은 저장소에 없다
  bg/           전투 배경 — README.md 에 지역별 규격과 프롬프트
android/        Capacitor 안드로이드 프로젝트
```

### 아트 파이프라인

런타임 이미지 처리는 하지 않는다. 스프라이트 가공은 전부 빌드 시점에 끝낸다.

```bash
npm run assets                                   # 시트에서 자르기 → 정규화
npm run bg -- "경로/battle-swamp-v1.png" swamp   # 배경 한 장 추가
```

`npm run assets` 는 공용 아트 라이브러리(`D:/AI/workspace/game/images`)를 읽는다.
그 폴더가 없으면 돌릴 수 없지만, 결과물(`assets/`)은 커밋되어 있으므로 게임 실행에는 지장이 없다.

## 상태

플레이 가능하다. 전투 · 11스탯 강화 · 가챠 3배너 · 던전 2종 · 일일/출석 · 광산 · 몬스터 수집 ·
마스터리 · 연구가 들어가 있고, 밸런스는 30/365/730일 시뮬레이션을 통과했다.

아직인 것은 DESIGN.md §14 에 적어두었다 — 실기기 검증, 배경 9장, 스킬바, 3단계 레이어.
