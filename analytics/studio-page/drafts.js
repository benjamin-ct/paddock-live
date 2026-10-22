// Brouillons de posts (gardés sur le serveur, partagés avec l'appli) : liste, reprise dans l'éditeur,
// suppression
import { $, $$, esc, api, ago, icon, sheet, toast, state, SIG } from './ui.js';
import { editor } from './editor.js';
import { captionsFor, unpackDraftImages } from '/shared/post-draft.js';

export const draftList = () => api('drafts').then((r) => r.items || []);

// Feuille des brouillons : toucher pour reprendre, croix pour supprimer
export async function draftsSheet(back, onChange = () => {}) {
  const items = await draftList();
  const dlg = sheet('Brouillons', items.length ? `<div class="list">${items.map((x) => `<div class="draftrow" data-id="${esc(x.id)}">
      <button class="card news" data-open><div class="t">${esc(x.title)}</div><div class="meta">Enregistré il y a ${esc(ago(x.at))}</div></button>
      <button class="iconbtn boxed" data-del aria-label="Supprimer le brouillon" title="Supprimer le brouillon">${icon('close')}</button></div>`).join('')}</div>`
    : '<p class="hint">Aucun brouillon. Dans un post, « Brouillon » le garde ici pour plus tard (aussi dans l\'appli).</p>');
  $$('[data-open]', dlg).forEach((b) => {
    b.onclick = async () => {
      b.classList.add('busy');
      try { await openDraft(b.closest('[data-id]').dataset.id, back); dlg.close(); } catch (err) { toast(err.message, 'bad'); } finally { b.classList.remove('busy'); }
    };
  });
  $$('[data-del]', dlg).forEach((b) => {
    b.onclick = async () => {
      const row = b.closest('[data-id]');
      if (!confirm(`Supprimer le brouillon « ${$('.t', row).textContent} » ?`)) return;
      try { onChange((await api('drafts/remove', { method: 'POST', body: JSON.stringify({ id: row.dataset.id }) })).items || []); row.remove(); } catch (err) { toast(err.message, 'bad'); }
    };
  });
}

// Brouillon repris : mêmes données, images écartées, format, options et textes retouchés
export async function openDraft(id, back) {
  const dr = await api(`draft?id=${encodeURIComponent(id)}`);
  const d = await unpackDraftImages(dr.d);
  Object.assign(state, dr.opts, { fmt: dr.fmt });
  editor({
    back, title: dr.title, subtitle: 'Brouillon', data: () => d,
    caps: (dd) => captionsFor(dd, SIG, { spoiler: !state.noSpoiler, linkInComment: state.linkComment && state.fmt !== 'link' }),
    record: () => ({ key: dr.key, kind: dr.kind, title: dr.title }), draft: dr,
  });
}
