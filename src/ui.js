// HUD + 패널. 강화 패널이 1단계의 핵심 화면이다.
import { B, STAT_KEYS, chapterLabel, perWave, zoneAt } from './balance.js';

import { S, save, wipe } from './state.js';
import { R, retry, enterStage, toughness, MODE, AUTO_RETRY_CLEARS } from './combat.js';
import { Lcost, LcostN, Lval, nval, unlocked, maxed, affordable, buy, bestBuy, canClear, LDPS, LHP, LDEF } from './stats.js';
import { preloadFor } from './render.js';
import * as G from './gacha.js';
import * as DUN from './dungeon.js';
import * as RELIC from './relics.js';
import * as PR from './prestige.js';
import * as DQ from './daily.js';
import * as L2 from './layer2.js';
import { playRewarded } from './ads.js';
import { initGrow, renderGrow } from './ui-grow.js';
import { initDev } from './ui-dev.js';
import { initGacha, renderGacha } from './ui-gacha.js';
import { renderRoad } from './ui-road.js';
import { nextMilestone } from './unlocks.js';
import * as sfx from './audio.js';
import * as EV from './events.js';
import { fmt, L0, ratio } from './logmath.js';
import { t, n0, LANG, LANGS, setLang } from './i18n.js';

const $ = id => document.getElementById(id);
let tab = 'battle';
let buyMode = 1;        // 1 | 10 | 'max'
let lastGoal = '';      // 목표 띠 — 바뀔 때만 다시 그린다

export function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('on');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove('on'), 1500);
}

// ── 스탯 표시값 ──────────────────────────────────────────────
function statValueText(k) {
  const d = B.stats[k];
  if (d.kind === 'mul') {
    if (k === 'def') return t('upg.defVal', { v: fmt(Lval(k)) });
    return fmt(Lval(k));
  }
  const v = nval(k);
  if (d.unit === 'pct') return (v * 100).toFixed(1) + '%';
  if (d.unit === 'persec') return t('unit.persec', { v: v.toFixed(2) });
  if (d.unit === 'mul') return '×' + v.toFixed(2);
  return v.toFixed(2);
}

function lockText(k) {
  const d = B.stats[k];
  if (d.reqStage) return t('upg.lockStage', { n: d.reqStage });
  if (d.req) return t('upg.lockReq', { stat: B.stats[d.req[0]].name, lv: d.req[1] });
  return t('upg.locked');
}

