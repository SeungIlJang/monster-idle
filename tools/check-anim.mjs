// 전투 애니메이션 프레임 검사 — 아트 담당(Codex)이 **보내기 전에** 돌린다.
//
//   node tools/check-anim.mjs <폴더>
//   node tools/check-anim.mjs "D:/AI/workspace/game/games/output/monster-idle/anim-v1"
//
// 폴더 안 파일 이름 (docs/anim-frames-handoff.md):
//   mon_<key>_idle_2.png        mon_<key>_attack_windup.png        mon_<key>_attack_follow.png
//   mon_<key>_t2_idle_2.png     mon_<key>_t2_attack_windup.png     …  (2차 — 진화 단계)
//   hero_<key>_idle_2.png       hero_<key>_attack_windup.png       hero_<key>_attack_follow.png
//   comp_<id>_idle_2.png
//
// 기준은 이미 게임에 들어 있는 1번 그림이다(assets/<group>/<key>/<단계>idle_1.png 등).
// 새 프레임이 그것과 **캔버스 · 발 행 · 가로 중심** 이 다르면 프레임이 바뀔 때마다 캐릭터가
// 떠오르거나 옆으로 미끄러진다. 크기가 다르면 숨쉬기가 아니라 커졌다 줄었다로 보인다.
// 둘 다 "돌려 보면 어색한데 왜인지 모르는" 종류라 숫자로 막는다.
//
// 파일을 쓰지 않는다. 검사만 한다.
import fs from 'node:fs';
import path from 'node:path';
import { decodePNG } from './png.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const ASSETS = path.join(ROOT, 'assets');
const ALPHA = 24;          // 내용으로 치는 알파
const CX_TOL = 0.6;        // 가로 중심 허용 오차(px)
const IDLE_TOL = 6;        // idle_2 내용 크기가 idle_1 과 달라도 되는 폭(px) — 숨쉬기 정도
const H_RATIO = [0.7, 1.15];   // 공격 프레임 높이 / idle 높이 허용 범위
const MIN_DIFF = 0.02;     // 1번 그림과 이만큼(내용 픽셀 비율)은 달라야 한다 — 복사본 방지

const dir = process.argv[2];
if (!dir || !fs.existsSync(dir)) {
  console.log('쓰는 법: node tools/check-anim.mjs <폴더>');
  process.exit(1);
}

/** PNG 를 읽어 색상타입 · 캔버스 · 내용 경계를 잰다 */
function measure(file) {
  const buf = fs.readFileSync(file);
  const colorType = buf[25];                      // IHDR 의 색상타입 바이트
  const img = decodePNG(buf);
  const { width: w, height: h, data } = img;
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (data[(y * w + x) * 4 + 3] > ALPHA) {
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
  }
  return { colorType, w, h, data, x0, y0, x1, y1, cw: x1 - x0 + 1, ch: y1 - y0 + 1, cx: (x0 + x1) / 2, kb: buf.length / 1024 };
}

/** 두 그림의 내용 픽셀 중 눈에 띄게 다른 비율 */
function diffRatio(a, b) {
  if (a.w !== b.w || a.h !== b.h) return 1;
  let n = 0, d = 0;
  for (let i = 0; i < a.data.length; i += 4) {
    const on = a.data[i + 3] > ALPHA || b.data[i + 3] > ALPHA;
    if (!on) continue;
    n++;
    const dd = Math.abs(a.data[i] - b.data[i]) + Math.abs(a.data[i + 1] - b.data[i + 1])
      + Math.abs(a.data[i + 2] - b.data[i + 2]) + Math.abs(a.data[i + 3] - b.data[i + 3]);
    if (dd > 60) d++;
  }
  return n ? d / n : 0;
}

// 파일 이름 해석: <group>_<key>[_t2|_t3]_<frame>.png
const RE = /^(mon|hero|comp)_([a-z0-9]+?)(?:_(t2|t3))?_(idle_2|attack_windup|attack_follow)\.png$/;
const files = fs.readdirSync(dir).filter(f => f.toLowerCase().endsWith('.png')).sort();
const ok = [], bad = [], skipped = [];
let totalKB = 0;
const seen = new Map();          // "group/key/stage" → Set(frame)

