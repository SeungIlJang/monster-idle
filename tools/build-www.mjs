// Capacitor 용 웹 루트(www/)를 만든다.
// 개발은 프로젝트 루트를 그대로 서빙하지만(server.mjs), 앱에 넣을 때는
// node_modules·tools·문서를 빼고 실행에 필요한 것만 모아야 한다.
//
// 사용: npm run build
import fs from 'node:fs';
import path from 'node:path';

const HERE = path.resolve(import.meta.dirname, '..');
const OUT = path.join(HERE, 'www');

// OTA 구조:
//  - www/index.html = OTA 로더(tools/ota-loader.html). 온라인이면 원격(games-site/monsteridle/)으로 이동,
//    실패/오프라인이면 번들된 game.html 폴백.
//  - www/game.html  = 게임 본체(루트 index.html). 오프라인 폴백 + src/assets 상대경로 참조.
//  - 게임 수정은 games 레포(games-site/monsteridle/)에 배포하면 즉시 반영(AAB 재빌드 불필요).
const INCLUDE = ['src', 'assets'];

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

let files = 0, bytes = 0;
for (const name of INCLUDE) {
  const from = path.join(HERE, name);
  if (!fs.existsSync(from)) { console.warn('  건너뜀(없음): ' + name); continue; }
  const to = path.join(OUT, name);
  fs.cpSync(from, to, { recursive: true });
}
// ── 통짜 배경 솎아내기 ──────────────────────────────────────
// 패럴랙스 층을 갖춘 지역은 통짜 배경이 **같은 픽셀의 중복**이다 —
// `_2_mid`(원본 y<420) 와 `_3_ground`(원본 y>=420) 를 합치면 원본 그 자체다.
// 둘 다 실으면 지역당 ~320KB, 10지역이면 3.2MB 를 같은 그림으로 두 번 싣는다.
//
// **원본은 레포에 남긴다.** tools/split-bg-from-original.mjs 가 층을 다시 만들 때 쓰고,
// 층이 없는 지역의 폴백이기도 하다. 빼는 건 앱에 싣는 사본뿐이다.
//
// 대가: 층을 받다 실패하면 통짜 대신 그라데이션이 보인다. 층과 통짜는 같은 배포에
// 같이 올라가므로 한쪽만 실패할 일은 드물고, 그 드문 경우에 3.2MB 를 내내 지고 다닐
// 이유는 없다고 봤다. 되돌리려면 이 블록만 지우면 된다.
// 타이틀 화면 CSS(index.html .tbg)가 이 한 장을 직접 가리킨다 — 빼면 제목 배경이 빈다.
const TITLE_BG = 'forest';
const layerDir = path.join(OUT, 'assets', 'bg', 'layers');
let dropped = 0, droppedBytes = 0;
if (fs.existsSync(layerDir)) {
  const bgDir = path.join(OUT, 'assets', 'bg');
  for (const f of fs.readdirSync(bgDir)) {
    const m = /^(.+)\.png$/.exec(f);
    if (!m) continue;
    const zone = m[1];
    if (zone === TITLE_BG) continue;
    // 필수 층(중경·지면)이 다 있는 지역만 뺀다
    const has = ['2_mid', '3_ground'].every(n => fs.existsSync(path.join(layerDir, `${zone}_${n}.png`)));
    if (!has) continue;
    const p = path.join(bgDir, f);
    droppedBytes += fs.statSync(p).size;
    fs.rmSync(p);
    dropped++;
  }
}

// 게임 본체 → game.html (오프라인 폴백)
fs.copyFileSync(path.join(HERE, 'index.html'), path.join(OUT, 'game.html'));
// OTA 로더 → index.html (앱 진입점)
fs.copyFileSync(path.join(HERE, 'tools', 'ota-loader.html'), path.join(OUT, 'index.html'));
(function walk(p) {
  for (const e of fs.readdirSync(p, { withFileTypes: true })) {
    const q = path.join(p, e.name);
    if (e.isDirectory()) walk(q);
    else { files++; bytes += fs.statSync(q).size; }
  }
})(OUT);

console.log(`www/ 생성 · 파일 ${files}개 · ${(bytes / 1048576).toFixed(1)}MB`
  + (dropped ? `  (층을 갖춘 통짜 배경 ${dropped}장 제외 — ${(droppedBytes / 1048576).toFixed(1)}MB 절약)` : ''));
console.log('다음: npx cap sync android');