// ── 강화 패널 ────────────────────────────────────────────────
function renderUpgrade() {
  const rec = bestBuy(R.stage, R.boss);
  // 구매 단위 선택을 목록 맨 위에 붙인다 (예전엔 강화 탭 안에 있었다)
  // 자동 강화 토글을 구매 단위 옆에 붙인다 — 켜져 있으면 ×1/×10/MAX 는 사실상 안 쓰게 된다
  const auto = S.autoBuy !== false;
  const bar = `<div class="bar">` + [1, 10, 'max'].map(m =>
    `<div class="seg ${buyMode === m ? 'on' : ''}" data-bm="${m}">${m === 'max' ? 'MAX' : '×' + m}</div>`).join('')
    + `<div class="seg ${auto ? 'on' : ''}" data-auto="1" title="${t('upg.autoTip')}">⚙ ${t('upg.auto')} ${auto ? 'ON' : 'OFF'}</div></div>`;
  const rows = STAT_KEYS.map(k => {
    const d = B.stats[k];
    if (!unlocked(k)) {
      return `<div class="row lock"><div class="ic">🔒</div><div class="mid">
        <div class="t">${d.name}</div><div class="d" style="font-weight:600;opacity:.6;font-size:11px">${lockText(k)}</div></div>
        <div class="buyBtn"><div class="lbl">🔒</div></div></div>`;
    }
    if (maxed(k)) {
      return `<div class="row max"><div class="ic">${d.icon}<b>MAX</b></div><div class="mid">
        <div class="t">${d.name}</div><div class="d">${statValueText(k)}</div></div>
        <div class="buyBtn"><div class="lbl">${t('upg.done')}</div></div></div>`;
    }
    const n = buyMode === 'max' ? affordable(k) : buyMode;
    const have = affordable(k) >= Math.min(n, 1) && affordable(k) > 0;
    const payN = Math.max(1, Math.min(n || 1, affordable(k) || 1));
    const Lc = buyMode === 1 ? Lcost(k) : LcostN(k, payN);
    const can = Lc <= S.Lg;
    const star = rec && rec.key === k ? `<span class="rec">${t('upg.rec')}</span>` : '';
    return `<div class="row ${can ? 'can' : 'cant'}" data-k="${k}">
      <div class="ic">${d.icon}<b>LV ${S.lv[k]}</b></div>
      <div class="mid">
        <div class="t">${d.name}${star}</div>
        <div class="d">${statValueText(k)}</div>
      </div>
      <div class="buyBtn">
        <div class="lbl">${t('upg.buy')} ${buyMode === 'max' ? '×' + (affordable(k) || 0) : '×' + buyMode}</div>
        <div class="cost">🪙 ${fmt(Lc)}</div>
      </div></div>`;
  }).join('');

  $('mainUpg').innerHTML = bar + rows;
  $('mainUpg').querySelectorAll('[data-k]').forEach(el => {
    el.onclick = () => {
      const k = el.dataset.k;
      const n = buyMode === 'max' ? affordable(k) : buyMode;
      const got = buy(k, Math.max(1, n));
      // 성공했을 때만 울린다. 길게 누르기 연타는 audio.js 가 250ms 로 막는다.
      if (got > 0) { sfx.upgrade(); save(); refresh(); }
      else toast(t('upg.noGold'));
    };
  });
  const autoEl = $('mainUpg').querySelector('[data-auto]');
  if (autoEl) autoEl.onclick = () => { S.autoBuy = S.autoBuy === false; save(); renderUpgrade(); };
  $('mainUpg').querySelectorAll('[data-bm]').forEach(el => {
    el.onclick = () => { buyMode = el.dataset.bm === 'max' ? 'max' : +el.dataset.bm; renderUpgrade(); };
  });
}

// ── 던전 패널 ────────────────────────────────────────────────
const dSel = {};                 // 던전별 선택 난이도
const dRes = {};                 // 던전별 마지막 결과

// 조각은 등불 유물(×1.25) 때문에 소수가 생긴다 — 정수면 정수로, 아니면 한 자리
const shardTxt = v => (Math.abs(v - Math.round(v)) < 0.05 ? String(Math.round(v)) : v.toFixed(1));
/** 마을 침공 카드의 '다음 유물' 줄. 던전에 들어가기 전에 목표가 보여야 키를 쓸 이유가 생긴다 */
function relicLine() {
  const nx = RELIC.next();
  if (!nx) return `<div class="d" style="opacity:.85">🏺 ${t('relic.allOpen', { n: RELIC.RELICS.length })}</div>`;
  const pct = (RELIC.progress() * 100).toFixed(1);
  return `<div class="d" style="opacity:.9;margin-top:-4px">🏺 ${t('relic.next')} <b>${nx.icon} ${nx.name}</b> — ${RELIC.describe(nx.eff)}
      <div style="height:6px;background:#0b1028;border-radius:4px;margin:5px 0 3px;overflow:hidden">
        <div style="height:100%;width:${pct}%;background:linear-gradient(90deg,#c58a2e,#ffd27a)"></div></div>
      ${t('relic.progressLine', { sh: shardTxt(RELIC.shards()), cost: nx.cost, open: RELIC.openCount(), total: RELIC.RELICS.length, rec: DUN.recDiff('raid') })}</div>`;
}

