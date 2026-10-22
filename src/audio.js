// 효과음. 로딩·재생·동시 발음·음량·음소거·정지를 여기서만 관리한다.
//
// 원칙 (docs/sfx-handoff.md):
//  · 매 프레임 Audio 객체를 만들지 않는다 — 디코드한 버퍼를 재사용하고 소스 노드만 새로 만든다
//    (AudioBufferSourceNode 는 일회용이지만 생성이 싸고, 무거운 건 디코드다).
//  · **제한은 전부 실제 시간(performance.now()) 기준이다.** 게임 dt 나 ×2 배속 시간을 쓰면
//    배속에서 소리가 두 배로 쏟아진다.
//  · 오디오가 실패해도 전투와 UI 는 절대 멈추지 않는다 — 모든 진입점이 try/catch 다.
//  · 설정은 **세이브와 분리된 키**에 넣는다. 진행 데이터 스키마를 건드리지 않는다.
const KEY = 'monsteridle.audio';

const FILES = [
  'attack_slime_1', 'attack_slime_2', 'attack_slime_3',
  'hit_soft_1', 'hit_soft_2',
  'kill_pop', 'upgrade', 'gacha_open', 'gacha_common', 'gacha_rare',
];

// 전체 동시 발음 6, 공격은 그중 2까지. 공격 최소 간격 120ms, 처치 묶음 150ms, 강화 250ms.
const MAX_VOICES = 6, MAX_ATTACK = 2;
// 피격에도 간격이 필요하다. 사양은 공격만 명시했지만, 피격을 열어 두니
// 게임 1000틱(=50게임초)을 실시간 10ms 에 돌렸을 때 5발이 겹쳐 터졌다 —
// 배속과 탭 복귀 점프에서 그대로 드러나는 구멍이다.
const GAP = { attack: 120, hit: 120, upgrade: 250 };
const KILL_COALESCE = 150;
// 보상음이 울리는 동안 평타를 잠시 낮춘다. 원본이 이미 공격 -10dBFS / 보상 더 크게 설계돼
// 있으므로 재정규화하지 않고 재생 게인만 건드린다.
const DUCK_MS = 450, DUCK_GAIN = 0.4;

let ctx = null, master = null;
const buffers = new Map();
let voices = 0, attackVoices = 0;
let lastAt = {}, lastVariant = {};
let killPending = 0, killTimer = null;
let duckUntil = 0;
let ready = false, loading = null;

// ── 설정 (세이브와 별도) ─────────────────────────────────────
function loadCfg() {
  try {
    const d = JSON.parse(localStorage.getItem(KEY) || '{}');
    return { vol: typeof d.vol === 'number' ? Math.min(1, Math.max(0, d.vol)) : 0.7, mute: !!d.mute };
  } catch { return { vol: 0.7, mute: false }; }
}
let cfg = loadCfg();
function saveCfg() { try { localStorage.setItem(KEY, JSON.stringify(cfg)); } catch {} }

export const volume = () => cfg.vol;
export const muted = () => cfg.mute;
export function setVolume(v) {
  cfg.vol = Math.min(1, Math.max(0, v)); saveCfg(); applyMaster();
}
export function toggleMute() { cfg.mute = !cfg.mute; saveCfg(); applyMaster(); return cfg.mute; }

function applyMaster() {
  if (master) master.gain.value = cfg.mute ? 0 : cfg.vol;
}

// ── 초기화 ───────────────────────────────────────────────────
/**
 * **실제 사용자 입력 뒤에** 불러야 한다 (타이틀의 시작 버튼).
 * 입력 전에 만든 AudioContext 는 모바일에서 suspended 로 태어나 영영 안 울린다.
 */
