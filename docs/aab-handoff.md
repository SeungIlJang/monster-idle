# AAB 빌드 담당에게 — 무럭무럭 몬스터

Capacitor 앱입니다. 웹 본체는 완성돼 있습니다.

> **갱신 (2026-10-29)** — `8596fa1` 에서 **AdMob 실 ID 와 버전이 이미 들어갔습니다**
> (`useTest:false`, 보상형·배너 실 단위, AndroidManifest 앱 ID, `versionCode 6` / `versionName 1.0.5`).
> 아래 **1-2 는 끝났습니다.** 남은 차단 요소는 **1-1 서명 키스토어 하나**입니다.

## 프로젝트

| | |
|---|---|
| 경로 | `D:\AI\workspace\game\monster-idle` |
| appId | `com.moduseries.monsteridle` |
| 앱 이름 | 무럭무럭 몬스터 |
| 현재 버전 | `versionCode 6` · `versionName "1.0.5"` (`android/app/build.gradle`) |
| SDK | minSdk 24 · compileSdk 36 · targetSdk 36 (`android/variables.gradle`) |
| 웹 번들 | `www/` · 약 16.8MB (대부분 몬스터·배경 PNG) |

## 1. 먼저 사용자와 확정할 것 — 이게 없으면 스토어에 못 올립니다

### 1-1. 서명 키스토어 (없음)

`android/app/build.gradle` 은 `android/keystore.properties` 를 읽게 돼 있고, **파일이 없으면
릴리스를 서명 없이 빌드합니다.** 지금 그 파일도 `.jks` 도 없습니다.

사용자가 기존 키스토어를 갖고 있는지 먼저 물어보세요. **한 번 올린 앱은 같은 키로만 갱신할 수
있어서, 키를 새로 만들지 기존 걸 쓸지는 사용자만 정할 수 있습니다.**

없다면 `keytool -genkeypair` 로 만들고 `android/keystore.properties` 에 적습니다:

    storeFile=../keystore/monsteridle.jks
    storePassword=…
    keyAlias=monsteridle
    keyPassword=…

- `keystore.properties` 와 `*.jks` 는 이미 `.gitignore` 에 들어 있습니다(확인함). 그래도
  커밋 전에 `git status` 로 한 번 보세요.
- 비밀번호는 사용자가 직접 입력하게 하고, 대화나 파일에 평문으로 남기지 마세요.
- 키를 잃어버리면 그 앱은 영영 갱신 못 합니다. 백업 위치를 사용자에게 확인받으세요.

### 1-2. AdMob 실제 광고 ID — ✅ 끝남 (`8596fa1`)

세 군데 다 실제 값으로 바뀐 걸 확인했습니다: `src/ads.json` 의 `useTest:false` 와
`real.rewarded`·`real.banner`, `AndroidManifest.xml` 의 `APPLICATION_ID`.
`ads.json` 에 남아 있는 `ca-app-pub-3940256099942544…` 두 개는 `test` 블록이라 그대로 두면 됩니다.

알아 둘 동작 하나 — `useTest:false` 에서 광고를 못 띄우면 **네이티브에서만** 보상을 건너뜁니다.
웹(브라우저로 연 OTA 배포본)은 `isNative()` 가 false 라 예전처럼 2초 시뮬레이션으로 보상이
나갑니다. 의도된 동작이고 이번 변경으로 생긴 게 아니지만, 웹에서 테스트할 때 혼동하지 마세요.

## 2. 빌드

필요한 것: JDK 17 이상(이 PC 에는 21 설치돼 있음), Android SDK(platform 36, build-tools).
`android/local.properties` 가 **아직 없습니다** — `ANDROID_HOME` 을 잡아 두면 `cap sync` 가
만들고, 아니면 직접 `sdk.dir` 을 적어야 합니다. 현재 SDK 설치 여부는 확인하지 못했습니다.

    cd /d/AI/workspace/game/monster-idle
    npm run sync                 # www/ 재생성 + npx cap sync android
    cd android
    ./gradlew bundleRelease      # AAB
    ./gradlew assembleRelease    # APK (실기기 확인용)

결과물:

- AAB — `android/app/build/outputs/bundle/release/app-release.aab`
- APK — `android/app/build/outputs/apk/release/app-release.apk`

**Play 에 올릴 때마다 `versionCode` 를 직전 업로드보다 키워야 합니다.** 지금 6 이고
`8596fa1` 에서 5→6 으로 올려 둔 상태입니다. 이 6 으로 이미 올린 적이 있으면 또 키워야 하니
사용자에게 업로드 이력을 확인하세요.

## 3. 구조에서 미리 알아야 할 것 — OTA

이 앱은 웹 본체를 원격에서 받아옵니다. `npm run sync` 가 만드는 `www/` 는 이렇게 생겼습니다:

- `www/index.html` — **OTA 로더.** 온라인이면 `seungiljang.github.io/games/monsteridle/` 로 이동
- `www/game.html` — 게임 본체. 원격 실패·오프라인일 때 쓰는 **번들 폴백**

그래서 **AAB 를 다시 안 올려도 원격만 갱신하면 게임 내용이 바뀝니다.** AAB 는 폴백 본체와
네이티브 껍데기를 담는 몫입니다. `capacitor.config.json` 의 `allowNavigation` 에
`seungiljang.github.io` 가 들어 있어야 로더가 동작합니다(현재 들어 있음).

> ⚠️ 지금 원격 배포본이 소스보다 **4개 커밋 뒤처져 있습니다.** AAB 안의 폴백은 최신으로
> 들어가지만, 원격으로 넘어가면 구버전이 뜹니다. 빌드 전에 사용자에게 OTA 배포를
> 먼저 돌릴지 확인하세요. (`node tools/deploy-ota.mjs` → `games` 레포에서 `monsteridle/` 만 커밋·푸시)

## 4. 확인

- APK 를 실기기에 설치해 **첫 실행이 원격을 받아오는지**, 비행기 모드에서 **폴백이 뜨는지** 둘 다.
- 광고 보상(광산 ×2, 오프라인 ×2)이 실제로 지급되는지. 실 ID 로 바꾼 뒤 첫 노출까지 시간이 걸릴 수 있습니다.
- 성장 → 몬스터 탭에 12칸이 다 차고 `?` 가 없는지.
- `minSdk 24` 라 구형 기기 포함입니다. 저사양에서 전투 화면 프레임을 한 번 보세요.

## 5. 손대지 말 것

- `D:\AI\workspace\game\games` 레포의 `monsteridle/` **외 경로** — `gallog.html`·`ppopgi.html`·
  `baedal.html`·`doll-delivery/`·`linedefense/` 등은 다른 담당자 작업물입니다.
- 게임 밸런스(`src/balance.json`)와 아트. 빌드 건으로 바꿀 일이 없습니다.
- 키스토어·비밀번호를 커밋하거나 로그에 남기는 것.
