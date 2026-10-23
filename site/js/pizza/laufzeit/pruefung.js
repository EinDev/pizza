// pizza-Interpreter · Deklarationen registrieren und Startprüfungen (SPEC §14.7)
// Abschnitt von site/js/pizza.js (gemeinsamer Gültigkeitsbereich; Reihenfolge und Bau: scripts/baue-pizza.js).

// Laufzeit: Deklarationen und Startprüfung
class LaufzeitPruefung {
  registriere(d) {
    switch (d.k) {
      case 'Klasse': {
        const k = new Klasse(d.name, d);
        k.rohling = d.mods.indexOf('rohling') >= 0;
        k.gebacken = d.mods.indexOf('gebacken') >= 0;
        k.calzone = d.mods.indexOf('calzone') >= 0;
        for (const f of d.felder) {
          const info = { typ: f.typ, decls: f.decls, gebacken: f.mods.indexOf('gebacken') >= 0, sicht: sichtbarkeit(f.mods) };
          if (f.mods.indexOf('tiefkühl') >= 0) {
            k.statischeFelder.push(info);
            for (const dd of f.decls) {
              const v = new Var(standardWert(f.typ), f.typ, info.gebacken);
              v.mod = info.sicht; v.klasse = k;
              k.statisch.set(dd.name, v);
            }
          } else k.felder.push(info);
        }
        for (const md of d.methoden) {
          const m = new Methode(md, k);
          this.alleMethoden.push(m);
          const l = k.methoden.get(m.name);
          if (l) l.push(m); else k.methoden.set(m.name, [m]);
        }
        for (const kd of d.ktoren) {
          const m = new Methode(kd, k);
          m.statisch = false;
          m.hatUnten = kd.body.body.some(st => st.k === 'AusdrAnw' && st.e.k === 'UntenCall');
          k.ktoren.push(m);
        }
        this.klassen.set(d.name, k);
        this.klassenListe.push(k);
        for (const inn of d.innere) this.registriere(inn);
        break;
      }
      case 'Rezeptur': {
        const r = new Rezeptur(d.name, d);
        r.methoden = d.methoden.map(m => m.name);
        this.klassen.set(d.name, r);
        break;
      }
      case 'Enum': {
        const e = new EnumTyp(d.name);
        d.werte.forEach((w, i) => { const ew = new EnumWert(e, w.n, i + 1); e.werte.push(ew); e.nachName.set(w.n, ew); });
        this.klassen.set(d.name, e);
        break;
      }
      case 'Methode': {
        const m = new Methode(d, null);
        m.statisch = true;
        this.alleMethoden.push(m);
        const v = this.global.vars.get(d.name);
        if (v && v.w instanceof Gebunden) v.w.liste.push(m);
        else this.global.vars.set(d.name, new Var(new Gebunden(null, [m], d.name), null, false));
        break;
      }
    }
  }

  pf(code, text, n) { return new PizzaFehlerSig(code, text, n ? n.z : null, n ? n.s : null); }

