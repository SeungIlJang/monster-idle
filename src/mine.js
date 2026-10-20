// 광산 — 타일 채굴 미니게임
//
// 밸런스 원칙: **곡괭이 1개당 기대 산출이 고정**이다. 타일 종류는 조각/광석 비율만 바꾸고
// 총량은 바꾸지 않는다. 타일 분포(WEIGHTS)나 비율(MIX)을 나중에 손봐도 총량이 어긋나지
// 않도록, 곡괭이 가중 평균으로 정규화한 뒤 쓴다(NORM). 시뮬이 검증한 하루 산출이 그대로 유지된다.
import { B } from './balance.js';
import { S } from './state.js';

const M = B.layer2.mine;
export const WIDTH = 7;
const KEEP_ROWS = 24;              // 저장할 창(window) 높이 — 세이브 크기를 일정하게 유지

// 타일: 1 흙(1타), 2 돌(2타), 3 광맥(2타). 저장은 정수 하나로 — type*10 + 남은타수
export const TILE = {
  1: { name: '흙', icon: '🟫', hits: 1, weight: 0.50, s: 1.4, o: 0.6 },
  2: { name: '돌', icon: '🪨', hits: 2, weight: 0.35, s: 0.8, o: 1.2 },
  3: { name: '광맥', icon: '💠', hits: 2, weight: 0.15, s: 0.2, o: 1.8 },
};
const TYPES = [1, 2, 3];

// 곡괭이 가중 정규화 — 이게 "산출 총량 유지"의 핵심이다
const NORM = (() => {
  let picks = 0;
  for (const t of TYPES) picks += TILE[t].weight * TILE[t].hits;
  let s = 0, o = 0;
  for (const t of TYPES) {
    const w = (TILE[t].weight * TILE[t].hits) / picks;   // 곡괭이 1개가 이 타일일 확률
    s += w * TILE[t].s;
    o += w * TILE[t].o;
  }
  return { s, o };
})();

const code = (type, hits) => type * 10 + hits;
const typeOf = c => Math.floor(c / 10);
const hitsOf = c => c % 10;
export const isDug = c => !c;

function randType() {
  let r = Math.random();
  for (const t of TYPES) { r -= TILE[t].weight; if (r < 0) return t; }
  return 1;
}
const newRow = () => Array.from({ length: WIDTH }, () => { const t = randType(); return code(t, TILE[t].hits); });

/** 그리드 보장 — 없으면 만들고, 아래가 모자라면 채운다 */
export function ensureGrid() {
  const g = S.mine;
  if (!Array.isArray(g.grid) || !g.grid.length) {
    g.grid = [];
    g.top = 0;                     // grid[0] 이 실제 깊이 top 행
    g.depth = 0;                   // 최고 도달 깊이(행)
    for (let i = 0; i < KEEP_ROWS; i++) g.grid.push(newRow());
    g.grid[0] = g.grid[0].map(() => 0);   // 첫 줄은 지표면 — 이미 파인 상태
  }
  while (g.grid.length < KEEP_ROWS) g.grid.push(newRow());
  return g;
}

/** 화면에 보여줄 행들 (절대 깊이와 함께) */
export function rows() {
  const g = ensureGrid();
  return g.grid.map((cells, i) => ({ depth: g.top + i, cells }));
}

/** 파낼 수 있는가 — 상/좌/우/하 중 하나가 이미 파여 있어야 한다 */
export function canDig(r, c) {
  const g = ensureGrid();
  if (r < 0 || r >= g.grid.length || c < 0 || c >= WIDTH) return false;
  if (isDug(g.grid[r][c])) return false;
  if (r === 0) return true;                                  // 맨 윗줄은 지표면에 닿아 있다
  const nb = [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]];
  return nb.some(([y, x]) =>
    y >= 0 && y < g.grid.length && x >= 0 && x < WIDTH && isDug(g.grid[y][x]));
}

/** 곡괭이 1개가 주는 기본 산출 (깊이 배수 포함) */
export function perPick() {
  const mult = 1 + S.best / M.depthDiv;
  return {
    shard: (M.shardPerDay / M.pickMax) * mult,
    ore: (M.orePerDay / M.pickMax) * mult,
  };
}

function award(type, picks = 1) {
  const base = perPick();
  const t = TILE[type] || TILE[1];
  const shard = Math.max(1, Math.round((base.shard * t.s / NORM.s) * picks));
  const ore = Math.max(1, Math.round((base.ore * t.o / NORM.o) * picks));
  S.shard += shard;
  S.ore += ore;
  return { shard, ore };
}

/** 창을 아래로 밀어 세이브 크기를 일정하게 유지한다 */
function scrollWindow() {
  const g = S.mine;
  // 위쪽에서 완전히 파인 행은 버린다 (단 최소 2행은 남겨 맥락을 보여준다)
  let drop = 0;
  while (drop < g.grid.length - 2 && g.grid[drop].every(isDug) && g.grid[drop + 1].every(isDug)) drop++;
  if (drop > 0) {
    g.grid.splice(0, drop);
    g.top += drop;
    while (g.grid.length < KEEP_ROWS) g.grid.push(newRow());
  }
  const deepest = g.top + g.grid.findLastIndex(row => row.some(isDug));
  if (deepest > (g.depth || 0)) g.depth = deepest;
}

