// Météo prévue sur un circuit (Open-Meteo, gratuit et sans clé) pour le post « programme du
// week-end » : températures et risque de pluie de chaque jour, gardées une heure. days.tz : fuseau
// horaire du circuit (heure locale dans la barre du haut avant le Grand Prix) ; days.current : temps
// qu'il fait sur le circuit (onglet Météo) ; days.hours : les 12 prochaines heures. code : temps
// qu'il fait (code météo WMO : 0 ciel dégagé, 3 couvert, 61 pluie, 95 orage…).
import { getJSON } from './net.js';

const cache = new Map();
export async function forecast(lat, lon, { get = getJSON, now = Date.now } = {}) {
  const la = Number(lat), lo = Number(lon);
  if (!Number.isFinite(la) || !Number.isFinite(lo) || Math.abs(la) > 90 || Math.abs(lo) > 180) throw new Error('Coordonnées invalides');
  const key = `${la.toFixed(2)},${lo.toFixed(2)}`;
  const hit = cache.get(key);
  if (hit && now() - hit.at < 1800e3) return hit.days;
  const q = new URLSearchParams({ latitude: la.toFixed(4), longitude: lo.toFixed(4), daily: 'temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code',
    current: 'temperature_2m,relative_humidity_2m,surface_pressure,wind_speed_10m,wind_direction_10m,precipitation,weather_code,cloud_cover',
    hourly: 'temperature_2m,precipitation_probability,weather_code', forecast_hours: '12', timezone: 'auto', forecast_days: '16' });
  const j = await get(`https://api.open-meteo.com/v1/forecast?${q}`, { timeout: 15000 });
  const d = j?.daily || {};
  const days = (d.time || []).map((date, i) => ({ date, tmax: d.temperature_2m_max?.[i] ?? null, tmin: d.temperature_2m_min?.[i] ?? null, rain: d.precipitation_probability_max?.[i] ?? null, code: d.weather_code?.[i] ?? null }))
    .filter((x) => x.tmax !== null);
  days.tz = typeof j?.timezone === 'string' ? j.timezone : null;
  const c = j?.current;
  days.current = c && Number.isFinite(c.temperature_2m) ? { at: c.time || null, air: c.temperature_2m, humidity: c.relative_humidity_2m ?? null, pressure: c.surface_pressure ?? null,
    wind: c.wind_speed_10m ?? null, windDir: c.wind_direction_10m ?? null, rain: c.precipitation ?? null, code: c.weather_code ?? null, cloud: c.cloud_cover ?? null } : null;
  // Heures locales du circuit -> instants (décalage horaire donné par Open-Meteo)
  const h = j?.hourly || {}, off = (Number(j?.utc_offset_seconds) || 0) * 1000;
  days.hours = (h.time || []).map((tm, i) => ({ t: Date.parse(`${tm}Z`) - off, temp: h.temperature_2m?.[i] ?? null, rain: h.precipitation_probability?.[i] ?? null, code: h.weather_code?.[i] ?? null }))
    .filter((x) => Number.isFinite(x.t) && x.temp !== null);
  cache.set(key, { at: now(), days });
  return days;
}
