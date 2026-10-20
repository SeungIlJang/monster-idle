// Capacitor 용 웹 루트(www/)를 만든다.
// 개발은 프로젝트 루트를 그대로 서빙하지만(server.mjs), 앱에 넣을 때는
// node_modules·tools·문서를 빼고 실행에 필요한 것만 모아야 한다.
//
// 사용: npm run build
import fs from 'node:fs';
import path from 'node:path';

const HERE = path.resolve(import.meta.dirname, '..');
const OUT = path.join(HERE, 'www');

const INCLUDE = ['index.html', 'src', 'assets'];

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

let files = 0, bytes = 0;
for (const name of INCLUDE) {
  const from = path.join(HERE, name);
  if (!fs.existsSync(from)) { console.warn('  건너뜀(없음): ' + name); continue; }
  const to = path.join(OUT, name);
  fs.cpSync(from, to, { recursive: true });
}
(function walk(p) {
  for (const e of fs.readdirSync(p, { withFileTypes: true })) {
    const q = path.join(p, e.name);
    if (e.isDirectory()) walk(q);
    else { files++; bytes += fs.statSync(q).size; }
  }
})(OUT);

console.log(`www/ 생성 · 파일 ${files}개 · ${(bytes / 1048576).toFixed(1)}MB`);
console.log('다음: npx cap sync android');
