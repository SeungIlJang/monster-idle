// 모듈이 **import 하지 않은 이름**을 쓰고 있는지 본다.
//
// `node --check` 는 문법만 본다. 다른 모듈의 export 를 import 없이 쓰면 그 줄이 실제로
// 돌 때까지 아무도 모르고, 돌면 ReferenceError 로 죽는다.
//
// 실제로 offline.js 가 goldMul 을 import 없이 써서 **시작 버튼이 안 눌렸다.**
// main.js 가 showTitle(80행) 보다 먼저 그 함수를 불러 던졌고, 그래서 버튼에 핸들러가
// 영영 안 붙었다. 증상은 "버튼이 안 눌림" 인데 원인은 전혀 다른 파일이었다.
//
// 사용: node tools/check-imports.mjs
import fs from 'node:fs';
import path from 'node:path';

const SRC = path.resolve(import.meta.dirname, '..', 'src');
const files = fs.readdirSync(SRC).filter(f => f.endsWith('.js'));

/** 주석 줄을 걷어낸다 — 설명에 적힌 이름까지 "쓴다" 고 보면 거짓 경보가 쏟아진다 */
const stripComments = s => s
  .split('\n')
  .filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l))
  .join('\n');

/** 중괄호 import 목록에서 이름만 뽑는다 (as 별칭은 별칭 쪽이 실제 이름이다) */
function namesIn(list) {
  return list.split(',')
    .map(p => p.trim().split(/\s+as\s+/).pop().trim())
    .filter(Boolean);
}

// 1) 파일마다 무엇을 export 하는지
const exportsOf = new Map();
for (const f of files) {
  const s = fs.readFileSync(path.join(SRC, f), 'utf8');
  const names = new Set();
  for (const m of s.matchAll(/^export\s+(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/gm)) names.add(m[1]);
  for (const m of s.matchAll(/^export\s+(?:const|let|var)\s+([A-Za-z_$][\w$]*)/gm)) names.add(m[1]);
  for (const m of s.matchAll(/^export\s*\{([^}]*)\}/gm)) for (const n of namesIn(m[1])) names.add(n);
  exportsOf.set(f, names);
}

let bad = 0;
for (const f of files) {
  const raw = fs.readFileSync(path.join(SRC, f), 'utf8');
  const code = stripComments(raw);

  const imported = new Set();
  for (const m of raw.matchAll(/import\s*\{([^}]*)\}\s*from/g)) for (const n of namesIn(m[1])) imported.add(n);
  for (const m of raw.matchAll(/import\s+(?:\*\s+as\s+)?([A-Za-z_$][\w$]*)\s*(?:,|from)/g)) imported.add(m[1]);
  // 동적 import 의 구조분해 — main.js 가 부팅 순서 때문에 이 꼴을 쓴다:
  //   const { ensureKeys } = await import('./dungeon.js');
  // 이걸 못 읽으면 멀쩡한 파일에 거짓 경보가 쏟아진다.
  for (const m of raw.matchAll(/(?:const|let|var)\s*\{([^}]*)\}\s*=\s*await\s+import\s*\(/g))
    for (const part of m[1].split(',')) {
      const n = part.includes(':') ? part.split(':').pop().trim() : part.trim();
      if (n) { imported.add(n); imported.add(part.split(':')[0].trim()); }
    }

  // 이 파일이 스스로 정의한 이름. 놓치면 거짓 경보가 되므로 넉넉히 잡는다.
  const local = new Set();
  const defRes = [
    /(?:^|[\s;{])(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/g,
    /(?:^|[\s;{])(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)/g,
    /(?:^|[\s;{])class\s+([A-Za-z_$][\w$]*)/g,
  ];
  for (const re of defRes) for (const m of code.matchAll(re)) local.add(m[1]);

  for (const [other, names] of exportsOf) {
    if (other === f) continue;
    for (const n of names) {
      if (imported.has(n) || local.has(n)) continue;
      // `이름(` 로 불리고 있는가. 앞에 . 이나 따옴표가 붙은 건 다른 것이다.
      const used = new RegExp('(?<![\\w$.\'"`])' + n + '\\s*\\(').test(code);
      if (used) {
        console.log(`  ✗ ${f}: ${n}() 를 쓰는데 import 가 없다  (${other} 의 export)`);
        bad++;
      }
    }
  }
}

console.log(bad ? `\n${bad}건 — 고쳐야 한다` : '모든 모듈이 쓰는 이름을 제대로 들여온다');
process.exit(bad ? 1 : 0);
