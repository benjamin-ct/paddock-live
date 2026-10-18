// Météo prévue sur un circuit (Open-Meteo, gratuit et sans clé) pour le post « programme du
// week-end » : températures et risque de pluie de chaque jour, gardées une heure. days.tz : fuseau
// horaire du circuit (heure locale dans la barre du haut avant le Grand Prix).
import { getJSON } from './net.js';

const cache = new Map();
export async function forecast(lat, lon, { get = getJSON, now = Date.now } = {}) {
  const la = Number(lat), lo = Number(lon);
  if (!Number.isFinite(la) || !Number.isFinite(lo) || Math.abs(la) > 90 || Math.abs(lo) > 180) throw new Error('Coordonnées invalides');
  const key = `${la.toFixed(2)},${lo.toFixed(2)}`;
  const hit = cache.get(key);
  if (hit && now() - hit.at < 3600e3) return hit.days;
  const q = new URLSearchParams({ latitude: la.toFixed(4), longitude: lo.toFixed(4), daily: 'temperature_2m_max,temperature_2m_min,precipitation_probability_max', timezone: 'auto', forecast_days: '16' });
  const j = await get(`https://api.open-meteo.com/v1/forecast?${q}`, { timeout: 15000 });
  const d = j?.daily || {};
  const days = (d.time || []).map((date, i) => ({ date, tmax: d.temperature_2m_max?.[i] ?? null, tmin: d.temperature_2m_min?.[i] ?? null, rain: d.precipitation_probability_max?.[i] ?? null }))
    .filter((x) => x.tmax !== null);
  days.tz = typeof j?.timezone === 'string' ? j.timezone : null;
  cache.set(key, { at: now(), days });
  return days;
}
