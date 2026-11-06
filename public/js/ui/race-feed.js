// Panneau « Fil de course » : un seul fil chronologique (le plus récent en haut) avec les radios d'équipe et les
// messages de la direction de course, des enquêtes et des limites de piste, filtrable par puces. Tout vient des
// panneaux Radios et Messages (mêmes données, au rythme du délai TV, même texte, même lecture des radios).
import { store, versionOf, on } from '../store.js';
import { prefs, setPref } from '../prefs.js';
import { $, esc, drivers, teamColor, fmtClock } from '../util.js';
import { parseUtc } from '/shared/f1.js';
import { icon } from '../icons.js';
import { t } from '../i18n.js';
import { radioCaptures, radioTextHtml, lapAt, isPlaying, playRadio } from './radios.js';
import { rcmType, rcmFlagClass, rcmMsgHtml, rcmVersion, FLAG_FR } from './feed.js';

const MAX = 200;   // lignes affichées au plus
const list = (o) => (!o ? [] : Array.isArray(o) ? o.filter(Boolean) : Object.keys(o).sort((a, b) => a - b).map((k) => o[k]).filter(Boolean));
// Puce de chaque message : radios, direction de course (drapeaux, safety car, autres), enquêtes, limites de piste
const KIND = { flags: 'rcm', sc: 'rcm', other: 'rcm', stewards: 'stewards', limits: 'limits' };
// Couleur de l'étiquette : le sens du message (drapeau, neutralisation, enquête) ; une radio : la couleur de l'écurie
const FLAG_K = { GREEN: 'green', CLEAR: 'green', YELLOW: 'yellow', 'DOUBLE YELLOW': 'yellow', RED: 'red', BLUE: 'blue', CHEQUERED: 'text', 'BLACK AND WHITE': 'text', 'BLACK AND ORANGE': 'orange', BLACK: 'text' };

let ver = 0;   // transcriptions, traductions, lecture d'une radio
let key = '';
let html = '';

function rcmTag(m) {
  const type = rcmType(m);
  if (type === 'stewards') return ['orange', t('Enquête')];
  if (type === 'limits') return ['text-2', t('Limites')];
  if (type === 'sc') return ['orange', /VSC|VIRTUAL/i.test(m.Message || '') ? 'VSC' : 'SC'];
  if (m.Flag) return [FLAG_K[m.Flag] || 'muted', t(FLAG_FR[m.Flag] || m.Flag)];
  return ['muted', t('Direction')];
}

function rows() {
  const filter = prefs.raceFeedFilter || 'all';
  const out = [];
  if (filter === 'all' || filter === 'radio') {
    for (const c of radioCaptures().slice(0, MAX)) out.push({ utc: c.utc, radio: c });
  }
  if (filter !== 'radio') {
    for (const m of list(store.state.RaceControlMessages?.Messages)) {
      if (!prefs.rcmBlue && m.Flag === 'BLUE') continue;   // drapeaux bleus : comme le panneau Messages
      if (filter !== 'all' && KIND[rcmType(m)] !== filter) continue;
      out.push({ utc: parseUtc(m.Utc), msg: m });
    }
  }
  return out.sort((a, b) => (b.utc || 0) - (a.utc || 0)).slice(0, MAX);
}

