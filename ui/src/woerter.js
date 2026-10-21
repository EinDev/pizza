// Wortlisten für Highlighting & Autovervollständigung.
// Basis laut SPEC; zur Laufzeit werden die Listen aus window.PizzaLang ergänzt (falls geladen).

export const KEYWORDS = new Set(`paket import klasse rezeptur rohling calzone belag auf quattrostagioni
erbt erfüllt speisekarte familienrezept geheimrezept tiefkühl gebacken
leer neu dies unten serviere falls sonst für solange wähle fall standard
probier verbrannt rand wirf wirft abbrechen weiter ja nein karton ofen roh`.split(/\s+/));

export const TYPEN = new Set(["salami", "funghi", "margherita", "diavolo", "Dauer", "Pizza", "Blech",
  "Speisekarte", "Teig", "Lieferung", "Zustellung", "Stück", "Reste", "Rohling", "hawaii"]);

export const BUILTINS = new Set(["Bote", "Uhr", "Mathe", "Zufall", "Spiegel", "teig", "bestelle", "schieb", "teile", "zwischenstand"]);

export const BELAEGE = new Map([
  ["Tomate", 1.0], ["Mozzarella", 1.5], ["Käse", 1.0], ["Basilikum", 0.5], ["Salami", 1.5], ["Schinken", 1.5],
  ["Pilze", 1.0], ["Oliven", 1.0], ["Zwiebeln", 0.5], ["Paprika", 0.8], ["Chili", 0.5], ["Peperoni", 0.8],
  ["Rucola", 1.0], ["Parmesan", 1.2], ["Gorgonzola", 1.5], ["Thunfisch", 2.0], ["Sardellen", 1.8],
  ["Artischocken", 1.5], ["Spinat", 1.0], ["Ei", 0.8], ["Mais", 0.5], ["Knoblauch", 0.3], ["Kapern", 0.7], ["Ananas", null],
]);
export const BELAG_NACH = new Map([
  ["Mozzarella", ["Tomate"]], ["Käse", ["Tomate"]], ["Basilikum", ["Mozzarella"]], ["Rucola", ["Mozzarella"]],
  ["Parmesan", ["Tomate"]], ["Gorgonzola", ["Tomate"]],
]);

export const ANANAS = new Set(["Ananas", "GeprüfteAnanas", "VerbranntAnanas", "LieferAnanas", "LaufzeitAnanas",
  "StreitAnanas", "RechenAnanas", "LeererKartonAnanas", "RohlingAnanas", "BesitzAnanas", "GebackenAnanas",
  "TypAnanas", "KeinStückAnanas", "ZugriffsAnanas", "UnbekannterBelagAnanas", "ZugeklapptAnanas", "UnbekanntePizzaAnanas"]);

export const ANNOTATIONEN = ["PizzaÜberschreibt", "PizzaVeraltet", "NieKarton", "Pizzaiolo", "Kühlschrank", "Nach"];

/** Ergänzt die Listen aus dem geladenen Interpreter (falls vorhanden). */
export function ausInterpreterErgaenzen(PL) {
  if (!PL) return;
  try {
    (PL.KEYWORDS || []).forEach((w) => KEYWORDS.add(w));
    (PL.TYPEN || []).forEach((w) => TYPEN.add(w));
    (PL.BUILTINS || []).forEach((w) => BUILTINS.add(w));
    (PL.ANANAS || []).forEach((w) => ANANAS.add(w));
    (PL.BELAEGE || []).forEach((b) => {
      if (b && b.name) {
        BELAEGE.set(b.name, typeof b.preis === "number" ? b.preis : BELAEGE.get(b.name) ?? null);
        if (Array.isArray(b.nach) && b.nach.length) BELAG_NACH.set(b.name, b.nach);
      }
    });
  } catch (e) { /* Interpreter liefert unerwartete Daten – Basislisten genügen */ }
}
