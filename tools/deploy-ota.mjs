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
import { execFileSync } from 'node:child_process';

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

// 출처를 games/ota-sources.json 에 남긴다. games 의 신선도 검사(tools/check-ota-freshness.mjs)가
// 이 커밋을 소스 저장소의 현재 HEAD 와 비교해서, 복사를 빠뜨리면 CI 가 빨간불을 낸다.
// 소스만 고치고 여기로 옮기지 않으면 앱은 옛 사본을 계속 받는데 아무 신호가 없어서 넣었다.
const git = (...a) => execFileSync('git', a, { cwd: HERE }).toString().trim();
const sources = path.join(path.dirname(DEST), 'ota-sources.json');
const all = fs.existsSync(sources) ? JSON.parse(fs.readFileSync(sources, 'utf8')) : {};
const dirty = git('status', '--porcelain') !== '';
all['monsteridle'] = { repo: 'monster-idle', commit: git('rev-parse', 'HEAD'), dirty, builtAt: new Date().toISOString() };
// 키 순서를 고정해야 다른 앱을 배포할 때 쓸데없는 diff 가 생기지 않는다.
const sorted = Object.fromEntries(Object.keys(all).sort().map(k => [k, all[k]]));
fs.writeFileSync(sources, JSON.stringify(sorted, null, 2) + '\n');
if (dirty) console.warn('⚠️ 커밋 안 된 변경이 있는 상태로 빌드했다 — 기록한 커밋이 이 배포본과 다르다');

console.log('다음: games 레포에서 monsteridle/ 과 ota-sources.json 커밋·푸시');
