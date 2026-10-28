// 캔버스 렌더. 왼쪽이 플레이어(몬스터), 오른쪽이 적(인간 용사).
//
// 몬스터는 도감 시트에서 잘라낸 대표 포즈 1장만 있다(tools/make-monster-sprites.mjs).
// 그래서 공격·피격 연출은 프레임이 아니라 스쿼시·런지·셰이크로 만든다(DESIGN.md §12).
// 용사는 Idle/Attack/Hit/Dead 프레임이 멀쩡해서 프레임 애니를 그대로 쓴다.
import { B, heroAt, zoneAt, sceneEvery, heroPool } from './balance.js';
import { S } from './state.js';
import { R, enrage } from './combat.js';
import { pick, preload, boxOf, frameCount } from './sprites.js';
import { activeCompanions, compImage } from './companions.js';
import { L0, ratio, fmt } from './logmath.js';

const WAVES = B.stage.waves;
// 세로로 긴 폰 화면에서 위쪽이 텅 비어 보였다 — 바닥을 올려 전투를 화면 가운데로 끌어온다
const GROUND = 0.70;
// 전투는 한 줄이 아니라 **앞뒤가 있는 바닥면**에서 벌어진다. 모두 같은 선에 세우면
// 종이인형처럼 보이고, 캐릭터를 키우면 화면이 금방 꽉 찬다. 레퍼런스는 작은 캐릭터를
// 깊이를 두고 흩어 놓는다 — 뒤쪽은 위에 작게, 앞쪽은 아래에 크게.
const LANE_BACK = 0.60, LANE_FRONT = 0.82;
const laneY = d => H * (LANE_BACK + d * (LANE_FRONT - LANE_BACK));
const laneS = d => 0.80 + d * 0.38;
// 적을 흩을 깊이값. 순서대로 쓰면 지그재그로 놓여 "줄"이 안 보인다.
const FOE_LANES = [0.52, 0.16, 0.86, 0.34, 0.70, 0.04];
// 진영 색: 왼쪽(몬스터)이 나, 오른쪽(용사)이 적
const ALLY = '#7fe0a0';
const FOE = '#ff8a8a';
let cv, ctx, W = 0, H = 0, DPR = 1;
let t = 0;

export function initRender(canvas) {
  cv = canvas;
  ctx = cv.getContext('2d');
  resize();
  addEventListener('resize', resize);
}

export function resize() {
  if (!cv) return;
  DPR = Math.min(devicePixelRatio || 1, 2);
  W = cv.clientWidth;
  H = cv.clientHeight;
  if (!W || !H) return;
  cv.width = Math.round(W * DPR);
  cv.height = Math.round(H * DPR);
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.imageSmoothingEnabled = false;
}

// 구름은 천천히 흐른다
const CLOUDS = Array.from({ length: 5 }, (_, i) => ({
  x: Math.random(), y: 0.12 + Math.random() * 0.3, s: 0.6 + Math.random() * 0.7, sp: 0.004 + Math.random() * 0.006,
}));
// 먼 나무 / 가까운 덤불 — 위치를 고정해 화면이 흔들리지 않게
const TREES = Array.from({ length: 9 }, (_, i) => ({ x: (i + 0.5) / 9 + (Math.random() - 0.5) * 0.05, s: 0.7 + Math.random() * 0.6 }));
const BUSHES = Array.from({ length: 7 }, (_, i) => ({ x: (i + 0.5) / 7 + (Math.random() - 0.5) * 0.08, s: 0.7 + Math.random() * 0.5 }));

function hill(cx, cy, rx, ry, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, Math.PI, 0);
  ctx.fill();
}
function pine(x, baseY, h, dark) {
  const w = h * 0.52;
  ctx.fillStyle = dark ? '#2f6b45' : '#3f8b55';
  for (let i = 0; i < 3; i++) {
    const t = i / 3, yTop = baseY - h + h * t * 0.55, hw = w * (1 - t * 0.28);
    ctx.beginPath();
    ctx.moveTo(x, yTop);
    ctx.lineTo(x + hw / 2, yTop + h * 0.42);
    ctx.lineTo(x - hw / 2, yTop + h * 0.42);
    ctx.closePath();
    ctx.fill();
  }
  ctx.fillStyle = '#6b4a2e';
  ctx.fillRect(x - h * 0.05, baseY - h * 0.12, h * 0.1, h * 0.12);
}

// assets/bg/<zone>.png 가 있으면 그걸 쓴다. 없으면 아래 캔버스 그림이 그대로 나온다.
// 404 는 한 번만 확인하고 기억해서, 없는 파일을 매 프레임 다시 요청하지 않는다.
const BG = new Map();

// 패럴랙스 층 — assets/bg/layers/<zone>_{1_sky,2_mid,3_ground}.png.
// 셋이 **다 준비됐을 때만** 쓴다. 한 장이라도 없으면 통짜 배경으로 폴백한다
// (아트가 한 지역씩 들어와도 게임이 안 깨지게).
const LAYER_SPEED = [0.15, 0.45, 1.00];
const LAYER_NAME = ['1_sky', '2_mid', '3_ground'];
const LAYERS = new Map();
function bgLayers(key) {
  if (!LAYERS.has(key)) {
    LAYERS.set(key, LAYER_NAME.map(n => {
      const im = new Image();
      im.src = new URL(`../assets/bg/layers/${key}_${n}.png`, import.meta.url).href;
      im.onerror = () => { im.failed = true; };
      return im;
    }));
  }
  const set = LAYERS.get(key);
  if (set.some(im => im.failed)) return null;
  return set.every(im => im.complete && im.naturalWidth > 0) ? set : null;
}

