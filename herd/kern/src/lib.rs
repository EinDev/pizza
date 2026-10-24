//! Herd-Kern (Schicht 2 + 3, HERD.md §3): Welt aus Teilen mit Komponenten, Systeme, Culling, Batching →
//! Bildpaket. `no_std` + `alloc` + `libm`; nativ (Bibliothek) und als `kern.wasm` bitgleich (K-129).
//!
//! Einstieg: [`Kern`] – jede Methode entspricht einem Export des Herd-ABI (`herd/README.md`).

#![cfg_attr(not(test), no_std)]

extern crate alloc;

pub mod abi;
pub mod farbe;
pub mod fehler;
pub mod formen;
pub mod hash;
pub mod lichter;
pub mod komponenten;
pub mod mathe;
pub mod paket;
pub mod ressourcen;
pub mod schema;
pub mod schrift;
pub mod teigling;
pub mod welt;
pub mod zahl;

pub use abi::Kern;

#[cfg(test)]
mod tests;
