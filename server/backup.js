// Sauvegarde des réglages : partie gardée par le serveur (sources d'actualités décochées, lumières connectées,
// flux radio ajoutés). Jamais de jeton ni de clé : connexion F1 TV, accès du téléphone, clés des
// lumières (pont Hue, Home Assistant) restent sur l'ordinateur.
import { getConfig, saveConfig } from './config.js';
import { saveLights } from './lights.js';
import { allowHost } from './f1tv.js';
import { importNewsConfig } from './news.js';

const HOST = /^[a-z0-9-]+(\.[a-z0-9-]+)+(:\d{1,5})?$/i;

export function exportServerSettings(cfg = getConfig()) {
  const l = cfg.lights || {};
  return {
    news: { disabled: cfg.news?.disabled || [] },
    lights: {
      provider: l.provider || 'off',
      after: l.after || 'normal',
      hue: { ip: l.hue?.ip || '', lights: l.hue?.lights || [] },
      ha: { url: l.ha?.url || '', entities: l.ha?.entities || [] },
    },
    radioHosts: cfg.radioHosts || [],
  };
}

// Applique une sauvegarde (contenu revérifié : un fichier peut avoir été modifié à la main)
export function importServerSettings(data) {
  if (!data || typeof data !== 'object') return { ok: false };
  if (data.news && typeof data.news === 'object') importNewsConfig(data.news);
  if (data.lights && typeof data.lights === 'object') {
    const { provider, after, hue, ha } = data.lights;
    saveLights({
      provider, after,
      hue: hue && typeof hue === 'object' ? { ip: typeof hue.ip === 'string' && /^[\w.:-]{0,64}$/.test(hue.ip) ? hue.ip : undefined, lights: hue.lights } : undefined,
      ha: ha && typeof ha === 'object' ? { url: typeof ha.url === 'string' && (ha.url === '' || /^https?:\/\/[^\s]+$/i.test(ha.url)) ? ha.url : undefined, entities: ha.entities } : undefined,
    });
  }
  if (Array.isArray(data.radioHosts)) {
    const hosts = [...new Set([...(getConfig().radioHosts || []), ...data.radioHosts.filter((h) => typeof h === 'string' && HOST.test(h))])].slice(0, 100);
    saveConfig({ radioHosts: hosts });
    hosts.forEach(allowHost);
  }
  return { ok: true };
}
