// pizza-Interpreter · Klang: Erzeuger laden, Objekte, Spuren, Ereignisse (SPEC §18.8, HERD.md §12.4 H-K14, K-153)
// Abschnitt von site/js/pizza.js (gemeinsamer Gültigkeitsbereich; Reihenfolge und Bau: scripts/baue-pizza.js).
//
// Dünne Anbindung an klang.wasm (herd/klang): Synthese, Prüfungen und Fehlertexte der Klänge leben dort; hier stehen nur
// Sprachtypen, Spuren (Wiedergabe-Zustand in simulierter Zeit), Ereignisse und Rückrufe. Spiegel: laufzeit/src/klang.rs –
// dieselbe Folge von Aufrufen ⇒ dieselben PCM-Hashes und Ereignisse in allen Motoren. Das Hörbare (Mischen, Raum, Gerät)
// machen die Wiedergaben (Browser site/js/klang/spieler.js, nativ host/src/klang.rs) – nicht Teil der Bitgleichheit.
// =====================================================================
const KLANG_KLASSEN = ['Klang', 'Spur'];
const KLANG_KUECHE = 'Den Klang gibt es nur in der Hauptküche.';
const KLANG_FEHLT = 'PizzaFehler HOST: Der Klang-Erzeuger fehlt (klang.wasm).';
for (const n of KLANG_KLASSEN) if (TYPEN.indexOf(n) < 0) TYPEN.push(n);

// ---------- Erzeuger laden (Node: site/js/herd/klang.wasm neben kern.wasm; Browser/Worker: optionen.klangKern) ----------
let klangStandardModul;                    // undefined: noch nicht versucht · null: nicht vorhanden · WebAssembly.Module
const klangModulCache = new WeakMap();     // Bytes → Module
function klangModul(k) {
  if (typeof WebAssembly === 'undefined') return null;
  if (k !== undefined && k !== null) {
    if (k instanceof WebAssembly.Module) return k;
    if (typeof k !== 'object') return null;
    let m = klangModulCache.get(k);
    if (m === undefined) {
      try { m = new WebAssembly.Module(k); } catch (e) { m = null; }
      klangModulCache.set(k, m);
    }
    return m;
  }
  if (klangStandardModul === undefined) {
    klangStandardModul = null;
    const b = herdDatei('klang.wasm');
    if (b !== null) { try { klangStandardModul = new WebAssembly.Module(b); } catch (e) { /* bleibt null */ } }
  }
  return klangStandardModul;
}

// Eine Erzeuger-Instanz je Lauf (Klänge sind global im Erzeuger)
class KlangKern {
  constructor(modul) {
    this.e = new WebAssembly.Instance(modul, {}).exports;
    if (typeof this.e.abi_version !== 'function' || this.e.abi_version() !== 1 || typeof this.e.ton !== 'function') throw new Error('kein Klang-Erzeuger');
    this.puf = null; this.u8 = null;
  }
  mem() {
    const b = this.e.memory.buffer;
    if (b !== this.puf) { this.puf = b; this.u8 = new Uint8Array(b); }
    return this.u8;
  }
  // zwei Texte nacheinander in den Austauschpuffer → [p1, l1, p2, l2]
  texte(a, b) {
    const ea = HERD_ENC.encode(a), eb = HERD_ENC.encode(b === undefined ? '' : b);
    const p = this.e.puffer(ea.length + eb.length + 1);
    const m = this.mem();
    m.set(ea, p);
    m.set(eb, p + ea.length);
    return [p, ea.length, p + ea.length, eb.length];
  }
  fehlerText() {
    let kap = 64;
    for (;;) {
      const p = this.e.puffer(kap);
      const n = this.e.fehler_text(p, kap);
      if (n <= kap) return HERD_DEC.decode(this.mem().subarray(p, p + n));
      kap = n;
    }
  }
  hash(id) {
    const p = this.e.puffer(16);
    this.e.hash(id, p);
    const u = this.mem();
    let s = '';
    for (let i = 0; i < 16; i++) s += String.fromCharCode(u[p + i]);
    return s;
  }
  // PCM (i16 LE, mono, 48 kHz) als eigene Kopie
  pcm(id) {
    const p = this.e.pcm(id), n = this.e.pcm_laenge(id);
    return this.mem().slice(p, p + n);
  }
}
class KlangFehlt { }

