// Page du jeu du jour (/jeu/, /en/guess-the-circuit/) : circuit ou pilote du jour, essais, indices, partage, série et
// classement. Tracés, pilotes et textes dans la page (analytics/jeu/page.mjs) ; partie et série dans ce navigateur
// (localStorage) ; seulement pour qui rejoint le classement : pseudo et résultat envoyés au serveur (/jeu/api/).
import { TRIES, FIRST_DAY, MAX_JOKERS, parisDay, dailyIndex, hints, driverHints, mark, stats, shareText, revealed, revealStart, cluesShown, plan, points } from './game.js';

const { t, circuits, drivers } = JSON.parse(document.getElementById('data').textContent);
const $ = (id) => document.getElementById(id);
const today = parisDay();
const { mode, level } = plan(today);
const isDriver = mode === 'driver';
const pool = isDriver ? drivers : circuits.filter((c) => c.turns);   // circuits : indices complets
const answer = pool[dailyIndex(today, pool.length)];
const items = isDriver ? drivers : circuits;
const byId = new Map(items.map((c) => [c.id, c]));
const natOf = new Map(drivers.map((d) => [d.id, d.iso]));
const same = isDriver ? (a, b) => natOf.get(a) === natOf.get(b) : undefined;
const KEY = 'pl-jeu-circuit', PLAYER = 'pl-jeu-joueur';

let games = {};
try { games = JSON.parse(localStorage.getItem(KEY)) || {}; } catch { /* stockage refusé : partie d'un seul affichage */ }
const game = games[today] || (games[today] = { g: [] });
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(games)); } catch { /* idem */ } };

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const fmt = (s, ...v) => v.reduce((x, y) => x.replace('{}', y), s);
const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const num = today - FIRST_DAY + 1;

// Programme du jour : type et difficulté en tête de page, titre et saisie du bon type
$('num').textContent = `· ${fmt(t.num, num)} · ${isDriver ? t.modeDriver : t.modeCircuit}`;
$('level').textContent = t[`lv_${level}`];
$('level').dataset.level = level;
if (isDriver) {
  document.body.classList.add('driver');
  $('h1').textContent = t.h1Driver;
  $('lead').textContent = t.leadDriver;
  $('guess').setAttribute('list', 'drivers');
  $('guess').placeholder = t.placeholderDriver;
  $('trackShort').textContent = t.driverShort;
}

// Essai saisi -> circuit (nom ou ville) ou pilote (nom complet ou nom de famille) : exact, sinon le seul qui contient le texte
const keys = (c) => (isDriver ? [c.name, c.name.split(' ').slice(1).join(' ')] : [c.name, c.city]).map(norm);
function find(text) {
  const q = norm(text);
  if (!q) return { err: isDriver ? t.unknownDriver : t.unknown };
  const exact = items.filter((c) => keys(c).includes(q));
  if (exact.length === 1) return { c: exact[0] };
  const part = q.length >= 3 ? items.filter((c) => ` ${keys(c).join(' ')} `.includes(q)) : [];
  if (part.length === 1) return { c: part[0] };
  return { err: part.length || exact.length ? (isDriver ? t.manyDriver : t.many) : (isDriver ? t.unknownDriver : t.unknown) };
}

const marks = () => game.g.map((id) => mark(id, answer.id, same));
const clues = () => (isDriver ? driverHints(answer, t) : hints(answer, t));
let shown = { tries: game.g.length, hints: null };

