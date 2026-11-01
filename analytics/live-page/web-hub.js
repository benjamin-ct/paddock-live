// Délai TV de la version web, appliqué dans le navigateur comme le fait le serveur local de l'appli
// (server/hub.js) : le relais du Worker (analytics/live-relay.js) envoie l'état d'il y a quelques minutes
// (base) et tous les messages depuis ; on montre l'état à « maintenant − délai ». GPS et télémétrie (stream)
// arrivent compressés : décompressés ici dans l'ordre, puis envoyés aux panneaux un peu en avance.
import { LOOKAHEAD_MS, WEB_HIST_MS as HIST_MS } from '../../shared/live-delay.js';

export class WebHub {
  // apply(state, derived, topic, data, t) : shared/derive.js ; reset/batch : store.js (handleReset/handleBatch) ;
  // inflate(raw) : promesse de l'objet décompressé ; ask(from, to) : GPS plus ancien demandé au relais
  // tap(topic, data) : chaque élément du flux décompressé (la Comparaison garde le GPS et la télémétrie de la séance)
  constructor({ apply, reset, batch, inflate = null, ask = () => {}, tap = null }) {
    Object.assign(this, { apply, reset, batch, inflate, ask, tap });
    this.base = null;
    this.events = [];
    this.stream = [];
    this.keep = 0;
    this.gen = 0;
    this.sent = -1;
    this.ei = 0;
    this.si = 0;
    this.cutoff = -Infinity;
    this.queue = Promise.resolve();
    this.asked = Infinity;
    this.wait = 0;
  }

  hello(msg) {
    this.base = msg.base;
    this.events = msg.events || [];
    this.keep = msg.keep || 0;
    this.stream = [];
    this.asked = Infinity;
    this.gen++;
    this.pushStream(msg.stream || []);
  }

  push(events) {
    for (const e of events) this.events.push(e);
  }

  // Décompression dans l'ordre d'arrivée ; older : GPS plus ancien (réponse à ask), placé en tête
  pushStream(items, older = false) {
    if (!items.length || !this.inflate) return this.queue;
    const gen = this.gen;
    this.queue = this.queue.then(async () => {
      const out = [];
      for (const [topic, raw, t] of items) {
        const data = await this.inflate(raw).catch(() => null);
        if (data) { out.push([topic, data, t]); this.tap?.(topic, data); }
      }
      if (gen !== this.gen && !older) return;
      if (older) { this.stream.unshift(...out.filter((s) => !this.stream.length || s[2] < this.stream[0][2])); this.gen++; } else for (const s of out) this.stream.push(s);
    });
    return this.queue;
  }

  // Début des données disponibles (délai maximal possible)
  start() {
    return this.base?.t || this.events[0]?.[2] || null;
  }

  tick(cutoff) {
    if (!this.base) return;
    // Relais qui vient de (re)démarrer : son état de base est celui du direct à ce moment. Rien n'est montré
    // avant que le délai TV l'ait rattrapé (sinon spoiler) ; wait : temps restant, pour l'affichage
    this.wait = Math.max(0, this.base.t - cutoff);
    if (this.wait) return;
    const st = this.stream;
    if (this.sent !== this.gen || cutoff < this.cutoff - 200) {
      const state = structuredClone(this.base.state);
      const derived = structuredClone(this.base.derived);
      let i = 0;
      for (const ev = this.events; i < ev.length && ev[i][2] <= cutoff; i++) this.apply(state, derived, ...ev[i]);
      let s0 = 0;
      while (s0 < st.length && st[s0][2] < cutoff - HIST_MS) s0++;
      let s1 = s0;
      while (s1 < st.length && st[s1][2] <= cutoff + LOOKAHEAD_MS) s1++;
      // Délai allongé : GPS manquant demandé au relais (une fois par période)
      if (st.length && st[0][2] > cutoff - HIST_MS + 2000 && cutoff - HIST_MS < this.asked) {
        this.asked = cutoff - HIST_MS;
        this.ask(cutoff - HIST_MS, st[0][2]);
      }
      this.ei = i;
      this.si = s1;
      this.sent = this.gen;
      this.cutoff = cutoff;
      this.reset({ state, derived, stream: st.slice(s0, s1) });
      return;
    }
    const out = [];
    while (this.ei < this.events.length && this.events[this.ei][2] <= cutoff) out.push(this.events[this.ei++]);
    const s0 = this.si;
    while (this.si < st.length && st[this.si][2] <= cutoff + LOOKAHEAD_MS) this.si++;
    this.cutoff = cutoff;
    if (out.length || this.si > s0) this.batch({ events: out, stream: st.slice(s0, this.si) });
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
    let k = 0;
    while (k < this.si && this.stream[k][2] < limit - HIST_MS) k++;
    if (k) { this.stream.splice(0, k); this.si -= k; }
  }
}
