// assets/mon/sheets.json 을 붙여넣을 수 있는 프롬프트 문장으로 펼친다.
// 인자 처리와 검증 순서는 tools/print-bg-prompts.mjs 와 맞춰 두었다.
//
//   node tools/print-mon-prompts.mjs                     # 전부
//   node tools/print-mon-prompts.mjs goblin bat          # 일부만
//   node tools/print-mon-prompts.mjs --out docs/prompts/mon
//
// 생성한 시트는 2x2 로 잘라 assets/mon/<key>/{idle,attack,hit,dead}_1.png 모양으로 두고
// tools/make-mon.mjs 로 들이면 된다.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const S = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/mon/sheets.json'), 'utf8'));

function main() {
  const args = process.argv.slice(2);
  let outDir = null;
  const keys = [];
  // 예전에는 indexOf('--out') + filter 로 처리했는데, --out 이 없으면 인덱스가 -1 이라
  // 첫 번째 인자가 통째로 버려졌다("goblin" 하나만 달라고 해도 9종이 다 나왔다).
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--out') {
      if (outDir !== null || !args[i + 1] || args[i + 1].startsWith('--')) {
        throw new Error('--out 뒤에 출력 폴더를 한 번 지정하세요.');
      }
      outDir = args[++i];
    } else if (arg.startsWith('--')) {
      throw new Error(`알 수 없는 옵션: ${arg}`);
    } else {
      keys.push(arg);
    }
  }

  const known = new Set(S.monsters.map(m => m.key));
  const unknown = keys.filter(k => !known.has(k));
  if (unknown.length) {
    throw new Error(`맞는 키가 없습니다: ${unknown.join(', ')}. 가능: ${[...known].join(' ')}`);
  }
  const picked = keys.length ? S.monsters.filter(m => keys.includes(m.key)) : S.monsters;

  // 모두 조립해 검사한 뒤에 쓴다 — 중간에 실패해 반쪽짜리 묶음이 남지 않게.
  const built = picked.map(m => ({
    m,
    text: S.template.replace(/\{(\w+)\}/g, (_, k) => {
      if (typeof m[k] !== 'string') throw new Error(`${m.key}: '${k}' 가 sheets.json 에 없습니다.`);
      return m[k];
    }),
  }));
  for (const { m, text } of built) {
    if (/\{[^{}]+\}/.test(text)) throw new Error(`${m.key}: 치환하지 못한 변수가 있습니다.`);
  }

  if (outDir && built.length) fs.mkdirSync(path.resolve(ROOT, outDir), { recursive: true });
  for (const { m, text } of built) {
    if (outDir) {
      const dest = path.resolve(ROOT, outDir, `${m.key}.txt`);
      fs.writeFileSync(dest, text + '\n', 'utf8');
      console.log(`${m.key.padEnd(10)} ${m.name.padEnd(8)} → ${path.relative(ROOT, dest)} (${text.length}자)`);
    } else {
      console.log(`\n───────── ${m.key} · ${m.name} ─────────\n${text}`);
    }
  }
  console.log(`\n${built.length}종.${outDir ? '' : ' --out <폴더> 로 한 종에 한 파일씩 저장합니다.'}`);
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
