// Studio : publication directe sur TikTok, selon les règles de TikTok pour l'audit de l'app : compte
// relu à l'ouverture, visibilité choisie sans valeur par défaut, interactions à cocher, contenu
// commercial déclaré, accord affiché avant de publier, rien d'envoyé sans confirmation. Sans
// l'autorisation video.publish, la vidéo part en brouillon (à finir dans l'appli TikTok).
import { $, $$, esc, api, toggle, toast, glide } from './ui.js';

export const TIKTOK_PRIVACY = { PUBLIC_TO_EVERYONE: 'Tout le monde', MUTUAL_FOLLOW_FRIENDS: 'Amis (abonnés mutuels)', FOLLOWER_OF_CREATOR: 'Abonnés', SELF_ONLY: 'Moi uniquement' };
const MUSIC = '<a href="https://www.tiktok.com/legal/page/global/music-usage-confirmation/en" target="_blank" rel="noopener">Confirmation d\'utilisation de la musique</a>';
const BRANDED = '<a href="https://www.tiktok.com/legal/page/global/bc-policy/en" target="_blank" rel="noopener">Politique relative au contenu de marque</a>';
const LABEL = 'Indiquez si votre contenu fait votre promotion, celle d\'un tiers, ou les deux.';

// Choix de la vidéo en cours (gardés quand l'éditeur redessine) ; compte relu au plus toutes les 20 s
let cur = { video: null, mode: 'draft', title: null, privacy: '', comment: false, duet: false, stitch: false, biz: false, own: false, brand: false, info: null, at: 0, duration: 0 };

