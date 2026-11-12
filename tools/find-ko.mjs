// 코드 속 한글 문자열 찾기 — 언어팩으로 옮기지 않은 화면 글자가 남았는지 본다.
//
//   node tools/find-ko.mjs            ← 파일별 개수
//   node tools/find-ko.mjs src/ui.js  ← 그 파일의 줄 목록
//
// 주석은 뺀다. 화면에 안 나오는 줄도 뺀다(SKIP_LINE · SKIP_CALL). 파일 통째로 빼는 곳은 ALLOW.
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
// 개발자 모드는 비밀번호 뒤 내부 도구라 번역하지 않는다. i18n.js 는 언어 이름(한국어 · 日本語)과 '과/와' 처리가 있다
export const ALLOW = new Set(['src/ui-dev.js', 'src/i18n.js']);
// 언어팩이 덮어쓰는 HTML 기본 글자(data-i18n), 템플릿 안 HTML 주석
const SKIP_LINE = /data-i18n|<!--/;
// 콘솔·에러 — 개발자용. 여러 줄에 걸친 호출도 괄호가 닫힐 때까지 건너뛴다
const SKIP_CALL = /console\.(log|warn|error|info)\s*\(|throw new Error\s*\(/;
const HANGUL = /[가-힣]/;

/** 주석을 지운다 (문자열 안의 // 는 남긴다 — 'https://' 같은 것) */
function stripJs(s) {
  let out = '', i = 0, q = null;
  while (i < s.length) {
    const c = s[i], n = s[i + 1];
    if (q) {
      out += c;
      if (c === '\\') { out += n || ''; i += 2; continue; }
      if (c === q) q = null;
      i++; continue;
    }
    if (c === '"' || c === "'" || c === '`') { q = c; out += c; i++; continue; }
    if (c === '/' && n === '/') { while (i < s.length && s[i] !== '\n') i++; continue; }
    if (c === '/' && n === '*') { i += 2; while (i < s.length && !(s[i] === '*' && s[i + 1] === '/')) { if (s[i] === '\n') out += '\n'; i++; } i += 2; continue; }
    out += c; i++;
  }
  return out;
}
function stripHtml(s) {
  return s.replace(/<!--[\s\S]*?-->/g, m => m.replace(/[^\n]/g, ''))
    .replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ''))
    .replace(/<script[\s\S]*?<\/script>/g, m => stripJs(m));
}

export function scan(rel) {
  const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  const body = rel.endsWith('.html') ? stripHtml(src) : stripJs(src);
  const hits = [];
  let depth = 0;
  body.split('\n').forEach((l, i) => {
    if (depth > 0 || SKIP_CALL.test(l)) {
      const from = depth > 0 ? 0 : l.search(SKIP_CALL);
      for (const c of l.slice(from)) { if (c === '(') depth++; else if (c === ')') depth--; }
      if (depth < 0) depth = 0;
      return;
    }
    if (SKIP_LINE.test(l)) return;
    if (HANGUL.test(l)) hits.push([i + 1, l.trim()]);
  });
  return hits;
}

export function files() {
  return ['index.html', ...fs.readdirSync(path.join(ROOT, 'src')).filter(f => f.endsWith('.js')).map(f => 'src/' + f)];
}

if (process.argv[1] && process.argv[1].endsWith('find-ko.mjs')) {
  const one = process.argv[2];
  if (one) {
    for (const [n, l] of scan(one)) console.log(String(n).padStart(5), l.slice(0, 160));
  } else {
    let total = 0;
    const rows = files().map(f => [scan(f).length, f]).filter(r => r[0]).sort((a, b) => b[0] - a[0]);
    for (const [n, f] of rows) { console.log(String(n).padStart(5), f, ALLOW.has(f) ? '(허용)' : ''); if (!ALLOW.has(f)) total += n; }
    console.log('번역 대상 줄 합계', total);
  }
}