function bgImage(key) {
  if (!BG.has(key)) {
    const im = new Image();
    im.src = new URL('../assets/bg/' + key + '.png', import.meta.url).href;
    im.onerror = () => BG.set(key, null);
    BG.set(key, im);
  }
  const im = BG.get(key);
  return im && im.complete && im.naturalWidth > 0 ? im : null;
}
/** 캔버스를 꽉 채우도록 잘라 그린다 (cover) */
function drawCover(img) {
  const ar = img.naturalWidth / img.naturalHeight;
  let dw = W, dh = W / ar;
  if (dh < H) { dh = H; dw = H * ar; }
  ctx.drawImage(img, (W - dw) / 2, (H - dh) / 2, dw, dh);
}

// ── 배경 스크롤 — "앞으로 나아가는" 느낌의 전부 ─────────────
// 레퍼런스(Legend of Slime)는 배경을 통짜로 그리지 않는다. 벽·바닥·소품 조각
// (bg_ch1_in_wall_01/02/03, in_ground_gray/wood, bookshelf, candlestick…)을
// 이어 붙여 **흘려보낸다.** 캐릭터가 움직여서가 아니라 세상이 흘러서 전진으로 읽힌다.
//
// 우리 배경은 1080×600 통짜라 가로로 이을 수 없다. 대신 **거울 타일링**을 쓴다 —
// 원본과 좌우반전본을 번갈아 깔면 맞닿는 가장자리가 같은 픽셀이라 이음매가 없다.
// 어떤 그림에도 통하고, 새 아트가 필요 없다.
let bgX = 0;        // 누적 이동 거리(px)
let bgRush = 0;     // 전진 가속 잔여 시간(초)
const BG_WALK = 10; // 평소 걷는 속도(px/초) — 있는 줄도 모를 만큼 느려야 어지럽지 않다
const BG_RUSH = 190; // 웨이브·스테이지를 깼을 때의 가속

/** 전진 연출. 진척이 생긴 순간에만 부른다(웨이브/스테이지 클리어). */
export function bgAdvance(sec = 0.55) { bgRush = Math.max(bgRush, sec); }

/**
 * 층 하나를 offset 만큼 밀어서 깐다.
 * **offset 은 받기만 한다** — 누적은 drawBG 에서 프레임당 한 번만 한다.
 * 층마다 누적하면 이동 속도가 층 수만큼 곱해진다(아트 담당이 짚어 준 함정).
 */
function drawScroll(img, offset) {
  const ar = img.naturalWidth / img.naturalHeight;
  let dw = W, dh = W / ar;
  if (dh < H) { dh = H; dw = H * ar; }
  const y = (H - dh) / 2;

  // 주기는 원본+반전 = 2칸. 그 안에서만 돌면 offset 이 아무리 커져도 정밀도가 상하지 않는다
  const period = dw * 2;
  let bgX = ((offset % period) + period) % period;
  // **보이는 칸만** 그린다. 화면 밖까지 그리면 배경 한 장이 매 프레임 6번 깔려
  // 폰에서 채우기 비용이 그대로 늘어난다(여긴 전체 화면 크기다).
  let i = Math.floor(bgX / dw);          // 지금 왼쪽 끝에 걸친 칸
  for (let x = i * dw - bgX; x < W; x += dw, i++) {
    if (i % 2) {                          // 홀수 칸은 좌우반전 — 맞닿는 가장자리가 같은 픽셀이라 이음매가 없다
      ctx.save();
      ctx.translate(x + dw, y);
      ctx.scale(-1, 1);
      ctx.drawImage(img, 0, 0, dw, dh);
      ctx.restore();
    } else {
      ctx.drawImage(img, x, y, dw, dh);
    }
  }
}

