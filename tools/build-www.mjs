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

console.log(`www/ 생성 · 파일 ${files}개 · ${(bytes / 1048576).toFixed(1)}MB`);
console.log('다음: npx cap sync android');