function renderDungeon() {
  if (!DUN.unlocked()) {
    $('dunList').innerHTML = `<div class="note">${t('dun.locked')}</div>`;
    return;
  }
  $('dunList').innerHTML = DUN.DUNGEONS.map(d => {
    const maxD = DUN.maxDiff(d.key);
    // 마을 침공은 '끝까지 점령되는 최고 난이도' 로 연다 — 조각이 난이도의 log 라 한두 칸 낮춰도 거의 손해가 없다
    const cur = Math.min(dSel[d.key] ?? (d.key === 'raid' ? DUN.recDiff('raid') : maxD), maxD);
    dSel[d.key] = cur;
    const keys = DUN.keysLeft(d.key), ads = DUN.adLeft(d.key);
    const r = dRes[d.key];
    return `<div class="dcard">
      <h3>${d.icon} ${d.name}</h3>
      <div class="d">${d.desc}<br>${t('dun.reward', { r: d.reward })}</div>
      ${d.key === 'raid' ? relicLine() : ''}
      <div class="drow">
        <span class="k">🗝️ ${t('dun.keys', { n: keys, m: DUN.keysMax(d.key) })}</span>
        <span class="k">📺 ${t('dun.ads', { n: ads, m: B.dungeon.adRunsPerDay })}</span>
        <span style="opacity:.5">${t('dun.best', { n: DUN.clearedDiff(d.key) })}</span>
      </div>
      <div class="dlv">
        <button data-dd="${d.key}" ${cur <= 1 ? 'disabled' : ''}>−</button>
        <div class="cur">${t('dun.diff', { n: cur })}<small>${t('dun.base', { n: DUN.diffStage(cur) })}</small></div>
        <button data-du="${d.key}" ${cur >= maxD ? 'disabled' : ''}>+</button>
      </div>
      <div class="dbtn">
        <button data-dk="${d.key}" ${keys < 1 ? 'disabled' : ''}>${t('dun.enter')}<span class="c">🗝️ ${t('dun.key1')}</span></button>
        <button class="ad" data-da="${d.key}" ${ads < 1 ? 'disabled' : ''}>📺 ${t('dun.extra')}<span class="c">${t('dun.left', { n: ads })}</span></button>
      </div>
      ${r ? `<div class="dres">${r}</div>` : ''}
    </div>`;
  }).join('');

  const run = async (k, useAd) => {
    if (useAd) {
      if (DUN.adLeft(k) < 1) { toast(t('dun.noAds')); return; }
      if (!await playRewarded()) { toast(t('ad.notFinished')); return; }
    }
    const res = DUN.enter(k, dSel[k], useAd);
    if (!res) { toast(t('dun.cant')); return; }
    if (k === 'boss') {
      dRes[k] = t('dun.bossLine', { k: res.killed, t: res.total, s: res.seconds.toFixed(1) })
        + (res.died ? ` · <span style="color:#ff8a8a">${t('dun.down')}</span>` : res.full ? ` · <span style="color:#7fd07f">${t('dun.fullClear')}</span>` : ' · ' + t('dun.timeout'))
        + `<br>${t('dun.gain')} 💎 <b>${res.gem}</b>`
        + (res.full ? ' · ' + t('dun.nextUnlock') : '');
    } else if (k === 'raid') {
      dRes[k] = t('dun.raidLine', { z: res.zones, t: res.total, s: res.seconds.toFixed(1) })
        + (res.full ? ` · <span style="color:#7fd07f">${t('dun.fullRaid')}</span>` : ' · ' + t('dun.timeout'))
        + `<br>${t('dun.gain')} 🏺 ${t('dun.shards')} <b>${shardTxt(res.gain)}</b>`
        + (res.opened?.length ? ` · <span style="color:#ffd27a">${t('relic.awoke', { names: res.opened.map(r => r.icon + ' ' + r.name).join(', ') })}</span>` : '');
      for (const r of res.opened || []) toast(t('relic.awokeToast', { icon: r.icon, name: r.name, fx: RELIC.describe(r.eff) }));
    } else {
      dRes[k] = t('dun.cartLine', { p: (res.frac * 100).toFixed(0) })
        + (res.full ? ` · <span style="color:#7fd07f">${t('dun.cartFull')}</span>` : '')
        + `<br>${t('dun.gain')} 🪙 <b>${fmt(res.Lgold)}</b>`;
    }
    save(); renderDungeon(); refresh();
    showDunResult(k, res);
  };
  $('dunList').querySelectorAll('[data-dd]').forEach(el => el.onclick = () => { dSel[el.dataset.dd]--; renderDungeon(); });
  $('dunList').querySelectorAll('[data-du]').forEach(el => el.onclick = () => { dSel[el.dataset.du]++; renderDungeon(); });
  $('dunList').querySelectorAll('[data-dk]').forEach(el => el.onclick = () => run(el.dataset.dk, false));
  $('dunList').querySelectorAll('[data-da]').forEach(el => el.onclick = () => run(el.dataset.da, true));
}

