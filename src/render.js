// 캔버스 렌더. 왼쪽이 플레이어(몬스터), 오른쪽이 적(인간 용사).
//
// 몬스터는 도감 시트에서 잘라낸 대표 포즈 1장만 있다(tools/make-monster-sprites.mjs).
// 그래서 공격·피격 연출은 프레임이 아니라 스쿼시·런지·셰이크로 만든다(DESIGN.md §12).
// 용사는 Idle/Attack/Hit/Dead 프레임이 멀쩡해서 프레임 애니를 그대로 쓴다.
import { B, heroAt } from './balance.js';
import { S } from './state.js';
import { R } from './combat.js';
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

function drawBG() {
  const gy = H * GROUND;
  const zone = B.zones.list[Math.floor((R.stage - 1) / B.stage.bossEvery) % B.zones.list.length];
  const img = bgImage(zone.key);
  if (img) { drawCover(img); return; }

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

export function render(dt) {
  if (!ctx || !W || !H) return;
  t += dt;
  const frame = Math.floor(t * 7);

  ctx.save();
  if (R.shake > 0) {
    const s = R.shake * 14;
    ctx.translate((Math.random() - 0.5) * s, (Math.random() - 0.5) * s);
  }
  drawBG();

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
  const hero = heroAt(R.stage);
  const alive = R.enemies.filter(e => e.Lhp > L0);
  const n = alive.length;
  // 격자로 세우면 "줄" 이 보인다. 깊이를 지그재그로 주고 가로도 조금씩 어긋나게 둔다.
  // 뒤 레인은 작고 위에, 앞 레인은 크고 아래에 — 그래야 한 바닥면 위에 흩어진 것으로 보인다.
  const drawn = alive.map((e, i) => {
    // 보스는 한 기뿐이다 — 흩을 이유가 없고 가운데 크게 서야 한다
    if (R.boss) return { e, i, d: 0.5, x: W * 0.66 };
    const d = FOE_LANES[i % FOE_LANES.length];
    return { e, i, d, x: W * (0.56 + (i % 3) * 0.13 + (d - 0.5) * 0.06) };
  }).sort((a, b) => a.d - b.d);           // 뒤에 있는 것부터 그린다

  for (const { e, i, d, x: ex } of drawn) {
    const ey = laneY(d);
    const h = eH * laneS(d);
    const eb = Math.sin(t * 2.4 + e.ph) * h * 0.015;
    const hit = e.hitT > 0 ? e.hitT / 0.12 : 0;
    // flip 을 쓰지 않는다 — 용사 그림이 이미 왼쪽(우리 쪽)을 보게 그려져 있다.
    // 뒤집으면 무기와 장식이 반대로 가고 기사의 방패가 바깥쪽으로 돌아간다.
    const fPose = hit > 0 ? 'hit' : R.foeAtkT > 0 ? 'attack' : 'idle';
    drawSprite(pick('hero', hero.key, fPose, frame + i), ex, ey + eb, h, boxOf('hero', hero.key), {
      dx: hit * 7,
      sx: 1 + hit * 0.06,
      ring: FOE,
    });
    const bw = h * 0.62;
    bar(ex - bw / 2, ey - h - 7, bw, 4, ratio(e.Lhp, e.Lmax), '#ff5a6e');
  }

  ctx.textAlign = 'center';
  // 레퍼런스는 잡몹에 이름표를 안 단다 — 보스일 때만 크게 보여준다
  if (R.boss) {
    ctx.fillStyle = FOE;
    ctx.font = '800 13px system-ui';
    ctx.strokeStyle = 'rgba(30,20,10,.7)'; ctx.lineWidth = 3;
    // 보스는 W*0.66 에 선다(위 drawn 참고). 이름표도 같은 x 여야 머리 위에 온다.
    ctx.strokeText('👑 ' + hero.name, W * 0.66, feet - eH - 46);
    ctx.fillText('👑 ' + hero.name, W * 0.66, feet - eH - 46);
  }


  // 스킬 섬광 — 전장을 한 번 밝힌다. 숫자만으로는 "터졌다" 가 안 읽힌다.
  if (R.skillFxT > 0) {
    ctx.globalAlpha = Math.min(0.35, R.skillFxT);
    ctx.fillStyle = '#b59bff';
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 1;
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

  ctx.restore();
}

export function preloadFor(stage) {
  preload('mon', S.mon);
  preload('hero', heroAt(stage).key);
}
