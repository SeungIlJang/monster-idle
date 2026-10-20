// 공용 아트 라이브러리에서 이 프로젝트로 스프라이트를 복사한다.
// roster 매핑은 src/balance.json 하나만 본다 — 이름을 여기 중복으로 적지 않는다.
//
// 중요: Unity 에셋팩에는 이미 배경이 제거된 `Transparent/` 변형이 들어있다.
// 구버전 프로젝트는 런타임에 flood-fill 로 배경을 지우다 6MB 전송과 시작 지연을 만들었다.
// 여기서는 Transparent 를 그대로 복사하고 런타임 이미지 처리는 하지 않는다(DESIGN.md §2).
//
// 용사(Heroes)만 복사한다. 몬스터는 에셋팩의 프레임이 시트를 잘못 자른 것이라 쓸 수 없고,
// tools/make-monster-sprites.mjs 가 도감 시트에서 직접 만든다.
//
// 사용: node tools/copy-assets.mjs && node tools/make-monster-sprites.mjs
import fs from 'node:fs';
import path from 'node:path';

const SRC = 'D:/AI/workspace/game/images/image/Unity_IdleRPG_Complete_Assets';
const HERE = path.resolve(import.meta.dirname, '..');
const OUT = path.join(HERE, 'assets');

const B = JSON.parse(fs.readFileSync(path.join(HERE, 'src', 'balance.json'), 'utf8'));
const ANIMS = ['Idle', 'Attack', 'Hit', 'Dead'];   // Walk 은 전투 레이아웃에서 쓰지 않아 제외

let copied = 0, missing = [];

function copySet(srcRoot, dir, outDir, frames) {
  for (const anim of ANIMS) {
    const n = frames[anim.toLowerCase()] ?? 0;
    for (let i = 1; i <= n; i++) {
      const name = `${anim}_Frame_${String(i).padStart(2, '0')}.png`;
      const from = path.join(srcRoot, dir, 'Transparent', anim, name);
      const to = path.join(outDir, `${anim.toLowerCase()}_${i}.png`);
      if (!fs.existsSync(from)) { missing.push(path.relative(SRC, from)); continue; }
      fs.mkdirSync(outDir, { recursive: true });
      fs.copyFileSync(from, to);
      copied++;
    }
  }
}

for (const h of B.roster.heroes) {
  copySet(path.join(SRC, 'Heroes'), h.dir, path.join(OUT, 'hero', h.key), B.anim.hero);
}

// 실제 복사된 프레임 수를 매니페스트로 남긴다 — 런타임이 몇 장을 기대해야 하는지 알아야 한다
const prev = fs.existsSync(path.join(OUT, 'manifest.json'))
  ? JSON.parse(fs.readFileSync(path.join(OUT, 'manifest.json'), 'utf8')) : {};
const manifest = { mon: prev.mon || {}, hero: {} };
for (const [group, list] of [['hero', B.roster.heroes]]) {
  for (const item of list) {
    const d = path.join(OUT, group, item.key);
    const counts = {};
    for (const anim of ANIMS) {
      const a = anim.toLowerCase();
      let n = 0;
      while (fs.existsSync(path.join(d, `${a}_${n + 1}.png`))) n++;
      if (n) counts[a] = n;
    }
    manifest[group][item.key] = counts;
  }
}
fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2));

const bytes = (function du(p) {
  let t = 0;
  for (const e of fs.readdirSync(p, { withFileTypes: true })) {
    const q = path.join(p, e.name);
    t += e.isDirectory() ? du(q) : fs.statSync(q).size;
  }
  return t;
})(OUT);

console.log(`복사 ${copied}장 · ${(bytes / 1048576).toFixed(1)}MB · assets/manifest.json 작성`);
if (missing.length) {
  console.log(`없는 프레임 ${missing.length}개 (매니페스트에서 자동 제외):`);
  for (const m of missing.slice(0, 10)) console.log('  ' + m);
}