  pruefe() {
    const dekls = [];
    const sammle = (d) => { dekls.push(d); if (d.k === 'Klasse') for (const i of d.innere) sammle(i); };
    for (const d of this.ast.body) if (DEKL.has(d.k)) sammle(d);
    // Durchgang 1: Q0004, Basisklassen, P0011
    for (const d of dekls) {
      if (d.k === 'Enum') {
        if (d.werte.length !== 4) throw this.pf('Q0004', 'quattrostagioni braucht genau 4 Werte, nicht ' + d.werte.length + '.', d);
      } else if (d.k === 'Klasse') {
        const k = this.klassen.get(d.name);
        if (d.basis) {
          const b = this.klassen.get(d.basis.name);
          if (!(b instanceof Klasse)) throw this.pf('P0010', 'Klasse \'' + d.name + '\' erbt von \'' + d.basis.name + '\' – diese Klasse gibt es nicht.', d.basis);
          if (b.gebacken) throw this.pf('P0011', 'Klasse \'' + d.name + '\' kann nicht von \'' + b.name + '\' erben – \'' + b.name + '\' ist gebacken.', d.basis);
          k.basis = b;
        }
        for (const t of d.erfuellt) {
          const r = this.klassen.get(t.name);
          if (!(r instanceof Rezeptur)) throw this.pf('P0010', 'Klasse \'' + d.name + '\' erfüllt \'' + t.name + '\' – diese Rezeptur gibt es nicht.', t);
          k.erfuellt.push(r);
        }
      } else if (d.k === 'Rezeptur') {
        const r = this.klassen.get(d.name);
        for (const t of d.basen) {
          const b = this.klassen.get(t.name);
          if (!(b instanceof Rezeptur)) throw this.pf('P0010', 'Rezeptur \'' + d.name + '\' erbt von \'' + t.name + '\' – diese Rezeptur gibt es nicht.', t);
          r.basen.push(b);
        }
      }
    }
    // Zyklen
    for (const k of this.klassenListe) {
      const gesehen = new Set();
      for (let c = k; c; c = c.basis) {
        if (gesehen.has(c)) throw this.pf('P0010', 'Klasse \'' + k.name + '\' erbt im Kreis – das ist ein Teigknoten.', k.decl);
        gesehen.add(c);
      }
    }
    // Durchgang 2: R0001, A0001
    for (const d of dekls) {
      if (d.k === 'Klasse') {
        const k = this.klassen.get(d.name);
        if (!k.rohling) {
          for (let c = k; c; c = c.basis) {
            for (const r of c.erfuellt) {
              for (const mn of this.rezepturMethoden(r, new Set())) {
                if (!this.hatImplementierung(k, mn)) throw this.pf('R0001', 'Klasse \'' + k.name + '\' erfüllt Rezeptur \'' + r.name + '\' nicht: Methode \'' + mn + '\' fehlt.', d);
              }
            }
          }
        }
        for (const md of d.methoden) {
          if (!md.annos.some(a => a.name === 'PizzaÜberschreibt')) continue;
          let ok = md.name === 'alsText' || (this.istAnanasKlasse(k) && md.name in ANANAS_M);
          if (!ok && k.basis && this.findeMethodeListe(k.basis, md.name)) ok = true;
          if (!ok) {
            for (let c = k; c && !ok; c = c.basis) {
              for (const r of c.erfuellt) if (this.rezepturMethoden(r, new Set()).indexOf(md.name) >= 0) ok = true;
            }
          }
          if (!ok) throw this.pf('A0001', 'Methode \'' + md.name + '\' in \'' + k.name + '\' ist mit @PizzaÜberschreibt markiert, überschreibt aber nichts.', md);
        }
      }
    }
    this.pruefeHerd();
  }

  rezepturMethoden(r, gesehen) {
    if (gesehen.has(r)) return [];
    gesehen.add(r);
    let l = r.methoden.slice();
    for (const b of r.basen) l = l.concat(this.rezepturMethoden(b, gesehen));
    return l;
  }

  hatImplementierung(k, name) {
    for (let c = k; c; c = c.basis) {
      const l = c.methoden.get(name);
      if (l && l.some(m => m.body !== null)) return true;
    }
    return false;
  }

  rezepturErbt(r, ziel) {
    if (r === ziel) return true;
    for (const b of r.basen) if (this.rezepturErbt(b, ziel)) return true;
    return false;
  }

  vorbereiten() {
    for (const m of this.alleMethoden) {
      for (const a of m.decl.annos) {
        if (a.name === 'Kühlschrank') {
          let e = null;
          if (a.args) {
            const b = a.args.ben.find(x => x.name === 'haltbar');
            e = b ? b.e : (a.args.pos[0] || null);
          }
          if (e === null) m.haltbar = Infinity;
          else {
            this.z = a.z; this.s = a.s;
            m.haltbar = this.dauerMs(this.ausw(e, this.global), '@Kühlschrank(haltbar: …)');
          }
        } else if (a.name === 'PizzaVeraltet') {
          let grund = '';
          if (a.args) {
            const b = a.args.ben.find(x => x.name === 'grund');
            const e = b ? b.e : (a.args.pos[0] || null);
            if (e) { this.z = a.z; this.s = a.s; grund = this.text(this.ausw(e, this.global)); }
          }
          m.veraltet = grund;
        }
      }
    }
    for (const k of this.klassenListe) {
      const ctx = { dies: null, klasse: k, ktor: false };
      for (const f of k.statischeFelder) {
        for (const d of f.decls) {
          if (d.init === null) continue;
          this.z = d.z; this.s = d.s;
          const sc = new Scope(this.global, ctx, true);
          const v = this.ausw(d.init, sc);
          this.pruefeTyp(f.typ, v, d.name);
          k.statisch.get(d.name).w = v;
        }
      }
    }
  }
}
laufzeitTeil(LaufzeitPruefung);
