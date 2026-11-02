// Diagnostic des données F1 (Réglages → Application, mode créateur) : le serveur lit toute la séance
// chargée dans les archives (chaque flux de l'Index.json, sans regarder le replay) et dresse
// l'inventaire des champs et des canaux de télémétrie, pour repérer une donnée nouvelle (énergie de la
// batterie, mode Boost…). Les nouveautés sont signalées ; le rapport complet se copie ou s'enregistre.
import { store } from '../store.js';
import { $, esc } from '../util.js';
import { t, dec, LOCALE } from '../i18n.js';
import { seek } from './moments.js';

// Flux et canaux déjà connus (saisons précédentes)
const KNOWN_FEEDS = new Set(['SessionInfo', 'ArchiveStatus', 'TrackStatus', 'SessionData', 'ContentStreams', 'AudioStreams', 'ExtrapolatedClock',
  'DriverList', 'TimingDataF1', 'TimingData', 'LapSeries', 'TopThree', 'TimingAppData', 'TimingStats', 'SessionStatus', 'TyreStintSeries', 'Heartbeat',
  'Position.z', 'WeatherData', 'WeatherDataSeries', 'CarData.z', 'TeamRadio', 'TlaRcm', 'RaceControlMessages', 'PitLaneTimeCollection', 'CurrentTyres',
  'DriverRaceInfo', 'ChampionshipPrediction', 'OvertakeSeries', 'DriverScore', 'SPFeed', 'PitStopSeries', 'PitStop', 'LapCount', 'DriverTracker']);
const CHANNELS = { 0: 'régime', 2: 'vitesse', 3: 'rapport', 4: 'accélérateur', 5: 'frein', 45: 'DRS' };
// Mots d'un champ qui peut cacher une donnée 2026 (énergie, mode dépassement, aileron actif…)
const WATCH = /energ|batt|boost|overtak|deploy|harvest|charg|^soc$|^ers|mgu|aero|wing|mode|power/i;

