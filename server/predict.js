// Pronostics entre amis : dans un groupe en ligne seulement (page paddocklive.app/p/<groupe>), comme la version web.
// Demandes relayées au serveur Paddock Live. path : 'new' (création) ou l'identifiant du groupe.
import { request } from './net.js';

export const PRONOS_URL = process.env.PADDOCK_PRONOS_URL ?? 'https://paddock-live-stats.paddock-live.workers.dev/p/api';
export async function pronosOnline(method, path, { query = '', body = null } = {}) {
  if (!/^(new|[a-z0-9]{10})$/.test(path)) return { status: 400, data: { error: 'Groupe inconnu' } };
  const data = body ? JSON.stringify(body) : undefined;
  const r = await request(`${PRONOS_URL}/${path}${query}`, { method, timeout: 30000, ...(data ? { body: data, headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } } : {}) });
  let out;
  try { out = JSON.parse(r.body.toString('utf8')); } catch { out = { error: `Serveur Paddock Live indisponible (HTTP ${r.status})` }; }
  return { status: r.status, data: out };
}
