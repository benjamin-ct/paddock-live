// Saison → Bilan : la saison en chiffres (champion ou leader, victoires, poles, podiums, plus belle remontée,
// abandons) et celle de vos pilotes favoris, avec une image à partager (copiée ou enregistrée).
import { esc } from '../util.js';
import { icon } from '../icons.js';
import { prefs } from '../prefs.js';
import { seasonReview, titleRace } from '/shared/season-calc.js';
import { gpFull } from '/shared/gp-names.js';
import { EN, t } from '../i18n.js';
import { toast } from './delay.js';

const ord = (n) => (EN ? `${n}${[, 'st', 'nd', 'rd'][n % 100 > 10 && n % 100 < 14 ? 0 : n % 10] || 'th'}` : n === 1 ? '1er' : `${n}e`);
// Premier en grand, les deux suivants dessous
const first = (list) => (list[0] ? `${esc(list[0].last || list[0].name)} <small>${list[0].n}</small>` : '—');
const next = (list) => list.slice(1, 3).map((x) => `${esc(x.last || x.name)} ${x.n}`).join(' · ');

function facts(data) {
  const r = seasonReview(data);
  const tr = titleRace(data, data.year);
  const champ = tr.champion, champTeam = tr.champTeam;
  const favs = (data.drivers || []).filter((d) => d.number && prefs.favs.includes(String(d.number)));
  return { r, champ, champTeam, favs };
}