const watched = (path) => path.split('.').some((s) => WATCH.test(s));
const channelOf = (path) => path.match(/\.Channels\.(\d+)$/)?.[1];
const vals = (list) => list.map(([v, n]) => `${v} ×${n}`).join(', ');
const line = (f) => `${f.path} · ${f.n}${f.max !== undefined ? ` · ${f.min} → ${f.max}` : ''} · ${vals(f.top)}${f.highest ? ` · max ${vals(f.highest)}` : ''}${f.more ? ' · …' : ''}`;
// Mode dépassement 2026 : changements d'OvertakeState et des indicateurs 4096 / 8192, avec l'écart sur la
// voiture de devant (disponible à moins d'une seconde ?)
const clock = (ms) => { const s = Math.max(0, Math.round(ms / 1000)); return `${Math.floor(s / 3600)}:${String(Math.floor(s / 60) % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; };
const gap = (g) => (g === null ? '—' : `${dec(g.toFixed(3))} s`);
const change = (e) => `${clock(e.off)} · ${t('tour {}', e.lap)} · ${e.tla} P${e.pos ?? '?'} · ${e.what} ${e.from === null ? `count ${e.to}` : `${e.from} → ${e.to}`} · ${gap(e.gap)}`;
const perDriver = (o) => o.overtakes.map((p) => `${p.tla} ${p.n} (count ${p.sum})`).join(', ');
const changes = (x) => t('{} : {} fois · écart médian {} · {}/{} à moins d\'1 s', x.change, x.n, gap(x.median), x.under1, x.known);

// Flux cachés testés en direct (server/feed-probe.js) : noms devinés pour l'énergie 2026 en évidence
const probeRows = (p) => Object.entries(p?.found || {}).map(([k, f]) => ({ k, f, guess: !KNOWN_FEEDS.has(k) }));
function probeHtml(p) {
  const head = `<p class="small"><b>${t('Flux cachés testés en direct')}</b> <span class="muted">${t('(énergie, batterie, Boost, mode dépassement…)')}</span></p>`;
  if (!p?.at) return `${head}<p class="small muted">${t('Pas encore testé : ça se fait tout seul à la prochaine séance en direct.')}</p>`;
  const rows = probeRows(p);
  return `${head}<p class="small ${rows.some((r) => r.guess) ? 'diag-new' : 'muted'}">${t('Testé le {} ({}) : {} nom(s) sur {} ont répondu.', esc(new Date(p.at).toLocaleString(LOCALE)), esc(p.session || '—'), rows.length, p.asked.length)}${p.error ? ` ${esc(p.error)}` : ''}</p>
    ${rows.length ? `<ul class="small diag-list" data-no-i18n>${rows.map(({ k, f, guess }) => `<li${guess ? ' class="diag-new"' : ''}>${esc(k)} · ${f.n} messages · ${esc(f.sample || '')}</li>`).join('')}</ul>` : ''}`;
}

// Calibrage de l'énergie estimée : part du temps à plein gaz par vitesse gagnée en 1 s, tranche par tranche
const binNames = (g) => [`≤ ${g[0]}`, ...g.slice(1).map((x, i) => `${g[i] + 1}–${x}`), `> ${g.at(-1)}`];
const pct = (b, x) => (b.n ? `${Math.round((x / b.n) * 100)} %` : '—');
const band = (b, next) => (next ? `${b.from}–${next.from}` : `${b.from}+`);
function energyHtml(e) {
  if (!e?.bands?.some((b) => b.n)) return '';
  const names = binNames(e.gains);
  return `<p class="small"><b>${t('Énergie estimée : calibrage')}</b> <span class="muted">${t('(plein gaz : km/h gagnés en 1 s, selon la vitesse)')}</span></p>
    <table class="small diag-table" data-no-i18n><tr><th>km/h</th>${names.map((n) => `<th>${esc(n)}</th>`).join('')}<th>n</th></tr>
      ${e.bands.map((b, i) => `<tr><td>${band(b, e.bands[i + 1])}</td>${b.bins.map((x) => `<td>${pct(b, x)}</td>`).join('')}<td>${b.n}</td></tr>`).join('')}</table>`;
}

// Rapport texte complet (à copier ou enregistrer, pour l'analyser ailleurs)
function report(r, p) {
  const out = [`Paddock Live · données F1 · ${r.path}`];
  if (p?.at) out.push('', `## Flux cachés testés en direct · ${new Date(p.at).toISOString()} · ${p.session || '—'} · ${p.asked.length} noms${p.error ? ` · erreur : ${p.error}` : ''}`, ...probeRows(p).map(({ k, f }) => `${k} · ${f.n} messages · ${f.sample || ''}`));
  for (const f of r.feeds) {
    out.push('', `## ${f.name}${KNOWN_FEEDS.has(f.name) ? '' : ' (nouveau)'} · ${f.lines} messages${f.error ? ` · erreur : ${f.error}` : ''}`);
    for (const x of f.fields) out.push(line(x));
  }
  const e = r.energy;
  if (e?.bands) out.push('', `## Énergie estimée : calibrage (plein gaz, km/h gagnés en 1 s) · ${binNames(e.gains).join(' | ')}`, ...e.bands.map((b, i) => `${band(b, e.bands[i + 1])} km/h · n ${b.n} · ${b.bins.map((x) => pct(b, x)).join(' | ')}`));
  const o = r.overtake;
  if (o?.events.length) out.push('', '## Mode dépassement 2026 (chronologie)', ...o.summary.map(changes), `OvertakeSeries par pilote : ${perDriver(o)}`, '', ...o.events.map(change));
  return out.join('\n');
}

