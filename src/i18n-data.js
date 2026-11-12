// balance.json 의 표시용 이름이 언어팩의 어느 키에 해당하는지 — 런타임(i18n.js)과 도구(tools/i18n-sync.mjs)가 같이 쓴다.
//
// balance.json 은 시뮬과 공유하는 단일 출처라 한국어 이름을 그대로 둔다. 화면에 낼 때만
// 언어팩 값으로 덮어쓴다(i18n.js). 키는 데이터 id 로 만든다 — 순서가 바뀌어도 어긋나지 않게.
// 의존성 없음(순환 import 를 만들지 않으려고).

/** [키, 객체, 필드] 를 낸다. 키는 'd.' 를 뺀 형태 */
export function dataFields(B) {
  const out = [];
  const put = (k, o, f) => { if (o && typeof o[f] === 'string') out.push([k, o, f]); };
  for (const [k, v] of Object.entries(B.stats || {})) put('stat.' + k, v, 'name');
  for (const b of B.gacha?.banners || []) { put('banner.' + b.key, b, 'name'); put('banner.' + b.key + '.affects', b, 'affects'); }
  (B.gacha?.rarities || []).forEach((r, i) => put('rarity.' + i, r, 'name'));
  for (const d of B.dungeon?.list || []) { put('dun.' + d.key, d, 'name'); put('dun.' + d.key + '.reward', d, 'reward'); put('dun.' + d.key + '.desc', d, 'desc'); }
  for (const q of B.daily?.quests || []) put('quest.' + q.id, q, 'name');
  for (const n of B.layer2?.mastery?.nodes || []) { put('mast.' + n.key, n, 'name'); put('mast.' + n.key + '.affects', n, 'affects'); }
  for (const n of B.prestige?.tree || []) { put('tree.' + n.key, n, 'name'); put('tree.' + n.key + '.desc', n, 'desc'); }
  for (const e of B.events?.list || []) put('event.' + e.id, e, 'name');
  for (const z of B.zones?.list || []) put('zone.' + z.key, z, 'name');
  for (const m of B.roster?.monsters || []) {
    put('mon.' + m.key, m, 'name');
    put('mon.' + m.key + '.ab', m.ability, 'name');
    put('mon.' + m.key + '.abd', m.ability, 'desc');
  }
  for (const h of B.roster?.heroes || []) put('hero.' + h.key, h, 'name');
  for (const r of B.relics?.list || []) put('relic.' + r.key, r, 'name');
  return out;
}
