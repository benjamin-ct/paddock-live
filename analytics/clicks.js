// Clics sur les liens des posts : liens suivis enregistrés à la publication, redirection /go/<id><réseau>
// avec comptage (par jour, réseau, pays et appareil ; ni cookie ni adresse IP), téléchargements de l'appli,
// et totaux pour les statistiques du Studio.
import { trackText, GO_RE, NET_OF } from '../shared/track-links.js';
import { PAGES, bioTarget } from './links/pages.mjs';

// Robots des réseaux (aperçus de liens) et moteurs : redirigés sans être comptés
const BOT = /bot|crawl|spider|slurp|preview|facebookexternalhit|meta-externalagent|cardyb|bluesky|embedly|whatsapp|telegram|discord|slack|skype|vkshare|pinterest|curl|wget|python|node-fetch|headless/i;
const deviceOf = (ua) => (/iPhone|iPad|Android|Mobile/i.test(ua) ? 'mobile' : 'desktop');
const dayOf = (t = Date.now()) => new Date(t).toISOString().slice(0, 10);

export function countClick(req, env, id, net) {
  const ua = req.headers.get('User-Agent') || '';
  if (!ua || BOT.test(ua)) return null;
  const country = String(req.cf?.country || '').slice(0, 2) || '?';
  return env.DB.prepare('INSERT INTO link_clicks (day, id, net, country, device, n) VALUES (?1, ?2, ?3, ?4, ?5, 1) ON CONFLICT (day, id, net, country, device) DO UPDATE SET n = n + 1')
    .bind(dayOf(), id, net, country, deviceOf(ua)).run().catch(() => null);
}

// Lien suivi : compté (sans attendre la base) puis renvoi vers l'adresse d'origine. Code « <id><réseau> »
// (lien d'un post) ou « <page>/<pictogramme> » (pages de liens en bio : /liens, /benjy)
export async function go(req, env, ctx, code) {
  let id; let net; let url;
  const bio = /^(\w+)\/(\w+)$/.exec(code);
  if (bio) {
    url = bioTarget(bio[1], bio[2])?.[1];
    [id, net] = [code, 'bio'];
  } else {
    const m = GO_RE.exec(code);
    url = m && (await env.DB.prepare('SELECT url FROM links WHERE id = ?1').bind(m[1]).first())?.url;
    [id, net] = [m?.[1], NET_OF[m?.[2]] || 'autre'];
  }
  if (!url) return new Response('Lien inconnu', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  const p = countClick(req, env, id, net);
  if (p) ctx?.waitUntil?.(p);
  return new Response(null, { status: 302, headers: { Location: url, 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } });
}

// Textes d'un post avec leurs liens suivis (adresses enregistrées) ; en cas d'erreur, textes d'origine
export async function trackPost(env, net, { text = '', comment = '' }, title = '') {
  try {
    const [t, c] = await Promise.all([trackText(text, net), trackText(comment, net)]);
    const links = [...t.links, ...c.links];
    if (links.length) {
      const stmt = env.DB.prepare('INSERT INTO links (id, url, title, at) VALUES (?1, ?2, ?3, ?4) ON CONFLICT (id) DO UPDATE SET title = CASE WHEN excluded.title <> \'\' THEN excluded.title ELSE links.title END');
      await env.DB.batch(links.map((l) => stmt.bind(l.id, l.url, String(title || '').slice(0, 200), Date.now())));
    }
    return { text: t.text, comment: c.text };
  } catch {
    return { text, comment };
  }
}

// Clics des `days` derniers jours : par lien (titre, adresse, total, réseaux, téléphone / ordinateur, pays)
export async function clickStats(env, days = 30) {
  const since = dayOf(Date.now() - (days - 1) * 86400e3);
  const rows = (await env.DB.prepare('SELECT c.id, c.net, c.country, c.device, SUM(c.n) AS n, l.url, l.title FROM link_clicks c LEFT JOIN links l ON l.id = c.id WHERE c.day >= ?1 GROUP BY c.id, c.net, c.country, c.device').bind(since).all()).results || [];
  const by = new Map();
  for (const r of rows) {
    const [page, key] = r.id.split('/');
    const bio = key && bioTarget(page, key);   // page de liens en bio
    const x = by.get(r.id) || { id: r.id, url: bio?.[1] || r.url || '', title: bio ? `${PAGES[page].name} (page de liens) · ${bio[0]}` : r.title || '', total: 0, nets: {}, devices: {}, countries: {} };
    x.total += r.n;
    x.nets[r.net] = (x.nets[r.net] || 0) + r.n;
    x.devices[r.device] = (x.devices[r.device] || 0) + r.n;
    x.countries[r.country] = (x.countries[r.country] || 0) + r.n;
    by.set(r.id, x);
  }
  return { days, links: [...by.values()].sort((a, b) => b.total - a.total).slice(0, 30) };
}
