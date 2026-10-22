use super::*;
use crate::kodierer::{Bild, Nachricht as N};

fn kern_mit(nachrichten: &[Vec<u8>]) -> Kern {
    let mut k = Kern::neu();
    for n in nachrichten {
        k.nachricht(n).expect("Nachricht");
    }
    k
}

#[test]
fn fenster_und_schliesse() {
    let mut k = Kern::neu();
    assert_eq!(k.nachricht(&N::fenster(320, 200, "Hallo Herd")), Ok(1));
    assert_eq!(k.fenster().unwrap().titel, "Hallo Herd");
    assert!(k.offen());
    assert_eq!(k.nachricht(&N::schliesse()), Ok(5));
    assert!(!k.offen());
}

#[test]
fn kaputte_nachrichten_liefern_fehler() {
    let mut k = Kern::neu();
    assert_eq!(k.nachricht(&[]), Err(Fehler::Leer));
    assert_eq!(k.nachricht(&[9]), Err(Fehler::UnbekannteArt));
    assert_eq!(k.nachricht(&[1, 0x40]), Err(Fehler::Abgeschnitten));
    assert_eq!(k.nachricht(&[5, 0]), Err(Fehler::Ueberhang));
    // Bild mit unbekanntem Befehl
    let mut b = vec![2, 1, 0, 0, 0, 1, 0, 0, 0, 0x7F];
    assert_eq!(k.nachricht(&b), Err(Fehler::UnbekannterBefehl));
    // Riesige Anzahl ohne Daten → abgeschnitten, keine Allokation
    b = vec![2, 1, 0, 0, 0, 0xFF, 0xFF, 0xFF, 0x7F];
    assert_eq!(k.nachricht(&b), Err(Fehler::Abgeschnitten));
    // Vieleck mit riesigem n
    b = vec![2, 1, 0, 0, 0, 1, 0, 0, 0, 0x05, 0xFF, 0xFF, 0xFF, 0xFF];
    assert_eq!(k.nachricht(&b), Err(Fehler::Abgeschnitten));
    // eigene Form mit Index außerhalb
    let f = N::eigene_form(3, &[0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0, 0.0], &[0, 1, 5], false);
    assert_eq!(k.nachricht(&f), Err(Fehler::Ungueltig));
    // Bildchen zu kurz
    let mut bc = N::bildchen(4, 2, 2, &[0; 16]);
    bc.pop();
    assert_eq!(k.nachricht(&bc), Err(Fehler::Abgeschnitten));
    // Text mit kaputtem UTF-8
    let t = vec![1, 64, 0, 64, 0, 2, 0, 0, 0, 0xC3, 0x28];
    assert_eq!(k.nachricht(&t), Err(Fehler::Ungueltig));
    // Zustand blieb leer
    assert!(k.fenster().is_none());
}

#[test]
fn jede_abgeschnittene_nachricht_ist_ein_fehler() {
    for s in demo::alle() {
        for n in &s.nachrichten {
            for l in 0..n.len() {
                let mut k = Kern::neu();
                assert!(k.nachricht(&n[..l]).is_err(), "{}: Länge {} von {}", s.name, l, n.len());
            }
        }
    }
}

#[test]
fn zufaellige_bytes_paniken_nie() {
    // einfacher deterministischer Zufall (xorshift)
    let mut x: u32 = 0x1234_5678;
    let mut zufall = || {
        x ^= x << 13;
        x ^= x >> 17;
        x ^= x << 5;
        x
    };
    let vorlage = demo::drei_d().nachrichten;
    for runde in 0..3000 {
        let mut n = vorlage[runde % vorlage.len()].clone();
        let kipp = 1 + zufall() as usize % 6;
        for _ in 0..kipp {
            let i = zufall() as usize % n.len();
            n[i] = zufall() as u8;
        }
        let mut k = Kern::neu();
        for v in &vorlage[..vorlage.len() - 1] {
            let _ = k.nachricht(v);
        }
        let _ = k.nachricht(&n);
        let _ = k.bereite(64 + zufall() % 300, 64 + zufall() % 300);
    }
}