// box : emplacement ; text : texte proposé (modifiable) ; onChange() : état à relire (tiktokProblem)
export function tiktokPanel(box, video, text, onChange) {
  if (cur.video !== video) {
    cur = { ...cur, video, mode: 'draft', title: null, privacy: '', comment: false, duet: false, stitch: false, biz: false, own: false, brand: false, duration: 0 };
    const v = document.createElement('video');
    v.preload = 'metadata';
    v.onloadedmetadata = () => { cur.duration = v.duration || 0; URL.revokeObjectURL(v.src); render(); };
    v.src = URL.createObjectURL(video);
  }
  if (cur.title === null) cur.title = String(text || '').slice(0, 2200);
  const render = () => {
    if (!box.isConnected) return;
    const i = cur.info;
    const direct = cur.mode === 'direct';
    const opts = i?.privacy || [];
    box.innerHTML = `<div class="seg wide" id="tkmode"><button data-tkmode="draft" class="${direct ? '' : 'on'}">Brouillon</button><button data-tkmode="direct" class="${direct ? 'on' : ''}">Publier directement</button></div>
      ${!direct ? '<p class="hint">Brouillon : la vidéo arrive dans votre boîte de réception TikTok, vous ajoutez le son et le texte puis publiez dans l\'appli TikTok.</p>'
        : !i ? '<p class="hint">Lecture du compte TikTok…</p>'
        : i.error ? `<p class="hint err">${esc(i.error)}</p>`
        : `<p class="tk-who">Publié sur le compte <b>${esc(i.nickname || i.username)}</b>${i.username ? ` <small>@${esc(i.username)}</small>` : ''}</p>
      <label class="field"><span>Texte de la vidéo <small data-count="tktitle"></small></span><textarea id="tktitle" rows="4" maxlength="2200">${esc(cur.title)}</textarea></label>
      <label class="field"><span>Qui peut voir cette vidéo</span><select id="tkprivacy"><option value="" ${cur.privacy ? '' : 'selected'} disabled>Choisir…</option>
        ${opts.map((k) => { const off = k === 'SELF_ONLY' && cur.brand; return `<option value="${k}" ${cur.privacy === k ? 'selected' : ''} ${off ? 'disabled title="La visibilité d\'un contenu de marque ne peut pas être privée."' : ''}>${TIKTOK_PRIVACY[k]}${off ? ' (impossible pour un contenu de marque)' : ''}</option>`; }).join('')}</select></label>
      ${opts.length === 1 && opts[0] === 'SELF_ONLY' ? '<p class="hint">Seul « Moi uniquement » est proposé : votre compte TikTok est privé, ou votre app TikTok n\'a pas encore passé l\'audit de TikTok.</p>' : ''}
      <h3 class="section">Autoriser les utilisateurs à</h3>
      ${[['comment', 'Commenter'], ['duet', 'Faire un Duo'], ['stitch', 'Faire un Collage (Stitch)']].map(([k, l]) => toggle(`tk-${k}`, l, i[k] && cur[k], i[k] ? '' : 'Désactivé dans vos réglages TikTok', i[k] ? '' : 'disabled')).join('')}
      ${toggle('tk-biz', 'Contenu commercial', cur.biz, 'Cette vidéo fait la promotion d\'une marque, d\'un produit ou d\'un service')}
      ${cur.biz ? `${toggle('tk-own', 'Votre marque', cur.own, 'Vous faites la promotion de vous-même ou de votre propre activité')}
        ${toggle('tk-brand', 'Contenu de marque', cur.brand, 'Vous faites la promotion d\'une autre marque ou d\'un tiers')}
        <p class="hint">${cur.brand ? 'Votre vidéo sera étiquetée « Partenariat rémunéré ».' : cur.own ? 'Votre vidéo sera étiquetée « Contenu promotionnel ».' : LABEL}</p>` : ''}
      <p class="hint">${cur.brand ? `En publiant, vous acceptez la ${BRANDED} et la ${MUSIC} de TikTok.` : `En publiant, vous acceptez la ${MUSIC} de TikTok.`}</p>
      <p class="hint">Après l'envoi, TikTok peut mettre quelques minutes à traiter la vidéo avant qu'elle apparaisse sur votre profil.</p>`}
      <p class="hint err" id="tkwhy" ${tiktokProblem() ? '' : 'hidden'}>${esc(tiktokProblem() || '')}</p>`;
    glide(box);
    $$('[data-tkmode]', box).forEach((b) => { b.onclick = () => { cur.mode = b.dataset.tkmode; load(); render(); }; });
    const title = $('#tktitle', box);
    if (title) {
      const count = () => { $('[data-count="tktitle"]', box).textContent = `${title.value.length} / 2200`; };
      count();
      title.oninput = () => { cur.title = title.value; count(); };
    }
    if ($('#tkprivacy', box)) $('#tkprivacy', box).onchange = (e) => { cur.privacy = e.target.value; render(); };
    for (const k of ['comment', 'duet', 'stitch', 'biz', 'own', 'brand']) {
      const el = $(`#tk-${k}`, box);
      if (el) el.onchange = () => {
        cur[k] = el.checked;
        if (k === 'biz' && !el.checked) Object.assign(cur, { own: false, brand: false });
        // Contenu de marque : jamais privé, la visibilité « Moi uniquement » est retirée
        if (k === 'brand' && el.checked && cur.privacy === 'SELF_ONLY') { cur.privacy = ''; toast('La visibilité d\'un contenu de marque ne peut pas être privée : choisissez une autre visibilité', 'bad'); }
        render();
      };
    }
    onChange();
  };
  // Compte relu à chaque ouverture du mode direct (au plus toutes les 20 s)
  const load = () => {
    if (cur.mode !== 'direct' || (cur.info && !cur.info.error && Date.now() - cur.at < 20e3)) return;
    cur.info = null;
    api('tiktok-creator').then((i) => { cur.info = i; cur.at = Date.now(); }, (err) => { cur.info = { error: err.message }; }).then(render);
  };
  load();
  render();
}

// Ce qui empêche la publication directe (texte du refus), sinon null
export function tiktokProblem() {
  if (cur.mode !== 'direct') return null;
  const i = cur.info;
  if (!i) return 'Lecture du compte TikTok…';
  if (i.error) return i.error;
  if (i.maxDuration && cur.duration > i.maxDuration) return `Vidéo trop longue pour ce compte TikTok (${i.maxDuration} s au plus)`;
  if (!cur.privacy) return 'Choisissez qui peut voir la vidéo sur TikTok';
  if (cur.biz && !cur.own && !cur.brand) return LABEL;
  return null;
}

// Réglages envoyés au serveur pour une publication directe, null pour un brouillon
export function tiktokChoice() {
  if (cur.mode !== 'direct' || tiktokProblem()) return null;
  return { title: cur.title, privacy: cur.privacy, comment: cur.comment, duet: cur.duet, stitch: cur.stitch, brandOrganic: cur.biz && cur.own, brandContent: cur.biz && cur.brand, username: cur.info.username };
}
