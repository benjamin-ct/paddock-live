// Envoi des vidéos verticales du créateur : brouillon TikTok (à finir dans l'appli TikTok) et Short
// YouTube envoyé en privé. Code partagé par l'appli de bureau et la page web du créateur (Studio) ;
// les jetons sont renouvelés ici et rendus à l'appelant, qui les enregistre.
import { call } from './meta-publish.js';

const TIKTOK = 'https://open.tiktokapis.com/v2';
const GOOGLE_TOKEN = 'https://oauth2.googleapis.com/token';
export const YOUTUBE = 'https://www.googleapis.com/youtube/v3';

// Jetons TikTok et Google : formulaire envoyé avec « application/x-www-form-urlencoded » tout court.
// TikTok refuse l'en-tête que fetch met de lui-même (« …;charset=UTF-8 ») : « invalid_request ».
export async function formOAuth(url, form, fetchFn = fetch) {
  const res = await fetchFn(url, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(form).toString(), signal: AbortSignal.timeout(30000),
  });
  let d = {};
  try { d = JSON.parse(await res.text()); } catch { /* réponse illisible */ }
  if (!res.ok || d.error || !d.access_token) {
    const why = [d.error, d.error_description].filter(Boolean).join(' : ') || `HTTP ${res.status}`;
    const e = new Error(String(why).slice(0, 300));
    e.code = d.error || '';
    throw e;
  }
  return d;
}
export const tiktokOAuth = (form, fetchFn) => formOAuth(`${TIKTOK}/oauth/token/`, form, fetchFn);
export const googleOAuth = (form, fetchFn) => formOAuth(GOOGLE_TOKEN, form, fetchFn);

// Jetons gardés à jour : le même objet s'il est encore valable 5 minutes, sinon un nouvel objet
export const tiktokTokens = (t, r) => ({ ...t, accessToken: r.access_token, expiresAt: Date.now() + (r.expires_in || 86400) * 1000, refreshToken: r.refresh_token || t.refreshToken, openId: r.open_id || t.openId });
export async function freshTiktok(t) {
  if (!t?.refreshToken) throw new Error('Compte TikTok non connecté');
  if (t.accessToken && t.expiresAt - Date.now() > 5 * 60e3) return t;
  return tiktokTokens(t, await tiktokOAuth({ client_key: t.clientKey, client_secret: t.clientSecret, grant_type: 'refresh_token', refresh_token: t.refreshToken }));
}
export const youtubeTokens = (y, r) => ({ ...y, accessToken: r.access_token, expiresAt: Date.now() + (r.expires_in || 3600) * 1000, refreshToken: r.refresh_token || y.refreshToken });
// Accès retiré ou expiré chez Google (projet en mode « Test » : 7 jours) : erreur avec code invalid_grant
export async function freshYoutube(y) {
  if (!y?.refreshToken) throw new Error('Compte YouTube non connecté');
  if (y.accessToken && y.expiresAt - Date.now() > 5 * 60e3) return y;
  return youtubeTokens(y, await googleOAuth({ client_id: y.clientId, client_secret: y.clientSecret, grant_type: 'refresh_token', refresh_token: y.refreshToken }));
}