// ── 일일 패널 ────────────────────────────────────────────────
function renderDaily() {
  const qs = DQ.questState();
  const quests = qs.map(q => {
    const pct = Math.min(100, (q.cur / q.goal) * 100);
    const btn = q.claimed ? `<span style="color:#7fd07f;font-weight:800;font-size:12px">${t('daily.done')}</span>`
      : q.done ? `<button data-q="${q.id}">${t('daily.claim')}</button>`
      : `<span style="opacity:.5;font-size:11px">${q.cur}/${q.goal}</span>`;
    return `<div class="qrow ${q.claimed ? 'claimed' : q.done ? 'done' : ''}">
      <div class="ic">${q.icon}</div>
      <div class="mid"><div class="t">${q.name}</div>
        <div class="qbar"><i style="width:${pct}%"></i></div>
        <div class="d">${t('daily.reward', { g: q.gem })}</div></div>
      <div>${btn}</div></div>`;
  }).join('');

  const pend = DQ.pendingAttend();
  const dayIdx = DQ.attendDayIndex();
  const cal = DQ.ATTEND_CYCLE.map((g, i) => {
    const n = i + 1;
    const cls = pend ? (n < dayIdx ? 'past' : n === dayIdx ? 'now' : '') : (n <= dayIdx ? 'past' : '');
    return `<div class="${cls}">${t('daily.day', { n })}<b>${g}</b></div>`;
  }).join('');

  // ── 기간 이벤트 (열려 있을 때만) ──
  const ev = EV.activeEvent();
  let evHtml = '';
  if (ev) {
    const p = EV.points(), track = EV.trackState();
    const last = track[track.length - 1];
    const prog = Math.min(1, p / last.at);
    const days = Math.ceil(EV.msLeft() / 86400000);
    evHtml = `<div class="evBox" style="--ec:${ev.color}">
      <div class="evTop"><b>${ev.icon} ${ev.name}</b><span>${t('ev.daysLeft', { n: days })}</span></div>
      <div class="evBar"><i style="width:${(prog * 100).toFixed(1)}%"></i></div>
      <div class="evPt">${t('ev.points', { p: n0(p), max: n0(last.at) })}</div>
      <div class="evTrack">${track.map(t => `
        <div class="evStep ${t.claimed ? 'done' : t.reached ? 'open' : ''}" data-ev="${t.i}">
          <div class="s">${n0(t.at)}</div>
          <div class="g">💎${n0(t.gem)}</div>
          ${t.claimed ? '<div class="chk">✓</div>' : ''}
        </div>`).join('')}</div>
    </div>`;
  }

  $('dailyList').innerHTML = evHtml +
    `<div class="note">${t('daily.reset')}</div>`
    + quests
    + `<div style="font-size:13px;font-weight:800;margin:14px 0 2px">🎁 ${t('att.title')}</div>
       <div class="note" style="margin-bottom:0">${t('att.streak', { n: S.attend.streak || 0 })}${pend ? t('att.can') : t('att.got')}</div>
       <div class="acal">${cal}</div>
       ${pend ? `<button id="attBtn" style="width:100%;border:none;border-radius:11px;background:#ffcf3a;color:#2a1e00;font-weight:800;padding:12px;font-size:14px;cursor:pointer">${t('att.btn', { n: pend.day, g: pend.gem })}</button>` : ''}`
    + `<div style="font-size:13px;font-weight:800;margin:18px 0 2px">🔊 ${t('set.sound')}</div>
       <div class="sndRow">
         <button id="sndMute">${sfx.muted() ? t('set.off') : t('set.on')}</button>
         <input id="sndVol" type="range" min="0" max="100" step="5" value="${Math.round(sfx.volume() * 100)}" ${sfx.muted() ? 'disabled' : ''}>
         <span id="sndPct">${Math.round(sfx.volume() * 100)}%</span>
       </div>
       <div style="font-size:13px;font-weight:800;margin:18px 0 2px">🌐 ${t('set.lang')}</div>
       <div class="sndRow">${LANGS.map(l => `<button data-lang="${l.code}" style="${l.code === LANG ? 'background:#2d4a9a;border-color:#6d8ef0;color:#fff' : ''}">${l.label}</button>`).join('')}</div>
       <div class="note" style="margin-top:4px">${t('set.saved')}</div>`;
  // 언어 — 저장하고 새로고침한다(i18n.setLang)
  $('dailyList').querySelectorAll('[data-lang]').forEach(el => el.onclick = () => {
    if (el.dataset.lang === LANG) return;
    save();
    setLang(el.dataset.lang);
  });

  $('dailyList').querySelectorAll('[data-ev]').forEach(el => el.onclick = () => {
    const g = EV.claimStep(+el.dataset.ev);
    if (g) { sfx.gachaResult(1); save(); renderDaily(); refresh(); toast(t('gem.got', { n: n0(g) })); }
  });
  $('dailyList').querySelectorAll('[data-q]').forEach(el => el.onclick = () => {
    const g = DQ.claimQuest(el.dataset.q);
    if (g) { save(); renderDaily(); refresh(); toast(t('gem.got', { n: g })); }
  });
  const ab = $('attBtn');
  if (ab) ab.onclick = () => {
    const p = DQ.claimAttend();
    if (p) { save(); renderDaily(); refresh(); toast(t('att.toast', { n: p.day, g: p.gem })); }
  };
  // 소리 설정 — 게임 세이브가 아니라 audio.js 의 별도 키에 저장된다(진행 데이터를 건드리지 않는다)
  $('sndMute').onclick = () => { sfx.toggleMute(); renderDaily(); };
  $('sndVol').oninput = e => {
    sfx.setVolume(e.target.value / 100);
    $('sndPct').textContent = e.target.value + '%';
  };
  // 슬라이더를 놓을 때 한 번 들려준다 — 숫자만 보고는 크기를 알 수 없다
  $('sndVol').onchange = () => sfx.upgrade();
}