function render() {
  const m = marks(), done = Boolean(game.r);
  const misses = m.filter((x) => x !== 'hit').length, jokers = game.j || 0, helps = misses + jokers;
  $('tries').innerHTML = Array.from({ length: TRIES }, (_, i) => {
    const c = byId.get(game.g[i]);
    return `<li class="${c ? 'on' : ''}${i >= shown.tries && c ? ' new' : ''}"><span class="n">${i + 1}</span><span class="nm">${c ? esc(c.name) : '—'}</span>${c ? `<span class="tag ${m[i]}">${isDriver && m[i] === 'near' ? t.nearDriver : t[m[i]]}</span>` : ''}</li>`;
  }).join('');
  const list = clues();
  const open = isDriver ? cluesShown(helps, done, level) : (done ? 5 : Math.min(helps, 5));
  const flagAt = isDriver ? 3 : 0;   // pays du pilote, pays du circuit
  const startOpen = isDriver ? cluesShown(0, false, level) : 0;
  $('hints').innerHTML = list.map(([label, value], i) => {
    const flag = i === flagAt ? `<span class="flag" aria-hidden="true">${answer.flag.map((col) => `<i style="background:${col}"></i>`).join('')}</span>` : '';
    const after = i - startOpen + 1;   // erreurs qu'il faut pour le voir
    return i < open ? `<div class="${shown.hints !== null && i >= shown.hints ? 'new' : ''}"><dt>${label}</dt><dd>${flag}${esc(value)}</dd></div>`
      : `<div class="lock"><dt>${label}</dt><dd>${after === 1 ? t.locked1 : fmt(t.locked, after)}</dd></div>`;
  }).join('');
  shown = { tries: game.g.length, hints: open };
  // Circuit : seulement une partie du tracé au départ, dévoilée au fil des erreurs (trait du tour, longueur 1 : pathLength)
  if (!isDriver) {
    const f = revealed(helps, done, level);
    for (const el of [$('trk'), $('trkU')]) {
      el.style.strokeDasharray = f < 1 ? `${f} ${1 - f}` : 'none';
      el.style.strokeDashoffset = f < 1 ? String(-revealStart(today)) : '0';
    }
  }
  $('form').hidden = done;
  // Joker : l'indice suivant sans perdre d'essai, 2 points de moins ; points encore possibles
  const left = isDriver ? 6 - open : 5 - open;
  $('joker').disabled = done || left <= 0 || jokers >= MAX_JOKERS;
  $('stake').textContent = fmt(t.stake, points(level, misses, jokers, true));
  if (!done) return;
  const won = game.r === 'w';
  $('track').classList.toggle('won', won);
  $('answer').hidden = false;
  $('answer').innerHTML = isDriver ? `<b>${esc(answer.name)}</b><span>${esc(answer.country)} · ${esc(answer.team)}</span>`
    : `<b>${esc(answer.name)}</b><span>${esc(answer.city)} · ${esc(answer.country)}</span>`;
  $('end').hidden = false;
  $('endH').textContent = won ? (m.length === 1 ? t.winOne : fmt(t.win, m.length)) : `${t.lose} ${answer.name}`;
  const s = stats(games, today);
  const pts = points(level, Math.max(0, m.length - (won ? 1 : 0)), jokers, won);
  $('shareText').textContent = shareText({ num, marks: m, won, streak: s.streak, t, title: isDriver ? t.shareTitleDriver : t.shareTitle,
    level: `${t[`lv_${level}`]}${jokers ? ` · ${jokers} joker${jokers > 1 ? 's' : ''}` : ''} · ${pts} ${t.pts}` });
  $('stats').innerHTML = [[s.played, 'played'], [s.played ? `${Math.round((s.won / s.played) * 100)} %` : '—', 'wonPct'], [s.streak, 'streak'], [s.best, 'best']]
    .map(([v, k]) => `<div><b>${v}</b><span>${t[k]}</span></div>`).join('');
  boardShow();
}

$('form').addEventListener('submit', (e) => {
  e.preventDefault();
  const input = $('guess');
  const { c, err } = find(input.value);
  if (err || game.g.includes(c.id)) { $('msg').textContent = err || t.again; input.select(); return; }
  game.g.push(c.id);
  const m = mark(c.id, answer.id, same);
  if (m === 'hit') game.r = 'w';
  else if (game.g.length >= TRIES) game.r = 'l';
  save();
  input.value = '';
  const before = shown.hints;
  render();
  if (game.r) { $('msg').textContent = ''; $('endH').focus(); return; }
  const h = clues()[before];
  $('msg').textContent = `${fmt(t.missed, c.name)}${h && shown.hints > before ? ` ${fmt(t.newHint, h[0], h[1])}` : ''}`;
  input.focus();
});

// Partage : feuille de partage du téléphone, sinon presse-papiers
$('share').addEventListener('click', async () => {
  const text = $('shareText').textContent;
  try {
    if (navigator.share && matchMedia('(pointer: coarse)').matches) { await navigator.share({ text }); return; }
    await navigator.clipboard.writeText(text);
    $('shareMsg').textContent = t.copied;
  } catch (e) {
    if (e?.name !== 'AbortError') $('shareMsg').textContent = t.copyFail;
  }
});

$('joker').addEventListener('click', () => {
  if (game.r || $('joker').disabled) return;
  const before = shown.hints;
  game.j = (game.j || 0) + 1;
  save();
  render();
  const h = clues()[before];
  $('msg').textContent = h ? fmt(t.jokerHint, h[0], h[1]) : '';
  $('guess').focus();
});

