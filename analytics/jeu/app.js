// Page du jeu du jour (/jeu/, /en/guess-the-circuit/) : circuit ou pilote du jour, essais, indices, partage, série et
// classement. Tracés, pilotes et textes dans la page (analytics/jeu/page.mjs) ; partie et série dans ce navigateur
// (localStorage) ; seulement pour qui rejoint le classement : pseudo et résultat envoyés au serveur (/jeu/api/).
import { TRIES, FIRST_DAY, MAX_JOKERS, parisDay, dailyIndex, hints, driverHints, mark, stats, shareText, revealed, revealStart, cluesShown, plan, points } from './game.js';

const { t, circuits, drivers } = JSON.parse(document.getElementById('data').textContent);
const $ = (id) => document.getElementById(id);
const today = parisDay();
// Archives : ?n=<numéro> rejoue un jour passé, sans points, sans série ni classement (partie gardée à part)
const askN = Number(new URLSearchParams(location.search).get('n'));
const day = Number.isInteger(askN) && askN >= 1 && FIRST_DAY + askN - 1 < today ? FIRST_DAY + askN - 1 : today;
const archive = day !== today;
// Lien d'invitation à un classement entre amis : ?g=<groupe>
const invited = /^[a-z0-9]{8}$/.test(new URLSearchParams(location.search).get('g') || '') ? new URLSearchParams(location.search).get('g') : null;
const { mode, level } = plan(day);
const isDriver = mode === 'driver';
const pool = isDriver ? drivers : circuits.filter((c) => c.turns);   // circuits : indices complets
const answer = pool[dailyIndex(day, pool.length)];
const items = isDriver ? drivers : circuits;
const byId = new Map(items.map((c) => [c.id, c]));
const natOf = new Map(drivers.map((d) => [d.id, d.iso]));
const same = isDriver ? (a, b) => natOf.get(a) === natOf.get(b) : undefined;
const KEY = 'pl-jeu-circuit', PLAYER = 'pl-jeu-joueur', OLD = 'pl-jeu-archives', GROUPS = 'pl-jeu-groupes';
const load = (k) => { try { return JSON.parse(localStorage.getItem(k)) || {}; } catch { return {}; } };   // stockage refusé : partie d'un seul affichage
let games = load(KEY), olds = load(OLD);
const store = archive ? olds : games;
// Jour passé déjà joué le jour même : son résultat, tel quel
const game = (archive && games[day]?.r) ? games[day] : store[day] || (store[day] = { g: [] });
const save = () => { try { localStorage.setItem(archive ? OLD : KEY, JSON.stringify(store)); } catch { /* idem */ } };

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const fmt = (s, ...v) => v.reduce((x, y) => x.replace('{}', y), s);
const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const num = day - FIRST_DAY + 1;

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
      el.style.strokeDashoffset = f < 1 ? String(-revealStart(day)) : '0';
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
  for (const id of ['stats', 'shareText', 'shareRow']) $(id).hidden = archive;
  if (archive) { $('archNote').hidden = false; return; }
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