// ── HUD ──────────────────────────────────────────────────────
export function refresh() {
  $('hStage').textContent = chapterLabel(R.stage) + (R.boss ? ' 👑' : '');
  $('hBest').textContent = S.life;      // 영구 최고 기록
  $('hGold').textContent = fmt(S.Lg);
  $('hGem').textContent = S.gem;
  // 전투력(DPS×HP×방어)은 합성 수치라 플레이어에게 의미가 없었다 — DPS 로 바꿨다
  $('hPow').textContent = fmt(LDPS(false));
  $('hSpd').textContent = '×' + (S.spd || 1);
  $('spdCell').classList.toggle('on', S.spd === 2);

  const tg = toughness();
  const slow = tg.need > B.player.giveUpSeconds;
  $('mode').textContent = R.mode === MODE.FARM ? t('mode.farm') : t('mode.run');
  $('mode').className = R.mode === MODE.FARM ? 'farm' : 'run';
  $('retryBtn').style.display = R.mode === MODE.FARM ? '' : 'none';
  // 깊은 스테이지에서는 need 가 천문학적 숫자가 되므로 그대로 찍지 않는다
  let needTxt = '';
  if (slow) {
    const mins = tg.need / 60;
    needTxt = mins > 600 ? t('hint.impossible') : t('hint.minutes', { m: Math.round(mins) });
  }
  // 파밍 중이라면 **왜 여기 있는지** 가 먼저다. 측정해 보니 첫 1시간의 45%가 파밍인데
  // 그동안 화면에는 "파밍 중" 세 글자뿐이었다 — 같은 곳을 도는 이유도 언제 끝나는지도
  // 안 보이니 반복이 그냥 정체로 읽힌다.
  //
  // 전투력 비율(canClear 의 생존여유)을 퍼센트로 보여줬다가 뺐다. 자동 재도전은
  // canClear 가 아직 false 여도 3판이면 한 번 찔러보므로(그쪽이 보수적이라서),
  // "준비 42%" 라고 써 놓고 재도전이 나가 버린다. 남은 판 수는 반드시 맞는 숫자다.
  if (R.mode === MODE.FARM) {
    const left = Math.max(0, AUTO_RETRY_CLEARS - (R.farmClears || 0));
    needTxt = canClear(S.st) || left === 0
      ? t('hint.ready', { st: chapterLabel(S.st) })
      : t('hint.left', { st: chapterLabel(S.st), n: left });
  }
  $('hint').textContent = needTxt;

  // 강화 목록은 메인 화면에 상시 노출된다 — 골드가 계속 늘어 구매 가능 여부가 바뀌므로 매 틱 갱신.
  // 나머지 패널은 사용자 조작으로만 바뀌므로 탭을 열 때와 조작 직후에만 그린다.
  if (tab === 'battle') renderUpgrade();

  // 스테이지 진행바
  const per = R.boss ? 1 : perWave(R.stage);
  const waves = R.boss ? 1 : B.stage.waves;
  const alive = R.enemies.filter(e => e.Lhp > -Infinity).length;
  const killed = R.waveIdx * per + (per - alive);
  const total = per * waves;
  const prog = Math.max(0, Math.min(1, killed / total));
  $('sProg').style.width = (prog * 100).toFixed(1) + '%';
  $('sName').textContent = zoneAt(R.stage).name;
  // 숫자로도 보여준다 — 30~60분 구간은 한 판이 약 250초라, 진행바가 한 칸 차는 데
  // 30초가 걸린다. 몇 마리 중 몇 번째인지 보이면 같은 4분도 "진행" 으로 읽힌다.
  $('sWave').textContent = R.boss ? t('wave.boss')
    : t('wave.line', { w: Math.min(R.waveIdx + 1, waves), ws: waves, k: killed, t: total });
  $('sNum').textContent = chapterLabel(R.stage);
  $('sIcon').textContent = R.boss ? '👑' : '🚩';

  // 다음 목표 — 로드맵은 눌러야 나오니 한 줄만 상시로 꺼내 둔다.
  // "왜 계속 내려가야 하는가" 에 대한 답이 화면에 항상 있어야 한다.
  const nm = nextMilestone();
  const goal = nm
    ? `${nm.ic} ${nm.what} <em>${t('goal.left', { n: nm.at - S.life })}</em>`
    : t('goal.done');
  if (goal !== lastGoal) { $('sGoal').innerHTML = goal; lastGoal = goal; }  // 초당 4번 파싱하지 않는다
  // 융합 가능한 묶음이 있으면 탭에 점을 띄운다
  const gd = $('gDot');
  if (gd) gd.style.display = G.BANNERS.some(b => G.hasFusable(b.key)) ? 'block' : 'none';
  const qd = $('qDot');
  if (qd) qd.style.display = (DQ.totalClaimable() + EV.claimable()) > 0 ? 'block' : 'none';
  const dd = $('dDot');
  if (dd) dd.style.display = DUN.unlocked() && DUN.DUNGEONS.some(d => DUN.keysLeft(d.key) > 0) ? 'block' : 'none';
  const gr = $('grDot');
  // 환생 추천 · 영혼 트리에 올릴 수 있는 노드가 있으면 성장 탭에 점을 띄운다
  if (gr) gr.style.display = (L2.picks() >= L2.pickMax() || L2.masteryFree() > 0 || L2.researchReady()
    || PR.recommended() || (PR.unlocked() && PR.TREE.some(PR.canBuy))) ? 'block' : 'none';
}

