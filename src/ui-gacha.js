// 가챠 패널 — 배너 레벨 · 드롭 테이블 · 보유/장착 효과 · 융합 (DESIGN.md §7)
// ui.js 와 순환 참조를 만들지 않으려고, 필요한 콜백은 init 으로 받는다.
import { B } from './balance.js';
import { S, save } from './state.js';
import * as G from './gacha.js';
import { playRewarded } from './ads.js';

const $ = id => document.getElementById(id);
let ctx = { refresh: () => {}, toast: () => {} };
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
    `<div class="glv"><span>배너 레벨</span><span class="n">${p.lv}</span>
       <span class="sub">${p.next === null ? '최대' : p.pulls + ' / ' + p.next + ' 뽑기'}</span></div>
     <div class="gprog"><i style="width:${(p.frac * 100).toFixed(1)}%"></i></div>
     <div class="gtab">${G.RARITIES.map((r, i) =>
       `<div style="color:${table[i] ? r.color : '#44506e'}">${r.name}<b>${table[i]}%</b></div>`).join('')}</div>
     <div class="gown">${bDef.name} <b>+${(own + eqv).toFixed(1)}%</b> → ${bDef.affects}
       <span style="opacity:.6">(보유 ${own.toFixed(1)} + 장착 ${eqv.toFixed(1)})</span><br>
       <span style="opacity:.7">뽑기 1회 기대값 +${G.expectedOwnedPerPull(gBanner).toFixed(2)}% · 보유 ${G.totalItems(gBanner)}개</span></div>`;

  // 버튼
  const cost1 = B.gacha.costPerPull, cost10 = cost1 * 10;
  const free = G.freeLeft(gBanner);
  $('gActions').innerHTML =
    `<button id="gP1" ${S.gem < cost1 ? 'disabled' : ''}>1회<span class="c">💎 ${cost1}</span></button>
     <button id="gP10" ${S.gem < cost10 ? 'disabled' : ''}>10회<span class="c">💎 ${cost10}</span></button>
     <button id="gPF" class="free" ${free < 1 ? 'disabled' : ''}>📺 무료<span class="c">${free} / ${B.gacha.freeAdPullsPerBanner}</span></button>
     <button id="gFuse" class="fuse" ${G.hasFusable(gBanner) ? '' : 'disabled'}>일괄 융합<span class="c">3개→상위</span></button>`;

  const show = res => {
    if (res) { gLast = res; save(); renderGacha(); ctx.refresh(); }
    else ctx.toast('젬이 부족합니다');
  };
  $('gP1').onclick = () => show(G.pull(gBanner, 1));
  $('gP10').onclick = () => show(G.pull(gBanner, 10));
  $('gPF').onclick = async () => {
    if (G.freeLeft(gBanner) < 1) { ctx.toast('오늘 무료 뽑기를 다 썼어요'); return; }
    if (!await playRewarded()) { ctx.toast('광고를 끝까지 봐야 보상을 받습니다'); return; }
    const r = G.freePull(gBanner);
    if (r) show(r);
  };
  $('gFuse').onclick = () => {
    const r = G.fuseAll(gBanner);
    save(); renderGacha(); ctx.refresh();
    ctx.toast(r.promoted || r.enhanced ? `융합 완료 · 승급 ${r.promoted} · 강화 ${r.enhanced}` : '융합할 묶음이 없어요');
  };

  // 마지막 뽑기 결과
  $('gResult').innerHTML = gLast.map(r => {
    const c = G.RARITIES[r.rarity];
    return `<span class="chip" style="color:${c.color};border-color:${c.color}">${r.icon} ${c.name}</span>`;
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
      cells.push(`<div class="slot" style="border-color:${c.color}">${eq[i].icon}<small style="color:${c.color}">+${eq[i].val.toFixed(0)}%</small></div>`);
    } else cells.push('<div class="slot empty">·<small>비어있음</small></div>');
  }
  $('gSlots').innerHTML =
    `<div class="slabel">장착 ${slots}/${bDef.slots}칸 · 자동으로 가장 센 것이 들어갑니다`
    + (nextAt ? ` <span style="opacity:.55">· 다음 칸 스테이지 ${nextAt}</span>` : '')
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
          <div class="ic">${it.icon}</div>
          <div class="mid">
            <div class="t"><span style="color:${c.color}">${c.name}</span> ${it.name}${it.enh ? ' <b style="color:#7fd07f">+' + it.enh + '</b>' : ''}</div>
            <div class="d">보유 효과 개당 +${it.unit.toFixed(2)}% · 합계 +${it.total.toFixed(1)}%${ready ? ` · ${need}개 모임 → ${top ? '강화' : '승급'} 가능` : ''}</div>
          </div>
          <div class="cnt">×${it.count}</div></div>`;
      }).join('')
    : '<div class="note">아직 뽑은 것이 없습니다. 무료 뽑기부터 해보세요.</div>';
}