function render(r) {
  const fields = r.feeds.flatMap((f) => f.fields.map((x) => ({ ...x, feed: f.name })));
  const fresh = r.feeds.filter((f) => !KNOWN_FEEDS.has(f.name));
  const watch = fields.filter((x) => watched(x.path));
  const channels = fields.filter((x) => x.feed === 'CarData.z' && channelOf(x.path));
  const li = (x) => `<li>${esc(line(x))}</li>`;
  return `<p class="small"><b>${t('Flux publiés')}</b> (${esc(r.path)}) : ${r.feeds.map((f) => (KNOWN_FEEDS.has(f.name) ? esc(f.name) : `<b class="diag-new">${esc(f.name)} (${t('nouveau')})</b>`)).join(', ')}</p>
    <p class="small ${fresh.length ? 'diag-new' : 'muted'}">${fresh.length ? t('{} flux nouveau(x) par rapport aux saisons précédentes.', fresh.length) : t('Aucun flux nouveau.')}
      ${t('{} champs lus dans toute la séance, en {} s.', fields.length, Math.round(r.ms / 1000))}</p>
    <p class="small"><b>${t('Canaux de télémétrie')}</b></p>
    <ul class="small diag-list" data-no-i18n>${channels.map((x) => { const k = channelOf(x.path); return `<li>${CHANNELS[k] ? t('Canal {} ({})', k, t(CHANNELS[k])) : `<b class="diag-new">${t('Canal {} ({})', k, t('nouveau'))}</b>`} : ${x.min} → ${x.max} · ${t('{} valeurs', `${x.distinct}${x.more ? '+' : ''}`)} · ${esc(vals(x.top))} · max ${esc(vals(x.highest))}</li>`; }).join('') || `<li>${t('Aucune télémétrie dans cette séance.')}</li>`}</ul>
    ${energyHtml(r.energy)}
    ${r.overtake?.events.length ? `<p class="small"><b>${t('Mode dépassement 2026 (pistes)')}</b> <span class="muted">${t('OvertakeState, indicateurs 4096 / 8192 du statut des pilotes, OvertakeSeries')}</span></p>
    <ul class="small diag-list" data-no-i18n>${r.overtake.summary.map((x) => `<li>${esc(changes(x))}</li>`).join('')}${r.overtake.overtakes.length ? `<li>${t('OvertakeSeries par pilote : {}', esc(perDriver(r.overtake)))}</li>` : ''}</ul>
    <details class="small"><summary>${t('Chronologie : {} changements (clic : aller au moment dans le replay)', r.overtake.events.length)}</summary>
      <ul class="diag-list" data-no-i18n>${r.overtake.events.map((e) => `<li><a href="#" data-off="${e.off}">${esc(change(e))}</a></li>`).join('')}</ul></details>` : ''}
    <p class="small"><b>${t('Champs à regarder')}</b> <span class="muted">${t('(énergie, batterie, Boost, dépassement, aileron, mode…)')}</span></p>
    <ul class="small diag-list" data-no-i18n>${watch.map((x) => `<li class="diag-new">${esc(x.feed)} · ${esc(line(x))}</li>`).join('') || `<li>${t('Aucun.')}</li>`}</ul>
    ${r.feeds.map((f) => `<details class="small"><summary>${esc(f.name)} · ${t('{} messages · {} champs', f.lines, f.fields.length)}${f.error ? ` · ${esc(f.error)}` : ''}</summary>
      <ul class="diag-list" data-no-i18n>${f.fields.map(li).join('')}</ul></details>`).join('')}
    <p><button class="btn" id="feedDiagCopy">${t('Copier le rapport')}</button> <button class="btn" id="feedDiagSave">${t('Enregistrer (.txt)')}</button></p>`;
}

export function initFeedDiag() {
  $('#feedDiagBtn')?.addEventListener('click', async (e) => {
    const out = $('#feedDiagOut'), btn = e.currentTarget;
    const path = store.state.SessionInfo?.Path;
    const probe = await fetch('/api/feeds/probe').then((r) => r.json()).catch(() => null);
    if (!path) { out.innerHTML = `${probeHtml(probe)}<p class="small muted">${t('Aucune séance chargée : lancez un replay ou attendez une séance.')}</p>`; return; }
    btn.disabled = true;
    out.innerHTML = `<p class="small muted">${t('Lecture de toute la séance dans les archives F1 (jusqu\'à une minute)…')}</p>`;
    try {
      const res = await fetch(`/api/feeds/diag?path=${encodeURIComponent(path)}`);
      const r = await res.json();
      if (!res.ok) throw new Error(r.error || `HTTP ${res.status}`);
      out.innerHTML = probeHtml(probe) + render(r);
      out.onclick = (ev) => { const a = ev.target.closest('[data-off]'); if (a) { ev.preventDefault(); seek(+a.dataset.off); } };
      const text = report(r, probe);
      $('#feedDiagCopy').onclick = (ev) => navigator.clipboard.writeText(text).then(() => { ev.target.textContent = t('Copié'); });
      $('#feedDiagSave').onclick = () => {
        const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([text], { type: 'text/plain' })), download: `donnees-f1-${path.split('/').filter(Boolean).pop()}.txt` });
        a.click();
        URL.revokeObjectURL(a.href);
      };
    } catch (err) {
      out.innerHTML = `<p class="small muted">${t('Analyse impossible : {}', esc(String(err.message || err).slice(0, 160)))}</p>`;
    }
    btn.disabled = false;
  });
}