function drawBG(dt) {
  const gy = H * GROUND;
  const key = zoneAt(R.stage).key;

  // 누적은 **여기서 한 번만.** 아래 층들은 이 값에 배속만 곱해 쓴다.
  if (bgRush > 0) bgRush -= dt;
  bgX += (BG_WALK + (bgRush > 0 ? BG_RUSH : 0)) * dt;

  const set = bgLayers(key);
  if (set) {                       // 먼 하늘은 거의 안 움직이고 발밑 땅은 제 속도로 흐른다
    for (let i = 0; i < set.length; i++) drawScroll(set[i], bgX * LAYER_SPEED[i]);
    ambTick(dt, key);
    return;
  }
  const img = bgImage(key);        // 층이 아직 없는 지역 — 통짜 배경을 단층으로 흘린다
  if (img) { drawScroll(img, bgX); ambTick(dt, key); return; }

  // 하늘 — 밝은 낮
  const sky = ctx.createLinearGradient(0, 0, 0, gy);
  sky.addColorStop(0, '#7ec8f2');
  sky.addColorStop(1, '#bfe6f7');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, gy);

  // 구름
  ctx.fillStyle = 'rgba(255,255,255,.85)';
  for (const c of CLOUDS) {
    c.x += c.sp * 0.016;
    if (c.x > 1.2) c.x = -0.2;
    const cx = c.x * W, cy = c.y * gy, r = 13 * c.s;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, 7);
    ctx.arc(cx + r * 0.9, cy + r * 0.15, r * 0.78, 0, 7);
    ctx.arc(cx - r * 0.9, cy + r * 0.2, r * 0.66, 0, 7);
    ctx.fill();
  }

  // 먼 언덕 두 겹 — 깊이감
  hill(W * 0.22, gy + 4, W * 0.42, H * 0.17, '#4f9b62');
  hill(W * 0.78, gy + 4, W * 0.46, H * 0.21, '#449057');

  // 먼 나무
  for (const t of TREES) pine(t.x * W, gy, H * 0.12 * t.s, true);

  // 땅
  const g = ctx.createLinearGradient(0, gy, 0, H);
  g.addColorStop(0, '#79c266');
  g.addColorStop(0.18, '#63ad54');
  g.addColorStop(1, '#3f7a3c');
  ctx.fillStyle = g;
  ctx.fillRect(0, gy, W, H - gy);
  ctx.fillStyle = 'rgba(255,255,255,.10)';
  ctx.fillRect(0, gy, W, 3);

  // 가까운 덤불 — 지면에 디테일
  for (const b of BUSHES) {
    const bx = b.x * W, by = gy + H * 0.055, r = 7 * b.s;
    ctx.fillStyle = '#4e9a4a';
    ctx.beginPath();
    ctx.arc(bx, by, r, 0, 7);
    ctx.arc(bx + r * 0.8, by + r * 0.1, r * 0.75, 0, 7);
    ctx.arc(bx - r * 0.8, by + r * 0.1, r * 0.7, 0, 7);
    ctx.fill();
  }
}

/**
 * 발끝(feetY) 기준으로 스프라이트를 그린다.
 * targetH 는 **캐릭터가 보이는 높이**다 — 캔버스 높이가 아니라 box(내용 경계) 기준이라
 * 캐릭터마다 캔버스 여백이 달라도 같은 크기로 보인다.
 */
function drawSprite(img, cx, feetY, targetH, box, { flip = false, sx = 1, sy = 1, dx = 0, alpha = 1, ring = null } = {}) {
  if (!img) return;
  const iw = img.naturalWidth, ih = img.naturalHeight;
  const bh = Math.max(0.01, box.h), bw = Math.max(0.01, box.w);
  const scale = targetH / (bh * ih);
  const dw = iw * scale * sx, dh = ih * scale * sy;
  // 내용 경계의 아래쪽이 발끝에, 가로 중심이 cx 에 오도록 맞춘다
  const footOff = (box.y + bh) * ih * scale * sy;
  const midOff = (box.x + bw / 2) * iw * scale * sx;
  const visW = bw * iw * scale;

  ctx.save();
  ctx.globalAlpha = 0.25 * alpha;
  ctx.fillStyle = '#1d3b24';
  ctx.beginPath();
  ctx.ellipse(cx + dx, feetY, visW * 0.45, targetH * 0.07, 0, 0, 7);
  ctx.fill();
  // 진영 고리 — 역할 반전 게임이라 어느 쪽이 내 편인지 한눈에 보여야 한다
  if (ring) {
    ctx.globalAlpha = 0.9 * alpha;
    ctx.strokeStyle = ring;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.ellipse(cx + dx, feetY, visW * 0.5, targetH * 0.08, 0, 0, 7);
    ctx.stroke();
  }
  ctx.globalAlpha = alpha;
  // 도트 그림이라 보간을 끈다. 켜 두면 가장자리가 투명 픽셀과 섞여 흐려지고,
  // 배경이 밝아진 뒤로는 그 흐려진 테두리가 그대로 눈에 띈다. (save/restore 안이라 배경에는 영향 없음)
  ctx.imageSmoothingEnabled = false;
  ctx.translate(cx + dx - midOff, feetY - footOff);
  if (flip) { ctx.translate(midOff * 2, 0); ctx.scale(-1, 1); }
  ctx.drawImage(img, 0, 0, dw, dh);
  ctx.restore();
}

function bar(x, y, w, h, frac, color) {
  ctx.fillStyle = 'rgba(0,0,0,.45)';
  ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
  ctx.fillStyle = '#2a3350';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w * Math.max(0, Math.min(1, frac)), h);
}

