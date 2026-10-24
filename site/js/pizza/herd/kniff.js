// pizza-Interpreter · Herd: Kniff – eigene pizza-Klassen als Komponente (SPEC §18.4, HERD.md §12.4 H-K13, K-152)
// Abschnitt von site/js/pizza.js (gemeinsamer Gültigkeitsbereich; Reihenfolge und Bau: scripts/baue-pizza.js).
//
// Der Herd-Kern kennt keine Kniffe: Anhängen, Reihenfolge und Rückrufe leben in der Laufzeit (Spiegel: laufzeit/src/herd.rs,
// Abschnitt „Kniff“). Bitgleich in allen Motoren, daher fest: Teile nach aufsteigender ID, je Teil Kniffe in
// Anhängereihenfolge, Schnappschuss zu Beginn der Phase (später angehängte Kniffe laufen ab dem nächsten Takt), vor jedem
// Rückruf die Prüfung „hängt noch an diesem Teil“, dieselbe Folge von Kern-Aufrufen (teil_hole RUHT/KINDER/ENTFERNT,
// komp_von, hole_liste, hole_zahl) wie die Wasm-Laufzeit. Programme ohne Kniffe rufen hier nichts.

// überschreibbare Rückrufe der Basisklasse (leer) und die Methoden, die jeder Kniff kann
const KNIFF_RUECKRUFE = ['start', 'takt', 'beimBetreten', 'beimVerlassen', 'beimKlick', 'beimEntfernen'];
const KNIFF_NAMEN = new Set(['teil'].concat(KNIFF_RUECKRUFE));
const KNIFF_TEIL_RUHT = 19, KNIFF_TEIL_KINDER = 18, KNIFF_TEIL_ENTFERNT = 14, KNIFF_TEIL_RAUM = 12;

const KNIFF_M = tabelle({
  // teil() → das Teil, an dem der Kniff hängt, sonst karton (auch nach ohne/entferne – beimEntfernen läuft danach)
  'teil': function (o) {
    if (this.kueche !== null) throw this.ananas('KüchenAnanas', HERD_KUECHE);
    const z = this.kniffZ.get(o);
    return z === undefined || z.teil === 0 ? null : this.herdTeilObj(z.teil);
  },
  'start': function () { return null; },
  'takt': function () { return null; },
  'beimBetreten': function () { return null; },
  'beimVerlassen': function () { return null; },
  'beimKlick': function () { return null; },
  'beimEntfernen': function () { return null; }
});

