// Curseurs (volume, seuil, temps perdu…) : la piste est remplie jusqu'à la valeur (variable CSS --fill, style.css),
// tenue à jour quand on déplace le curseur, quand un curseur apparaît et quand le code change sa valeur
const fill = (el) => {
  const min = Number(el.min) || 0, max = el.max === '' ? 100 : Number(el.max);
  el.style.setProperty('--fill', `${Math.min(100, Math.max(0, ((Number(el.value) - min) / (max - min || 1)) * 100))}%`);
};
const scan = (root) => { if (root.matches?.('input[type=range]')) fill(root); root.querySelectorAll?.('input[type=range]').forEach(fill); };

document.addEventListener('input', (e) => { if (e.target.type === 'range') fill(e.target); }, true);
new MutationObserver((list) => { for (const m of list) m.addedNodes.forEach((n) => n.nodeType === 1 && scan(n)); })
  .observe(document.documentElement, { childList: true, subtree: true });
const desc = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
Object.defineProperty(HTMLInputElement.prototype, 'value', { ...desc, set(v) { desc.set.call(this, v); if (this.type === 'range') fill(this); } });
scan(document);
