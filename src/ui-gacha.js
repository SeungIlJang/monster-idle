// 가챠 패널 — 배너 레벨 · 드롭 테이블 · 보유/장착 효과 · 융합 (DESIGN.md §7)
// ui.js 와 순환 참조를 만들지 않으려고, 필요한 콜백은 init 으로 받는다.
import { B } from './balance.js';
import { S, save } from './state.js';
import * as G from './gacha.js';
import { playRewarded } from './ads.js';
import * as sfx from './audio.js';
import { t } from './i18n.js';

const $ = id => document.getElementById(id);
let ctx = { refresh: () => {}, toast: () => {} };

// 동료는 그림이 있다(assets/comp/<id>.png) — 이모지 대신 실제 그림을 쓴다. 장비·스킬은 그림이 없어 이모지 그대로.
// 주소는 **이 모듈 기준**으로 만든다. OTA 앱은 HTML 을 document.write 로 주입해서 'assets/…' 같은 상대경로가
// 앱 속 옛 www/ 를 가리킨다 — 모듈 주소는 원격이라 거기서 받는다(companions.js 와 같은 방식).
// 못 받으면 이모지로 되돌린다.
const compImg = id => new URL(`../assets/comp/${id}.png`, import.meta.url).href;
// 등급 빛 — 그림 뒤에 등급 색을 깐다. 높을수록 진하고, 전설 이상은 숨 쉬듯 빛난다(CSS .rgl).
// 하늘의 등급 연출(render.drawRarity)과 같은 색 · 같은 순서라 뽑기 화면과 전투 화면이 같은 말을 한다.
const rarGlow = (r, under = '') => {
  const c = G.RARITIES[r]?.color || '#9aa7c7';
  const a = Math.round((0.16 + r * 0.11) * 255).toString(16).padStart(2, '0');
  return `background:radial-gradient(circle at 50% 45%, ${c}${a} 0%, transparent 68%)${under ? ',' + under : ''};--rc:${c}`;
};
const iconOf = (banner, it) => (banner === 'comp' && it?.id
  ? `<img class="gimg" src="${compImg(it.id)}" alt="" onerror="this.replaceWith(document.createTextNode('${it.icon || '❔'}'))">`
  : (it?.icon ?? '❔'));
export function initGacha(c) { ctx = { ...ctx, ...c }; }

let gBanner = 'equip';
let gLast = [];                       // 마지막 뽑기 결과 (칩으로 표시)

