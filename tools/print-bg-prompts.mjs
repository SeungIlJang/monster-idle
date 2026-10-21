// assets/bg/prompts.json 을 지역별로 복사할 수 있는 프롬프트로 펼친다.
// 기본: generated 에 없는 지역. 완료한 지역도 키를 지정하거나 --all 로 출력 가능.
// node tools/print-bg-prompts.mjs --out docs/prompts/bg
// node tools/print-bg-prompts.mjs swamp cave
// node tools/print-bg-prompts.mjs --all
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/bg/prompts.json'), 'utf8'));

function main() {
  const args = process.argv.slice(2);
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
  if (all && keys.length) throw new Error('--all 과 지역 키는 함께 지정할 수 없습니다.');
  const known = new Set(SOURCE.zones.map(z => z.key));
  const unknown = keys.filter(k => !known.has(k));
  if (unknown.length) throw new Error(`맞는 키가 없습니다: ${unknown.join(', ')}. 가능: ${[...known].join(' ')}`);
  const generated = new Set((SOURCE.generated || []).map(z => z.key));
  const picked = SOURCE.zones.filter(z => keys.length ? keys.includes(z.key) : all || !generated.has(z.key));
  // 모든 치환을 먼저 검사해 불완전한 파일 묶음을 만들지 않는다.
  const built = picked.map(zone => ({
    zone,
    text: SOURCE.promptTemplate.replace(/\{(common|zone)\.(\w+)\}/g, (_, scope, key) => {
      const value = (scope === 'common' ? SOURCE.common : zone)[key];
      if (typeof value !== 'string') throw new Error(`${zone.key}: ${scope}.${key} 가 없습니다.`);
      return value;
    }),
  }));
  for (const { zone, text } of built) {
    if (/\{[^{}]+\}/.test(text)) throw new Error(`${zone.key}: 치환하지 못한 변수가 있습니다.`);
  }
  if (outDir && built.length) fs.mkdirSync(path.resolve(ROOT, outDir), { recursive: true });
  for (const { zone, text } of built) {
    if (outDir) {
      const dest = path.resolve(ROOT, outDir, `${zone.key}.txt`);
      fs.writeFileSync(dest, text + '\n', 'utf8');
      console.log(`${zone.key.padEnd(10)} ${zone.name} → ${path.relative(ROOT, dest)} (${text.length}자)`);
    } else {
      console.log(`\n───────── ${zone.key} · ${zone.name} ─────────\n${text}`);
    }
  }
  console.log(`\n${built.length}개 지역.${outDir ? '' : ' --out <폴더> 로 한 지역에 한 파일씩 저장합니다.'}`);
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
