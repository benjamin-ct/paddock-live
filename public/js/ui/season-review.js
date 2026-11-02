// Saison → Bilan : la saison en chiffres (champion ou leader, victoires, poles, podiums, plus belle remontée,
// abandons) et celle de vos pilotes favoris, avec une image à partager (copiée ou enregistrée).
import { esc } from '../util.js';
import { icon } from '../icons.js';
import { prefs } from '../prefs.js';
import { seasonReview, titleRace } from '/shared/season-calc.js';
import { gpFull } from '/shared/gp-names.js';
import { LANG, ord, t } from '../i18n.js';
import { toast } from './delay.js';
import { saveImage, shareReady } from './season-png.js';

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
  // Fond, logo en filigrane et portrait aux couleurs de l'écurie du pilote
  const look = (x) => { const logo = x && ctx.logo(x.team); return x ? `--tc:${ctx.color(x.team, x.teamId)}${logo ? `;--logo:url('${logo}')` : ''}` : '--tc:#475569'; };
  const face = (x) => { const u = x && ctx.photo(x); return u ? `<img src="${u}" alt="" loading="lazy" onerror="this.remove()">` : ''; };
  // Les trois premiers en barres à la couleur de leur écurie
  const bars = (list) => { const max = list[0]?.n || 1; return `<div class="rv-bars">${list.slice(0, 3).map((x) => `<span class="rv-bar"><b>${esc(x.last || x.name)}</b><i style="--w:${(x.n / max) * 100}%;--c:${ctx.color(x.team, x.teamId)}"></i><em>${x.n}</em></span>`).join('')}</div>`; };
  const card = (label, x, big, body) => `<div class="sz-rv-card" style="${look(x)}">${face(x)}<div class="rv-label">${label}</div><div class="rv-big">${big}</div>${body}</div>`;
  const top = (label, list, foot = '') => card(label, list[0], list[0] ? `${esc(list[0].last || list[0].name)} <small>${list[0].n}</small>` : '—', `${bars(list)}${foot ? `<div class="rv-foot">${foot}</div>` : ''}`);
  const lead = champ || r.leader, leadTeam = champ ? champTeam : r.leaderTeam;
  const starts = data.races.filter((x) => x.results?.length).reduce((s, x) => s + x.results.length, 0);
  const cb = r.comeback;
  const favRow = (d) => {
    const w = r.wins.find((x) => x.code === d.code)?.n || 0, p = r.podiums.find((x) => x.code === d.code)?.n || 0, pole = r.poles.find((x) => x.code === d.code)?.n || 0;
    return `<tr><td>${d.pos ?? '—'}</td><td><b>${esc(d.name)}</b> <span class="muted small">${esc(d.team)}</span></td><td>${d.points}</td><td>${w}</td><td>${p}</td><td>${pole}</td></tr>`;
  };
  return `<section class="sz-box"><h3>${t('Bilan de la saison {}', data.year)}</h3>
      <p class="muted">${t('{} Grands Prix courus sur {}', r.done, r.races)}${r.done < r.races ? ` · ${t('le bilan se complète à chaque course')}` : ''}</p>
      <div class="rv-progress" title="${r.done} / ${r.races}"><i style="--w:${(r.done / r.races) * 100}%"></i></div>
      ${lead ? `<div class="sz-drv-hero sz-rv-hero" style="${look(lead)}">${face(lead)}<div class="txt">
        <div class="rv-label">${champ ? t('Champion du monde') : t('En tête du championnat')}</div>
        <div class="sz-drv-name">${esc(lead.name)}</div>
        <span class="no">${lead.points ?? ''} <small>pts</small></span>
        <div class="sub">${esc(lead.team || '')}${leadTeam && leadTeam.name !== lead.team ? ` · ${t('Constructeurs')} : ${esc(leadTeam.name)}` : ''}</div></div></div>` : ''}
      <div class="sz-rv-grid">
        ${top(t('Victoires'), r.wins, t('{} vainqueurs différents', r.winners))}
        ${top(t('Pole positions'), r.poles, t('{} victoires depuis la pole', r.poleWins))}
        ${top(t('Podiums'), r.podiums)}
        ${card(t('Plus belle remontée'), cb, cb ? `${esc(cb.last || cb.name)} <small>+${cb.gain}</small>` : '—', cb ? `<div class="rv-climb"><span>${ord(cb.from)}</span><i></i><span>${ord(cb.to)}</span></div><div class="rv-foot">${esc(gpFull(cb.gp, LANG))}</div>` : '')}
        ${card(t('Abandons'), null, String(r.dnf), `<div class="rv-progress rv-dnf"><i style="--w:${starts ? (r.dnf / starts) * 100 : 0}%"></i></div><div class="rv-foot">${t('sur {} départs', starts)}</div>`)}
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
  const bg = g.createLinearGradient(0, 0, 0, c.height);
  bg.addColorStop(0, '#0F172A'); bg.addColorStop(1, '#020817');
  g.fillStyle = bg; g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = '#e10600'; g.fillRect(80, 110, 120, 10);
  g.fillStyle = '#fff';
  g.font = '800 96px "Saira Condensed", sans-serif';
  g.fillText(t('BILAN {}', data.year), 80, 230);
  g.font = '400 34px "Titillium Web", sans-serif';
  g.fillStyle = '#CBD5E1';
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
    g.fillStyle = '#94A3B8'; g.font = '700 30px "Titillium Web", sans-serif';
    g.fillText(label.toUpperCase(), 80, y);
    g.fillStyle = '#fff'; g.font = '800 64px "Saira Condensed", sans-serif';
    g.fillText(value, 80, y + 70, 920);
  });
  g.fillStyle = '#94A3B8'; g.font = '400 28px "Titillium Web", sans-serif';
  g.fillText('paddocklive.app', 80, 1290);
  return new Promise((ok) => c.toBlob(ok, 'image/png'));
}

export async function reviewAction(kind, data) {
  // Réglages → Alertes & favoris
  if (kind === 'favs') { document.querySelector('#settingsBtn')?.click(); document.querySelector('#setNav [data-sgroup="alerts"]')?.click(); return; }
  if (kind !== 'copy' && shareReady('review')) return;
  try {
    const blob = await reviewImage(data);
    if (kind === 'copy') {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      toast(t('Image copiée'));
      return;
    }
    await saveImage(blob, `bilan-f1-${data.year}.png`, 'review');
  } catch (err) {
    toast(t('Image impossible : {}', err.message));
  }
}