export function renderGacha() {
  const bDef = G.BANNERS.find(b => b.key === gBanner);

  // 배너 선택
  $('gBanners').innerHTML = G.BANNERS.map(b =>
    `<div class="seg ${b.key === gBanner ? 'on' : ''}" data-gb="${b.key}">${b.icon} ${b.name}${G.hasFusable(b.key) ? ' •' : ''}</div>`
  ).join('');
  $('gBanners').querySelectorAll('[data-gb]').forEach(el => {
    el.onclick = () => { gBanner = el.dataset.gb; gLast = []; renderGacha(); };
  });

  // 레벨 · 드롭 테이블 · 효과
  const p = G.lvProgress(gBanner);
  const table = G.dropTable(gBanner);
  const own = S.own[gBanner] || 0;
  const eqv = S.eqv[gBanner] || 0;
  $('gHead').innerHTML =
    `<div class="glv"><span>${t('gacha.lv')}</span><span class="n">${p.lv}</span>
       <span class="sub">${p.next === null ? t('gacha.max') : t('gacha.pulls', { n: p.pulls, m: p.next })}</span></div>
     <div class="gprog"><i style="width:${(p.frac * 100).toFixed(1)}%"></i></div>
     <div class="gtab">${G.RARITIES.map((r, i) =>
       `<div style="color:${table[i] ? r.color : '#44506e'}">${r.name}<b>${table[i]}%</b></div>`).join('')}</div>
     <div class="gown">${bDef.name} <b>+${(own + eqv).toFixed(1)}%</b> → ${bDef.affects}
       <span style="opacity:.6">${t('gacha.split', { o: own.toFixed(1), e: eqv.toFixed(1) })}</span><br>
       <span style="opacity:.7">${t('gacha.expect', { p: G.expectedOwnedPerPull(gBanner).toFixed(2), n: G.totalItems(gBanner) })}</span></div>`;

  // 버튼
  const cost1 = B.gacha.costPerPull, cost10 = cost1 * 10;
  const free = G.freeLeft(gBanner);
  $('gActions').innerHTML =
    `<button id="gP1" ${S.gem < cost1 ? 'disabled' : ''}>${t('gacha.p1')}<span class="c">💎 ${cost1}</span></button>
     <button id="gP10" ${S.gem < cost10 ? 'disabled' : ''}>${t('gacha.p10')}<span class="c">💎 ${cost10}</span></button>
     <button id="gPF" class="free" ${free < 1 ? 'disabled' : ''}>${t('gacha.free')}<span class="c">${free} / ${B.gacha.freeAdPullsPerBanner}</span></button>
     <button id="gFuse" class="fuse" ${G.hasFusable(gBanner) ? '' : 'disabled'}>${t('gacha.fuse')}<span class="c">${t('gacha.fuseHint')}</span></button>`;

  const show = res => {
    if (!res) { ctx.toast(t('gacha.noGem')); return; }     // 실패에는 성공음을 내지 않는다
    // 10연차도 시작음 **한 번** + 최고 등급 결과음 **한 번**이다. 10개를 겹치면 소음이 된다.
    sfx.gachaOpen();
    const best = res.reduce((a, r) => Math.max(a, r.rarity), 0);
    setTimeout(() => sfx.gachaResult(best), 420);          // 시작음과 겹치지 않게 한 박자 뒤
    gLast = res; save(); renderGacha(); ctx.refresh();
  };
  $('gP1').onclick = () => show(G.pull(gBanner, 1));
  $('gP10').onclick = () => show(G.pull(gBanner, 10));
  $('gPF').onclick = async () => {
    if (G.freeLeft(gBanner) < 1) { ctx.toast(t('gacha.noFree')); return; }
    if (!await playRewarded()) { ctx.toast(t('ad.notFinished')); return; }
    const r = G.freePull(gBanner);
    if (r) show(r);
  };
  $('gFuse').onclick = () => {
    const r = G.fuseAll(gBanner);
    save(); renderGacha(); ctx.refresh();
    ctx.toast(r.promoted || r.enhanced ? t('gacha.fused', { p: r.promoted, e: r.enhanced }) : t('gacha.noFuse'));
  };

  // 마지막 뽑기 결과
  $('gResult').innerHTML = gLast.map(r => {
    const c = G.RARITIES[r.rarity];
    return `<span class="chip" style="color:${c.color};border-color:${c.color}">${iconOf(gBanner, r)} ${c.name}</span>`;
  }).join('');

  // 장착 슬롯 (자동 장착 — 가장 센 것부터 채운다)
  const eq = G.equippedList(gBanner);
  const slots = G.activeSlots(gBanner);
  const nextAt = G.nextSlotAt(gBanner);
  const cells = [];
  for (let i = 0; i < bDef.slots; i++) {
    if (i >= slots) cells.push(`<div class="slot lock">🔒<small>st.${bDef.slotUnlock[i]}</small></div>`);
    else if (eq[i]) {
      const c = G.RARITIES[eq[i].rarity];
      cells.push(`<div class="slot ${eq[i].rarity >= 3 ? 'rgl' : ''}" style="border-color:${c.color};${rarGlow(eq[i].rarity, '#161c3c')}">${iconOf(gBanner, eq[i])}<small style="color:${c.color}">+${eq[i].val.toFixed(0)}%</small></div>`);
    } else cells.push(`<div class="slot empty">·<small>${t('gacha.empty')}</small></div>`);
  }
  $('gSlots').innerHTML =
    `<div class="slabel">${t('gacha.slots', { n: slots, m: bDef.slots })}`
    + (nextAt ? ` <span style="opacity:.55">${t('gacha.nextSlot', { n: nextAt })}</span>` : '')
    + `</div><div class="slots">${cells.join('')}</div>`;

  // 인벤토리
  const inv = G.inventoryOf(gBanner);
  $('gInv').innerHTML = inv.length
    ? inv.map(it => {
        const c = G.RARITIES[it.rarity];
        const top = it.rarity >= G.RARITIES.length - 1;
        const need = top ? B.gacha.fuse.dupToEnhance : B.gacha.fuse.sameRarityToPromote;
        const ready = it.count >= need;
        return `<div class="ginv ${ready ? 'ready' : ''}">
          <div class="ic ${it.rarity >= 3 ? 'rgl' : ''}" style="${rarGlow(it.rarity)}">${iconOf(gBanner, it)}</div>
          <div class="mid">
            <div class="t"><span style="color:${c.color}">${c.name}</span> ${it.name}${it.enh ? ' <b style="color:#7fd07f">+' + it.enh + '</b>' : ''}</div>
            <div class="d">${t('gacha.unit', { u: it.unit.toFixed(2), s: it.total.toFixed(1) })}${ready ? t('gacha.ready', { n: need, act: top ? t('gacha.enh') : t('gacha.promote') }) : ''}</div>
          </div>
          <div class="cnt">×${it.count}</div></div>`;
      }).join('')
    : `<div class="note">${t('gacha.none')}</div>`;
}
