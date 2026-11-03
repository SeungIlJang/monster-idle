// 광고 모드 전환 — 테스트 트랙 AAB 와 프로덕션 AAB 를 가른다.
//
//   node tools/set-ads-mode.mjs test   → capacitor.config.json 의 appendUserAgent 에 MSAdsTest 추가
//   node tools/set-ads-mode.mjs real   → 토큰 제거(기본값)
//   node tools/set-ads-mode.mjs        → 현재 상태만 출력
//
// 게임 코드가 UA 의 MSAdsTest 를 보고 구글 테스트 광고로 전환한다. 테스터가 광고를 눌러도
// 계정에 영향이 없다. 이 앱은 OTA 라 테스트 트랙과 프로덕션이 같은 HTML 을 받으므로,
// AAB 마다 달라질 수 있는 신호는 UA 뿐이다.
//
// 반드시 `npx cap sync android` 앞에서 실행해야 한다. sync 가 이 값을 안드로이드 에셋으로 복사한다.
// 테스트 AAB 를 만든 뒤에는 `real` 로 되돌려 둘 것 — 안 되돌리면 다음 프로덕션 빌드에
// 테스트 광고가 실려 수익이 0 이 된다(2026-10 에 실제로 겪은 사고다).
import { readFileSync, writeFileSync } from 'node:fs';

const TOKEN = 'MSAdsTest';
const FILE = new URL('../capacitor.config.json', import.meta.url);
const mode = process.argv[2];

const cfg = JSON.parse(readFileSync(FILE, 'utf8'));
const ua = (cfg.appendUserAgent ?? '').trim();
const has = ua.split(/\s+/).includes(TOKEN);

if (mode === undefined) {
  console.log(`광고 모드: ${has ? 'TEST (테스트 광고)' : 'REAL (실광고)'}   appendUserAgent=${JSON.stringify(cfg.appendUserAgent ?? null)}`);
  process.exit(0);
}
if (mode !== 'test' && mode !== 'real') {
  console.error('사용법: node tools/set-ads-mode.mjs [test|real]');
  process.exit(1);
}

const next = mode === 'test'
  ? [...ua.split(/\s+/).filter(Boolean), TOKEN].join(' ')
  : ua.split(/\s+/).filter(t => t && t !== TOKEN).join(' ');

if (next) cfg.appendUserAgent = next;
else delete cfg.appendUserAgent;

writeFileSync(FILE, JSON.stringify(cfg, null, 2) + '\n');
console.log(`광고 모드 → ${mode === 'test' ? 'TEST (테스트 광고)' : 'REAL (실광고)'}   appendUserAgent=${JSON.stringify(cfg.appendUserAgent ?? null)}`);
console.log('다음: npx cap sync android');
