// assets/mon/sheets.json 을 붙여넣을 수 있는 프롬프트 문장으로 펼친다.
//
//   node tools/print-mon-prompts.mjs            # 전부
//   node tools/print-mon-prompts.mjs goblin bat # 일부만
//   node tools/print-mon-prompts.mjs --out .tmp/prompts   # 파일로 한 종에 한 장씩
//
// 생성한 시트는 2x2 로 잘라 assets/mon/<key>/{idle,attack,hit,dead}_1.png 모양으로 두고
// tools/make-mon.mjs 로 들이면 된다.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const S = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/mon/sheets.json'), 'utf8'));

const args = process.argv.slice(2);
const outIdx = args.indexOf('--out');
const outDir = outIdx >= 0 ? args[outIdx + 1] : null;
const keys = args.filter((a, i) => !a.startsWith('--') && i !== outIdx + 1);

const build = m => S.template.replace(/\{(\w+)\}/g, (_, k) => {
  if (m[k] === undefined) throw new Error(`${m.key}: '${k}' 가 sheets.json 에 없다`);
  return m[k];
});

const picked = keys.length ? S.monsters.filter(m => keys.includes(m.key)) : S.monsters;
if (!picked.length) {
  console.error('맞는 키가 없다. 가능: ' + S.monsters.map(m => m.key).join(' '));
  process.exit(1);
}

if (outDir) fs.mkdirSync(path.resolve(ROOT, outDir), { recursive: true });

for (const m of picked) {
  const text = build(m);
  if (outDir) {
    const f = path.resolve(ROOT, outDir, `${m.key}.txt`);
    fs.writeFileSync(f, text + '\n');
    console.log(`${m.key.padEnd(10)} ${m.name.padEnd(8)} → ${path.relative(ROOT, f)} (${text.length}자)`);
  } else {
    console.log(`\n───────── ${m.key} · ${m.name} ─────────\n${text}`);
  }
}
if (!outDir) console.log(`\n${picked.length}종. --out <폴더> 를 주면 한 종에 한 파일로 쓴다.`);