/**
 * 던전 결과 팝업.
 *
 * 던전은 즉시 판정이라 **전투 화면이 전혀 바뀌지 않는다.** 하루 2키뿐인 "오늘 할 일"인데
 * 결과가 카드 맨 아래 11px 한 줄로 지나가서 "아무 일도 없었다" 로 읽혔다.
 * 달성률 막대를 채워 보여 주는 게 핵심이다 — 완전 클리어 전까지는 최고 난이도가
 * 0 에서 안 움직여서 얼마나 갔는지 흔적이 남지 않았다.
 */
function showDunResult(k, res) {
  const def = DUN.DUNGEONS.find(d => d.key === k);
  const boss = k === 'boss', raid = k === 'raid';
  const frac = boss ? res.killed / res.total : res.frac;

  $('drTitle').textContent = `${def.icon} ${def.name}`;
  $('drSub').textContent = boss
    ? t('dr.sub', { d: dSel[k], s: res.seconds.toFixed(1) }) + ' · ' +
      (res.died ? t('dr.died') : res.full ? t('dun.fullClear') : t('dun.timeout'))
    : raid
      ? t('dr.sub', { d: dSel[k], s: res.seconds.toFixed(1) }) + ' · ' + (res.full ? t('dun.fullRaid') : t('dun.timeout'))
      : t('dr.sub', { d: dSel[k], s: res.seconds });

  const bar = $('drFill').parentElement;
  bar.classList.toggle('full', !!res.full);
  $('drFill').style.width = '0%';
  // 한 박자 뒤에 채워야 막대가 차오르는 게 보인다 (0% 로 깔고 바로 바꾸면 트랜지션이 안 돈다)
  setTimeout(() => { $('drFill').style.width = (Math.min(1, frac) * 100).toFixed(1) + '%'; }, 30);

  $('drScore').textContent = boss
    ? t('dr.bossScore', { k: res.killed, t: res.total })
    : raid ? t('dr.raidScore', { z: res.zones, t: res.total })
    : t('dr.cartScore', { p: (res.frac * 100).toFixed(0) });
  $('drGain').textContent = boss ? `💎 ${n0(res.gem)}` : raid ? `🏺 ${t('dun.shards')} +${shardTxt(res.gain)}` : `🪙 ${fmt(res.Lgold)}`;
  if (raid) {
    // 유물이 깨어났으면 그게 이번 판의 주인공이다. 아니면 다음 목표까지 얼마 남았는지.
    const nx = RELIC.next();
    $('drNext').textContent = res.opened?.length
      ? res.opened.map(r => t('relic.awokeFx', { icon: r.icon, name: r.name, fx: RELIC.describe(r.eff) })).join('  ·  ')
      : nx ? t('relic.nextTo', { icon: nx.icon, name: nx.name, sh: shardTxt(RELIC.shards()), cost: nx.cost }) : t('relic.allAwake');
  } else {
    $('drNext').textContent = res.full ? t('dr.unlock', { n: dSel[k] + 1 }) : '';
  }

  $('dunRes').classList.add('on');
}

