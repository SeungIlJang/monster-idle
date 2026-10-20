// 용사 스프라이트를 **도감 시트에서 직접 잘라낸다.**
//
// 왜 에셋팩의 낱장 프레임을 안 쓰는가:
//   Unity 에셋팩의 Heroes/<용사>/Transparent/<Anim>/Frame_NN.png 는 시트를 자동으로 자른
//   결과인데 격자가 전혀 맞지 않는다. 머리만 남은 프레임, 옆 프레임의 조각이 섞인 프레임,
//   17x1 픽셀짜리 쪼가리가 섞여 있다. 그대로 재생하면 캐릭터가 토막 나 보인다.
//   (배경이 어두울 땐 티가 덜 났지만 밝은 배경을 깔자 그대로 드러났다.)
//
// 원본 시트(Original_Assets/Hero_*_SpriteSheet.png)는 멀쩡하다. 오른쪽에
// Idle/Walk/Attack/Hit/Dead/Skill 6행 × 5열 격자가 규칙적으로 놓여 있다.
// 여기서 행·열을 직접 찾아 자른다 — 격자 좌표를 하드코딩하지 않고 투영으로 찾으므로
// 시트마다 프레임 폭이 달라도(공격 행은 검기 때문에 더 넓다) 따라간다.
//
// 사용: node tools/make-hero-sprites.mjs [--debug]
import fs from 'node:fs';
import path from 'node:path';
import { decodePNG, encodePNG, crop, floodClearGradient, trim, keepLargestBlob } from './png.mjs';

const PACK = 'D:/AI/workspace/game/images/image/Unity_IdleRPG_Complete_Assets/Original_Assets';
const SHEETS = 'D:/AI/workspace/game/images/image/IdleRPG_Character_Enemy_Assets';
const HERE = path.resolve(import.meta.dirname, '..');
const OUT = path.join(HERE, 'assets', 'hero');
const DEBUG = process.argv.includes('--debug');

// 격자 시트에서 자르는 용사들. region 은 격자만 들어오도록 자르는 범위(비율).
// 왼쪽의 큰 초상화·스킬 아이콘·행 이름표를 제외해야 한다.
const GRID = [
  { key: 'warrior', sheet: 'Hero_Kael_Ironblade_Warrior_SpriteSheet.png' },
  { key: 'knight', sheet: 'Hero_Aldric_Aegis_Knight_SpriteSheet.png' },
  { key: 'rogue', sheet: 'Hero_Sylas_Nightveil_Rogue_SpriteSheet.png' },
  { key: 'mage', sheet: 'Hero_Lyra_Arcanis_Mage_SpriteSheet.png' },
  { key: 'cleric', sheet: 'Hero_Elira_Dawnlight_Cleric_SpriteSheet.png' },
  { key: 'archer', sheet: 'Hero_Rina_Windarrow_Archer_SpriteSheet.png' },
];
// 오른쪽 끝을 0.97 에서 끊는 이유: 마법사 시트는 격자 전체를 장식 테두리가 감싸고 있어
// 시트 끝까지 넣으면 그 세로 테두리가 6행을 하나로 이어버린다(행이 1개로 잡혔다).
const REGION = { x0: 0.44, y0: 0.03, x1: 0.97, y1: 0.78 };

// 배경 제거 허용치. 높이면 어두운 캐릭터(로그는 검은 옷이다)를 배경으로 착각해 먹어버린다.
// 20 에서는 로그의 몸이 통째로 지워졌다. 6 이면 6개 시트 모두 배경만 70~76% 깨끗이 지워진다.
const TOL = 6;

// 격자 행 순서. walk/skill 은 전투 레이아웃에서 쓰지 않아 버린다.
const ROWS = ['idle', 'walk', 'attack', 'hit', 'dead', 'skill'];
const KEEP = new Set(['idle', 'attack', 'hit', 'dead']);
const MAX_FRAMES = 4;        // 프레임이 많아봐야 앱 용량만 먹는다