// Brouillon TikTok (boîte de réception de l'appli TikTok) ; video : octets (Uint8Array ou Buffer).
// Après l'envoi, TikTok traite la vidéo : son état est relu (reçue, refusée et pourquoi, ou encore en
// traitement) pour ne pas annoncer un brouillon qui n'arrivera jamais.
export const draftTiming = { poll: 3000, max: 60000 };
const TIKTOK_FAIL = {
  file_format_check_failed: 'format de la vidéo refusé', duration_check_failed: 'durée de la vidéo refusée',
  frame_rate_check_failed: 'nombre d\'images par seconde refusé', picture_size_check_failed: 'taille de l\'image refusée',
  spam_risk_too_many_pending_share: 'trop de brouillons en attente dans TikTok : publiez ou supprimez les précédents',
  spam_risk_user_banned_from_posting: 'compte TikTok privé de publication pour le moment',
  spam_risk: 'envoi bloqué par TikTok (trop d\'envois rapprochés)', app_version_check_failed: 'appli TikTok trop ancienne : mettez-la à jour',
};
// Refus d'une publication directe (code de l'erreur TikTok) : ce qu'il faut faire
const TIKTOK_REFUSED = {
  unaudited_client_can_only_post_to_private_accounts: 'App TikTok pas encore auditée : en publication directe, TikTok n\'accepte que « Moi uniquement » sur un compte privé. Choisissez « Brouillon », ou passez le compte TikTok en privé et choisissez « Moi uniquement », en attendant l\'audit.',
  privacy_level_option_mismatch: 'Visibilité refusée par TikTok pour ce compte : choisissez-en une autre',
  spam_risk_too_many_posts: 'Limite de publications du jour atteinte sur ce compte TikTok : réessayez demain',
  spam_risk_user_banned_from_posting: 'Compte TikTok privé de publication pour le moment',
};
// État d'un envoi chez TikTok : { status, fail_reason } ; lecture impossible -> { error }
export async function tiktokStatus(token, id) {
  try {
    const d = (await call(`${TIKTOK}/post/publish/status/fetch/`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, json: { publish_id: id } }))?.data || {};
    return { status: d.status || 'inconnu', fail_reason: d.fail_reason || '', post: d.publicaly_available_post_id?.[0] ? String(d.publicaly_available_post_id[0]) : '' };
  } catch (err) { return { error: String(err?.message || err).slice(0, 200) }; }
}
// ---------- Publication directe (autorisation video.publish) ----------
// Tant que l'app TikTok du créateur n'a pas passé l'audit de TikTok, seul « Moi uniquement » est accepté,
// sur un compte privé. Règles de TikTok suivies par le Studio : compte relu avant chaque publication,
// visibilité choisie sans valeur par défaut, interactions à cocher, contenu commercial déclaré.
export const TIKTOK_PRIVACY = ['PUBLIC_TO_EVERYONE', 'MUTUAL_FOLLOW_FRIENDS', 'FOLLOWER_OF_CREATOR', 'SELF_ONLY'];
export async function tiktokCreator(token) {
  const d = (await call(`${TIKTOK}/post/publish/creator_info/query/`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, json: {} }))?.data || {};
  return {
    nickname: d.creator_nickname || '', username: d.creator_username || '', avatar: d.creator_avatar_url || '',
    privacy: (d.privacy_level_options || []).filter((x) => TIKTOK_PRIVACY.includes(x)),
    comment: !d.comment_disabled, duet: !d.duet_disabled, stitch: !d.stitch_disabled,
    maxDuration: Number(d.max_video_post_duration_sec) || 0,
  };
}
// o : { title, privacy, comment, duet, stitch, brandOrganic, brandContent } (interactions autorisées : true)
export async function tiktokDirect(token, video, mime = 'video/mp4', o = {}) {
  if (!video?.length) throw new Error('Vidéo manquante');
  const auth = { Authorization: `Bearer ${token}` };
  const init = await call(`${TIKTOK}/post/publish/video/init/`, { method: 'POST', headers: auth, json: {
    post_info: { title: String(o.title || '').slice(0, 2200), privacy_level: o.privacy, disable_comment: !o.comment, disable_duet: !o.duet, disable_stitch: !o.stitch, brand_organic_toggle: !!o.brandOrganic, brand_content_toggle: !!o.brandContent },
    source_info: { source: 'FILE_UPLOAD', video_size: video.length, chunk_size: video.length, total_chunk_count: 1 },
  } }).catch((err) => { throw TIKTOK_REFUSED[err.code] ? new Error(TIKTOK_REFUSED[err.code]) : err; });
  const res = await fetch(init.data.upload_url, { method: 'PUT', headers: { 'Content-Type': mime, 'Content-Range': `bytes 0-${video.length - 1}/${video.length}` }, body: video, signal: AbortSignal.timeout(300000) });
  if (!res.ok) throw new Error(`Envoi de la vidéo refusé par TikTok (HTTP ${res.status})`);
  const id = init.data.publish_id;
  let s = { status: 'inconnu' };
  for (const t0 = Date.now(); id && Date.now() - t0 < draftTiming.max;) {
    await new Promise((r) => setTimeout(r, draftTiming.poll));
    s = await tiktokStatus(token, id);
    if (s.status === 'FAILED' || s.status === 'PUBLISH_COMPLETE') break;
  }
  return tiktokOutcome(id, s, o);
}
const INBOX = 'ouvrez la notification dans TikTok (Boîte de réception → Notifications système) pour ajouter un son et publier';
// État lu -> résultat ({ url, id, note, pending }) ou erreur levée si TikTok a refusé la vidéo.
// direct : réglages d'une publication directe (sinon brouillon) ; username : compte, pour le lien
export function tiktokOutcome(id, s, direct = null) {
  if (s.status === 'FAILED') throw new Error(`TikTok a refusé la vidéo : ${TIKTOK_FAIL[s.fail_reason] || s.fail_reason || 'raison inconnue'}`);
  if (direct && s.status === 'PUBLISH_COMPLETE') {
    return { url: s.post && direct.username ? `https://www.tiktok.com/@${direct.username}/video/${s.post}` : null, id,
      note: direct.privacy === 'SELF_ONLY' ? 'Publiée, visible par vous seul' : 'Publiée : TikTok peut mettre quelques minutes à l\'afficher sur votre profil' };
  }
  if (!direct && (s.status === 'SEND_TO_USER_INBOX' || s.status === 'PUBLISH_COMPLETE')) return { url: null, id, note: `Brouillon reçu par TikTok : ${INBOX}` };
  const why = s.error ? `état illisible : ${s.error}` : `état TikTok : ${s.status}`;
  return { url: null, id, pending: true, note: `Vidéo envoyée, encore en traitement chez TikTok (${why}) : vérifiez l'état dans quelques minutes` };
}