// ── 탭 ───────────────────────────────────────────────────────
const PANEL_RENDER = {
  upg: renderUpgrade, gacha: renderGacha, dun: renderDungeon,
  daily: renderDaily, grow: renderGrow, road: renderRoad,
};
function setTab(name) {
  tab = name;
  for (const el of document.querySelectorAll('.nav')) el.classList.toggle('on', el.dataset.t === name);
  for (const el of document.querySelectorAll('.panel')) el.classList.remove('on');
  if (name !== 'battle') $('p_' + name)?.classList.add('on');
  PANEL_RENDER[name]?.();      // 탭을 열 때 한 번 그린다 (이후는 조작할 때만)
  refresh();
}

export function initUI() {
  for (const el of document.querySelectorAll('.nav')) el.onclick = () => setTab(el.dataset.t);
  for (const el of document.querySelectorAll('[data-close]')) el.onclick = () => setTab('battle');
  // 스테이지 바를 누르면 해금 로드맵 — 월드맵 자리에 해당한다
  const sb = $('stageBar');
  if (sb) sb.onclick = () => setTab(tab === 'road' ? 'battle' : 'road');
  // 배속 — 방치형에서 가장 자주 눌리는 버튼인데 없었다.
  // 공짜로 둔다. 시뮬상 상시 ×2 가 30일 +3.8% / 365일 +2.1% 라 체감용이지 힘이 아니다
  // (곡선이 로그라 처리량을 2배로 올려도 스테이지는 상수만큼만 오른다).
  const sc = $('spdCell');
  if (sc) sc.onclick = () => { S.spd = S.spd === 2 ? 1 : 2; save(); refresh(); };
  for (const m of [1, 10, 'max']) {
    const el = $('bm_' + m);
    if (el) el.onclick = () => { buyMode = m; renderUpgrade(); };
  }
  initGrow({ refresh, toast, onLeadChange: () => preloadFor(R.stage) });
  initGacha({ refresh, toast });
  // 개발자 모드가 값을 바꾸면 **지금 열려 있는 패널**도 다시 그려야 한다 —
  // refresh() 는 상단 HUD 만 손대서, 성장 패널의 조각·광석이 0 인 채로 남았다.
  initDev({ refresh, toast, redraw: () => PANEL_RENDER[tab]?.(), onLeadChange: () => preloadFor(R.stage) });
  $('retryBtn').onclick = () => { retry(); refresh(); };
  $('drClose').onclick = () => $('dunRes').classList.remove('on');
  const wb = $('wipeBtn');
  if (wb) wb.onclick = () => {
    if (confirm(t('wipe.confirm'))) {
      wipe();
      location.reload();
    }
  };
  setTab('battle');
}
