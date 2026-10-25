// Onglet « Suivi » du Studio : le dossier Google Drive du suivi (« Paddock Live · Réseaux ») lu par le
// serveur, en lecture seule. Connexion Google faite depuis le Studio (retour sur la page /studio/),
// jetons gardés dans le coffre chiffré avec la clé du créateur.
// Le compte Google du Drive peut être un autre que celui de YouTube : Google demande toujours lequel
// utiliser, avec le même client Google (projet de YouTube).
import { googleOAuth, youtubeTokens } from '../shared/video-publish.js';

const FOLDER = 'Paddock Live · Réseaux';
const SCOPE = 'https://www.googleapis.com/auth/drive.readonly';
const API = 'https://www.googleapis.com';
const ID = /^[\w-]{10,100}$/;

const json = (d, status = 200) => new Response(JSON.stringify(d), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
const b64url = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const random = (n) => b64url(crypto.getRandomValues(new Uint8Array(n)));

// Jeton d'accès valable (renouvelé dans ses 5 dernières minutes) ; coffre réenregistré s'il change
async function token(vault, save) {
  const g = vault.gdrive;
  if (g.accessToken && g.expiresAt - Date.now() > 5 * 60e3) return g.accessToken;
  const next = youtubeTokens(g, await googleOAuth({ client_id: g.clientId, client_secret: g.clientSecret, grant_type: 'refresh_token', refresh_token: g.refreshToken }));
  await save({ ...vault, gdrive: next });
  return next.accessToken;
}

async function google(path, at) {
  const res = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${at}` }, signal: AbortSignal.timeout(20000) });
  const d = await res.json().catch(() => ({}));
  if (!res.ok) {
    const why = d.error?.message || `HTTP ${res.status}`;
    // API pas encore activée dans le projet Google : le message de Google le dit, avec le lien
    throw Object.assign(new Error(`Google : ${why}`.slice(0, 400)), { status: res.status === 404 ? 404 : 502 });
  }
  return d;
}

export async function driveApi(sub, req, url, vault, save) {
  if (sub === 'start' && req.method === 'POST') {
    let body;
    try { body = await req.json(); } catch { return json({ error: 'JSON invalide' }, 400); }
    let redirect;
    try { redirect = new URL(body?.redirect); } catch { redirect = null; }
    if (!redirect || redirect.protocol !== 'https:' || redirect.pathname !== '/studio/' || redirect.search || redirect.hash) return json({ error: 'Adresse de retour invalide' }, 400);
    // Client Google : celui donné, sinon celui de YouTube (même projet Google)
    const clientId = String(body.clientId || vault.youtube?.clientId || '').trim();
    const clientSecret = String(body.clientSecret || (clientId === vault.youtube?.clientId ? vault.youtube?.clientSecret : '') || '').trim();
    if (!clientId || !clientSecret) return json({ error: 'Renseignez l\'ID client et le code secret Google' }, 400);
    const verifier = random(48);
    const state = random(16);
    const challenge = b64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
    await save({ ...vault, gdrivePending: { state, verifier, redirect: redirect.href, clientId, clientSecret, at: Date.now() } });
    return json({ url: `https://accounts.google.com/o/oauth2/v2/auth?${new URLSearchParams({
      client_id: clientId, redirect_uri: redirect.href, response_type: 'code', state, scope: SCOPE,
      code_challenge: challenge, code_challenge_method: 'S256', access_type: 'offline', prompt: 'select_account consent',
    })}` });
  }
  if (sub === 'finish' && req.method === 'POST') {
    let body;
    try { body = await req.json(); } catch { return json({ error: 'JSON invalide' }, 400); }
    const p = vault.gdrivePending;
    if (!p || p.state !== body?.state || Date.now() - p.at > 15 * 60e3) return json({ error: 'Demande de connexion expirée : recommencez depuis l\'onglet Suivi' }, 400);
    const { gdrivePending, ...rest } = vault;
    let r;
    try {
      r = await googleOAuth({ client_id: p.clientId, client_secret: p.clientSecret, code: String(body.code || ''), grant_type: 'authorization_code', redirect_uri: p.redirect, code_verifier: p.verifier });
    } catch (err) {
      await save(rest);
      return json({ error: `Google a refusé la connexion : ${err.message}` }, 502);
    }
    if (!r.refresh_token) { await save(rest); return json({ error: 'Google n\'a pas donné d\'accès durable : recommencez la connexion' }, 502); }
    await save({ ...rest, gdrive: youtubeTokens({ clientId: p.clientId, clientSecret: p.clientSecret }, r) });
    return json({ ok: true });
  }
  if (sub === 'forget' && req.method === 'POST') {
    const { gdrive, gdrivePending, ...rest } = vault;
    await save(rest);
    return json({ ok: true });
  }
  if (req.method !== 'GET' || !['files', 'doc', 'values'].includes(sub)) return json({ error: 'Introuvable' }, 404);
  if (!vault.gdrive?.refreshToken) return json({ connected: false, youtubeClient: !!vault.youtube?.clientId });

  let at;
  try { at = await token(vault, save); } catch (err) {
    // Accès retiré ou expiré (projet Google en mode « Test » : 7 jours) : il faut se reconnecter
    if (err.code === 'invalid_grant') {
      const { gdrive, ...rest } = vault;
      await save(rest);
      return json({ connected: false, expired: true, youtubeClient: !!vault.youtube?.clientId });
    }
    return json({ error: `Google : ${err.message}` }, 502);
  }
  try {
    if (sub === 'files') {
      const q = (s) => new URLSearchParams({ q: s, fields: 'files(id,name,mimeType,createdTime,modifiedTime)', pageSize: '100', orderBy: 'name' });
      const folder = (await google(`/drive/v3/files?${q(`name = '${FOLDER}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`)}`, at)).files?.[0];
      if (!folder) return json({ connected: true, folder: null, files: [] });
      const files = (await google(`/drive/v3/files?${q(`'${folder.id}' in parents and trashed = false`)}`, at)).files || [];
      return json({ connected: true, folder: { id: folder.id, name: folder.name }, files });
    }
    const id = url.searchParams.get('id') || '';
    if (!ID.test(id)) return json({ error: 'Document invalide' }, 400);
    if (sub === 'doc') return json(await google(`/docs/v1/documents/${id}?includeTabsContent=true`, at));
    const range = url.searchParams.get('range') || '';
    if (!range || range.length > 100) return json({ error: 'Plage invalide' }, 400);
    return json(await google(`/v4/spreadsheets/${id}/values/${encodeURIComponent(range)}`, at));
  } catch (err) {
    return json({ error: err.message }, err.status || 502);
  }
}