export function init() {
  if (loading) return loading;
  loading = (async () => {
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      applyMaster();
      master.connect(ctx.destination);
      await resume();
      const base = new URL('../assets/audio/sfx/', import.meta.url);
      // 한 번에 받아 디코드한다. 전부 합쳐 428KiB 라 나눠 받을 이유가 없다.
      await Promise.all(FILES.map(async n => {
        try {
          const r = await fetch(new URL(n + '.wav', base));
          if (!r.ok) return;
          buffers.set(n, await ctx.decodeAudioData(await r.arrayBuffer()));
        } catch {}            // 한 개가 실패해도 나머지는 쓴다
      }));
      ready = buffers.size > 0;
      return ready;
    } catch { return false; }
  })();
  return loading;
}

/** 기기에서 정지된 컨텍스트를 되살린다 */
export async function resume() {
  try { if (ctx && ctx.state === 'suspended') await ctx.resume(); } catch {}
}
/** 화면이 숨겨지거나 광고가 뜰 때. 대기 중이던 소리는 버린다 — 복귀하며 몰아 울리면 안 된다. */
export function suspend() {
  try {
    if (killTimer) { clearTimeout(killTimer); killTimer = null; killPending = 0; }
    if (ctx && ctx.state === 'running') ctx.suspend();
  } catch {}
}

// ── 재생 ─────────────────────────────────────────────────────
function voice(name, gain) {
  const buf = buffers.get(name);
  if (!buf || !ctx || voices >= MAX_VOICES) return false;
  try {
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const g = ctx.createGain();
    g.gain.value = gain;
    src.connect(g); g.connect(master);
    const isAtk = name.startsWith('attack_');
    voices++; if (isAtk) attackVoices++;
    src.onended = () => { voices--; if (isAtk) attackVoices--; };
    src.start();
    return true;
  } catch { return false; }
}

/** 같은 변주를 연달아 쓰지 않는다 */
function variant(group, list) {
  const pool = list.filter(n => n !== lastVariant[group]);
  const pick = (pool.length ? pool : list)[Math.floor(Math.random() * (pool.length || list.length))];
  lastVariant[group] = pick;
  return pick;
}

const ATTACK = FILES.filter(n => n.startsWith('attack_'));
const HIT = FILES.filter(n => n.startsWith('hit_'));

export function attack() {
  if (!ready) return;
  const now = performance.now();
  if (now - (lastAt.attack || 0) < GAP.attack) return;
  if (attackVoices >= MAX_ATTACK) return;
  lastAt.attack = now;
  // 보상음이 울리는 동안에는 평타를 낮춘다
  voice(variant('attack', ATTACK), now < duckUntil ? DUCK_GAIN : 1);
}

export function playerHit() {
  if (!ready) return;
  const now = performance.now();
  if (now - (lastAt.hit || 0) < GAP.hit) return;
  lastAt.hit = now;
  voice(variant('hit', HIT), now < duckUntil ? DUCK_GAIN : 1);
}

/**
 * 처치. 150ms 안의 여러 처치는 **한 번으로 묶는다** — 적 4마리 · 동료 5기 · 금화 5~9개마다
 * 각각 울리면 귀가 남아나지 않는다.
 */
export function kill() {
  if (!ready) return;
  killPending++;
  if (killTimer) return;
  killTimer = setTimeout(() => {
    killTimer = null; killPending = 0;
    voice('kill_pop', 1);
  }, KILL_COALESCE);
}

function reward(name) {
  if (!ready) return;
  duckUntil = performance.now() + DUCK_MS;
  voice(name, 1);
}

export function upgrade() {
  if (!ready) return;
  const now = performance.now();
  if (now - (lastAt.upgrade || 0) < GAP.upgrade) return;   // 길게 누르기 연타 제한
  lastAt.upgrade = now;
  reward('upgrade');
}

export const gachaOpen = () => reward('gacha_open');
/** rarity 는 G.RARITIES 의 인덱스. 0=일반, 1 이상(희귀·영웅·전설·신화)은 희귀음. */
export const gachaResult = rarity => reward(rarity >= 1 ? 'gacha_rare' : 'gacha_common');

export const isReady = () => ready;
