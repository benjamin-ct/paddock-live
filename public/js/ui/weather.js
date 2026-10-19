// Onglet Météo : le temps sur le circuit en un coup d'œil (ciel, température, vent sur une rose des
// vents, pluie), les prochaines heures et les jours du week-end. En séance : station météo de la F1
// (air, piste…) et prévisions Open-Meteo du circuit ; entre deux séances : prochain Grand Prix.
import { store, versionOf } from '../store.js';
import { $, esc, api } from '../util.js';
import { icon } from '../icons.js';
import { upcoming } from './home.js';
import { placeNow } from './radar.js';
import { DEC, EN, LOCALE, t } from '../i18n.js';

// Code météo (WMO) -> icône et libellé
export function sky(code) {
  const c = Number(code);
  if (code === null || code === undefined || !Number.isFinite(c)) return null;
  if (c === 0) return { icon: 'sun', label: 'Ciel dégagé' };
  if (c <= 2) return { icon: 'cloud-sun', label: c === 1 ? 'Peu nuageux' : 'Partiellement nuageux' };
  if (c === 3) return { icon: 'cloud', label: 'Couvert' };
  if (c === 45 || c === 48) return { icon: 'fog', label: 'Brouillard' };
  if (c >= 51 && c <= 57) return { icon: 'rain', label: 'Bruine' };
  if (c >= 61 && c <= 67) return { icon: 'rain', label: 'Pluie' };
  if ((c >= 71 && c <= 77) || c === 85 || c === 86) return { icon: 'snow', label: 'Neige' };
  if (c >= 80 && c <= 82) return { icon: 'rain', label: 'Averses' };
  if (c >= 95) return { icon: 'storm', label: 'Orage' };
  return { icon: 'cloud', label: 'Nuageux' };
}

const CARD = EN ? ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] : ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'];
const cardinal = (deg) => CARD[Math.round((((deg % 360) + 360) % 360) / 45) % 8];
const num = (v, d = 0) => (v !== null && v !== '' && Number.isFinite(Number(v)) ? Number(v).toFixed(d).replace('.', DEC) : '—');

// Rose des vents : la flèche montre où va le vent (il vient de « dir »)
function rose(dir) {
  const L = [['N', 32, 9], [EN ? 'E' : 'E', 56, 35], ['S', 32, 61], [EN ? 'W' : 'O', 8, 35]];
  return `<svg class="wxv-rose" viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="27"/>
    ${L.map(([c, x, y]) => `<text x="${x}" y="${y}">${c}</text>`).join('')}
    ${Number.isFinite(dir) ? `<g transform="rotate(${dir + 180} 32 32)"><path d="M32 13l6 11-4.5-1.5V47h-3V22.5L26 24z"/></g>` : ''}</svg>`;
}

// Prévisions du circuit de la séance en cours (entre deux séances : celles de l'accueil)
let fc = null;   // { key, at, data }
async function loadForecast(p) {
  const key = `${p.lat},${p.lon}`;
  if (fc?.key === key && Date.now() - fc.at < 15 * 60e3) return;
  fc = { key, at: Date.now(), data: fc?.key === key ? fc.data : null };
  try { fc.data = await api(`/api/forecast?lat=${p.lat}&lon=${p.lon}`); fc.at = Date.now(); } catch { /* hors ligne */ }
}

function hero({ air, track, hum, pressure, wind, dir, raining, code, src }) {
  const s = raining ? sky(61) : sky(code) || { icon: 'cloud', label: '' };
  const tPct = Math.max(0, Math.min(100, ((Number(track) - 10) / 50) * 100));
  return `<div class="wxv-hero">
      <div class="wxv-now"><span class="wxv-sky${raining ? ' wet' : ''}">${icon(s.icon)}</span>
        <div><div class="wxv-temp">${num(air)}<sup>°C</sup></div>${s.label ? `<div class="wxv-cond">${s.label}</div>` : ''}<div class="wxv-src">${src}</div></div></div>
      ${track !== undefined ? `<div class="wxv-track" title="Température de la piste"><span>Piste</span><b>${num(track)}°</b><i class="wxv-scale"><i style="left:${tPct}%"></i></i></div>` : ''}
      <div class="wxv-wind">${rose(dir)}<div><b>${num(wind)}<small> km/h</small></b><span>${Number.isFinite(dir) ? t('Vent du {}', cardinal(dir)) : 'Vent'}</span></div></div>
    </div>
    <div class="wxv-chips">
      <span>${icon('droplet')} Humidité <b>${num(hum)} %</b></span>
      <span>Pression <b>${num(pressure)} hPa</b></span>
      <span class="wxv-rain${raining ? ' on' : ''}">${icon(raining ? 'rain' : 'sun')} ${raining ? 'Il pleut' : 'Pas de pluie'}</span>
    </div>`;
}