// ---------- Classement : facultatif ; une fois rejoint (pseudo), chaque partie finie y est envoyée ----------
let player = null;
try { player = JSON.parse(localStorage.getItem(PLAYER)); } catch { /* stockage refusé */ }
const newUid = () => [...crypto.getRandomValues(new Uint8Array(24))].map((b) => 'abcdefghijklmnopqrstuvwxyz0123456789'[b % 36]).join('');
const rankTxt = (r) => (r ? fmt(t.rank, r.rank, r.pts) : '');
const TABS = ['today', 'week', 'month', 'all'];
let tab = 'today', last = null;
function boardHtml(b) {
  last = b;
  const cur = b.boards?.[tab];
  if (!cur) return '';
  const tabs = `<div class="tabs" role="tablist">${TABS.map((k) => `<button type="button" role="tab" data-tab="${k}" aria-selected="${k === tab}">${esc(t[`tab_${k}`])}</button>`).join('')}</div>`;
  const rows = cur.top.length ? `<ol class="rank">${cur.top.map((r, i) => `<li><span class="n">${i + 1}</span><span class="nm">${esc(r.name)}${r.streak > 1 ? ` <span class="fire" title="${esc(fmt(t.streakTip, r.streak))}">🔥${r.streak}</span>` : ''}</span><span class="pts">${r.pts}<small> ${t.pts}</small>${tab !== 'today' ? `<em>${fmt(t.days, r.days)}</em>` : ''}</span></li>`).join('')}</ol>`
    : `<p class="msg">${esc(t.boardEmpty)}</p>`;
  const mine = b.mine ? `<p class="me">${esc(fmt(t.mine, b.mine.pts))}${b.mine.bonus ? ` <span class="bonus">${esc(fmt(t.bonus, b.mine.bonus))}</span>` : ''}${b.mine.streak > 1 ? ` · 🔥 ${esc(fmt(t.streakTip, b.mine.streak))}` : ''}</p>` : '';
  return `${mine}${tabs}<p class="label">${esc(fmt(t.players, cur.players))}${cur.me ? ` · ${esc(t.you)} : ${esc(rankTxt(cur.me))}` : ''}</p>${rows}`;
}
$('boardBody').addEventListener('click', (e) => {
  const b = e.target.closest('[data-tab]');
  if (!b || !last) return;
  tab = b.dataset.tab;
  $('boardBody').innerHTML = boardHtml(last);
  $('boardBody').querySelector(`[data-tab="${tab}"]`)?.focus();
});
async function boardLoad() {
  try {
    const r = await fetch(`/jeu/api/board?day=${today}${player?.uid ? `&uid=${player.uid}` : ''}`);
    if (r.ok) $('boardBody').innerHTML = boardHtml(await r.json());
  } catch { $('boardBody').innerHTML = `<p class="msg">${esc(t.boardOff)}</p>`; }
}
async function boardSend(name) {
  const msg = $('boardMsg');
  msg.textContent = t.sending;
  const uid = player?.uid || newUid();
  try {
    const r = await fetch('/jeu/api/score', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uid, name, day: today, tries: game.g.length, won: game.r === 'w', jokers: game.j || 0 }) });
    const b = await r.json().catch(() => ({}));
    if (!r.ok) { msg.textContent = b.error || t.boardOff; if (b.code === 'name') { $('boardJoin').hidden = false; $('pseudo').focus(); } return; }
    player = { uid, name: b.name };
    try { localStorage.setItem(PLAYER, JSON.stringify(player)); } catch { /* stockage refusé : pas de classement aux prochaines parties */ }
    game.sent = true;
    save();
    msg.textContent = fmt(t.sent, b.name);
    $('boardJoin').hidden = true;
    $('boardBody').innerHTML = boardHtml(b);
  } catch { msg.textContent = t.boardOff; }
}
function boardShow() {
  $('board').hidden = false;
  if (player && !game.sent) { boardSend(player.name); return; }
  $('boardJoin').hidden = !!player;
  if (player) $('boardMsg').textContent = fmt(t.sent, player.name);
  boardLoad();
}
$('boardJoin').addEventListener('submit', (e) => { e.preventDefault(); const v = $('pseudo').value.trim(); if (v) boardSend(v); });
$('boardRename').addEventListener('click', () => { $('boardJoin').hidden = false; $('pseudo').value = player?.name || ''; $('pseudo').focus(); });

// Prochain jeu : temps jusqu'à minuit à Paris ; le jour passé, proposer de recharger la page
const CLOCK = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Paris', hour: 'numeric', minute: 'numeric', second: 'numeric', hourCycle: 'h23' });
function tick() {
  if (parisDay() !== today) { $('clock').innerHTML = `<a href="">${esc(t.fresh)} · ${esc(t.reload)}</a>`; return; }
  const p = Object.fromEntries(CLOCK.formatToParts(new Date()).map((x) => [x.type, Number(x.value)]));
  const left = 86400 - (p.hour * 3600 + p.minute * 60 + p.second);
  const pad = (n) => String(n).padStart(2, '0');
  $('clock').textContent = fmt(t.next, `${pad(Math.floor(left / 3600))}:${pad(Math.floor((left % 3600) / 60))}:${pad(left % 60)}`);
  setTimeout(tick, 1000 - (Date.now() % 1000));
}

if (!isDriver) {
  $('trkU').setAttribute('points', answer.outline);
  $('trk').setAttribute('points', answer.outline);
}
render();
tick();