/** 타일 1타. 곡괭이 1개를 쓴다 */
export function digTile(r, c) {
  const g = ensureGrid();
  if (!canDig(r, c)) return null;
  if ((g.pick || 0) < 1) return null;
  g.pick -= 1;
  const cell = g.grid[r][c];
  const type = typeOf(cell);
  const left = hitsOf(cell) - 1;
  g.grid[r][c] = left > 0 ? code(type, left) : 0;
  const got = award(type, 1);
  scrollWindow();
  return { ...got, type, broke: left <= 0 };
}

/** 위에서부터 파낼 수 있는 타일을 곡괭이가 떨어질 때까지 자동으로 */
export function digAuto() {
  const g = ensureGrid();
  let shard = 0, ore = 0, digs = 0;
  while ((g.pick || 0) > 0) {
    let done = false;
    outer:
    for (let r = 0; r < g.grid.length; r++) {
      for (let c = 0; c < WIDTH; c++) {
        if (canDig(r, c)) {
          const got = digTile(r, c);
          if (got) { shard += got.shard; ore += got.ore; digs++; done = true; }
          break outer;
        }
      }
    }
    if (!done) break;
  }
  return digs ? { shard, ore, digs } : null;
}

/**
 * 폭탄 — 3×3 을 파낸다. 어두운 타일도 뚫린다.
 * 산출은 "곡괭이 bombDigs 개를 쓴 것"으로 고정해 기존 예산을 그대로 지킨다.
 */
export function bombAt(r, c) {
  const g = ensureGrid();
  if (bombLeft() < 1) return null;
  g.bomb = (g.bomb || 0) + 1;
  let broke = 0;
  const counts = {};
  for (let y = r - 1; y <= r + 1; y++) {
    for (let x = c - 1; x <= c + 1; x++) {
      if (y < 0 || y >= g.grid.length || x < 0 || x >= WIDTH) continue;
      const cell = g.grid[y][x];
      if (isDug(cell)) continue;
      // 곡괭이 환산으로 센다 — 남은 타수가 그 타일의 "곡괭이 가치"다.
      // 타일 개수로 세면 정규화(NORM, 곡괭이 가중)와 어긋나 조각이 15% 과다 지급된다.
      counts[typeOf(cell)] = (counts[typeOf(cell)] || 0) + hitsOf(cell);
      g.grid[y][x] = 0;
      broke++;
    }
  }
  // 부순 타일 구성대로 bombDigs 곡괭이어치를 나눠 준다
  let shard = 0, ore = 0;
  const total = Object.values(counts).reduce((a, n) => a + n, 0) || 1;
  for (const t of Object.keys(counts)) {
    const got = award(+t, (M.bombDigs * counts[t]) / total);
    shard += got.shard; ore += got.ore;
  }
  scrollWindow();
  return { shard, ore, broke, digs: M.bombDigs };
}

// ── 곡괭이 충전 · 일일 ───────────────────────────────────────
function today() {
  const d = new Date();
  return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
}
export function ensureMineDaily() {
  const g = ensureGrid();
  const t = today();
  if (g.day !== t) { g.day = t; g.bomb = 0; }
}
export function picks() {
  const g = ensureGrid();
  const now = Date.now();
  if (!g.t) g.t = now;
  const per = M.pickMinutes * 60000;
  const gained = Math.floor((now - g.t) / per);
  if (gained > 0) {
    g.pick = Math.min(M.pickMax, (g.pick || 0) + gained);
    g.t += gained * per;
    if (g.pick >= M.pickMax) g.t = now;
  }
  return g.pick || 0;
}
export function nextPickIn() {
  if (picks() >= M.pickMax) return 0;
  return Math.max(0, Math.ceil((S.mine.t + M.pickMinutes * 60000 - Date.now()) / 1000));
}
export const pickMax = () => M.pickMax;
export function bombLeft() { ensureMineDaily(); return Math.max(0, M.bombPerDay - (S.mine.bomb || 0)); }
export const depth = () => S.mine.depth || 0;
export const depthMult = () => 1 + S.best / M.depthDiv;

/** 검증용 — 곡괭이 1개의 기대 산출 (타일 분포 가중) */
export function expectedPerPick() {
  const base = perPick();
  let picksW = 0;
  for (const t of TYPES) picksW += TILE[t].weight * TILE[t].hits;
  let s = 0, o = 0;
  for (const t of TYPES) {
    const w = (TILE[t].weight * TILE[t].hits) / picksW;
    s += w * (base.shard * TILE[t].s / NORM.s);
    o += w * (base.ore * TILE[t].o / NORM.o);
  }
  return { shard: s, ore: o, base };
}