// ── 환경 입자 ── 배경이 흐르기만 하고 그 안엔 아무것도 안 움직이고 있었다.
// 레퍼런스는 fx_dust·fx_autumn_leaf·fx_cloud 같은 걸 상시 띄운다. 지역마다 색과
// 종류만 바꿔(balance.json 의 zones.list[].amb) 같은 코드로 돌린다.
const AMB_N = 18;
let ambZone = '', amb = [];
function ambTick(dt, zone) {
  if (ambZone !== zone) {                 // 지역이 바뀌면 통째로 새로 뿌린다
    ambZone = zone;
    amb = Array.from({ length: AMB_N }, () => ({
      x: Math.random(), y: Math.random(), r: 0.5 + Math.random() * 1.6,
      vx: -0.004 - Math.random() * 0.012, vy: (Math.random() - 0.5) * 0.006,
      ph: Math.random() * 6.28, sp: 0.6 + Math.random() * 1.6,
    }));
  }
  const cfg = (B.zones.list.find(z => z.key === zone) || {}).amb;
  if (!cfg) return;
  const kind = cfg.kind;
  ctx.save();
  ctx.fillStyle = cfg.color;
  for (const p of amb) {
    // 눈·재는 떨어지고 나머지는 옆으로 흐른다
    const fall = kind === 'snow' || kind === 'leaf' ? 0.016 : kind === 'ember' ? -0.022 : 0;
    p.x += p.vx * dt * 60 * 0.016;
    p.y += (p.vy + fall) * dt * 60 * 0.016;
    p.ph += dt * p.sp;
    if (p.x < -0.05) { p.x = 1.05; p.y = Math.random(); }
    if (p.y < -0.05) p.y = 1.05;
    if (p.y > 1.05) p.y = -0.05;
    const px = (p.x + Math.sin(p.ph) * 0.012) * W;
    const py = p.y * H * GROUND * 1.25;           // 지면 아래로는 안 내려간다
    ctx.globalAlpha = (kind === 'ember' ? 0.75 : 0.42) * (0.6 + 0.4 * Math.sin(p.ph * 1.3));
    if (kind === 'leaf') {                         // 잎 — 길쭉하게 회전
      ctx.save(); ctx.translate(px, py); ctx.rotate(p.ph);
      ctx.fillRect(-p.r * 2, -p.r * 0.7, p.r * 4, p.r * 1.4);
      ctx.restore();
    } else {
      ctx.beginPath(); ctx.arc(px, py, p.r, 0, 7); ctx.fill();
    }
  }
  ctx.restore();
}

// 적 인덱스 → 화면 좌표. 매 프레임 적을 그리며 채우고, 투사체·파편이 그대로 쓴다.
// 숫자 연출은 예전처럼 인덱스 근사 위치를 쓰지만 투사체는 실제로 맞아야 해서 좌표가 필요하다.
const foePos = [];

/** 투사체 한 발. 모양은 리드 몬스터의 bolt.shape, 색은 bolt.color (balance.json). */
function drawBolt(x, y, u, b, size) {
  const mon = B.roster.monsters.find(m => m.key === S.mon);
  const col = mon?.bolt?.color || '#9ae6b4';
  const shape = mon?.bolt?.shape || 'orb';
  const r = size * (b.crit ? 0.11 : 0.085);
  // 꼬리 — 지나온 쪽으로 옅게 늘어뜨린다. 점 하나만 날면 너무 빈약하다.
  ctx.save();
  ctx.globalAlpha = 0.3;
  ctx.strokeStyle = col;
  ctx.lineWidth = r * 1.1;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x - r * 2.6, y + r * 0.5);
  ctx.lineTo(x, y);
  ctx.stroke();
  ctx.restore();

  ctx.save();
  ctx.fillStyle = col;
  ctx.shadowColor = col;
  ctx.shadowBlur = b.crit ? 12 : 6;
  if (shape === 'wedge') {                 // 쐐기 — 날아가는 방향으로 뾰족하게
    ctx.translate(x, y);
    ctx.beginPath();
    ctx.moveTo(r * 1.5, 0); ctx.lineTo(-r, -r * 0.8); ctx.lineTo(-r * 0.4, 0); ctx.lineTo(-r, r * 0.8);
    ctx.closePath(); ctx.fill();
  } else if (shape === 'shard') {          // 조각 — 회전하는 마름모
    ctx.translate(x, y);
    ctx.rotate(b.ph + u * 9);
    ctx.beginPath();
    ctx.moveTo(0, -r * 1.3); ctx.lineTo(r * 0.8, 0); ctx.lineTo(0, r * 1.3); ctx.lineTo(-r * 0.8, 0);
    ctx.closePath(); ctx.fill();
  } else if (shape === 'coin') {           // 금화 — 납작하게 돌아간다
    ctx.translate(x, y);
    ctx.scale(Math.abs(Math.cos(b.ph + u * 11)) * 0.8 + 0.2, 1);
    ctx.beginPath(); ctx.arc(0, 0, r, 0, 7); ctx.fill();
    ctx.strokeStyle = '#b07d10'; ctx.lineWidth = 1.5; ctx.stroke();
  } else {                                  // orb
    ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
    ctx.globalAlpha = 0.5; ctx.beginPath(); ctx.arc(x, y, r * 1.5, 0, 7); ctx.fill();
  }
  ctx.restore();
}