function rowHtml(r, dl) {
  // Heure à gauche ; en tête du texte, l'étiquette et le tour
  const when = `<span class="rf-when">${Number.isFinite(r.utc) ? fmtClock(r.utc) : ''}</span>`;
  const head = (tag, lap) => `<div class="rf-head">${tag}${lap ? `<small>${t('Tour {}', lap)}</small>` : ''}</div>`;
  if (r.radio) {
    const c = r.radio, d = dl[c.num] || {};
    const name = [d.FirstName, d.LastName].filter(Boolean).join(' ') || d.FullName || d.Tla || c.num;
    const playing = isPlaying(c.url);
    const text = prefs.radioText ? radioTextHtml(c) : `<div class="rd-text muted">${esc(t('Radio d\'équipe'))}</div>`;
    return `<li class="rf-item rf-radio${playing ? ' playing' : ''}" data-url="${esc(c.url)}">${when}
      <div class="rf-body">${head(`<span class="rf-tag" style="--k:${teamColor(d)}" title="${esc(name)}">${esc(d.Tla || c.num)}</span>`, lapAt(c.num, c.utc))}${text}</div>
      <button type="button" class="icon-btn rf-play" aria-label="${esc(playing ? t('Pause') : t('Écouter la radio de {}', name))}">${icon(playing ? 'pause' : 'play')}</button></li>`;
  }
  const m = r.msg;
  const [k, label] = rcmTag(m);
  const flag = rcmFlagClass(m);
  return `<li class="rf-item">${when}<div class="rf-body">${head(`<span class="rf-tag" style="--k:var(--${k})">${flag ? `<i class="rcm-flag ${flag}"></i>` : ''}${esc(label)}</span>`, m.Lap)}${rcmMsgHtml(m.Message)}</div></li>`;
}

export function renderRaceFeed() {
  const box = $('#rfList');
  if (!box || box.closest('.hidden-panel, .lstash')) return;   // panneau masqué : redessiné à son retour
  // Tours des radios revus toutes les 5 s, comme le panneau Radios
  const k = `${versionOf(['TeamRadio', 'RaceControlMessages', 'DriverList', '__reset'])}|${rcmVersion()}|${ver}|${prefs.raceFeedFilter}|${prefs.radioText}|${prefs.radioLang}|${prefs.radioFilter}|${prefs.rcmBlue}|${prefs.favs.join()}|${store.duel.a}|${store.duel.b}|${Math.floor(performance.now() / 5000)}|${document.documentElement.dataset.scheme}`;
  if (k === key) return;
  key = k;
  const all = rows();
  const dl = drivers(store.state);
  const next = all.length ? all.map((r) => rowHtml(r, dl)).join('')
    : `<li class="note">${esc(t(!store.state.SessionInfo ? 'Pas de séance en cours.' : prefs.raceFeedFilter === 'all' ? 'Rien pour l\'instant : radios et messages arrivent ici au fil de la séance.' : 'Rien dans ce filtre pour l\'instant.'))}</li>`;
  if (next !== html) { html = next; box.innerHTML = next; }
}

export function initRaceFeed() {
  const chips = $('#rfChips');
  if (!chips) return;
  const paint = () => { for (const b of chips.querySelectorAll('[data-rf]')) b.setAttribute('aria-pressed', String(b.dataset.rf === (prefs.raceFeedFilter || 'all'))); };
  paint();
  // Puces plus larges que le panneau : elles défilent, un fondu sur le bord le signale (à droite, puis à gauche)
  const more = () => { chips.classList.toggle('more', chips.scrollLeft + chips.clientWidth < chips.scrollWidth - 1); chips.classList.toggle('less', chips.scrollLeft > 1); };
  new ResizeObserver(more).observe(chips);
  chips.addEventListener('scroll', more, { passive: true });
  // Molette verticale : les puces défilent de côté (au doigt, le glissement suffit)
  chips.addEventListener('wheel', (e) => {
    if (!e.deltaY || Math.abs(e.deltaX) > Math.abs(e.deltaY) || chips.scrollWidth <= chips.clientWidth) return;
    e.preventDefault();
    chips.scrollLeft += e.deltaY;
  }, { passive: false });
  chips.addEventListener('click', (e) => { const b = e.target.closest('[data-rf]'); if (b) setPref('raceFeedFilter', b.dataset.rf); });
  on('prefs', (k) => { if (k === 'raceFeedFilter') { paint(); renderRaceFeed(); } });
  // Une radio se lit au clic sur sa ligne ou son bouton (comme dans le panneau Radios)
  $('#rfList').addEventListener('click', (e) => { const li = e.target.closest('.rf-radio'); if (li) playRadio(li.dataset.url); });
  const bump = () => { ver++; };
  on('radioText', bump);
  window.addEventListener('paddock:radio', bump);   // radio lancée ou arrêtée (ui/radios.js)
}