#[test]
fn liste_ist_lesbar_und_seitentreu() {
    let mut k = kern_mit(&demo::zwei_d().nachrichten);
    let l = k.bereite(1000, 1000).to_vec();
    let a = Ansicht::neu(&l).expect("Liste");
    assert_eq!(a.ziel(), (1000, 1000));
    // 640×360 in 1000×1000 → 1000×563, mittig
    assert_eq!(a.ansichtsfenster(), [0, 218, 1000, 563]);
    assert_eq!(a.flags() & flag::DREI_D, 0);
    let zuege: Vec<Zug> = a.zuege().collect();
    assert!(!zuege.is_empty());
    assert!(zuege.iter().all(|z| z.durchgang == durchgang::FLACH));
    // Bildchen-Züge verweisen auf Bildchen 1/2
    assert!(zuege.iter().any(|z| z.textur == 1));
    let ecken = a.abschnitt(abschnitt::ECKEN2D).len() / ECKE2D_BYTES;
    let idx = a.abschnitt(abschnitt::INDIZES2D);
    for i in idx.chunks_exact(4) {
        assert!((u32::from_le_bytes([i[0], i[1], i[2], i[3]]) as usize) < ecken);
    }
    // Texturen: weiß, zwei Bildchen, Schrift
    let t: Vec<TexturEintrag> = a.texturen().collect();
    assert_eq!(t[0].id, textur::WEISS);
    assert_eq!(t[1].id, 1);
    assert_eq!(t[2].id, 2);
}

#[test]
fn drei_d_hat_alle_durchgaenge() {
    let mut k = kern_mit(&demo::drei_d().nachrichten);
    let l = k.bereite(640, 360).to_vec();
    let a = Ansicht::neu(&l).unwrap();
    assert_ne!(a.flags() & flag::DREI_D, 0);
    assert_ne!(a.flags() & flag::SCHATTEN, 0);
    assert_eq!(a.schatten_groesse(), szene::SCHATTEN_GROESSE);
    assert_eq!(a.abschnitt(abschnitt::SZENE).len(), SZENE_BYTES);
    let z: Vec<Zug> = a.zuege().collect();
    // Durchgänge in Reihenfolge
    for w in z.windows(2) {
        assert!(w[0].durchgang <= w[1].durchgang);
    }
    for d in [durchgang::SCHATTEN, durchgang::HIMMEL, durchgang::UNDURCHSICHTIG, durchgang::DURCHSICHTIG, durchgang::FLACH] {
        assert!(z.iter().any(|x| x.durchgang == d), "Durchgang {} fehlt", d);
    }
    let inst = a.abschnitt(abschnitt::INSTANZEN).len() / INSTANZ_BYTES;
    for x in &z {
        if x.durchgang != durchgang::HIMMEL && x.durchgang != durchgang::FLACH {
            assert!((x.erste_instanz + x.instanz_anzahl) as usize <= inst);
            assert!(k.netz(x.netz).is_some());
        }
    }
    // Durchsichtige: je zwei Züge (Rückseiten, dann Vorderseiten)
    let d: Vec<&Zug> = z.iter().filter(|x| x.durchgang == durchgang::DURCHSICHTIG).collect();
    assert_eq!(d.len(), 4);
    assert_eq!((d[0].seiten, d[1].seiten), (1, 2));
}

#[test]
fn ohne_bild_gibt_es_eine_leere_liste() {
    let mut k = Kern::neu();
    let l = k.bereite(100, 50).to_vec();
    let a = Ansicht::neu(&l).unwrap();
    assert_eq!(a.zuege().count(), 0);
    assert_eq!(a.klar()[0], 1.0);
}

#[test]
fn hash_ist_reproduzierbar() {
    for s in demo::alle() {
        let mut a = kern_mit(&s.nachrichten);
        let mut b = kern_mit(&s.nachrichten);
        a.bereite(640, 360);
        b.bereite(640, 360);
        assert_eq!(a.fnv(), b.fnv(), "{}", s.name);
        // zweimal vorbereiten ändert nichts
        a.bereite(640, 360);
        assert_eq!(a.fnv(), b.fnv());
    }
}

#[test]
fn erneutes_senden_erhoeht_version() {
    let mut k = Kern::neu();
    k.nachricht(&N::grundform(1, 1, 0, 0.0)).unwrap();
    let mut b = Bild::neu(1);
    b.zeichne(1, [0.0; 3], [1.0; 3], 0.0, 0.0, 0.0, crate::kodierer::palette::WEISS, 0.3, 0.0, 0);
    k.nachricht(&b.fertig()).unwrap();
    let v1 = Ansicht::neu(k.bereite(64, 64)).unwrap().netze().next().unwrap().version;
    k.nachricht(&N::grundform(1, 2, 8, 0.0)).unwrap();
    let v2 = Ansicht::neu(k.bereite(64, 64)).unwrap().netze().next().unwrap().version;
    assert!(v2 > v1);
}