// ---------- Objekte ----------
class KlangObj { constructor(id, dauer, hash) { this.id = id; this.dauer = dauer; this.hash = hash; } }
// Spur = ein Abspielen eines Klangs. Zustand in simulierter Zeit (klangJetzt): ende = start + dauer / tonhoehe, Schleife ∞.
class KlangSpur {
  constructor(nr, klang) {
    this.nr = nr; this.klang = klang;
    this.laut = 1; this.ton = 1; this.pan = 0; this.lage = null; this.reichweite = 30; this.schleife = false;
    this.start = 0; this.ende = 0; this.gestoppt = false; this.endeFn = null; this.gemeldet = false;
  }
}

function klangKlasseVon(v) {
  if (v instanceof KlangObj) return 'Klang';
  if (v instanceof KlangSpur) return 'Spur';
  return null;
}

// ---------- Laufzeit-Methoden (this = Laufzeit) ----------
const KLANG_LAUFZEIT = {
  // „braucht den Erzeuger“ (wie K-128): das Programm nennt Klang.… und hat keine eigene Klasse Klang
  pruefeKlang() {
    let noetig = false;
    const gesehen = new Set();
    const geh = (x) => {
      if (noetig || x === null || typeof x !== 'object' || gesehen.has(x)) return;
      gesehen.add(x);
      if (Array.isArray(x)) { for (const y of x) geh(y); return; }
      if ((x.k === 'MCall' || x.k === 'Mem') && x.obj && x.obj.k === 'Name' && x.obj.n === 'Klang') { noetig = true; return; }
      for (const k in x) { const v = x[k]; if (v !== null && typeof v === 'object') geh(v); }
    };
    if (!this.klassen.has('Klang')) geh(this.ast.body);
    this.klangNoetig = noetig;
  },
  klangKern(pflicht) {
    if (this.kk !== null) return this.kk;
    if (!this.kkFehlt) {
      const m = klangModul(this.klangOpt);
      try { if (m !== null && HERD_ENC !== null) this.kk = new KlangKern(m); } catch (e) { this.kk = null; }
      if (this.kk !== null) return this.kk;
      this.kkFehlt = true;
    }
    if (pflicht) throw new KlangFehlt();
    throw this.ananas('LaufzeitAnanas', 'Interner Fehler im Klang: der Klang-Erzeuger fehlt (klang.wasm).');
  },
  // Erzeuger-Fehler → Ananas (Art 1 TypAnanas, 2 LaufzeitAnanas)
  klangI(r) {
    if (r >= 0) return r;
    const k = this.kk, art = k.e.fehler_art(), text = k.fehlerText();
    k.e.fehler_neu();
    return this.klangWirf(art === 1 ? 'TypAnanas' : 'LaufzeitAnanas', text);
  },
  klangWirf(art, text) { throw this.ananas(art, text); },
  klangNeu(id) {
    const k = this.kk;
    return new KlangObj(this.klangI(id), k.e.dauer(id), k.hash(id));
  },
  klangText(v, wo, param, std) {
    if (v === undefined || v === null) { if (std !== undefined) return std; }
    else if (typeof v === 'string') return v;
    throw this.ananas('TypAnanas', wo + '() braucht einen Text für \'' + param + '\', nicht ' + this.darstellung(v === undefined ? null : v) + '.');
  },
  klangArg(v, wo, param) {
    if (v instanceof KlangObj) return v;
    throw this.ananas('TypAnanas', wo + '() braucht einen Klang für \'' + param + '\', nicht ' + this.darstellung(v === undefined ? null : v) + '.');
  },
  klangBereich(wo, was, w, min, max) {
    if (w >= min && w <= max) return w;
    throw this.ananas('LaufzeitAnanas', wo + '() braucht ' + was + ' von ' + zahlText(min) + ' bis ' + zahlText(max) + ', nicht ' + zahlText(w) + '.');
  },
  // simulierte Zeit (Sekunden): mit Herd die Bildzeit (herd.zeit()), sonst die Uhr des Programms (Uhr.jetzt())
  klangJetzt() { return this.herd !== null ? this.herd.bildnummer / 60 : (this.schritte + this.offset) / 1000; },
  klangLaeuft(s) { return !s.gestoppt && this.klangJetzt() < s.ende; },
  // Ereignis { typ: "klang", art, … }: mit offenem Herd-Fenster bis zum nächsten Bild (bzw. schliesse) gesammelt, damit ein Klang
  // mit dem Bild seines Takts startet; sonst sofort. onKlang(art, daten) vor dem Ereignis, bei „spiele“ mit daten.bytes (PCM).
  klangSende(art, daten, id) {
    if (this.herd !== null && this.herd.offen) this.klangWarte.push([art, daten, id]);
    else this.klangRaus(art, daten, id);
  },
  klangRaus(art, daten, id) {
    if (this.onKlang !== null) {
      const d = Object.assign({}, daten);
      if (id > 0) d.bytes = this.kk.pcm(id);
      try { this.onKlang(art, d); } catch (x) { /* Wiedergabe-Fehler ignorieren */ }
    }
    this.emit(Object.assign({ typ: 'klang', art }, daten));
  },
  klangFlush() {
    if (this.klangWarte.length === 0) return;
    const w = this.klangWarte;
    this.klangWarte = [];
    for (const [art, daten, id] of w) this.klangRaus(art, daten, id);
  },
  klangSetzeEreignis(s) {
    if (!this.klangLaeuft(s)) return;
    this.klangSende('setze', { spur: s.nr, lautstaerke: s.laut, tonhoehe: s.ton, panorama: s.pan, lage: s.lage === null ? null : s.lage.slice(), reichweite: s.reichweite }, 0);
  },
  // k.spiele(lautstaerke: 1, schleife: nein, tonhoehe: 1, panorama: 0) → Spur
  klangSpiele(k, pos, ben) {
    const laut = this.klangBereich('spiele', 'eine Lautstärke', this.herdZahl(arg(pos, ben, 0, 'lautstaerke'), 'spiele', 'lautstaerke', 1), 0, 2);
    const sw = arg(pos, ben, 1, 'schleife');
    const schleife = sw === undefined || sw === null ? false : this.bool(sw);
    const ton = this.klangBereich('spiele', 'eine Tonhöhe', this.herdZahl(arg(pos, ben, 2, 'tonhoehe'), 'spiele', 'tonhoehe', 1), 0.125, 8);
    const pan = this.klangBereich('spiele', 'ein Panorama', this.herdZahl(arg(pos, ben, 3, 'panorama'), 'spiele', 'panorama', 0), -1, 1);
    const s = new KlangSpur(++this.klangSpurNr, k);
    s.laut = laut; s.ton = ton; s.pan = pan; s.schleife = schleife;
    s.start = this.klangJetzt();
    s.ende = schleife ? Infinity : s.start + k.dauer / ton;
    this.klangSende('spiele', { spur: s.nr, klang: k.hash, lautstaerke: laut, tonhoehe: ton, panorama: pan, schleife }, k.id);
    return s;
  },
  klangStoppe(s) {
    if (!this.klangLaeuft(s)) { s.gestoppt = true; return; }
    s.gestoppt = true;
    this.klangSende('stoppe', { spur: s.nr }, 0);
  },
  // neue Tonhöhe: der Rest einer laufenden Spur (ohne Schleife) wird umgerechnet
  klangTonhoehe(s, t) {
    const jetzt = this.klangJetzt();
    if (!s.schleife && !s.gestoppt && jetzt < s.ende) s.ende = jetzt + (s.ende - jetzt) * s.ton / t;
    s.ton = t;
  },
  klangBeimEnde(s, fn) {
    if (fn !== null && !(fn instanceof Funktion || fn instanceof Gebunden || fn instanceof NativFn)) {
      throw this.ananas('TypAnanas', 'beimEnde() braucht eine Funktion, z. B. () -> { … }.');
    }
    s.endeFn = fn;
    if (fn !== null && this.klangEnden.indexOf(s) < 0) {
      this.klangEnden.push(s);
      this.klangEnden.sort((a, b) => a.nr - b.nr);
    }
  },
  // Rückrufe beimEnde nach den Kniffen jedes Takts (nur in herd.backe): Spuren nach Nummer, die in diesem Takt ausgelaufen sind
  // (nicht gestoppt, ohne Schleife, jetzt ≥ ende), je einmal. Schnappschuss zu Beginn der Phase.
  klangEndePhase(h, node) {
    const jetzt = this.klangJetzt();
    const faellig = this.klangEnden.filter(s => s.endeFn !== null && !s.gemeldet && !s.gestoppt && !s.schleife && jetzt >= s.ende);
    if (faellig.length === 0) return;
    for (const s of faellig) s.gemeldet = true;
    this.klangEnden = this.klangEnden.filter(s => !s.gemeldet);
    for (const s of faellig) {
      this.rufe(s.endeFn, [], null, node);
      if (h.schliessen) return;   // schliesse() im Rückruf: übrige Rückrufe und Bild entfallen
    }
  },
  klangEnde() { this.klangFlush(); }
};
Object.assign(Laufzeit.prototype, KLANG_LAUFZEIT);