for (const f of files) {
  const m = RE.exec(f);
  if (!m) { skipped.push(`${f} — 이름 규칙에 안 맞음 (예: mon_slime_idle_2.png)`); continue; }
  const [, group, key, stage = '', fr] = m;
  if (group === 'comp' && (stage || fr !== 'idle_2')) { bad.push(`${f} — 뽑기 동료는 idle_2 한 장만 받습니다`); continue; }
  const pre = stage ? stage + '_' : '';
  // 기준 그림
  const refIdle = group === 'comp' ? path.join(ASSETS, 'comp', `${key}.png`) : path.join(ASSETS, group, key, `${pre}idle_1.png`);
  const refAtk = group === 'comp' ? null : path.join(ASSETS, group, key, `${pre}attack_1.png`);
  if (!fs.existsSync(refIdle)) { bad.push(`${f} — 게임에 기준 그림이 없음 (${path.relative(ROOT, refIdle)}) · 키 이름 확인`); continue; }
  const id = measure(refIdle);
  const ref = fr.startsWith('attack') && refAtk && fs.existsSync(refAtk) ? measure(refAtk) : id;
  const a = measure(path.join(dir, f));
  totalKB += a.kb;
  const why = [];
  if (a.colorType !== 6) why.push(`RGBA(색상타입 6)가 아님 — 지금 ${a.colorType}`);
  if (a.w !== id.w || a.h !== id.h) why.push(`캔버스 ${a.w}×${a.h} — ${id.w}×${id.h} 이어야 함`);
  if (a.x1 < 0) why.push('그림이 비어 있음');
  else {
    if (a.y1 !== id.y1) why.push(`발 행 ${a.y1} — ${id.y1} 이어야 함 (1px 만 달라도 프레임마다 떠 보임)`);
    if (Math.abs(a.cx - id.cx) > CX_TOL) why.push(`가로 중심 ${a.cx} — ${id.cx} ±${CX_TOL} 이어야 함`);
    if (a.x0 < 1 || a.x1 > a.w - 2 || a.y0 < 1) why.push(`캔버스 가장자리에 닿음 (${a.x0},${a.y0}~${a.x1},${a.y1}) — 잘려 보임`);
    if (fr === 'idle_2') {
      if (Math.abs(a.cw - id.cw) > IDLE_TOL || Math.abs(a.ch - id.ch) > IDLE_TOL)
        why.push(`내용 크기 ${a.cw}×${a.ch} — idle_1 ${id.cw}×${id.ch} ±${IDLE_TOL} 이어야 함 (커지면 숨쉬기가 아니라 부풀었다 줄어든다)`);
    } else {
      const r = a.ch / id.ch;
      if (r < H_RATIO[0] || r > H_RATIO[1]) why.push(`높이 ${a.ch} = idle 의 ${r.toFixed(2)}배 — ${H_RATIO[0]}~${H_RATIO[1]} 이어야 함`);
    }
    const d = diffRatio(a, ref);
    if (d < MIN_DIFF) why.push(`기준 그림(${fr === 'idle_2' ? 'idle_1' : 'attack_1'})과 거의 같음 — ${(d * 100).toFixed(1)}% 만 다름. 화면에서 안 보입니다`);
  }
  const tag = `${group}/${key}${stage ? '/' + stage : ''}`;
  if (!seen.has(tag)) seen.set(tag, new Set());
  seen.get(tag).add(fr);
  if (why.length) bad.push(`${f}\n      - ` + why.join('\n      - '));
  else ok.push(`${f}  (${a.cw}×${a.ch}, ${a.kb.toFixed(0)}KB)`);
}

// 공격은 짝으로 와야 한다 — 준비만 있고 마무리가 없으면 동작이 중간에 끊긴다
const pairs = [];
for (const [tag, set] of seen) {
  if (set.has('attack_windup') !== set.has('attack_follow')) pairs.push(`${tag} — attack_windup 과 attack_follow 는 같이 보내 주세요 (지금 ${[...set].join(', ')})`);
}

console.log(`\n검사 폴더: ${dir}`);
if (ok.length) console.log(`\n통과 ${ok.length}장\n  ` + ok.join('\n  '));
if (bad.length) console.log(`\n고칠 것 ${bad.length}장\n  ` + bad.join('\n  '));
if (pairs.length) console.log(`\n짝이 안 맞음\n  ` + pairs.join('\n  '));
if (skipped.length) console.log(`\n건너뜀\n  ` + skipped.join('\n  '));
console.log(`\n합계 ${(totalKB / 1024).toFixed(2)}MB (원본 RGBA 기준 — 들일 때 이쪽에서 압축합니다)`);
if (!bad.length && !pairs.length && ok.length) console.log(`\n✅ 통과 ${ok.length}장 — 전부 통과했습니다. 보내 주세요.`);
else if (!ok.length && !bad.length) console.log('\n검사할 파일이 없습니다.');
else { console.log('\n❌ 위 항목을 고친 뒤 다시 돌려 주세요.'); process.exitCode = 1; }
console.log('(검사만 했습니다 — 파일을 쓰지 않았습니다)');