export function renderReview(ctx) {
  const { data } = ctx;
  const { r, champ, champTeam, favs } = facts(data);
  if (!r.done) return `<section class="sz-box"><h3>${t('Bilan de la saison')}</h3><p class="muted">${t('Pas encore de Grand Prix couru cette saison.')}</p></section>`;
  const card = (label, big, sub = '') => `<div class="sz-card sz-kpi"><div class="muted small">${label}</div><div class="sz-big">${big}</div>${sub ? `<div class="muted small">${sub}</div>` : ''}</div>`;
  const lead = champ
    ? card(t('Champion du monde'), esc(champ.last || champ.name), `${esc(champ.name)}${champTeam ? ` · ${t('Constructeurs')} : ${esc(champTeam.name)}` : ''}`)
    : card(t('En tête du championnat'), esc(r.leader?.last || r.leader?.name || '—'), r.leader ? `${esc(r.leader.name)} · ${r.leader.points} pts${r.leaderTeam ? ` · ${esc(r.leaderTeam.name)}` : ''}` : '');
  const cb = r.comeback;
  const favRow = (d) => {
    const w = r.wins.find((x) => x.code === d.code)?.n || 0, p = r.podiums.find((x) => x.code === d.code)?.n || 0, pole = r.poles.find((x) => x.code === d.code)?.n || 0;
    return `<tr><td>${d.pos ?? '—'}</td><td><b>${esc(d.name)}</b> <span class="muted small">${esc(d.team)}</span></td><td>${d.points}</td><td>${w}</td><td>${p}</td><td>${pole}</td></tr>`;
  };
  return `<section class="sz-box"><h3>${t('Bilan de la saison {}', data.year)}</h3>
      <p class="muted">${t('{} Grands Prix courus sur {}', r.done, r.races)}${r.done < r.races ? ` · ${t('le bilan se complète à chaque course')}` : ''}</p>
      <div class="sz-cards sz-kpis sz-review-kpis">
        ${lead}
        ${card(t('Victoires'), first(r.wins), [next(r.wins), t('{} vainqueurs différents', r.winners)].filter(Boolean).join(' · '))}
        ${card(t('Pole positions'), first(r.poles), [next(r.poles), t('{} victoires depuis la pole', r.poleWins)].filter(Boolean).join(' · '))}
        ${card(t('Podiums'), first(r.podiums), next(r.podiums))}
        ${card(t('Plus belle remontée'), cb ? `${esc(cb.last || cb.name)} <small>+${cb.gain}</small>` : '—', cb ? `${ord(cb.from)} → ${ord(cb.to)} · ${esc(gpFull(cb.gp, EN))}` : '')}
        ${card(t('Abandons'), String(r.dnf), t('sur {} départs', data.races.filter((x) => x.results?.length).reduce((s, x) => s + x.results.length, 0)))}
      </div>
      <div class="row" style="gap:8px;margin-top:12px"><button class="btn small" data-review="copy">${t('Copier l\'image')}</button><button class="btn small" data-review="save">${t('Enregistrer l\'image')}</button></div>
    </section>
    <section class="sz-box sz-favs"><h3>${t('Vos pilotes favoris')}</h3>
      ${favs.length ? `<table class="sz-table"><tr><th>#</th><th>${t('Pilote')}</th><th>Pts</th><th>${t('Victoires')}</th><th>${t('Podiums')}</th><th>${t('Poles')}</th></tr>${favs.map(favRow).join('')}</table>`
    : `<p class="muted">${t('Choisissez vos pilotes favoris pour voir leur saison ici.')}</p><button class="btn small" data-review="favs">${icon('star')} ${t('Choisir mes favoris')}</button>`}
    </section>`;
}

// Image à partager (1080 × 1350, format des réseaux) : les mêmes chiffres, sans rien d'autre
async function reviewImage(data) {
  const { r, champ } = facts(data);
  await Promise.all(['800 64px "Saira Condensed"', '700 30px "Titillium Web"', '400 30px "Titillium Web"'].map((f) => document.fonts?.load(f).catch(() => null)));
  const c = document.createElement('canvas');
  c.width = 1080; c.height = 1350;
  const g = c.getContext('2d');
  g.fillStyle = '#0b0c0f'; g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = '#e10600'; g.fillRect(80, 110, 120, 10);
  g.fillStyle = '#fff';
  g.font = '800 96px "Saira Condensed", sans-serif';
  g.fillText(t('BILAN {}', data.year), 80, 230);
  g.font = '400 34px "Titillium Web", sans-serif';
  g.fillStyle = '#c8c7c1';
  g.fillText(t('{} Grands Prix courus sur {}', r.done, r.races), 80, 290);
  const name = (x) => (x ? x.last || x.name : '—');
  const rows = [
    [champ ? t('Champion du monde') : t('En tête du championnat'), champ ? champ.name : (r.leader?.name || '—')],
    [t('Le plus de victoires'), r.wins[0] ? `${name(r.wins[0])} · ${r.wins[0].n}` : '—'],
    [t('Le plus de poles'), r.poles[0] ? `${name(r.poles[0])} · ${r.poles[0].n}` : '—'],
    [t('Vainqueurs différents'), String(r.winners)],
    [t('Plus belle remontée'), r.comeback ? `${name(r.comeback)} · ${ord(r.comeback.from)} → ${ord(r.comeback.to)}` : '—'],
    [t('Abandons'), String(r.dnf)],
  ];
  rows.forEach(([label, value], i) => {
    const y = 420 + i * 140;
    g.fillStyle = '#8f8d87'; g.font = '700 30px "Titillium Web", sans-serif';
    g.fillText(label.toUpperCase(), 80, y);
    g.fillStyle = '#fff'; g.font = '800 64px "Saira Condensed", sans-serif';
    g.fillText(value, 80, y + 70, 920);
  });
  g.fillStyle = '#8f8d87'; g.font = '400 28px "Titillium Web", sans-serif';
  g.fillText('paddocklive.app', 80, 1290);
  return new Promise((ok) => c.toBlob(ok, 'image/png'));
}

export async function reviewAction(kind, data) {
  // Réglages → Alertes & favoris
  if (kind === 'favs') { document.querySelector('#settingsBtn')?.click(); document.querySelector('#setNav [data-sgroup="alerts"]')?.click(); return; }
  try {
    const blob = await reviewImage(data);
    if (kind === 'copy') {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      toast(t('Image copiée'));
      return;
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `bilan-f1-${data.year}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  } catch (err) {
    toast(t('Image impossible : {}', err.message));
  }
}
