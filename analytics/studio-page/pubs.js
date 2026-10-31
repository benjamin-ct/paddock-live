// Studio : onglet Publications. Nouveaux posts (écrit à la main, Paddock Live), « Reste à faire » (ce qui se finit à la main : X, brouillon TikTok, Short
// privé…), puis les publications programmées ou en cours (état de chaque réseau, Réessayer, Modifier), puis les
// posts publiés ces 7 derniers jours avec leurs liens.
import { $, $$, esc, api, ago, icon, toast, empty, skeleton, schedList, NET_NAMES } from './ui.js';
import { shareToX, X_SUITE } from './publish.js';

const OPEN = { tiktok: ['Ouvrir TikTok', 'https://www.tiktok.com/'], youtube: ['Ouvrir YouTube Studio', 'https://studio.youtube.com/'] };
const when = (t) => new Date(t).toLocaleString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });

// start : cartes « Écrire un post » et « Post Paddock Live » ({ html, bind(body) }, branchées par app.js)
export async function pubsTab(body, { current }, start) {
  body.innerHTML = `${start.html}<div id="todos">${skeleton(2)}</div><div id="schedlist"></div><div id="published"></div>`;
  start.bind(body);
  const [todo, hist] = await Promise.all([api('todo').catch(() => null), api('history').catch(() => null)]);
  if (!current()) return;
  renderTodos($('#todos', body), todo?.items || []);
  await schedList($('#schedlist', body));
  const week = (hist?.items || []).filter((e) => e.at > Date.now() - 7 * 86400e3).sort((a, b) => b.at - a.at);
  $('#published', body).innerHTML = `<h3 class="section">Publiés ces 7 derniers jours</h3>${week.length ? `<div class="list">${week.map((e) => `<div class="card"><div class="card-top"><time>il y a ${esc(ago(e.at))}</time></div><div class="t">${esc(e.title || 'Post')}</div>
    <div class="row">${Object.entries(e.nets || {}).map(([n, x]) => (x?.url ? `<a class="pill ok" href="${esc(x.url)}" target="_blank" rel="noopener">${esc(NET_NAMES[n] || n)} ${icon('link')}</a>` : `<span class="pill">${esc(NET_NAMES[n] || n)}</span>`)).join('')}</div></div>`).join('')}</div>` : empty('Rien de publié ces 7 derniers jours.', 'send')}`;
}

function renderTodos(el, items) {
  const now = Date.now();
  el.innerHTML = `<h3 class="section">Reste à faire${items.length ? ` · ${items.length}` : ''}</h3>${items.length ? `<div class="list">${items.map((t) => `<div class="card todo" data-todo="${esc(t.id)}">
      <div class="card-top"><span class="pill${t.after > now ? '' : ' warn'}">${t.after > now ? `à partir du ${esc(when(t.after))}` : 'à faire'}</span></div>
      <div class="t">${esc(t.title)}</div>
      ${t.text ? `<p class="todo-text">${esc(t.text)}</p>` : ''}
      <div class="row">${t.kind === 'x' ? `<button class="btn primary small" data-x>${icon('send')}Ouvrir X${t.files?.length ? (t.files[0].type.startsWith('video/') ? ' avec la vidéo' : ' avec les images') : ''}</button>` : ''}
        ${t.kind === 'x' && t.text.includes(X_SUITE) ? `<button class="btn small" data-x="suite">${icon('send')}Ouvrir X avec la suite</button>` : ''}
        ${OPEN[t.kind] ? `<a class="btn small" href="${OPEN[t.kind][1]}" target="_blank" rel="noopener">${icon('link')}${OPEN[t.kind][0]}</a>` : ''}
        ${t.text ? `<button class="btn small" data-copy>${icon('copy')}Copier le texte</button>` : ''}
        <button class="btn small" data-done>${icon('check')}Fait</button></div></div>`).join('')}</div>`
    : '<p class="hint">Rien à finir à la main. Les rappels X, les brouillons TikTok et les Shorts privés arrivent ici après une publication.</p>'}`;
  for (const card of $$('[data-todo]', el)) {
    const t = items.find((x) => x.id === card.dataset.todo);
    if ($('[data-copy]', card)) $('[data-copy]', card).onclick = () => navigator.clipboard.writeText(t.text).then(() => toast('Texte copié', 'ok'), () => toast('Copie impossible', 'bad'));
    for (const b of $$('[data-x]', card)) {
      b.onclick = async () => {
        b.classList.add('busy'); b.disabled = true;
        try {
          // Fichiers gardés par le serveur, puis partage vers X (texte copié) : le post, ou sa suite (fichiers
          // x-suite-…, texte sous « Suite, à poster en réponse au post »)
          const suite = b.dataset.x === 'suite';
          const list = (t.files || []).map((f, i) => ({ ...f, i })).filter((f) => /^x-suite-/.test(f.name || '') === suite);
          const files = await Promise.all(list.map(async (f) => new File([await (await api(`todo/file?id=${t.id}&i=${f.i}`, { raw: true })).blob()], f.name || `x-${f.i + 1}`, { type: f.type })));
          const parts = t.text.split('\n\n— ');
          await shareToX(files, suite ? parts.find((p) => p.startsWith(X_SUITE.slice(2))).split('\n').slice(1).join('\n') : parts[0]);
        } catch (err) { toast(err.message, 'bad'); } finally { b.classList.remove('busy'); b.disabled = false; }
      };
    }
    $('[data-done]', card).onclick = async () => {
      try { renderTodos(el, (await api('todo/done', { method: 'POST', body: JSON.stringify({ id: t.id }) })).items || []); toast('Fait', 'ok'); } catch (err) { toast(err.message, 'bad'); }
    };
  }
}
