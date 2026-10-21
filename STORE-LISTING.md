# 무럭무럭 몬스터 — Play 스토어 등록 자료

- 패키지명: `com.moduseries.monsteridle` · 퍼블리셔: 모두의시리즈 · 카테고리: **게임 > 롤플레잉**(또는 캐주얼)
- 버전: versionCode **1** / versionName **1.0** · targetSdk 34 · minSdk 22 · Capacitor 6
- AAB: `android/app/build/outputs/bundle/release/app-release.aab` (서명됨)
- 업로드 키: `C:\dev\keystores\monsteridle-upload.jks` (alias `monsteridle`) — ⚠️ repo 커밋 금지, 반드시 백업(분실 시 업데이트 불가)
- 개인정보처리방침 URL: `https://seungiljang.github.io/games/monsteridle-privacy.html`
- 스토어 이미지: `store-assets/icon-512.png` · `store-assets/feature-1024x500.png` · 스크린샷 `store-assets/*.png`

---

## 🇰🇷 한국어

### 앱 이름 (최대 30자)
무럭무럭 몬스터

### 간단한 설명 (최대 80자)
이번엔 네가 몬스터다! 숲을 침략한 용사를 사냥하는 귀여운 방치형 RPG 🐲

### 자세한 설명 (최대 4000자)
◆ 무럭무럭 몬스터 ◆
인간 용사들이 몬스터의 숲을 침략했다!
이번엔 당신이 몬스터가 되어 용사를 사냥할 차례입니다.

🐲 역할 반전 방치형 RPG
· 용사가 "악당", 몬스터가 숲을 지키는 주인공! 신선한 역할 반전
· 리드 몬스터 1기 + 동료 몬스터 최대 5기로 파티를 꾸려 전투
· 슬라임·고블린·오크·스켈레톤·골렘·드래곤 등 다양한 몬스터 수집·성장

⚔️ 자동 전투 + 깊은 성장
· 방치하는 동안에도 몬스터가 알아서 용사를 처치하고 성장
· 레벨업·스탯 강화·장비·가챠로 점점 강해지는 손맛
· 던전, 광산, 일일 콘텐츠로 매일 즐길 거리

👑 8명의 네임드 용사 보스
· 카엘 아이언블레이드, 알드릭 이지스, 사일러스 나이트베일 등
· 챕터를 진행하며 강력한 용사 보스에 맞서 싸우세요

🎮 가볍게, 귀엽게
· 복잡한 조작 없이 누구나 즐기는 방치형
· 귀엽고 코믹한 몬스터 아트와 연출
· 오프라인에서도 성장이 이어지는 방치 보상

■ 이런 분께 추천해요
· 방치형·수집형 RPG를 좋아하는 분
· 가볍게 성장의 재미를 즐기고 싶은 분
· 귀여운 몬스터 캐릭터를 모으고 키우고 싶은 분

※ 인앱 결제는 없습니다. 게임 기록은 기기에 저장돼요. (무료 제공을 위해 보상형 광고가 포함됩니다.)

---

## 🇺🇸 English (선택)

### Title
Monster Grow Idle

### Short description
This time, YOU are the monster! Hunt the heroes who invaded the forest in this cute idle RPG.

### Full description
Human heroes have invaded the monsters' forest — now it's your turn to fight back!

🐲 Role-Reversal Idle RPG
Play as the monsters defending their home. Lead one main monster plus up to five companions, collect and grow slimes, goblins, orcs, skeletons, golems, dragons and more.

⚔️ Auto-Battle & Deep Growth
Your party hunts heroes and grows even while you're away. Level up, upgrade stats, gear, and gacha to get stronger. Dungeons, mines, and daily content keep you coming back.

👑 8 Named Hero Bosses
Face powerful hero bosses — Kael Ironblade, Aldric Aegis, Sylas Nightveil and more — as you progress through chapters.

🎮 Light & Cute
Simple idle gameplay anyone can enjoy, with cute, comic monster art and offline idle rewards.

No in-app purchases. Progress is saved on your device. (Includes rewarded ads to keep the game free.)

---

## Play Console 입력 가이드

| 항목 | 입력값 |
|---|---|
| 앱/게임 | 게임 · 무료 |
| 광고 포함 | **예** (AdMob 보상형 리워드) |
| 콘텐츠 등급 설문 | 가벼운 판타지 전투(만화적). 선정성·도박·위치공유 "아니요" → 전체~낮은 연령 예상 |
| 타겟층 | **만 13세 이상** 권장 |
| 데이터 보안 | 게임 진행도는 기기에만 저장(서버 전송 없음). 단, **AdMob 광고가 광고 식별자(기기 또는 기타 ID)를 수집** → 데이터 안전성 "기기 또는 기타 ID 수집·광고 목적" 체크, **광고 ID 선언 = "예"** |
| 개인정보처리방침 | `https://seungiljang.github.io/games/monsteridle-privacy.html` |

## ⚠️ 출시 전 필수 체크
- [ ] **광고**: 현재 `src/ads.json`의 `useTest=true`(테스트 광고, 수익 0). 실수익 원하면 AdMob 콘솔에서 실 리워드 ID 발급 → `ads.json`의 `real.rewarded` 채우고 `useTest=false`, 매니페스트 App ID도 실 ID로 교체 후 재빌드.
- [ ] **targetSdk**: 현재 34. Play가 신규 앱에 35를 요구하면 `variables.gradle`에서 35로 올려 재빌드 필요.
- [ ] 업로드 키 백업.
- [ ] 신규 개인 개발자 계정이면 비공개 테스트 12명·14일 후 프로덕션 신청 가능.