function hoursHtml(hours) {
  const list = (hours || []).filter((h) => h.t >= Date.now() - 30 * 60e3).slice(0, 8);
  if (list.length < 2) return '';
  return `<div class="wxv-sec"><h5>Prochaines heures</h5><div class="wxv-hours">${list.map((h) => {
    const s = sky(h.code) || { icon: 'cloud', label: '' };
    const r = Number(h.rain) || 0;
    return `<div class="wxv-h${r >= 40 ? ' wet' : ''}" title="${esc(s.label)}"><span>${new Date(h.t).toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit' })}</span>${icon(s.icon)}<b>${num(h.temp)}°</b>
      <i class="wxv-pbar"><i style="height:${r}%"></i></i><small>${h.rain === null ? '—' : `${r} %`}</small></div>`;
  }).join('')}</div></div>`;
}

function daysHtml(days, week, title = 'Jours du week-end') {
  if (!days?.length) return '';
  return `<div class="wxv-sec"><h5>${title}</h5><div class="wxv-days">${days.map((d) => {
    const s = sky(d.code) || { icon: 'cloud', label: '' };
    const r = Number(d.rain) || 0;
    const sess = (week || []).filter((x) => new Date(x.t).toISOString().slice(0, 10) === d.date).map((x) => x.label);
    return `<div class="wxv-d${sess.includes('Course') ? ' race' : ''}" title="${esc(s.label)}">
      <span class="wxv-dn">${esc(new Date(`${d.date}T12:00:00`).toLocaleDateString(LOCALE, { weekday: 'short', day: 'numeric' }))}</span>
      ${icon(s.icon)}<span class="wxv-dt"><b>${num(d.tmax)}°</b> ${num(d.tmin)}°</span>
      <span class="wxv-dr" title="Risque de pluie"><i style="width:${r}%"></i></span><small>${icon('droplet')} ${d.rain === null ? '—' : `${r} %`}</small>
      ${sess.length ? `<em>${sess.map(esc).join(' · ')}</em>` : ''}</div>`;
  }).join('')}</div></div>`;
}

let wxVer = '';
export function renderWeather() {
  const nx = upcoming();
  const w = store.state.WeatherData;
  const p = nx ? null : placeNow();
  if (p) loadForecast(p);
  const f = !nx && fc?.key === `${p?.lat},${p?.lon}` ? fc.data : null;
  const v = `${versionOf(['WeatherData', '__reset'])}|${nx ? `${nx.race}|${JSON.stringify(nx.current)}|${nx.days?.length}|${nx.hours?.length}` : ''}|${f ? fc.at : ''}|${Math.floor(Date.now() / 300e3)}`;
  if (v === wxVer) return;
  wxVer = v;
  // Deux zones : temps qu'il fait (ici) et radar des précipitations (radar.js), rafraîchies séparément
  if (!$('#wxGauges')) $('#weather').innerHTML = '<div id="wxGauges"></div><div id="wxRadar"></div>';
  const box = $('#wxGauges');
  if (nx) {
    const c = nx.current;
    box.innerHTML = c ? `<div class="wxv">${hero({ air: c.air, hum: c.humidity, pressure: c.pressure, wind: c.wind, dir: Number(c.windDir), raining: Number(c.rain) > 0, code: c.code, src: esc(t('{} · Open-Meteo', nx.locality || nx.race)) })}
      ${hoursHtml(nx.hours)}${daysHtml(nx.days, nx.week)}</div>`
      : `<p class="note">${esc(t('Météo de {} en cours de chargement…', nx.locality || nx.race))}</p>`;
    return;
  }
  if (!w) { box.innerHTML = '<div class="note">Pas de données météo.</div>'; return; }
  const today = new Date().toISOString().slice(0, 10);
  box.innerHTML = `<div class="wxv">${hero({ air: w.AirTemp, track: w.TrackTemp, hum: w.Humidity, pressure: w.Pressure, wind: Number(w.WindSpeed) * 3.6, dir: Number(w.WindDirection),
    raining: w.Rainfall === '1' || w.Rainfall === 1, code: f?.current?.code, src: 'Station météo du circuit (F1)' })}
    ${hoursHtml(f?.hours)}${daysHtml((f?.days || []).filter((d) => d.date >= today).slice(0, 3), null, 'Prochains jours')}</div>`;
}
