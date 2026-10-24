// Délai TV de la version web, appliqué dans le navigateur comme le fait le serveur local de l'appli
// (server/hub.js) : le relais du Worker (analytics/live-relay.js) envoie l'état d'il y a quelques minutes
// (base) et tous les messages depuis ; on montre l'état à « maintenant − délai ».
export class WebHub {
  // apply(state, derived, topic, data, t) : shared/derive.js ; reset/batch : store.js (handleReset/handleBatch)
  constructor({ apply, reset, batch }) {
    Object.assign(this, { apply, reset, batch });
    this.base = null;
    this.events = [];
    this.keep = 0;
    this.gen = 0;
    this.sent = -1;
    this.ei = 0;
    this.cutoff = -Infinity;
  }

  hello(msg) {
    this.base = msg.base;
    this.events = msg.events || [];
    this.keep = msg.keep || 0;
    this.gen++;
  }

  push(events) {
    for (const e of events) this.events.push(e);
  }

  // Début des données disponibles (délai maximal possible)
  start() {
    return this.base?.t || this.events[0]?.[2] || null;
  }

  tick(cutoff) {
    if (!this.base) return;
    if (this.sent !== this.gen || cutoff < this.cutoff - 200) {
      const state = structuredClone(this.base.state);
      const derived = structuredClone(this.base.derived);
      let i = 0;
      for (const ev = this.events; i < ev.length && ev[i][2] <= cutoff; i++) this.apply(state, derived, ...ev[i]);
      this.ei = i;
      this.sent = this.gen;
      this.cutoff = cutoff;
      this.reset({ state, derived, stream: [] });
      return;
    }
    const out = [];
    while (this.ei < this.events.length && this.events[this.ei][2] <= cutoff) out.push(this.events[this.ei++]);
    this.cutoff = cutoff;
    if (out.length) this.batch({ events: out });
  }

  // Messages plus vieux que le délai maximal (déjà affichés) : intégrés à la base, la mémoire reste bornée
  roll(now) {
    if (!this.base) return;
    let n = 0;
    const limit = Math.min(now - this.keep, this.cutoff);
    while (n < this.ei && this.events[n][2] < limit) {
      this.apply(this.base.state, this.base.derived, ...this.events[n]);
      this.base.t = this.events[n++][2];
    }
    if (n) { this.events.splice(0, n); this.ei -= n; }
  }
}