export async function tiktokDraft(token, video, mime = 'video/mp4') {
  if (!video?.length) throw new Error('Vidéo manquante');
  const auth = { Authorization: `Bearer ${token}` };
  const init = await call(`${TIKTOK}/post/publish/inbox/video/init/`, { method: 'POST', headers: auth, json: { source_info: { source: 'FILE_UPLOAD', video_size: video.length, chunk_size: video.length, total_chunk_count: 1 } } });
  const res = await fetch(init.data.upload_url, { method: 'PUT', headers: { 'Content-Type': mime, 'Content-Range': `bytes 0-${video.length - 1}/${video.length}` }, body: video, signal: AbortSignal.timeout(300000) });
  if (!res.ok) throw new Error(`Envoi de la vidéo refusé par TikTok (HTTP ${res.status}${res.status >= 400 ? ` : ${(await res.text().catch(() => '')).slice(0, 120)}` : ''})`);
  const id = init.data.publish_id;
  if (!id) return { url: null, note: `Vidéo envoyée : ${INBOX}` };
  let s = { status: 'inconnu' };
  for (const t0 = Date.now(); Date.now() - t0 < draftTiming.max;) {
    await new Promise((r) => setTimeout(r, draftTiming.poll));
    s = await tiktokStatus(token, id);
    if (s.status === 'FAILED' || s.status === 'SEND_TO_USER_INBOX' || s.status === 'PUBLISH_COMPLETE') break;
  }
  return tiktokOutcome(id, s);
}

// Titre (1re ligne, 100 caractères) et description : YouTube refuse les chevrons
export function youtubeSnippet(text) {
  const clean = String(text || '').replace(/[<>]/g, '').trim();
  const lines = clean.split('\n');
  const title = [...(lines[0] || '').trim()].slice(0, 100).join('').trim() || 'Paddock';
  let description = lines.slice(1).join('\n').trim();
  if (!/#shorts\b/i.test(clean)) description = `${description}${description ? '\n\n' : ''}#Shorts`;
  return { title, description: [...description].slice(0, 4900).join(''), categoryId: '17' };
}

// Short envoyé en privé (envoi par reprise). Projet Google sans audit de l'API YouTube : YouTube
// verrouille la vidéo en privé (impossible de la rendre publique) ; après l'audit, elle se rend
// publique dans YouTube Studio.
export async function youtubeUpload(token, video, mime, text) {
  if (!video?.length) throw new Error('Vidéo manquante');
  const init = await fetch('https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json; charset=UTF-8', 'X-Upload-Content-Length': String(video.length), 'X-Upload-Content-Type': mime },
    body: JSON.stringify({ snippet: youtubeSnippet(text), status: { privacyStatus: 'private', selfDeclaredMadeForKids: false } }),
    signal: AbortSignal.timeout(30000),
  });
  const where = init.headers.get('location');
  if (!init.ok || !where) {
    const j = await init.json().catch(() => ({}));
    const why = j.error?.errors?.[0]?.reason === 'quotaExceeded' ? 'quota du jour de l\'API YouTube atteint, réessayez demain' : j.error?.message || `HTTP ${init.status}`;
    throw new Error(`Envoi refusé par YouTube : ${why}`);
  }
  const res = await fetch(where, { method: 'PUT', headers: { 'Content-Type': mime }, body: video, signal: AbortSignal.timeout(600000) });
  const v = await res.json().catch(() => ({}));
  if (!res.ok || !v.id) throw new Error(`Envoi de la vidéo refusé par YouTube (${v.error?.message || `HTTP ${res.status}`})`);
  return { url: `https://youtube.com/shorts/${v.id}`, id: v.id, note: 'Short envoyé en privé (verrouillé par YouTube tant que votre projet Google n\'a pas passé l\'audit de l\'API YouTube)' };
}
