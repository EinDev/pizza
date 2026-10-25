// pizza-Interpreter · Herd: Laufzeit-Methoden und Spielschleife
// Abschnitt von site/js/pizza.js (gemeinsamer Gültigkeitsbereich; Reihenfolge und Bau: scripts/baue-pizza.js).

// ---------- Laufzeit-Methoden (this = Laufzeit) ----------
const HERD_LAUFZEIT = {
  // P0013 (K-133) und „braucht den Kern“ – Startprüfung, ohne den Kern zu laden
  pruefeHerd() {
    let herd = false, theke = false, noetig = false;
    for (const n of herdSammle(this.ast.body)) {
      const name = n.k === 'Neu' ? n.typ.name : n.obj.n;
      if (this.klassen.has(name)) continue;          // eigene Klasse hat Vorrang
      if (n.k !== 'Neu') { noetig = true; continue; }
      if (name === 'Theke') theke = true;
      else if (name === 'Herd' || name === 'Form' || name === 'Bildchen') { noetig = true; if (name === 'Herd') herd = true; }
      else continue;
      if (herd && theke) throw this.pf('P0013', 'Theke und Herd in einem Programm gibt es noch nicht.', n);
    }
    this.herdNoetig = noetig;
  },
  // Kern holen (lazy). pflicht: fehlt er, endet der Lauf mit HOST-Fehler (nur vor dem Start); sonst null.
  herdKern(pflicht) {
    if (this.hk !== null) return this.hk;
    if (this.hkFehlt) { if (pflicht) throw new HerdKernFehlt(); return null; }
    const m = herdModul(this.herdOpt);
    try { if (m !== null && HERD_ENC !== null) this.hk = new HerdKern(m); } catch (e) { this.hk = null; }
    if (this.hk === null) {
      this.hkFehlt = true;
      if (pflicht) throw new HerdKernFehlt();
      return null;
    }
    if (this.herdSpion !== null) { try { this.herdSpion(this.hk.e); } catch (x) { /* Werkzeugfehler ignorieren */ } }
    return this.hk;
  },
  // für Ressourcen/Komponenten zur Laufzeit: Kern muss da sein (Herd-Programme prüfen das vor dem Start)
  hk_() {
    const k = this.herdKern(false);
    if (k === null) throw this.ananas('LaufzeitAnanas', 'Interner Fehler im Herd: der Herd-Kern fehlt (kern.wasm).');
    return k;
  },
  // Kern-Fehler → Ananas (Art 1 TypAnanas, 2 LaufzeitAnanas, 3 intern); setzt das NaN-Fehlerflag zurück
  herdFehler() {
    const k = this.hk, e = k.e;
    const art = e.fehler_art();
    const text = k.liesText((p, kap) => e.fehler_text(p, kap)) || '';
    e.fehler_neu();
    if (art === 1) return this.ananas('TypAnanas', text);
    if (art === 2) return this.ananas('LaufzeitAnanas', text);
    return this.ananas('LaufzeitAnanas', 'Interner Fehler im Herd: ' + text);
  },
  herdI(r) { if (r < 0) throw this.herdFehler(); return r; },
  herdF(r) { if (r !== r && this.hk.e.fehler_neu() === 1) throw this.herdFehler(); return r; },
  herdZahl(v, wo, param, std) {
    if (v === undefined || v === null) { if (std !== undefined) return std; }
    else if (typeof v === 'number') return v;
    throw this.ananas('TypAnanas', wo + '() braucht eine Zahl für \'' + param + '\', nicht ' + this.darstellung(v === undefined ? null : v) + '.');
  },
  herdTaste(n) { return this.text(n === undefined ? null : n); },
  herdMausBit(k, wo) {
    const n = this.herdZahl(k, wo, 'k', 1);
    if (n === 1) return 1;
    if (n === 2) return 2;
    if (n === 3) return 4;
    throw this.ananas('LaufzeitAnanas', 'Maustaste ' + zahlText(n) + ' gibt es nicht (1 links, 2 rechts, 3 Mitte).');
  },
  // Farbe als Text: Text unverändert, sonst die Textform (der Kern prüft und meldet)
  herdFarbText(v) { return typeof v === 'string' ? v : this.text(v === undefined ? null : v); },
  herdTeilId(v, wo, param) {
    if (v === undefined || v === null) return 0;
    if (v instanceof HerdTeil) return v.id;
    throw this.ananas('TypAnanas', wo + '() braucht ein Teil für \'' + param + '\', nicht ' + this.darstellung(v) + '.');
  },
  herdTeilObj(id) {
    const k = this.hk;
    let t = k.teile.get(id);
    if (t === undefined) { t = new HerdTeil(id, k.schema.teilTab); k.teile.set(id, t); }
    return t;
  },
  herdKompObj(h, art) {
    const k = this.hk;
    let o = k.komps.get(h);
    if (o === undefined) { o = new HerdKomp(h, art, 0); k.komps.set(h, o); }
    return o;
  },
  herdKompVon(teil, art) {
    const h = this.herdI(this.hk.e.komp_von(teil.id, art.nummer));
    if (h === 0) return null;
    const o = this.herdKompObj(h, art);
    o.teil = teil.id;
    return o;
  },
  herdForm(id) {
    this.herdI(id);
    const k = this.hk;
    let f = k.res.get(id);
    if (f === undefined) { f = new HerdForm(id); k.res.set(id, f); }
    return f;
  },
  // Feld nach Name (hole/setze); unbekannt → Kern-Text „<Name> hat kein Feld 'x'.“
  herdFeld(art, n) {
    const name = this.text(n === undefined ? null : n);
    const f = art.feldNachName.get(name);
    if (f !== undefined) return f;
    const k = this.hk, p = k.text(name);
    this.herdI(k.e.feld_nummer(art.nummer, p, k.len));
    throw this.ananas('LaufzeitAnanas', 'Interner Fehler im Herd: Feld \'' + name + '\' fehlt im Schema.');
  },
  herdTypfehler(art, f, v) {
    const k = this.hk, p = k.text(this.darstellung(v));
    k.e.melde_typfehler(art.nummer, f.nummer, p, k.len);
    return this.herdFehler();
  },
  // Wert setzen nach Feldtyp (schneller Weg: Zahl → setze_zahl, ohne Objekt-Allokation)
  herdSetze(h, art, f, v) {
    const e = this.hk.e;
    let r;
    switch (f.t) {
      case HF_ZAHL: case HF_GANZ:
        if (typeof v !== 'number') throw this.herdTypfehler(art, f, v);
        r = e.setze_zahl(h, f.nummer, v);
        break;
      case HF_DIAVOLO:
        if (v !== true && v !== false) throw this.herdTypfehler(art, f, v);
        r = e.setze_zahl(h, f.nummer, v ? 1 : 0);
        break;
      case HF_TEXT: case HF_WAHL: case HF_FARBE: {
        if (f.t !== HF_TEXT && typeof v !== 'string') throw this.herdTypfehler(art, f, v);
        const k = this.hk, p = k.text(f.t === HF_TEXT ? this.text(v) : v);
        r = e.setze_text(h, f.nummer, p, k.len);
        break;
      }
      case HF_TEIL:
        if (v !== null && !(v instanceof HerdTeil)) throw this.herdTypfehler(art, f, v);
        r = e.setze_zahl(h, f.nummer, v === null ? 0 : v.id);
        break;
      case HF_FORM:
        if (v !== null && !(v instanceof HerdForm)) throw this.herdTypfehler(art, f, v);
        r = e.setze_zahl(h, f.nummer, v === null ? 0 : v.id);
        break;
      case HF_BILDCHEN:
        if (v !== null && !(v instanceof HerdBildchen)) throw this.herdTypfehler(art, f, v);
        r = e.setze_zahl(h, f.nummer, v === null ? 0 : v.id);
        break;
      case HF_LISTE: {
        if (!Array.isArray(v) || !v.every(x => x instanceof HerdBildchen)) throw this.herdTypfehler(art, f, v);
        const k = this.hk, p = e.puffer(v.length * 4 || 4);
        k.mem();
        for (let i = 0; i < v.length; i++) k.dv.setUint32(p + i * 4, v[i].id, true);
        r = e.setze_liste(h, f.nummer, p, v.length);
        break;
      }
      case HF_TEIL_LISTE: {
        if (!Array.isArray(v) || !v.every(x => x instanceof HerdTeil)) throw this.herdTypfehler(art, f, v);
        const k = this.hk, p = e.puffer(v.length * 4 || 4);
        k.mem();
        for (let i = 0; i < v.length; i++) k.dv.setUint32(p + i * 4, v[i].id, true);
        r = e.setze_liste(h, f.nummer, p, v.length);
        break;
      }
      case HF_ZAHL_LISTE: {
        if (!Array.isArray(v) || !v.every(x => typeof x === 'number')) throw this.herdTypfehler(art, f, v);
        const k = this.hk, p = e.puffer(v.length * 8 || 8);
        k.mem();
        for (let i = 0; i < v.length; i++) k.dv.setFloat64(p + i * 8, v[i], true);
        r = e.setze_zahlen(h, f.nummer, p, v.length);
        break;
      }
      default:
        throw this.ananas('LaufzeitAnanas', 'Interner Fehler im Herd: Feldtyp \'' + f.typ + '\' kennt diese Sprache noch nicht.');
    }
    if (r < 0) throw this.herdFehler();
  },
  herdHole(h, art, f) {
    const k = this.hk, e = k.e;
    switch (f.t) {
      case HF_ZAHL: case HF_GANZ: return this.herdF(e.hole_zahl(h, f.nummer));
      case HF_DIAVOLO: return this.herdF(e.hole_zahl(h, f.nummer)) !== 0;
      case HF_TEXT: case HF_WAHL: case HF_FARBE: {
        const s = k.liesText((p, kap) => e.hole_text(h, f.nummer, p, kap));
        if (s === null) throw this.herdFehler();
        return s;
      }
      case HF_TEIL: { const id = this.herdF(e.hole_zahl(h, f.nummer)); return id === 0 ? null : this.herdTeilObj(id); }
      case HF_FORM: case HF_BILDCHEN: { const id = this.herdF(e.hole_zahl(h, f.nummer)); return id === 0 ? null : (k.res.get(id) || null); }
      case HF_LISTE: {
        const ids = k.liesListe((p, kap) => e.hole_liste(h, f.nummer, p, kap));
        if (ids === null) throw this.herdFehler();
        return ids.map(id => k.res.get(id) || null);
      }
      case HF_TEIL_LISTE: {
        const ids = k.liesListe((p, kap) => e.hole_liste(h, f.nummer, p, kap));
        if (ids === null) throw this.herdFehler();
        return ids.map(id => this.herdTeilObj(id));
      }
      case HF_ZAHL_LISTE: {
        const z = k.liesZahlen((p, kap) => e.hole_zahlen(h, f.nummer, p, kap));
        if (z === null) throw this.herdFehler();
        return z;
      }
      default:
        throw this.ananas('LaufzeitAnanas', 'Interner Fehler im Herd: Feldtyp \'' + f.typ + '\' kennt diese Sprache noch nicht.');
    }
  },
  // Fabrik (README §3, Vertrag für alle Motoren): teil_neu → teil_lage → komp_neu → Setter in der übergebenen
  // (= Schema-)Reihenfolge, fehlende/karton-Werte ohne Aufruf → komp_haenge. felder: [name, wert, name, wert, …]
  herdFabrik(raum, x, y, z, artName, felder) {
    const k = this.hk_(), e = k.e;
    const id = this.herdI(e.teil_neu(raum));
    this.herdI(e.teil_lage(id, x, y, z));
    if (artName !== null) {
      const art = k.schema.nachName.get(artName);
      if (art === undefined) throw this.ananas('LaufzeitAnanas', 'Interner Fehler im Herd: Komponente ' + artName + ' fehlt im Schema.');
      const h = this.herdI(e.komp_neu(art.nummer));
      for (let i = 0; i < felder.length; i += 2) {
        const w = felder[i + 1];
        if (w === undefined || w === null) continue;
        this.herdSetze(h, art, art.feldNachName.get(felder[i]), w);
      }
      this.herdI(e.komp_haenge(h, id));
    }
    return this.herdTeilObj(id);
  },
  // neu <Herd-Klasse>(…) – undefined, wenn tn keine Herd-Klasse ist
  herdNeu(tn, pos, ben) {
    const fest = HERD_KLASSEN.indexOf(tn) >= 0;
    let art;
    if (!fest) {
      if (!HERD_KOMP_NAMEN.has(tn) && this.hk === null) return undefined;   // fremder Name: Kern nicht unnötig laden
      const k = this.herdKern(false);
      if (k === null || (art = k.schema.nachName.get(tn)) === undefined) return undefined;
    }
    if (this.kueche !== null) throw this.ananas('KüchenAnanas', HERD_KUECHE);
    if (tn === 'Teil') throw this.ananas('RohlingAnanas', '\'Teil\' kann man nicht mit neu backen.');
    const k = this.hk_(), e = k.e;
    if (tn === 'Herd') {
      const tw = arg(pos, ben, 0, 'titel');
      const titel = tw === undefined ? '' : this.text(tw);   // K-102: karton → "karton"
      let b = arg(pos, ben, 1, 'breite'), ho = arg(pos, ben, 2, 'hoehe');
      b = b === undefined || b === null ? 640 : (typeof b === 'number' ? b : this.ganzzahl(b, 'Herd(breite: …)'));
      ho = ho === undefined || ho === null ? 360 : (typeof ho === 'number' ? ho : this.ganzzahl(ho, 'Herd(hoehe: …)'));
      this.herdI(e.welt_neu(b, ho, k.text(titel), k.len));
      this.herd = new HerdWelt(titel, b, ho);
      return this.herd;
    }
    if (tn === 'Form') return this.herdFormNeu(pos, ben);
    if (tn === 'Bildchen') return this.herdBildchenNeu(pos, ben);
    // Komponente: unbekannte benannte Argumente zuerst (Kern-Text), dann komp_neu und Felder in Schema-Reihenfolge
    if (ben !== null) for (const n in ben) if (!art.feldNachName.has(n)) this.herdFeld(art, n);
    const h = this.herdI(e.komp_neu(art.nummer));
    const o = this.herdKompObj(h, art);
    for (let i = 0; i < art.felder.length; i++) {
      const f = art.felder[i], w = arg(pos, ben, i, f.name);
      if (w !== undefined && w !== null) this.herdSetze(h, art, f, w);
    }
    return o;
  },
  // neu Form(punkte, dreiecke, glatt: nein) – beide Bleche als f64 in einem Austauschpuffer; falscher Typ → Kern-Text
  herdFormNeu(pos, ben) {
    const k = this.hk_(), e = k.e;
    const pu = arg(pos, ben, 0, 'punkte'), dr = arg(pos, ben, 1, 'dreiecke'), gl = arg(pos, ben, 2, 'glatt');
    const glatt = gl === undefined || gl === null ? false : this.bool(gl);
    const zahlen = (b) => Array.isArray(b) && b.every(x => typeof x === 'number');
    // kein Zahlen-Blech → eine Länge, die nicht durch 3 teilbar ist: der Kern meldet seinen Text (Code 42/43)
    const np = zahlen(pu) ? pu.length : 1, nd = zahlen(dr) ? dr.length : 1;
    const p = e.puffer((np + nd) * 8 || 8);
    k.mem();
    const f64 = new Float64Array(k.puf, p, np + nd);
    for (let i = 0; i < np; i++) f64[i] = zahlen(pu) ? pu[i] : 0;
    for (let i = 0; i < nd; i++) f64[np + i] = zahlen(dr) ? dr[i] : 0;
    return this.herdForm(e.form_eigene(p, np, p + np * 8, nd, glatt ? 1 : 0));
  },
  // neu Bildchen(zeilen, farben: karton) – Zeilen: u32 Länge + UTF-8; Farben: Paare (Zeichen, Farbtext)
  herdBildchenNeu(pos, ben) {
    const k = this.hk_(), e = k.e;
    const zw = arg(pos, ben, 0, 'zeilen'), fw = arg(pos, ben, 1, 'farben');
    // kein Blech aus Texten → keine Zeilen: der Kern meldet „braucht Zeilen als nicht leeres Blech aus Texten“
    const zeilen = Array.isArray(zw) && zw.every(x => typeof x === 'string') ? zw : [];
    let farben = [];
    if (fw !== undefined && fw !== null) {
      if (!(fw instanceof Map)) throw this.ananas('TypAnanas', 'Bildchen() braucht eine Speisekarte für \'farben\', nicht ' + this.darstellung(fw) + '.');
      for (const [z, f] of fw) farben.push(this.text(z), this.herdFarbText(f));
    }
    const teile = zeilen.concat(farben).map(s => HERD_ENC.encode(s));
    let n = 0;
    for (const t of teile) n += 4 + t.length;
    const p = e.puffer(n || 4), m = k.mem();
    let o = p;
    for (const t of teile) { k.dv.setUint32(o, t.length, true); m.set(t, o + 4); o += 4 + t.length; }
    let zl = 0;
    for (let i = 0; i < zeilen.length; i++) zl += 4 + teile[i].length;
    const id = this.herdI(e.bildchen_neu(p, zl, p + zl, n - zl));
    const b = new HerdBildchen(id, this.herdF(e.ressource_hole(id, 2)), this.herdF(e.ressource_hole(id, 3)));
    k.res.set(id, b);
    return b;
  },
  // ---------- Bilddateien (SPEC §18.5, K-145; PROJEKTE §5.2 … §5.5) ----------
  // Vor dem Start: jedes Bild der Kiste (Endung .png/.jpg/.jpeg) → Teigling, je Quell-Hash einmal; ein Teigling aus
  // optionen.teiglinge gilt nur, wenn sein Kopf gültig ist und die SHA-256 der Quelle trägt (ein veralteter Cache ändert nie
  // ein Ergebnis). Teigmenge = Summe verschiedener Quell-Hashes ohne Fehler-Teiglinge; > 64 MiB → P0020 ohne Ort.
  vorbacke() {
    const bilder = Object.keys(this.kiste).filter(istBildPfad).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    if (!bilder.length) return;
    const vb = herdVorbacker(this.vorbackerOpt);
    if (vb === null) throw new VorbackerFehlt();
    const jeHash = new Map();
    let menge = 0;
    for (const pfad of bilder) {
      let q = this.kiste[pfad];
      if (typeof q === 'string') q = HERD_ENC !== null ? HERD_ENC.encode(q) : TEIGLING_LEER;
      const sha = teiglingHex(vb.sha256(q));
      let t = jeHash.get(sha);
      if (t === undefined) {
        const c = this.teiglingeOpt !== null && Object.prototype.hasOwnProperty.call(this.teiglingeOpt, pfad) ? this.teiglingeOpt[pfad] : null;
        const k = teiglingKopf(c);
        t = k !== null && k.sha256 === sha ? c : vb.vorbacken(q);
        jeHash.set(sha, t);
        const kt = teiglingKopf(t);
        if (kt !== null && !kt.fehler) menge += t.length;
      }
      this.teiglinge.set(pfad, t);
    }
    if (menge > TEIGMENGE_MAX) throw this.pf('P0020', 'Die Bilder sind zusammen zu groß für den Ofen (' + mbText(menge) + ' vorgebacken, höchstens 64 MB).', null);
  },
  // Bildchen.laden(pfad): Text? → Herd da? (Kern-Text, Code 3) → schon geladen (dasselbe Bildchen) → in der Kiste? →
  // Teigling an den Kern (bildchen_teigling prüft nur den Kopf; 61/62 → „<pfad> <Kern-Text>“)
  herdBildchenLaden(pw) {
    if (typeof pw !== 'string') throw this.ananas('TypAnanas', 'Bildchen.laden() braucht einen Text für \'pfad\', nicht ' + this.darstellung(pw === undefined ? null : pw) + '.');
    const k = this.hk_(), e = k.e;
    if (this.herd === null) this.herdI(e.bildchen_teigling(e.puffer(1), 0));   // noch keine Welt → Kern Code 3
    const alt = this.bildPfade.get(pw);
    if (alt !== undefined) return alt;
    if (!kisteHat(this.kiste, pw)) throw this.ananas('LaufzeitAnanas', 'Die Datei "' + pw + '" liegt nicht in der Kiste.');
    const t = this.teiglinge.get(pw) || TEIGLING_LEER;   // keine Bild-Endung → kein Teigling → Kern Code 61
    const p = e.puffer(t.length || 1);
    k.mem().set(t, p);
    const id = e.bildchen_teigling(p, t.length);
    if (id < 0) {
      const code = e.fehler_code();
      if (code !== 61 && code !== 62) throw this.herdFehler();
      const text = k.liesText((q, kap) => e.fehler_text(q, kap)) || '';
      e.fehler_neu();
      throw this.ananas('LaufzeitAnanas', pw + ' ' + text);
    }
    const b = new HerdBildchen(id, this.herdF(e.ressource_hole(id, 2)), this.herdF(e.ressource_hole(id, 3)));
    k.res.set(id, b);
    this.bildPfade.set(pw, b);
    return b;
  },
  // ---------- Spielschleife (SPEC §18.2) ----------
  herdSende(art, daten) {
    const ev = { typ: 'herd', art };
    for (const s in daten) if (s !== 'bytes') ev[s] = daten[s];
    this.emit(ev);
    if (this.onHerd !== null) { try { this.onHerd(art, daten); } catch (x) { /* Renderer-Fehler ignorieren */ } }
  },
  herdOeffne(h) {
    h.offen = true;
    this.hk.e.paket_voll();     // neues Fenster: das nächste Paket enthält wieder alle Ressourcen
    this.herdSende('fenster', { titel: h.titel, breite: h.breite, hoehe: h.hoehe });
  },
  herdSchliesseFenster(h) {
    if (!h.offen) return;
    h.offen = false;
    this.herdSende('schliesse', {});
  },
  herdBild(h) {
    const k = this.hk, e = k.e;
    const len = this.herdI(e.bild(h.bildnummer));
    const szene = k.hash(p => e.hash_szene(p));
    const paket = k.hash(p => e.hash_paket(p));
    const daten = { bildnummer: h.bildnummer, szene, paket };
    if (this.onHerd !== null) {   // Bytes nur an den Renderer (Kopie: der Kern überschreibt sie beim nächsten bild)
      const z = e.bild_zeiger();
      daten.bytes = k.mem().slice(z, z + len);
    }
    this.herdSende('bild', daten);
  },
  herdEingabe(h, ev) {
    h.vorTasten = h.tasten;
    h.vorKnoepfe = h.knoepfe;
    const t = ev.tasten;
    if (Array.isArray(t) && t.every(x => typeof x === 'string')) h.tasten = new Set(t);
    const m = ev.maus;
    if (Array.isArray(m) && m.length === 2 && typeof m[0] === 'number' && typeof m[1] === 'number' && isFinite(m[0]) && isFinite(m[1])) {
      h.mausX = m[0]; h.mausY = m[1];
    }
    const kn = ev.knoepfe;
    if (typeof kn === 'number' && Number.isInteger(kn) && kn >= 0 && kn <= 7) h.knoepfe = kn;
    // Rohbewegung und Rad: Summe seit dem letzten Ereignis (fehlt/ungültig → 0); gefangen: Zustand (fehlt → unverändert)
    const b = ev.bewegung;
    if (Array.isArray(b) && b.length === 2 && typeof b[0] === 'number' && typeof b[1] === 'number' && isFinite(b[0]) && isFinite(b[1])) {
      h.bewegungX = b[0]; h.bewegungY = b[1];
    } else { h.bewegungX = 0; h.bewegungY = 0; }
    const r = ev.rad;
    h.rad = typeof r === 'number' && isFinite(r) ? r : 0;
    if (typeof ev.gefangen === 'boolean') h.gefangen = ev.gefangen;
  },
  // Rückruf aus der Spielschleife (fn oder Kniff-Phase): schliesse() wirkt danach, Panik beendet sofort (kein schliesse)
  herdRueckruf(h, f) {
    h.imRueckruf = true;
    try {
      f();
    } catch (x) {
      if (x instanceof PanikSig) h.schliessen = false;   // §18.2
      throw x;
    } finally {
      h.imRueckruf = false;
      if (h.schliessen) { h.schliessen = false; this.herdSchliesseFenster(h); }
    }
  },
  herdBacke(h, fn, node) {
    if (fn !== null && !(fn instanceof Funktion || fn instanceof Gebunden || fn instanceof NativFn)) {
      throw this.ananas('TypAnanas', 'backe() braucht eine Funktion, z. B. () -> { … }.');
    }
    if (!h.offen) this.herdOeffne(h);
    if (this.uiWarte === null && this.uiListe === null) {   // ohne Renderer (wie K-063)
      this.warnung('W0104', HERD_W0104, node);
      this.herdSchliesseFenster(h);
      return;
    }
    const e = this.hk.e;
    for (;;) {
      const ev = this.uiNaechstesEreignis();
      if (ev.typ === 'geschlossen') { h.offen = false; return; }
      if (ev.typ !== 'takt') continue;
      this.herdEingabe(h, ev);
      const a = ev.anzahl;
      const n = typeof a === 'number' && Number.isInteger(a) && a >= 1 ? Math.min(a, 4) : 1;
      for (let i = 0; i < n; i++) {
        h.bildnummer++;
        h.erster = i === 0;
        // H-K12 (K-151): Eingabezustand an den Kern – je Takt vor fn() (UI-Bausteine, Blick.mausX)
        this.herdI(e.eingabe(h.mausX, h.mausY, h.knoepfe));
        // K-087: jeder Takt beginnt mit frischem Schrittbudget (P0002 je Takt, einschließlich der Kniffe)
        this.limitBasis = this.schritte;
        this.neuGrenze();
        try {
          if (fn !== null) {
            this.herdRueckruf(h, () => this.rufe(fn, [], null, node));
            if (!h.offen) return;   // schliesse() im Rückruf: Systeme und Bild entfallen
          }
          this.herdI(e.takt());
          // H-K13 (K-152): Kniff-Rückrufe nach Systemen und Nachlauf; gedrueckt/klick gelten wie in fn
          if (this.kniffAn.size > 0) {
            this.herdRueckruf(h, () => this.kniffPhase(h, node));
            if (!h.offen) return;   // schliesse() in einem Kniff: übrige Kniffe und Bild entfallen
          }
        } finally {
          h.erster = false;
        }
      }
      this.herdBild(h);
    }
  },
  // Programmende (wie K-061): offenes Fenster schließen
  herdEnde() {
    const h = this.herd;
    if (h !== null && h.offen) this.herdSchliesseFenster(h);
  }
};
Object.assign(Laufzeit.prototype, HERD_LAUFZEIT);
