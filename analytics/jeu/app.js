// Page du jeu « Devine le circuit » (/jeu/, /en/guess-the-circuit/) : tracé du jour, essais, indices, partage et série.
// Tracés et textes dans la page (analytics/jeu/page.mjs) ; partie et série dans ce navigateur seulement (localStorage).
import { TRIES, FIRST_DAY, parisDay, dailyIndex, hints, mark, stats, shareText, revealed, revealStart } from './game.js';

const { t, circuits } = JSON.parse(document.getElementById('data').textContent);
const $ = (id) => document.getElementById(id);
const pool = circuits.filter((c) => c.turns);   // indices complets
const today = parisDay();
const answer = pool[dailyIndex(today, pool.length)];
const byId = new Map(circuits.map((c) => [c.id, c]));
const KEY = 'pl-jeu-circuit';

let games = {};
try { games = JSON.parse(localStorage.getItem(KEY)) || {}; } catch { /* stockage refusé : partie d'un seul affichage */ }
const game = games[today] || (games[today] = { g: [] });
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(games)); } catch { /* idem */ } };

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const fmt = (s, ...v) => v.reduce((x, y) => x.replace('{}', y), s);
const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const num = today - FIRST_DAY + 1;
$('num').textContent = `· ${fmt(t.num, num)}`;

// Essai saisi -> circuit : nom ou ville exacts, sinon le seul circuit dont le nom ou la ville contient le texte
function find(text) {
  const q = norm(text);
  if (!q) return { err: t.unknown };
  const exact = circuits.filter((c) => norm(c.name) === q || norm(c.city) === q);
  if (exact.length === 1) return { c: exact[0] };
  const part = q.length >= 3 ? circuits.filter((c) => ` ${norm(c.name)} ${norm(c.city)} `.includes(q)) : [];
  if (part.length === 1) return { c: part[0] };
  return { err: part.length || exact.length ? t.many : t.unknown };
}

const marks = () => game.g.map((id) => mark(id, answer.id));
let shown = { tries: game.g.length, hints: null };

function render() {
  const m = marks(), done = Boolean(game.r);
  const misses = m.filter((x) => x !== 'hit').length;
  $('tries').innerHTML = Array.from({ length: TRIES }, (_, i) => {
    const c = byId.get(game.g[i]);
    return `<li class="${c ? 'on' : ''}${i >= shown.tries && c ? ' new' : ''}"><span class="n">${i + 1}</span><span class="nm">${c ? esc(c.name) : '—'}</span>${c ? `<span class="tag ${m[i]}">${t[m[i]]}</span>` : ''}</li>`;
  }).join('');
  const open = done ? 5 : Math.min(misses, 5);
  $('hints').innerHTML = hints(answer, t).map(([label, value], i) => {
    const flag = i === 0 ? `<span class="flag" aria-hidden="true">${answer.flag.map((col) => `<i style="background:${col}"></i>`).join('')}</span>` : '';
    return i < open ? `<div class="${shown.hints !== null && i >= shown.hints ? 'new' : ''}"><dt>${label}</dt><dd>${flag}${esc(value)}</dd></div>`
      : `<div class="lock"><dt>${label}</dt><dd>${i + 1 === 1 ? t.locked1 : fmt(t.locked, i + 1)}</dd></div>`;
  }).join('');
  shown = { tries: game.g.length, hints: open };
  // Tracé : seulement une partie au départ, dévoilée au fil des erreurs (trait du tour, longueur 1 : pathLength)
  const f = revealed(misses, done);
  for (const el of [$('trk'), $('trkU')]) {
    el.style.strokeDasharray = f < 1 ? `${f} ${1 - f}` : 'none';
    el.style.strokeDashoffset = f < 1 ? String(-revealStart(today)) : '0';
  }
  $('form').hidden = done;
  if (!done) return;
  const won = game.r === 'w';
  $('track').classList.toggle('won', won);
  $('answer').hidden = false;
  $('answer').innerHTML = `<b>${esc(answer.name)}</b><span>${esc(answer.city)} · ${esc(answer.country)}</span>`;
  $('end').hidden = false;
  $('endH').textContent = won ? (m.length === 1 ? t.winOne : fmt(t.win, m.length)) : `${t.lose} ${answer.name}`;
  const s = stats(games, today);
  $('shareText').textContent = shareText({ num, marks: m, won, streak: s.streak, t });
  $('stats').innerHTML = [[s.played, 'played'], [s.played ? `${Math.round((s.won / s.played) * 100)} %` : '—', 'wonPct'], [s.streak, 'streak'], [s.best, 'best']]
    .map(([v, k]) => `<div><b>${v}</b><span>${t[k]}</span></div>`).join('');
}

$('form').addEventListener('submit', (e) => {
  e.preventDefault();
  const input = $('guess');
  const { c, err } = find(input.value);
  if (err || game.g.includes(c.id)) { $('msg').textContent = err || t.again; input.select(); return; }
  game.g.push(c.id);
  const m = mark(c.id, answer.id);
  if (m === 'hit') game.r = 'w';
  else if (game.g.length >= TRIES) game.r = 'l';
  save();
  input.value = '';
  const before = shown.hints;
  render();
  if (game.r) { $('msg').textContent = ''; $('endH').focus(); return; }
  const h = hints(answer, t)[before];
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

// Prochain circuit : temps jusqu'à minuit à Paris ; le jour passé, proposer de recharger la page
const CLOCK = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Paris', hour: 'numeric', minute: 'numeric', second: 'numeric', hourCycle: 'h23' });
function tick() {
  if (parisDay() !== today) { $('clock').innerHTML = `<a href="">${esc(t.fresh)} · ${esc(t.reload)}</a>`; return; }
  const p = Object.fromEntries(CLOCK.formatToParts(new Date()).map((x) => [x.type, Number(x.value)]));
  const left = 86400 - (p.hour * 3600 + p.minute * 60 + p.second);
  const pad = (n) => String(n).padStart(2, '0');
  $('clock').textContent = fmt(t.next, `${pad(Math.floor(left / 3600))}:${pad(Math.floor((left % 3600) / 60))}:${pad(left % 60)}`);
  setTimeout(tick, 1000 - (Date.now() % 1000));
}

$('trkU').setAttribute('points', answer.outline);
$('trk').setAttribute('points', answer.outline);
render();
tick();
