//! Speisekarte: geordnete Hash-Map mit SameValueZero-Schlüsseln (wie JS `Map`).
//! Einträge liegen in Einfügereihenfolge in `k`/`v`; gelöschte Plätze tragen den Schlüssel UNDEF
//! (werden bei Bedarf kompaktiert). `idx` ist eine offene Hashtabelle (0 = frei, u32::MAX = gelöscht, sonst Position+1).

use crate::text::bytes;
use crate::wert::*;
use alloc::vec::Vec;

#[repr(C)]
pub struct Karte { pub art: u32, pub n: u32, pub k: Vec<W>, pub v: Vec<W>, pub idx: Vec<u32> }

const FREI: u32 = 0;
const GELOESCHT: u32 = u32::MAX;

pub fn neu_karte() -> W { neu_w(Karte { art: A_KARTE, n: 0, k: Vec::new(), v: Vec::new(), idx: Vec::new() }) }
pub fn karte(w: W) -> &'static mut Karte { obj::<Karte>(w) }

fn hash(k: W) -> u32 {
    let mut h: u64 = 0xcbf29ce484222325;
    if art(k) == A_TEXT {
        for &b in bytes(k) { h ^= b as u64; h = h.wrapping_mul(0x100000001b3); }
    } else {
        let mut x = k;
        if ist_zahl(k) && f(k) == 0.0 { x = 0; }
        h ^= x; h = h.wrapping_mul(0x100000001b3);
        h ^= x >> 29; h = h.wrapping_mul(0x100000001b3);
    }
    (h ^ (h >> 32)) as u32
}

fn gleich_svz(a: W, b: W) -> bool { crate::ops::same_value_zero(a, b) }

fn neu_index(m: &mut Karte) {
    let mut cap = 16usize;
    while cap < m.k.len() * 2 + 2 { cap *= 2; }
    m.idx = alloc::vec![FREI; cap];
    for i in 0..m.k.len() {
        let key = m.k[i];
        if key == UNDEF { continue; }
        let maske = cap - 1;
        let mut p = hash(key) as usize & maske;
        while m.idx[p] != FREI { p = (p + 1) & maske; }
        m.idx[p] = i as u32 + 1;
    }
}

fn kompaktiere(m: &mut Karte) {
    let mut k = Vec::with_capacity(m.n as usize);
    let mut v = Vec::with_capacity(m.n as usize);
    for i in 0..m.k.len() { if m.k[i] != UNDEF { k.push(m.k[i]); v.push(m.v[i]); } }
    m.k = k; m.v = v;
    neu_index(m);
}

/// Position des Schlüssels in k/v
pub fn finde(m: &mut Karte, key: W) -> Option<usize> {
    if m.k.len() <= 8 {
        for i in 0..m.k.len() { if m.k[i] != UNDEF && gleich_svz(m.k[i], key) { return Some(i); } }
        return None;
    }
    if m.idx.is_empty() {
        // Küchenbrigade: eine Speisekarte der Hauptküche wird nur gelesen (kein nachträglicher Index)
        if crate::gefroren(m as *mut Karte as u32) {
            for i in 0..m.k.len() { if m.k[i] != UNDEF && gleich_svz(m.k[i], key) { return Some(i); } }
            return None;
        }
        neu_index(m);
    }
    let maske = m.idx.len() - 1;
    let mut p = hash(key) as usize & maske;
    loop {
        let e = m.idx[p];
        if e == FREI { return None; }
        if e != GELOESCHT {
            let i = (e - 1) as usize;
            if gleich_svz(m.k[i], key) { return Some(i); }
        }
        p = (p + 1) & maske;
    }
}

pub fn lege(m: &mut Karte, key: W, val: W) {
    if let Some(i) = finde(m, key) { m.v[i] = val; return; }
    m.k.push(key);
    m.v.push(val);
    m.n += 1;
    if m.k.len() <= 8 { m.idx = Vec::new(); } else {
        if m.idx.is_empty() || m.k.len() * 2 + 2 > m.idx.len() { neu_index(m); }
        else {
            let maske = m.idx.len() - 1;
            let mut p = hash(key) as usize & maske;
            while m.idx[p] != FREI && m.idx[p] != GELOESCHT { p = (p + 1) & maske; }
            m.idx[p] = m.k.len() as u32;
        }
    }
}

pub fn entferne(m: &mut Karte, key: W) -> W {
    let i = match finde(m, key) { Some(i) => i, None => return KARTON };
    let v = m.v[i];
    if !m.idx.is_empty() {
        let maske = m.idx.len() - 1;
        let mut p = hash(key) as usize & maske;
        loop {
            if m.idx[p] == i as u32 + 1 { m.idx[p] = GELOESCHT; break; }
            if m.idx[p] == FREI { break; }
            p = (p + 1) & maske;
        }
    }
    m.k[i] = UNDEF;
    m.v[i] = KARTON;
    m.n -= 1;
    if m.k.len() > 16 && (m.n as usize) * 2 < m.k.len() { kompaktiere(m); }
    else if m.k.len() <= 8 { // kleine Karten: direkt kompakt halten
        let mut j = 0;
        while j < m.k.len() { if m.k[j] == UNDEF { m.k.remove(j); m.v.remove(j); } else { j += 1; } }
        m.idx = Vec::new();
    }
    v
}

pub fn schluessel(m: &Karte) -> Vec<W> { m.k.iter().copied().filter(|&k| k != UNDEF).collect() }
pub fn werte(m: &Karte) -> Vec<W> { (0..m.k.len()).filter(|&i| m.k[i] != UNDEF).map(|i| m.v[i]).collect() }
pub fn laenge(m: &Karte) -> usize { m.n as usize }
