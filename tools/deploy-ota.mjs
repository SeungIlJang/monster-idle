// OTA 배포: www/ 를 games 레포(seungiljang.github.io/games/monsteridle/)로 옮긴다.
//
// **www/ 를 그대로 복사하면 안 된다.** build-www.mjs 는 앱 번들용이라 이렇게 만든다:
//   www/index.html = OTA 로더  (원격을 fetch 해서 그쪽으로 이동)
//   www/game.html  = 게임 본체 (오프라인 폴백)
// 로더를 원격에 올리면 로더가 자기 자신을 불러오는 **무한 리다이렉트**가 된다.
// 원격에 올라가야 하는 건 게임 본체 쪽이다:
//
//   www/game.html → <games>/monsteridle/index.html
//   www/src/      → <games>/monsteridle/src/
//   www/assets/   → <games>/monsteridle/assets/
//
// 사용: npm run deploy          (복사만 — 커밋·푸시는 games 레포에서 직접)
import fs from 'node:fs';
import path from 'node:path';

const HERE = path.resolve(import.meta.dirname, '..');
const WWW = path.join(HERE, 'www');
// games 레포는 이 프로젝트 옆에 체크아웃돼 있다 (SeungIlJang/games)
const DEST = process.argv[2] || path.join(HERE, '..', 'games', 'monsteridle');

if (!fs.existsSync(path.join(WWW, 'game.html')))
  throw new Error('www/game.html 이 없다 — npm run build 를 먼저 돌려라');
if (!fs.existsSync(path.dirname(DEST)))
  throw new Error('games 레포를 찾을 수 없다: ' + DEST);

// 지운 파일이 원격에 남지 않도록 통째로 비우고 다시 깐다
fs.rmSync(DEST, { recursive: true, force: true });
fs.mkdirSync(DEST, { recursive: true });
for (const name of ['src', 'assets']) fs.cpSync(path.join(WWW, name), path.join(DEST, name), { recursive: true });
fs.copyFileSync(path.join(WWW, 'game.html'), path.join(DEST, 'index.html'));

// 로더가 섞여 들어갔는지 확인한다. 이게 올라가면 앱이 통째로 멈춘다.
if (fs.readFileSync(path.join(DEST, 'index.html'), 'utf8').includes('REMOTE='))
  throw new Error('index.html 이 OTA 로더다 — 무한 리다이렉트가 된다');

let files = 0, bytes = 0;
(function walk(p) {
  for (const e of fs.readdirSync(p, { withFileTypes: true })) {
    const q = path.join(p, e.name);
    if (e.isDirectory()) walk(q); else { files++; bytes += fs.statSync(q).size; }
  }
})(DEST);
console.log(`배포본 생성 · ${path.relative(path.join(HERE, '..'), DEST)} · 파일 ${files}개 · ${(bytes / 1048576).toFixed(1)}MB`);
console.log('다음: games 레포에서 monsteridle/ 만 커밋·푸시');
