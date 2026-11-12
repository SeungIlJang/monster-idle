// 언어팩 검사 — 빌드 전에 돈다(npm run build). 하나라도 어긋나면 실패한다.
//
//   node tools/check-i18n.mjs          ← 검사
//   node tools/check-i18n.mjs --sync   ← balance.json 의 표시용 이름을 ko.json 의 d.* 키로 채운 뒤 검사
//
// 보는 것:
//   1) 코드에 언어팩으로 안 옮긴 한글이 남았나 (find-ko.mjs)
//   2) ko · en · ja 의 키가 같은가 — 빠진 키는 화면에 키 이름이 그대로 뜬다
//   3) 같은 키의 {변수} 가 세 언어에서 같은가 — 다르면 숫자가 빠지거나 {n} 이 그대로 뜬다
//   4) 코드가 부르는 t('키') 가 팩에 있나 · balance.json 이름(d.*)이 다 있나
//   5) 빈 문구 · 번역 안 된 한글(en/ja 에 한글이 남음)
import fs from 'node:fs';
import path from 'node:path';
import { files, scan, ALLOW } from './find-ko.mjs';
import { dataFields } from '../src/i18n-data.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const LANG_DIR = path.join(ROOT, 'src', 'lang');
const LANGS = ['ko', 'en', 'ja'];
const B = JSON.parse(fs.readFileSync(path.join(ROOT, 'src', 'balance.json'), 'utf8'));
const read = l => JSON.parse(fs.readFileSync(path.join(LANG_DIR, l + '.json'), 'utf8'));
const errs = [];

// --sync: ko.json 에 d.* 를 채운다 (balance.json 의 한국어가 원문)
if (process.argv.includes('--sync')) {
  const ko = read('ko');
  let added = 0;
  for (const [k, o, f] of dataFields(B)) if (ko['d.' + k] === undefined) { ko['d.' + k] = o[f]; added++; }
  fs.writeFileSync(path.join(LANG_DIR, 'ko.json'), JSON.stringify(ko, null, 1) + '\n');
  console.log(`ko.json 에 데이터 이름 ${added}개 추가`);
}

const P = Object.fromEntries(LANGS.filter(l => fs.existsSync(path.join(LANG_DIR, l + '.json'))).map(l => [l, read(l)]));
for (const l of LANGS) if (!P[l]) errs.push(`src/lang/${l}.json 이 없다`);

// 1) 남은 한글
for (const f of files()) {
  if (ALLOW.has(f)) continue;
  for (const [n, line] of scan(f)) errs.push(`${f}:${n} 언어팩으로 안 옮긴 글자 — ${line.slice(0, 90)}`);
}

// 2) 키 집합
const ko = P.ko || {};
for (const l of LANGS.filter(l => l !== 'ko' && P[l])) {
  for (const k of Object.keys(ko)) if (P[l][k] === undefined) errs.push(`${l}.json 에 없는 키 ${k}`);
  for (const k of Object.keys(P[l])) if (ko[k] === undefined) errs.push(`${l}.json 에만 있는 키 ${k} (ko 에 없음)`);
}

// 3) 변수 · 5) 빈 문구 · 한글 잔재
const vars = s => [...String(s).matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort().join(',');
for (const [k, v] of Object.entries(ko)) {
  for (const l of LANGS) {
    const s = P[l]?.[k];
    if (s === undefined) continue;
    if (String(s).trim() === '') errs.push(`${l}.${k} 가 비어 있다`);
    // ko 의 변수는 다른 언어에서 빠져도 된다(예: 한국어 조사 {josa}). 없는 변수를 새로 쓰면 안 된다
    if (l !== 'ko') {
      const extra = vars(s).split(',').filter(x => x && !vars(v).split(',').includes(x));
      if (extra.length) errs.push(`${l}.${k} 에 ko 에 없는 변수 {${extra.join('},{')}}`);
      const lost = vars(v).split(',').filter(x => x && x !== 'josa' && !vars(s).split(',').includes(x));
      if (lost.length) errs.push(`${l}.${k} 에서 변수 {${lost.join('},{')}} 가 빠짐`);
      if (/[가-힣]/.test(s) && k !== 'set.lang') errs.push(`${l}.${k} 에 한글이 남음 — ${s}`);
    }
  }
}

// 4) 코드가 부르는 키
const used = new Set();
for (const f of files()) {
  const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
  for (const m of src.matchAll(/\b(?:t|tr)\(\s*'([\w.]+)'/g)) used.add(m[1]);
  for (const m of src.matchAll(/data-i18n(?:-html|-title)?="([\w.]+)"/g)) used.add(m[1]);
}
used.add('app.title');
for (const k of used) if (ko[k] === undefined && !k.endsWith('.')) errs.push(`코드가 부르는 키 ${k} 가 ko.json 에 없다`);
// 이어 붙여 만드는 키 — 접두사 + 데이터 id
const dyn = [];
for (const [k] of dataFields(B)) dyn.push('d.' + k);
const cat = fs.readFileSync(path.join(ROOT, 'src', 'gacha.js'), 'utf8');
for (const m of cat.matchAll(/\{ id: '(\w+)', icon/g)) dyn.push('d.item.' + m[1]);
for (const i of [1, 2, 3]) dyn.push('mine.tile.' + i);
for (const i of [1, 2, 3, 4, 5]) dyn.push('evo.aura.' + i);
for (const r of B.relics?.list || []) for (const e of Object.keys(r.eff || {})) dyn.push('rfx.' + e);
for (const k of ['mine', 'mon', 'mast', 'res', 'relic', 'pres']) dyn.push('grow.tab.' + k);
for (const k of dyn) if (ko[k] === undefined) errs.push(`데이터 키 ${k} 가 ko.json 에 없다`);

// 안 쓰는 키 — 실패는 아니고 알려만 준다
const all = new Set([...used, ...dyn]);
const unused = Object.keys(ko).filter(k => !all.has(k));

if (errs.length) {
  console.log(`❌ 언어팩 문제 ${errs.length}건`);
  for (const e of errs.slice(0, 60)) console.log('  ' + e);
  if (errs.length > 60) console.log(`  … 외 ${errs.length - 60}건`);
  process.exitCode = 1;
} else {
  console.log(`✅ 언어팩 통과 — 키 ${Object.keys(ko).length}개 × ${LANGS.length}개 언어` + (unused.length ? ` · 안 쓰는 키 ${unused.length}개(${unused.slice(0, 5).join(', ')}${unused.length > 5 ? '…' : ''})` : ''));
}