// Image du résultat : dessin maison (aucune image de la F1), sans la réponse : seulement le morceau de tracé visible au
// départ pour tous (circuit) ou le casque (pilote), les carrés des essais, les points et la série
function cardBlob() {
  const W = 1080, cv = document.createElement('canvas');
  cv.width = W; cv.height = W;
  const g = cv.getContext('2d'), css = getComputedStyle(document.documentElement);
  const col = (v, d) => css.getPropertyValue(v).trim() || d;
  const m = marks(), won = game.r === 'w', jokers = game.j || 0, s = stats(games, today);
  const pts = points(level, Math.max(0, m.length - (won ? 1 : 0)), jokers, won);
  g.fillStyle = '#0B0F15'; g.fillRect(0, 0, W, W);
  g.fillStyle = '#E10600'; g.fillRect(0, 0, W, 14);
  g.fillStyle = '#8A95A3'; g.font = '500 30px "JetBrains Mono", monospace';
  g.fillText(`PADDOCK LIVE · ${fmt(t.num, num).toUpperCase()} · ${t[`lv_${level}`].toUpperCase()}`, 72, 110);
  g.fillStyle = '#F2F4F5'; g.font = '800 92px "Archivo Cond", "Archivo", sans-serif';
  g.fillText((isDriver ? t.h1Driver : t.h1).toUpperCase(), 72, 210);
  // Dessin : à droite, 420 px
  g.save(); g.translate(600, 280); g.lineWidth = 9; g.lineJoin = g.lineCap = 'round'; g.strokeStyle = won ? col('--best', '#B98CFF') : '#F2F4F5';
  if (isDriver) {
    g.scale(4.2, 4.2); g.lineWidth = 2.2;
    for (const d of [...document.querySelectorAll('.helmet path')].map((x) => x.getAttribute('d'))) g.stroke(new Path2D(d));
  } else {
    const pts2 = answer.outline.split(' ').map((p) => p.split(',').map(Number));
    const seg = pts2.map((p, i) => Math.hypot(...p.map((v, k) => v - pts2[(i + 1) % pts2.length][k])));
    const total = seg.reduce((a, b) => a + b, 0);
    let from = revealStart(day) * total, len = revealed(0, false, level) * total, acc = 0;
    g.scale(4.2, 4.2); g.lineWidth = 2.2; g.beginPath();
    let started = false;
    for (let k = 0; k < pts2.length * 2 && len > 0; k++) {
      const i = k % pts2.length, a = pts2[i], b = pts2[(i + 1) % pts2.length], L = seg[i];
      if (acc + L > from) {
        const t0 = Math.max(0, (from - acc) / L), t1 = Math.min(1, (from - acc + len) / L);
        const pa = [a[0] + (b[0] - a[0]) * t0, a[1] + (b[1] - a[1]) * t0], pb = [a[0] + (b[0] - a[0]) * t1, a[1] + (b[1] - a[1]) * t1];
        if (!started) { g.moveTo(...pa); started = true; }
        g.lineTo(...pb);
        len -= (t1 - t0) * L; from = acc + L;
      }
      acc += L;
    }
    g.stroke();
  }
  g.restore();
  // Carrés des essais, résultat, points, série
  const C = { hit: '#3DDC84', near: '#FFD43B', miss: '#FF5A5F' };
  m.forEach((x, i) => { g.fillStyle = C[x]; g.fillRect(72 + i * 86, 760, 70, 70); });
  for (let i = m.length; i < TRIES; i++) { g.strokeStyle = '#2E3946'; g.lineWidth = 4; g.strokeRect(74 + i * 86, 762, 66, 66); }
  g.fillStyle = '#F2F4F5'; g.font = '800 64px "Archivo Cond", "Archivo", sans-serif';
  g.fillText(`${won ? `${m.length}/${TRIES}` : `X/${TRIES}`} · ${pts} ${t.pts.toUpperCase()}`, 72, 930);
  g.fillStyle = '#B4BDC8'; g.font = '400 34px "Archivo", sans-serif';
  g.fillText([jokers ? `${jokers} joker${jokers > 1 ? 's' : ''}` : '', s.streak > 1 ? `🔥 ${fmt(t.streakTip, s.streak)}` : ''].filter(Boolean).join(' · '), 72, 985);
  g.fillStyle = '#8A95A3'; g.font = '500 30px "JetBrains Mono", monospace';
  g.fillText(t.url, 72, 1040);
  return new Promise((res) => cv.toBlob(res, 'image/png'));
}
$('shareImg').addEventListener('click', async () => {
  await document.fonts.ready;
  const blob = await cardBlob();
  if (!blob) return;
  const file = new File([blob], `paddock-live-jeu-${num}.png`, { type: 'image/png' });
  try {
    if (navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], text: $('shareText').textContent }); return; }
  } catch (e) { if (e?.name === 'AbortError') return; }
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: file.name });
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  $('shareMsg').textContent = t.imgSaved;
});