// 도감 시트만 있는 용사(격자 시트가 없다). 대표 포즈 1장만 쓴다.
const SINGLE = [
  { key: 'emage', sheet: 'Hero_Terra_Stoneheart_EarthMage.png', box: { x0: 0.02, y0: 0.11, x1: 0.23, y1: 0.72 } },
  { key: 'dmage', sheet: 'Hero_Nyx_Shadowveil_DarkMage.png', box: { x0: 0.02, y0: 0.11, x1: 0.23, y1: 0.72 } },
];

/** 불투명 픽셀을 한 축으로 투영해, 빈 구간으로 나뉘는 덩어리 구간들을 찾는다 */
function segments(counts, { minGap, minRun, minMass }) {
  const runs = [];
  let s = -1;
  for (let i = 0; i < counts.length; i++) {
    if (counts[i] > 0 && s < 0) s = i;
    else if (counts[i] === 0 && s >= 0) { runs.push([s, i - 1]); s = -1; }
  }
  if (s >= 0) runs.push([s, counts.length - 1]);

  // 가까운 덩어리는 하나로 합친다 (타격 이펙트 별·검기가 캐릭터와 떨어져 있다)
  const merged = [];
  for (const r of runs) {
    const last = merged[merged.length - 1];
    if (last && r[0] - last[1] - 1 <= minGap) last[1] = r[1];
    else merged.push([...r]);
  }
  // 너무 얇거나 픽셀이 거의 없는 조각은 버린다
  return merged.filter(([a, b]) => {
    if (b - a + 1 < minRun) return false;
    let mass = 0;
    for (let i = a; i <= b; i++) mass += counts[i];
    return mass >= minMass;
  });
}

/**
 * 찾아낸 행 구간을 6개로 다듬는다. 시트마다 행 간격이 조금씩 달라서
 * 붙어버린 행(워리어는 Walk+Attack 이 한 덩어리로 잡힌다)과
 * 시트 아래쪽 장식·글자 같은 잡음이 섞여 들어온다.
 */
function tidyRows(runs, want) {
  if (!runs.length) return runs;
  const h = runs.map(([a, b]) => b - a + 1).sort((x, y) => x - y);
  const med = h[h.length >> 1];

  // 1) median 보다 많이 큰 구간은 여러 행이 붙은 것이므로 균등 분할
  const split = [];
  for (const [a, b] of runs) {
    const n = Math.max(1, Math.round((b - a + 1) / med));
    if (n === 1) { split.push([a, b]); continue; }
    const step = (b - a + 1) / n;
    for (let i = 0; i < n; i++) split.push([Math.round(a + i * step), Math.round(a + (i + 1) * step) - 1]);
  }
  // 2) median 의 절반도 안 되는 토막은 잡음으로 버린다
  const kept = split.filter(([a, b]) => b - a + 1 >= med * 0.5);
  // 3) 그래도 많으면 **위에서부터** want 개를 쓴다.
  //    격자는 항상 영역 맨 위에 있고 남는 것은 그 아래의 장식·설명 글이다.
  //    (얇은 것부터 버리면 진짜 행을 지운다 — 클레릭의 Dead 행이 가장 얇아서 날아갔었다.)
  return kept.slice(0, want);
}

function projectY(img, x0, x1, y0, y1) {
  const out = new Int32Array(y1 - y0 + 1);
  for (let y = y0; y <= y1; y++) {
    let n = 0;
    for (let x = x0; x <= x1; x++) if (img.data[(y * img.width + x) * 4 + 3] > 24) n++;
    out[y - y0] = n;
  }
  return out;
}
function projectX(img, x0, x1, y0, y1) {
  const out = new Int32Array(x1 - x0 + 1);
  for (let x = x0; x <= x1; x++) {
    let n = 0;
    for (let y = y0; y <= y1; y++) if (img.data[(y * img.width + x) * 4 + 3] > 24) n++;
    out[x - x0] = n;
  }
  return out;
}