export function render(dt) {
  if (!ctx || !W || !H) return;
  t += dt;
  const frame = Math.floor(t * 7);

  ctx.save();
  if (R.shake > 0) {
    const s = R.shake * 14;
    ctx.translate((Math.random() - 0.5) * s, (Math.random() - 0.5) * s);
  }
  drawBG(dt);

  const feet = laneY(0.45);          // 리드가 서는 깊이
  const base = Math.min(W, H);
  // 몬스터는 내용에 딱 맞게 잘라낸 크롭이고 용사 PNG 는 128x128 에 여백이 많다.
  // 같은 높이로 그리면 몬스터가 거인처럼 보여서, 보이는 크기가 맞도록 따로 잡는다.
  // 몬스터 크롭은 여백이 없고 용사 PNG 는 여백이 커서, 같은 기준으로는 몬스터가 커 보인다
  // 이제 둘 다 "보이는 높이" 라 같은 기준으로 비교된다
  // 영상 기준: 캐릭터는 전투 영역에서 작게, 서로 가깝게 선다
  // 작게. 0.20 일 때는 캐릭터 대여섯이 화면을 꽉 채워 전장이 보이지 않았다.
  // 잡몹은 작게 흩고 **보스만 크게** — 보스가 "사건" 으로 보여야 한다.
  const pH = base * 0.125 * laneS(0.45);
  const eH = base * (R.boss ? 0.32 : 0.11);

  // ── 동료 ──
  // 피해는 더하지 않는다. comp 배너의 DPS 기여는 이미 계산에 들어 있고
  // 여기서는 그 수치에 몸만 준다(companions.js 주석 참고).
  //
  // 전부 리드보다 먼저 그렸더니 리드 가까이 선 동료가 통째로 가려졌다.
  // dy 로 앞뒤를 갈라 뒷줄은 리드 전에, 앞줄은 리드 뒤에 그린다 — 그래야
  // 겹침이 "가림" 이 아니라 "거리감" 으로 읽힌다.
  const ATK_DUR = 0.25;
  const elapsed = ATK_DUR - Math.max(0, R.atkAnimT);         // 0 → 0.25
  const comps = activeCompanions();
  const drawComp = c => {
    const e = (elapsed - c.delay) / ATK_DUR;
    const lunge = e > 0 && e < 1 ? Math.sin(e * Math.PI) : 0;
    const h = base * 0.125 * c.s * laneS(c.d);
    const cx = W * (0.30 + c.dx);
    const cy = laneY(c.d) + Math.sin(t * 3 + c.phase) * h * 0.025;
    // 고리는 리드에게만 준다 — 여섯 개가 겹치면 바닥이 고리밭이 되고
    // 정작 "누가 주인공인지" 가 흐려진다.
    const opt = { dx: lunge * W * 0.03, sx: 1 + lunge * 0.08, sy: 1 - lunge * 0.06, alpha: 0.92 };
    const own = compImage(c.id);
    if (own) drawSprite(own, cx, cy, h, boxOf('comp', c.id), opt);
    else drawSprite(pick('mon', c.sprite, 'idle', 0), cx, cy, h, boxOf('mon', c.sprite), opt);
  };
  const LEAD_D = 0.45;
  for (const c of comps) if (c.d <= LEAD_D) drawComp(c);      // 리드보다 뒤

  // ── 플레이어 (몬스터) — 프레임이 1장이라 변형으로 연출 ──
  // 포즈 그림이 있으면 그걸 쓴다(슬라임은 idle/attack/hit/dead 4장). 없으면 idle 로
  // 폴백하고 아래 변형으로 흉내낸다 — pick() 이 알아서 돌려준다.
  const pose = R.atkAnimT > 0 ? 'attack' : R.pHitT > 0 ? 'hit' : 'idle';
  const pImg = pick('mon', S.mon, pose, 0);
  const hasPose = frameCount('mon', S.mon, pose) > 0;
  const atk = Math.max(0, R.atkAnimT) / 0.25;               // 1 → 0
  const lungePhase = Math.sin((1 - atk) * Math.PI);          // 0 → 1 → 0
  // 포즈 그림이 이미 런지를 그리고 있으면 변형을 약하게 준다 — 둘 다 세게 주면 과장된다
  const k = hasPose && pose !== 'idle' ? 0.35 : 1;
  const bob = Math.sin(t * 3) * pH * 0.02;
  drawSprite(pImg, W * 0.30, feet + bob, pH, boxOf('mon', S.mon), {
    dx: lungePhase * W * 0.05 * k,
    sx: 1 + lungePhase * 0.1 * k,
    sy: 1 - lungePhase * 0.08 * k,
    ring: ALLY,
  });
  for (const c of comps) if (c.d > LEAD_D) drawComp(c);      // 리드보다 앞 — 카메라에 가깝다

  const pbw = W * 0.22;
  const hpFrac = R.LhpMax > L0 ? ratio(R.Lhp, R.LhpMax) : 0;
  bar(W * 0.30 - pbw / 2, feet - pH - 20, pbw, 8, hpFrac, hpFrac < 0.3 ? '#ff6b6b' : '#4ade80');
  // 배경이 밝으면(설원·풀밭) 글자가 묻힌다 — 피해 숫자와 같이 어두운 외곽선을 깐다
  ctx.textAlign = 'center';
  ctx.strokeStyle = 'rgba(12,18,34,.8)';
  ctx.lineWidth = 3;
  const me = B.roster.monsters.find(m => m.key === S.mon);
  const nameY = feet - pH - 38, hpY = feet - pH - 26;
  ctx.font = '800 12px system-ui';
  ctx.strokeText('나 · ' + (me ? me.name : '몬스터'), W * 0.30, nameY);
  ctx.fillStyle = ALLY;
  ctx.fillText('나 · ' + (me ? me.name : '몬스터'), W * 0.30, nameY);
  ctx.font = '600 10px system-ui';
  ctx.strokeText('HP ' + fmt(R.Lhp), W * 0.30, hpY);
  ctx.fillStyle = '#cfdcf2';
  ctx.fillText('HP ' + fmt(R.Lhp), W * 0.30, hpY);

  // ── 적 (용사) — 프레임 애니 + 피격 시 밀림 ──
  // 한 기마다 용사가 다르다(combat.spawnWave 가 e.hero 를 심는다). 구세이브로 들어오면
  // e.hero 가 없으므로 예전처럼 구역 용사로 폴백한다.
  const lead = heroAt(R.stage);
  // 쓰러지는 중인 적도 그린다 — dead 포즈가 끝나야 사라진다.
  // 레인은 **R.enemies 안의 제자리 번호**로 고른다. 살아있는 것만 세서 고르면
  // 하나가 죽을 때마다 남은 적들이 레인을 갈아타며 툭 튄다.
  const shown = [];
  R.enemies.forEach((e, idx) => {
    if (!(e.Lhp > L0 || e.deadT > 0)) return;
    const d = R.boss ? 0.5 : FOE_LANES[idx % FOE_LANES.length];
    const x = R.boss ? W * 0.66 : W * (0.56 + (idx % 3) * 0.13 + (d - 0.5) * 0.06);
    shown.push({ e, idx, d, x });
  });
  shown.sort((a, b) => a.d - b.d);        // 뒤에 있는 것부터 그린다

  // 보스 발밑 오라 — 상시 맥동한다. 보스가 "큰 적" 이 아니라 "보스" 로 읽히게 한다.
  if (R.boss && shown.length) {
    const d0 = shown[0].d, bx = shown[0].x, by = laneY(d0);
    const pulse = 0.72 + 0.28 * Math.sin(t * 4.2);
    const rw = eH * 0.72 * pulse, rh = rw * 0.3;
    ctx.save();
    const g = ctx.createRadialGradient(bx, by, 0, bx, by, rw);
    const hot = enrage() > 1;                       // 광폭화하면 붉게 달아오른다
    g.addColorStop(0, hot ? 'rgba(255,90,60,.55)' : 'rgba(255,190,80,.45)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.ellipse(bx, by, rw, rh, 0, 0, 7); ctx.fill();
    ctx.restore();
  }

  for (const { e, idx, d, x: ex } of shown) {
    const ey = laneY(d);
    const h = eH * laneS(d);
    const eb = Math.sin(t * 2.4 + e.ph) * h * 0.015;
    const hit = e.hitT > 0 ? e.hitT / 0.12 : 0;
    const dying = e.deadT > 0 ? e.deadT / (B.combatFx?.deathSec || 0.32) : 0;
    foePos[idx] = { x: ex, y: ey - h * 0.55 };   // 투사체·파편이 겨눌 몸통 가운데
    // flip 을 쓰지 않는다 — 용사 그림이 이미 왼쪽(우리 쪽)을 보게 그려져 있다.
    // 뒤집으면 무기와 장식이 반대로 가고 기사의 방패가 바깥쪽으로 돌아간다.
    const fPose = dying > 0 ? 'dead' : hit > 0 ? 'hit' : R.foeAtkT > 0 ? 'attack' : 'idle';
    const hero = e.hero || lead;
    if (dying > 0) ctx.globalAlpha = Math.max(0, dying);   // 쓰러지며 옅어진다
    drawSprite(pick('hero', hero.key, fPose, frame + idx), ex, ey + eb, h, boxOf('hero', hero.key), {
      dx: hit * 7 + (1 - dying) * (dying > 0 ? 14 : 0),    // 맞은 쪽으로 밀리며 쓰러진다
      sx: 1 + hit * 0.06,
      ring: dying > 0 ? null : FOE,
    });
    ctx.globalAlpha = 1;
    if (dying > 0) continue;              // 쓰러지는 적은 체력바를 지운다
    const bw = h * 0.62;
    bar(ex - bw / 2, ey - h - 7, bw, 4, ratio(e.Lhp, e.Lmax), '#ff5a6e');
  }

  // ── 투사체 ── 리드에서 적까지 날아가고 꼬리를 남긴다.
  // 피해는 이미 끝나 있고 이건 눈에 보이는 몫만 담당한다(combat.js 참조).
  const boltFrom = { x: W * 0.30, y: feet - pH * 0.55 };
  for (const b of R.bolts) {
    const to = foePos[b.idx];
    if (!to || b.t > b.dur) continue;
    const u = Math.min(1, b.t / b.dur);
    const bx = boltFrom.x + (to.x - boltFrom.x) * u;
    // 살짝 포물선을 그려야 '날아간다' 로 읽힌다
    const by = boltFrom.y + (to.y - boltFrom.y) * u - Math.sin(u * Math.PI) * pH * 0.30;
    drawBolt(bx, by, u, b, pH);
  }

  ctx.textAlign = 'center';
  // 레퍼런스는 잡몹에 이름표를 안 단다 — 보스일 때만 크게 보여준다
  if (R.boss) {
    // 광폭화 중이면 배수를 같이 띄운다 — 얼마나 위험해졌는지가 숫자로 보여야 한다
    const en = enrage();
    const label = '👑 ' + lead.name + (en > 1 ? '  🔥×' + en.toFixed(1) : '');
    ctx.fillStyle = en > 1 ? '#ff7a5a' : FOE;
    ctx.font = '800 13px system-ui';
    ctx.strokeStyle = 'rgba(30,20,10,.7)'; ctx.lineWidth = 3;
    // 보스는 W*0.66 에 선다(위 drawn 참고). 이름표도 같은 x 여야 머리 위에 온다.
    ctx.strokeText(label, W * 0.66, feet - eH - 46);
    ctx.fillText(label, W * 0.66, feet - eH - 46);
  }


  // 스킬 섬광 — 전장을 한 번 밝힌다. 숫자만으로는 "터졌다" 가 안 읽힌다.
  // ── 스킬 연출 ── 6종이 전부 같은 보라 섬광이면 무엇이 터졌는지 안 읽힌다.
  // 모양·색은 balance.json 의 skills.fx 가 정한다(연출 전용, 피해와 무관).
  if (R.skillFxT > 0) {
    const def = (B.skills.fx || {})[R.skillFx] || ['#b59bff', 'flash'];
    const [col, kind] = def;
    const u = 1 - R.skillFxT / 0.35;             // 0 → 1
    const a = Math.min(0.42, R.skillFxT);
    const cy = H * GROUND * 0.92, cx = W * 0.66;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.fillStyle = col; ctx.strokeStyle = col;
    if (kind === 'streak') {                      // 돌풍 — 가로로 긋는 선
      ctx.lineWidth = 3;
      for (let i = 0; i < 5; i++) {
        const yy = H * (0.28 + i * 0.1);
        const x0 = W * (u * 1.5 - 0.5 + i * 0.05);
        ctx.beginPath(); ctx.moveTo(x0 * W / W, yy); ctx.lineTo(x0 + W * 0.3, yy); ctx.stroke();
      }
    } else if (kind === 'ring') {                 // 비명 — 퍼지는 고리
      ctx.lineWidth = 4;
      for (let i = 0; i < 3; i++) {
        ctx.globalAlpha = a * (1 - i * 0.3);
        ctx.beginPath(); ctx.arc(cx, cy, W * (0.08 + u * 0.5) - i * 14, 0, 7); ctx.stroke();
      }
    } else if (kind === 'cone') {                 // 숨결 — 리드에서 뻗는 부채꼴
      ctx.beginPath();
      ctx.moveTo(W * 0.30, cy);
      ctx.lineTo(W * (0.30 + u * 0.75), cy - H * 0.16);
      ctx.lineTo(W * (0.30 + u * 0.75), cy + H * 0.10);
      ctx.closePath(); ctx.fill();
    } else if (kind === 'crack') {                // 지진 — 지면 균열
      ctx.lineWidth = 3;
      for (let i = 0; i < 4; i++) {
        const bx = W * (0.45 + i * 0.13);
        ctx.beginPath(); ctx.moveTo(bx, cy);
        ctx.lineTo(bx + (i % 2 ? 10 : -10), cy - H * 0.08 * u);
        ctx.lineTo(bx + (i % 2 ? -6 : 6), cy - H * 0.15 * u);
        ctx.stroke();
      }
    } else if (kind === 'grip') {                 // 포박 — 조여드는 테두리
      ctx.lineWidth = 10 * (1 - u * 0.6);
      const m = W * 0.06 * u;
      ctx.strokeRect(m, m, W - m * 2, H - m * 2);
    } else if (kind === 'splash') {               // 산성 — 번지는 얼룩
      for (let i = 0; i < 7; i++) {
        const an = i * 0.9 + u * 2;
        ctx.globalAlpha = a * (1 - u) * 1.4;
        ctx.beginPath();
        ctx.arc(cx + Math.cos(an) * W * 0.18 * u, cy + Math.sin(an) * H * 0.10 * u, 10 + u * 16, 0, 7);
        ctx.fill();
      }
    } else {                                      // 폴백 — 예전 전체 섬광
      ctx.globalAlpha = Math.min(0.35, R.skillFxT);
      ctx.fillRect(0, 0, W, H);
    }
    ctx.restore();
  }

  // ── 버프 가시화 ── 배속은 숫자로만 있어서 켜 둔 줄도 모른다. 가장자리에 속도선을 깐다.
  if ((S.spd || 1) > 1) {
    ctx.save();
    ctx.globalAlpha = 0.16 + 0.06 * Math.sin(t * 9);
    ctx.strokeStyle = '#ffd34d';
    ctx.lineWidth = 2;
    for (let i = 0; i < 6; i++) {
      const yy = H * (0.1 + i * 0.16) + Math.sin(t * 6 + i) * 4;
      const len = W * 0.09;
      const x0 = (t * 320 + i * 140) % (W + len) - len;
      ctx.beginPath(); ctx.moveTo(x0, yy); ctx.lineTo(x0 + len, yy); ctx.stroke();
    }
    ctx.restore();
  }

  // ── 데미지 숫자 · 금화 ──
  for (const f of R.fx) {
    if (f.delay > 0) continue;                  // 아직 뜰 차례가 아니다
    ctx.globalAlpha = Math.max(0, Math.min(1, f.life * 1.6));
    const fx = W * (0.62 + (f.x - 1) * 0.055) + (f.jx || 0);
    const fy = feet - eH * 1.05 + f.y;
    if (f.type === 'coin') {
      ctx.beginPath();
      ctx.arc(fx, fy, 5, 0, 7);
      ctx.fillStyle = '#ffd34d';
      ctx.fill();
      ctx.strokeStyle = '#b07d10';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      continue;
    }
    if (f.type === 'shard') {           // 명중 파편 — 리드 색으로 튄다
      const mon = B.roster.monsters.find(m => m.key === S.mon);
      ctx.fillStyle = mon?.bolt?.color || '#9ae6b4';
      ctx.fillRect(fx - 2, fy - 2, 4, 4);
      continue;
    }
    if (f.type === 'skill') { ctx.fillStyle = '#b59bff'; ctx.font = '800 20px system-ui'; }
    else if (f.type === 'crit') { ctx.fillStyle = '#ffe24a'; ctx.font = '800 22px system-ui'; }
    else if (f.type === 'gold') { ctx.fillStyle = '#ffd34d'; ctx.font = '800 15px system-ui'; }
    else { ctx.fillStyle = '#fff'; ctx.font = '800 16px system-ui'; }
    ctx.strokeStyle = 'rgba(30,20,10,.75)';
    ctx.lineWidth = 3;
    ctx.strokeText(f.text, fx, fy);
    ctx.fillText(f.text, fx, fy);
  }
  ctx.globalAlpha = 1;

  if (R.bannerT > 0 && R.bannerBig) {
    // 해금은 사건이다 — 띠를 깔고 크게. 조용히 지나가면 플레이어가 모르고 넘어간다.
    const a = Math.min(1, R.bannerT);
    const by = H * 0.30;
    ctx.globalAlpha = a * 0.88;
    ctx.fillStyle = '#1a1230';
    ctx.fillRect(0, by - 30, W, 60);
    ctx.fillStyle = '#d8b24a';
    ctx.fillRect(0, by - 31, W, 2);
    ctx.fillRect(0, by + 29, W, 2);
    ctx.globalAlpha = a;
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffd34d';
    ctx.font = '800 15px system-ui';
    ctx.fillText('새로운 해금!', W * 0.5, by - 8);
    ctx.fillStyle = '#fff6c9';
    ctx.font = '800 13px system-ui';
    ctx.fillText(R.banner, W * 0.5, by + 14);
    ctx.globalAlpha = 1;
  } else if (R.bannerT > 0) {
    ctx.globalAlpha = Math.min(1, R.bannerT);
    ctx.fillStyle = '#fff6c9';
    ctx.font = '800 20px system-ui';
    ctx.strokeStyle = 'rgba(40,28,10,.8)';
    ctx.lineWidth = 4;
    ctx.strokeText(R.banner, W * 0.5, H * 0.18);
    ctx.fillText(R.banner, W * 0.5, H * 0.18);
    ctx.globalAlpha = 1;
  }

  // ── 보스 전용 체력바 ── 머리 위 작은 바로는 "보스" 가 안 읽힌다. 화면 위에 길게 깐다.
  if (R.boss) {
    const live = R.enemies.find(e => e.Lhp > L0);
    if (live) {
      const bw = W * 0.74, bx = (W - bw) / 2, by = H * 0.055;
      const fr = ratio(live.Lhp, live.Lmax);
      ctx.save();
      ctx.fillStyle = 'rgba(8,11,24,.72)';
      ctx.fillRect(bx - 3, by - 3, bw + 6, 14);
      ctx.fillStyle = '#2a1118';
      ctx.fillRect(bx, by, bw, 8);
      const hot = enrage() > 1;
      const g = ctx.createLinearGradient(bx, 0, bx + bw, 0);
      g.addColorStop(0, hot ? '#ff4a3a' : '#ff5a6e');
      g.addColorStop(1, hot ? '#ffb14a' : '#ff9a9a');
      ctx.fillStyle = g;
      ctx.fillRect(bx, by, bw * Math.max(0, Math.min(1, fr)), 8);
      ctx.restore();
    }
  }

  // ── 보스 등장 경고 ── 들어선 순간 1초. 가로 띠가 위아래로 열린다.
  if (R.bossIntroT > 0) {
    const u = 1 - R.bossIntroT / 1.0;                 // 0 → 1
    const open = Math.min(1, u * 3);                  // 빠르게 열리고
    const fade = R.bossIntroT < 0.3 ? R.bossIntroT / 0.3 : 1;   // 끝에서 사라진다
    const bh = H * 0.17 * open;
    ctx.save();
    ctx.globalAlpha = 0.82 * fade;
    ctx.fillStyle = 'rgba(14,4,8,.9)';
    ctx.fillRect(0, H * 0.42 - bh / 2, W, bh);
    ctx.strokeStyle = '#ff5a4a'; ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, H * 0.42 - bh / 2); ctx.lineTo(W, H * 0.42 - bh / 2);
    ctx.moveTo(0, H * 0.42 + bh / 2); ctx.lineTo(W, H * 0.42 + bh / 2);
    ctx.stroke();
    if (open > 0.6) {
      ctx.globalAlpha = fade;
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ffd34d';
      ctx.font = '800 22px system-ui';
      ctx.fillText('👑 보스 ' + R.heroName, W / 2, H * 0.42 + 8);
    }
    ctx.restore();
  }

  // ── 보스 처치 섬광 ──
  if (R.bossSlainT > 0) {
    ctx.save();
    ctx.globalAlpha = Math.min(0.75, R.bossSlainT * 1.5);
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }

  ctx.restore();
}

export function preloadFor(stage) {
  preload('mon', S.mon);
  preload('hero', heroAt(stage).key);
  // 적과 배경은 5스테이지마다 바뀐다. 다음 장면 것도 미리 받아둬야 교체되는 순간
  // 몇 프레임 동안 빈 칸/맨 캔버스가 비친다. bgImage 는 캐시에 넣기만 하면 예열된다.
  const next = stage + sceneEvery();
  // 한 웨이브에 지금까지 등장한 용사가 섞여 나오므로 풀 전체가 필요하다 (다음 구역 것까지).
  for (const h of heroPool(next)) preload('hero', h.key);
  bgImage(zoneAt(stage).key);
  bgImage(zoneAt(next).key);
}