const HERD_KNIFF = {
  istKniffKlasse(k) {
    for (let c = k; c; c = c.basis) if (c === this.kniffWurzel) return true;
    return false;
  },
  istKniff(v) { return v instanceof Obj && this.istKniffKlasse(v.klasse); },
  // eingebaute Kniff-Methode als Funktionswert (unqualifiziert `teil()` in einer Kniff-Klasse, `dies.teil`)
  kniffNativ(o, name, sc) {
    return new NativFn(name, (pos, ben, node) => this.objMethode(o, name, pos, ben, node, sc), o);
  },
  kniffZustand(k) {
    let z = this.kniffZ.get(k);
    if (z === undefined) { z = { teil: 0, gestartet: false }; this.kniffZ.set(k, z); }
    return z;
  },
  // teil.mit(kniff): Teil lebt (Kern-Text), Kniff hängt noch nirgends
  kniffMit(t, k) {
    this.herdF(this.hk.e.teil_hole(t.id, KNIFF_TEIL_RAUM));
    const z = this.kniffZustand(k);
    if (z.teil !== 0) throw this.ananas('LaufzeitAnanas', 'Dieser Kniff hängt schon an Teil ' + z.teil + '.');
    z.teil = t.id;
    const l = this.kniffAn.get(t.id);
    if (l === undefined) this.kniffAn.set(t.id, [k]); else l.push(k);
    return k;
  },
  // aus der Liste des Teils lösen (Zustand teil = 0)
  kniffLoese(k, id) {
    this.kniffZ.get(k).teil = 0;
    const l = this.kniffAn.get(id);
    const i = l.indexOf(k);
    l.splice(i, 1);
    if (l.length === 0) this.kniffAn.delete(id);
  },
  // teil.ohne(kniff) → der Kniff (danach beimEntfernen) oder karton, wenn er nicht an diesem Teil hängt
  kniffOhne(t, k, node) {
    this.herdF(this.hk.e.teil_hole(t.id, KNIFF_TEIL_RAUM));
    const z = this.kniffZ.get(k);
    if (z === undefined || z.teil !== t.id) return null;
    this.kniffLoese(k, t.id);
    this.kniffRufe(k, 'beimEntfernen', [], node);
    return k;
  },
  kniffListe(t) {
    this.herdF(this.hk.e.teil_hole(t.id, KNIFF_TEIL_RAUM));
    const l = this.kniffAn.get(t.id);
    return l === undefined ? [] : l.slice();
  },
  kniffIds() { return Array.from(this.kniffAn.keys()).sort((a, b) => a - b); },
  // teil.entferne(): erst der Kern (samt Kindern), dann lösen sich alle Kniffe der entfernten Teile (nach ID, je Teil in
  // Anhängereihenfolge) und bekommen danach beimEntfernen() – ohne Kinder wird nur das Teil selbst geprüft
  kniffEntferne(t, node) {
    const e = this.hk.e;
    if (this.kniffAn.size === 0) { this.herdI(e.teil_entferne(t.id)); return; }
    const kinder = this.herdF(e.teil_hole(t.id, KNIFF_TEIL_ENTFERNT)) === 0 ? this.herdF(e.teil_hole(t.id, KNIFF_TEIL_KINDER)) : 0;
    this.herdI(e.teil_entferne(t.id));
    let ids;
    if (kinder === 0) ids = this.kniffAn.has(t.id) ? [t.id] : [];
    else ids = this.kniffIds().filter(id => this.herdF(e.teil_hole(id, KNIFF_TEIL_ENTFERNT)) !== 0);
    const weg = [];
    for (const id of ids) {
      for (const k of this.kniffAn.get(id)) { this.kniffZ.get(k).teil = 0; weg.push(k); }
      this.kniffAn.delete(id);
    }
    for (const k of weg) this.kniffRufe(k, 'beimEntfernen', [], node);
  },
  // überschriebener Rückruf? (die Basisklasse Kniff hat keine Methoden-Deklarationen – ihre Rückrufe sind leer)
  kniffHat(k, name) { return this.findeMethodeListe(k.klasse, name) !== null; },
  kniffRufe(k, name, args, node) {
    const l = this.findeMethodeListe(k.klasse, name);
    if (l === null) return;
    this.rufeDecl(this.waehle(l, args.length), k, args, null, node, 'normal');
  },
  // Kniff-Phase je Takt (nach Systemen und Nachlauf, SPEC §18.2): Teile nach ID (ruhende ausgelassen, Stand zu Beginn),
  // je Kniff: start() einmal, beimBetreten/beimVerlassen je Eintrag aus Fuehler.betreten/verlassen, beimKlick bei
  // Taster.geklickt, takt(). Kehrt nach einem Rückruf mit herd.schliesse() sofort zurück.
  kniffPhase(h, node) {
    const k = this.hk, e = k.e;
    const plan = [];
    for (const id of this.kniffIds()) {
      if (this.herdF(e.teil_hole(id, KNIFF_TEIL_RUHT)) !== 0) continue;
      plan.push(id, this.kniffAn.get(id).slice());
    }
    const fu = k.schema.nachName.get('Fuehler'), ta = k.schema.nachName.get('Taster');
    const fBetreten = fu && fu.feldNachName.get('betreten'), fVerlassen = fu && fu.feldNachName.get('verlassen');
    const fGeklickt = ta && ta.feldNachName.get('geklickt');
    for (let p = 0; p < plan.length; p += 2) {
      const id = plan[p];
      for (const kn of plan[p + 1]) {
        const z = this.kniffZ.get(kn);
        if (z.teil !== id) continue;
        if (!z.gestartet) {
          z.gestartet = true;
          this.kniffRufe(kn, 'start', [], node);
          if (h.schliessen) return;
        }
        for (const [name, f] of [['beimBetreten', fBetreten], ['beimVerlassen', fVerlassen]]) {
          if (z.teil !== id || !f || !this.kniffHat(kn, name)) continue;
          const fh = this.herdI(e.komp_von(id, fu.nummer));
          if (fh === 0) continue;
          for (const anderes of this.herdHole(fh, fu, f)) {
            if (z.teil !== id) break;
            this.kniffRufe(kn, name, [anderes], node);
            if (h.schliessen) return;
          }
        }
        if (z.teil === id && fGeklickt && this.kniffHat(kn, 'beimKlick')) {
          const th = this.herdI(e.komp_von(id, ta.nummer));
          if (th !== 0 && this.herdHole(th, ta, fGeklickt) === true) {
            this.kniffRufe(kn, 'beimKlick', [], node);
            if (h.schliessen) return;
          }
        }
        if (z.teil === id && this.kniffHat(kn, 'takt')) {
          this.kniffRufe(kn, 'takt', [], node);
          if (h.schliessen) return;
        }
      }
    }
  }
};
Object.assign(Laufzeit.prototype, HERD_KNIFF);
