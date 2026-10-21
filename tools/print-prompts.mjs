// 생성용 프롬프트를 붙여넣을 수 있는 문장으로 펼친다.
//
//   node tools/print-prompts.mjs bg                      # 아직 생성 안 한 것만
//   node tools/print-prompts.mjs mon goblin bat          # 일부만
//   node tools/print-prompts.mjs hero --out docs/prompts/hero
//   node tools/print-prompts.mjs bg --all                # 완료한 것까지 전부
//
// 원본 JSON 은 common(선택) · poses(선택) · <항목배열> · promptTemplate · generated 형태다.
// 자리표시자는 {common.x} · {item.x} · {pose.<키>} 세 가지뿐이다.
// 네 그룹이 같은 형식이라 스크립트 하나로 처리한다 — 예전에는 bg 와 mon 이 거의 같은
// 스크립트를 따로 가지고 있었다.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const GROUPS = {
  bg: { file: 'assets/bg/prompts.json', items: 'zones', what: '지역' },
  mon: { file: 'assets/mon/sheets.json', items: 'monsters', what: '몬스터' },
  comp: { file: 'assets/comp/prompts.json', items: 'companions', what: '동료' },
  hero: { file: 'assets/hero/prompts.json', items: 'heroes', what: '용사' },
};

function main() {
  const args = process.argv.slice(2);
  const group = args.shift();
  if (!group || !GROUPS[group]) {
    throw new Error(`그룹을 지정하세요: ${Object.keys(GROUPS).join(' ')}`);
  }
  const G = GROUPS[group];

  let outDir = null;
  let all = false;
  const keys = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--out') {
      if (outDir !== null || !args[i + 1] || args[i + 1].startsWith('--')) {
        throw new Error('--out 뒤에 출력 폴더를 한 번 지정하세요.');
      }
      outDir = args[++i];
    } else if (arg === '--all') {
      all = true;
    } else if (arg.startsWith('--')) {
      throw new Error(`알 수 없는 옵션: ${arg}`);
    } else {
      keys.push(arg);
    }
  }
  if (all && keys.length) throw new Error('--all 과 키는 함께 지정할 수 없습니다.');

  const S = JSON.parse(fs.readFileSync(path.join(ROOT, G.file), 'utf8'));
  const list = S[G.items];
  if (!Array.isArray(list)) throw new Error(`${G.file} 에 ${G.items} 배열이 없습니다.`);
  const idOf = it => it.key ?? it.id;

  const known = new Set(list.map(idOf));
  const unknown = keys.filter(k => !known.has(k));
  if (unknown.length) {
    throw new Error(`맞는 키가 없습니다: ${unknown.join(', ')}. 가능: ${[...known].join(' ')}`);
  }
  // 기본은 아직 생성하지 않은 것. 이미 만든 것을 다시 뽑으려면 키를 직접 주거나 --all.
  const done = new Set((S.generated || []).map(g => g.key ?? g.id));
  const picked = list.filter(it => (keys.length ? keys.includes(idOf(it)) : all || !done.has(idOf(it))));

  const poseOf = k => {
    const p = (S.poses || []).find(x => x.key === k);
    if (!p) throw new Error(`poses 에 '${k}' 가 없습니다.`);
    return p.add;
  };

  // 전부 조립해 검사한 뒤에 쓴다 — 중간에 실패해 반쪽짜리 묶음이 남지 않게.
  const built = picked.map(item => ({
    item,
    text: S.promptTemplate.replace(/\{(common|item|pose)\.(\w+)\}/g, (_, scope, key) => {
      if (scope === 'pose') return poseOf(key);
      const src = scope === 'common' ? S.common : item;
      const v = src?.[key];
      if (typeof v !== 'string') throw new Error(`${idOf(item)}: ${scope}.${key} 가 없습니다.`);
      return v;
    }),
  }));
  for (const { item, text } of built) {
    if (/\{[^{}]+\}/.test(text)) throw new Error(`${idOf(item)}: 치환하지 못한 변수가 있습니다.`);
  }

  if (outDir && built.length) fs.mkdirSync(path.resolve(ROOT, outDir), { recursive: true });
  for (const { item, text } of built) {
    const id = idOf(item);
    if (outDir) {
      const dest = path.resolve(ROOT, outDir, `${id}.txt`);
      fs.writeFileSync(dest, text + '\n', 'utf8');
      console.log(`${id.padEnd(10)} ${(item.name || '').padEnd(8)} → ${path.relative(ROOT, dest)} (${text.length}자)`);
    } else {
      console.log(`\n───────── ${id}${item.name ? ' · ' + item.name : ''} ─────────\n${text}`);
    }
  }
  console.log(`\n${built.length}개 ${G.what}.${outDir ? '' : ' --out <폴더> 로 하나에 한 파일씩 저장합니다.'}`);
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
