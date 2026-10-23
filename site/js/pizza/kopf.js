// pizza-Interpreter · Konstanten (Version, Schlüsselwörter, Typen, Ananas-Baum, Grenzen)
// Abschnitt von site/js/pizza.js (gemeinsamer Gültigkeitsbereich; Reihenfolge und Bau: scripts/baue-pizza.js).

// =====================================================================
// Konstanten
// =====================================================================

const VERSION = '3.1.0';

const KEYWORDS = [
  'paket', 'import', 'klasse', 'rezeptur', 'rohling', 'calzone', 'quattrostagioni',
  'erbt', 'erfüllt', 'speisekarte', 'familienrezept', 'geheimrezept', 'tiefkühl', 'gebacken',
  'leer', 'neu', 'dies', 'unten', 'serviere', 'falls', 'sonst', 'für', 'solange', 'wähle', 'fall', 'standard',
  'probier', 'verbrannt', 'rand', 'wirf', 'wirft', 'abbrechen', 'weiter', 'ja', 'nein', 'karton', 'ofen', 'roh'
];
const KW = new Set(KEYWORDS);

const TYPEN = ['salami', 'funghi', 'margherita', 'diavolo', 'Dauer', 'Blech', 'Speisekarte',
  'Teig', 'Lieferung', 'Zustellung', 'Reste', 'Rohling', 'hawaii',
  'Theke', 'Zutat', 'Schild', 'Knopf', 'Eingabe', 'Haken', 'Stapel', 'Reihe',
  'Takt', 'Fortschritt', 'Abschnitt', 'Tabelle', 'Reiter', 'Auswahl', 'Tastatur', 'Zettel', 'Zufall', 'Vorratskammer'];

const BUILTINS = ['Bote', 'Bestellannahme', 'Uhr', 'Mathe', 'Zufall', 'Spiegel', 'teig', 'bestelle', 'schieb', 'zwischenstand', 'Kiste'];

// Reihenfolge verbindlich (SPEC §8, K-105): PizzaLang.ANANAS und die Klassenindizes der Wasm-Laufzeit spiegeln sie.
const ANANAS_BAUM = [
  ['Ananas', null],
  ['GeprüfteAnanas', 'Ananas'],
  ['VerbranntAnanas', 'GeprüfteAnanas'],
  ['LieferAnanas', 'GeprüfteAnanas'],
  ['LaufzeitAnanas', 'Ananas'],
  ['StreitAnanas', 'LaufzeitAnanas'],
  ['RechenAnanas', 'LaufzeitAnanas'],
  ['LeererKartonAnanas', 'LaufzeitAnanas'],
  ['RohlingAnanas', 'LaufzeitAnanas'],
  ['GebackenAnanas', 'LaufzeitAnanas'],
  ['TypAnanas', 'LaufzeitAnanas'],
  ['KeinStückAnanas', 'LaufzeitAnanas'],
  ['ZugriffsAnanas', 'LaufzeitAnanas'],
  ['ZugeklapptAnanas', 'LaufzeitAnanas'],
  ['UnbekanntePizzaAnanas', 'LaufzeitAnanas'],
  ['KüchenAnanas', 'LaufzeitAnanas']        // Küchenbrigade (THREADS.md §2.3) – am Ende angehängt, Indizes bleiben
];
const ANANAS = ANANAS_BAUM.map(a => a[0]);

const MODIFIKATOREN = new Set(['speisekarte', 'familienrezept', 'geheimrezept', 'tiefkühl', 'gebacken', 'rohling', 'calzone']);

const PANIK_BANNER = [
  '╔══════════════════════════════════════════════╗',
  '║   🍍  PIZZA-VM KERNEL PANIC  🍍              ║',
  '║                                              ║',
  '║   Fataler Fehler: ANANAS_AUF_PIZZA           ║',
  '║   Adresse 0xPIZZA → Ofen überhitzt           ║',
  '║   Der Pizzaiolo hat den Raum verlassen.      ║',
  '║                                              ║',
  '║   Core dumped → reste.kaltepizza             ║',
  '╚══════════════════════════════════════════════╝',
  'Exit-Code: 39'
].join('\n');

const STANDARD_LIMIT = 5000000;
const MAX_STAPEL = 1500;