// Archives : les 14 jours d'avant, rejouables (résultat du jeu du jour, ou de la partie des archives)
function archivesHtml() {
  const rows = [];
  for (let d = today - 1; d >= Math.max(FIRST_DAY, today - 14); d--) {
    const p = plan(d), g = games[d]?.r ? games[d] : olds[d], n = d - FIRST_DAY + 1;
    const res = g?.r === 'w' ? `<span class="tag hit">${esc(t.hit)}</span>` : g?.r === 'l' ? `<span class="tag miss">${esc(t.lost)}</span>` : `<span class="tag">${esc(t.toPlay)}</span>`;
    const date = new Date(d * 864e5).toLocaleDateString(t.locale, { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
    rows.push(`<li><a href="?n=${n}"${d === day ? ' aria-current="page"' : ''}><span class="n">${esc(fmt(t.num, n))}</span><span class="nm">${esc(date)} · ${esc(p.mode === 'driver' ? t.modeDriver : t.modeCircuit)} · ${esc(t[`lv_${p.level}`])}</span>${res}</a></li>`);
  }
  return rows.length ? `<ol class="tries arch">${rows.join('')}</ol>` : `<p class="msg">${esc(t.archEmpty)}</p>`;
}
$('archList').innerHTML = archivesHtml();
// Lien d'invitation reçu : nom du groupe en tête de page
if (invited) {
  fetch(`/jeu/api/board?day=${today}&g=${invited}`).then((r) => r.json()).then((b) => {
    if (b.group) { $('inviteNote').hidden = false; $('inviteNote').textContent = fmt(t.invited, b.group.name); }
  }).catch(() => {});
}
if (archive) {
  document.body.classList.add('archive');
  $('archTag').hidden = false;
  $('archBack').hidden = false;
}

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
  const scopes = `<div class="scopes">${[['', t.everyone], ...groups.map((x) => [x.id, x.name])].map(([id, n]) => `<button type="button" class="chip" data-scope="${id}" aria-pressed="${id === scope}">${esc(n)}</button>`).join('')}<button type="button" class="chip add" id="groupNew">${esc(t.groupNew)}</button></div>`;
  const ginfo = b.group ? `<div class="ginfo"><span class="label">${esc(fmt(t.groupMembers, b.group.members))}</span><button type="button" class="linkish" id="groupShare">${esc(t.groupInvite)}</button><button type="button" class="linkish" id="groupLeave">${esc(t.groupLeave)}</button></div>` : '';
  const tabs = `<div class="tabs" role="tablist">${TABS.map((k) => `<button type="button" role="tab" data-tab="${k}" aria-selected="${k === tab}">${esc(t[`tab_${k}`])}</button>`).join('')}</div>`;
  const rows = cur.top.length ? `<ol class="rank">${cur.top.map((r, i) => `<li><span class="n">${i + 1}</span><span class="nm">${esc(r.name)}${r.streak > 1 ? ` <span class="fire" title="${esc(fmt(t.streakTip, r.streak))}">🔥${r.streak}</span>` : ''}</span><span class="pts">${r.pts}<small> ${t.pts}</small>${tab !== 'today' ? `<em>${fmt(t.days, r.days)}</em>` : ''}</span></li>`).join('')}</ol>`
    : `<p class="msg">${esc(t.boardEmpty)}</p>`;
  const mine = b.mine ? `<p class="me">${esc(fmt(t.mine, b.mine.pts))}${b.mine.bonus ? ` <span class="bonus">${esc(fmt(t.bonus, b.mine.bonus))}</span>` : ''}${b.mine.streak > 1 ? ` · 🔥 ${esc(fmt(t.streakTip, b.mine.streak))}` : ''}</p>` : '';
  return `${mine}${scopes}${ginfo}${tabs}<p class="label">${esc(fmt(t.players, cur.players))}${cur.me ? ` · ${esc(t.you)} : ${esc(rankTxt(cur.me))}` : ''}</p>${rows}`;
}
// Groupes d'amis de ce navigateur : [{ id, name }] ; lien reçu (?g=) : rejoint dès qu'on a un pseudo
const loadGroups = () => { try { return JSON.parse(localStorage.getItem(GROUPS)) || []; } catch { return []; } };
let groups = loadGroups();
const saveGroups = () => { try { localStorage.setItem(GROUPS, JSON.stringify(groups)); } catch { /* stockage refusé */ } };
let scope = invited || '';
const keepGroup = (g) => { if (g && !groups.some((x) => x.id === g.id)) { groups.push({ id: g.id, name: g.name }); saveGroups(); } };
const inviteUrl = (id) => `${location.origin}${location.pathname}?g=${id}`;
async function groupApi(body) {
  const r = await fetch('/jeu/api/group', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ uid: player?.uid, ...body }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || t.boardOff);
  return j;
}
$('boardBody').addEventListener('click', async (e) => {
  const sc = e.target.closest('[data-scope]');
  if (sc) { scope = sc.dataset.scope; boardLoad(); return; }
  if (e.target.closest('#groupNew')) {
    if (!player) { $('boardMsg').textContent = t.groupNeedName; $('boardJoin').hidden = false; $('pseudo').focus(); return; }
    $('groupForm').hidden = false; $('groupName').focus(); return;
  }
  if (e.target.closest('#groupShare')) { shareLink(inviteUrl(scope)); return; }
  if (e.target.closest('#groupLeave')) {
    try { await groupApi({ action: 'leave', g: scope }); } catch (err) { $('boardMsg').textContent = err.message; return; }
    groups = groups.filter((x) => x.id !== scope); saveGroups(); scope = ''; boardLoad(); return;
  }
  const b = e.target.closest('[data-tab]');
  if (!b || !last) return;
  tab = b.dataset.tab;
  $('boardBody').innerHTML = boardHtml(last);
  $('boardBody').querySelector(`[data-tab="${tab}"]`)?.focus();
});
async function boardLoad() {
  try {
    // Lien d'invitation : entrée dans le groupe (joueur déjà inscrit)
    if (invited && player && !groups.some((x) => x.id === invited)) keepGroup((await groupApi({ action: 'join', g: invited })).group);
    const r = await fetch(`/jeu/api/board?day=${today}${player?.uid ? `&uid=${player.uid}` : ''}${scope ? `&g=${scope}` : ''}`);
    const b = await r.json().catch(() => ({}));
    if (r.ok) { if (b.group) keepGroup(b.group); $('boardBody').innerHTML = boardHtml(b); }
    else if (scope) { $('boardMsg').textContent = b.error || t.boardOff; groups = groups.filter((x) => x.id !== scope); saveGroups(); scope = ''; boardLoad(); }
  } catch (err) { $('boardBody').innerHTML = `<p class="msg">${esc(err.message || t.boardOff)}</p>`; }
}
async function shareLink(url) {
  try {
    if (navigator.share && matchMedia('(pointer: coarse)').matches) { await navigator.share({ url, text: t.groupShareText }); return; }
    await navigator.clipboard.writeText(url);
    $('boardMsg').textContent = t.linkCopied;
  } catch (e) { if (e?.name !== 'AbortError') $('boardMsg').textContent = url; }
}
$('groupForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    const g = (await groupApi({ name: $('groupName').value })).group;
    keepGroup(g); scope = g.id; $('groupForm').hidden = true; $('groupName').value = '';
    await boardLoad();
    shareLink(inviteUrl(g.id));
  } catch (err) { $('boardMsg').textContent = err.message; $('groupName').focus(); }
});
async function boardSend(name) {
  const msg = $('boardMsg');
  msg.textContent = t.sending;
  const uid = player?.uid || newUid();
  try {
    const r = await fetch('/jeu/api/score', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uid, name, day: today, tries: game.g.length, won: game.r === 'w', jokers: game.j || 0, ...(invited ? { g: invited } : {}) }) });
    const b = await r.json().catch(() => ({}));
    if (!r.ok) { msg.textContent = b.error || t.boardOff; if (b.code === 'name') { $('boardJoin').hidden = false; $('pseudo').focus(); } return; }
    player = { uid, name: b.name };
    try { localStorage.setItem(PLAYER, JSON.stringify(player)); } catch { /* stockage refusé : pas de classement aux prochaines parties */ }
    game.sent = true;
    save();
    msg.textContent = fmt(t.sent, b.name);
    $('boardJoin').hidden = true;
    if (b.group) keepGroup(b.group);
    boardLoad();
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