const manifestPath = path.join(HERE, 'assets', 'manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
manifest.hero = manifest.hero || {};
const warnings = [];
const fallback = [];        // 격자를 못 읽은 용사 — 왼쪽 초상화에서 1장만 뽑는다

for (const h of GRID) {
  const src = path.join(PACK, h.sheet);
  if (!fs.existsSync(src)) { warnings.push(`${h.key}: 시트 없음 ${h.sheet}`); continue; }

  const sheet = decodePNG(fs.readFileSync(src));
  const rx0 = Math.round(sheet.width * REGION.x0), rx1 = Math.round(sheet.width * REGION.x1) - 1;
  const ry0 = Math.round(sheet.height * REGION.y0), ry1 = Math.round(sheet.height * REGION.y1) - 1;
  const grid = crop(sheet, rx0, ry0, rx1 - rx0 + 1, ry1 - ry0 + 1);

  // 시트 배경은 어두운 그라데이션이라 밝기 임계값이 아니라 "이웃과 색이 비슷하면 배경"으로 지운다
  floodClearGradient(grid, TOL);

  const W = grid.width, H = grid.height;
  const raw = segments(projectY(grid, 0, W - 1, 0, H - 1),
    { minGap: Math.round(H * 0.012), minRun: Math.round(H * 0.025), minMass: 400 });
  const rowRuns = tidyRows(raw, ROWS.length);

  if (DEBUG) console.log(`[${h.key}] 격자 ${W}x${H}, 행 ${raw.length}→${rowRuns.length}개: ` +
    rowRuns.map(r => `${r[0]}-${r[1]}`).join(' '));
  if (rowRuns.length !== ROWS.length) {
    warnings.push(`${h.key}: 행이 ${rowRuns.length}개 (${ROWS.length}개여야 함) — 초상화로 대체`);
    fallback.push(h.key);
    continue;
  }

  const dir = path.join(OUT, h.key);
  fs.mkdirSync(dir, { recursive: true });
  for (const f of fs.readdirSync(dir)) fs.unlinkSync(path.join(dir, f));

  const entry = {};
  const counts = [];
  rowRuns.forEach(([y0, y1], ri) => {
    const anim = ROWS[ri];
    const colRuns = segments(projectX(grid, 0, W - 1, y0, y1),
      { minGap: Math.round(W * 0.012), minRun: Math.round(W * 0.015), minMass: 250 });
    counts.push(`${anim}:${colRuns.length}`);
    if (!KEEP.has(anim)) return;
    if (colRuns.length < 1) { warnings.push(`${h.key}.${anim}: 프레임을 못 찾음`); return; }

    // 행 안에서 덩치가 눈에 띄게 작은 칸은 캐릭터가 아니라 잡티다 — 깃발 조각, 흩날리는 점 몇 개.
    // 중앙값의 절반에 못 미치면 버린다. (한 칸이라도 이런 게 섞이면 전투 중에 캐릭터가 사라져 보인다.)
    const cells = colRuns.map(([x0, x1]) => {
      const c = trim(crop(grid, x0, y0, x1 - x0 + 1, y1 - y0 + 1), 2);
      let mass = 0;
      for (let p = 0; p < c.width * c.height; p++) if (c.data[p * 4 + 3] > 24) mass++;
      return { c, mass };
    });
    const masses = cells.map(c => c.mass).sort((a, b) => a - b);
    const medMass = masses[masses.length >> 1];
    // 칸이 안 나뉜 행은 한 장에 캐릭터 5명이 들어간다(로그의 Attack 은 검기가 프레임을 잇고,
    // 마법사는 행마다 패널 배경이 깔려 빈틈이 없다). 그런 덩어리는 유난히 넓다 — 584x110.
    // 쓰러진 Dead 포즈도 가로로 넓으므로 비율만으로는 못 거른다. 격자 폭 대비로도 본다.
    const good = cells.filter(({ c, mass }) =>
      mass >= medMass * 0.5 && c.width >= 8 && c.height >= 8 &&
      c.width < c.height * 3 && c.width < W * 0.4);
    if (good.length < cells.length) {
      counts[counts.length - 1] += `(-${cells.length - good.length})`;
    }

    let n = 0;
    for (const { c } of good.slice(0, MAX_FRAMES)) {
      fs.writeFileSync(path.join(dir, `${anim}_${++n}.png`), encodePNG(c));
    }
    if (n) entry[anim] = n;
  });

  // 칸 나누기가 실패하면 한 행이 통째로 한 장이 된다(마법사 시트는 행마다 패널 배경이 깔려
  // 있어 칸 사이가 비지 않는다 — 671x107 짜리 "캐릭터 5명" 이 나왔다).
  // 캐릭터는 가로보다 세로가 길거나 비슷하다. 지나치게 납작하면 격자 읽기에 실패한 것이다.
  // idle 만 본다 — 쓰러진 Dead 나 검기가 긴 Attack 은 원래 가로로 넓다.
  const wide = fs.readdirSync(dir).filter(f => {
    if (!f.startsWith('idle_')) return false;
    const im = decodePNG(fs.readFileSync(path.join(dir, f)));
    return im.width > im.height * 1.6;
  });
  if (wide.length || !entry.idle) {
    warnings.push(`${h.key}: 칸이 안 나뉨(납작한 프레임 ${wide.length}장) — 초상화로 대체`);
    fallback.push(h.key);
    continue;
  }

  manifest.hero[h.key] = entry;
  console.log(`  ${h.key.padEnd(8)} ${counts.join(' ')}  → ` +
    Object.entries(entry).map(([a, n]) => `${a}${n}`).join(' '));
}

// 격자를 못 읽은 용사는 같은 시트 왼쪽의 큰 초상화에서 대표 포즈 1장을 뽑는다.
// 애니메이션은 포기하지만 깨진 프레임이 섞이는 것보다 낫다.
for (const key of fallback) {
  const h = GRID.find(g => g.key === key);
  SINGLE.push({ key, sheet: path.join(PACK, h.sheet), portrait: true, box: { x0: 0.08, y0: 0.10, x1: 0.30, y1: 0.46 } });
}

for (const h of SINGLE) {
  const src = h.portrait ? h.sheet : path.join(SHEETS, h.sheet);
  if (!fs.existsSync(src)) { warnings.push(`${h.key}: 시트 없음 ${h.sheet}`); continue; }
  const img = decodePNG(fs.readFileSync(src));
  const x0 = Math.round(img.width * h.box.x0), y0 = Math.round(img.height * h.box.y0);
  const w = Math.round(img.width * (h.box.x1 - h.box.x0));
  const hh = Math.round(img.height * (h.box.y1 - h.box.y0));

  let cut = crop(img, x0, y0, w, hh);
  floodClearGradient(cut, h.portrait ? TOL : 16);
  keepLargestBlob(cut);        // 크롭 모서리에 걸린 테두리 조각을 떼어낸다
  cut = trim(cut, 2);

  const dir = path.join(OUT, h.key);
  fs.mkdirSync(dir, { recursive: true });
  for (const f of fs.readdirSync(dir)) fs.unlinkSync(path.join(dir, f));
  fs.writeFileSync(path.join(dir, 'idle_1.png'), encodePNG(cut));
  manifest.hero[h.key] = { idle: 1 };
  console.log(`  ${h.key.padEnd(8)} 도감 시트 → idle1 (${cut.width}x${cut.height})`);
}

fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
console.log('용사 스프라이트 생성 완료');
if (warnings.length) { console.log('확인 필요:'); for (const w of warnings) console.log('  ⚠ ' + w); }
