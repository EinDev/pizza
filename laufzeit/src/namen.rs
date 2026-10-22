//! Eingebaute Namen (Intern-IDs). Reihenfolge = ID. Namen, die nicht hier stehen, bekommen zur Laufzeit
//! fortlaufende IDs (text.rs::name_id); die Tabelle ist rein intern (kein JS-Spiegel, der Compiler übergibt Namen als Text).

pub const NAMEN: [&str; 202] = [
    "",
    "Bote",
    "Bestellannahme",
    "Uhr",
    "Mathe",
    "Zufall",
    "Spiegel",
    "teig",
    "bestelle",
    "schieb",
    "zwischenstand",
    "auto",
    "Ananas",
    "GeprüfteAnanas",
    "VerbranntAnanas",
    "LieferAnanas",
    "LaufzeitAnanas",
    "StreitAnanas",
    "RechenAnanas",
    "LeererKartonAnanas",
    "RohlingAnanas",
    "GebackenAnanas",
    "TypAnanas",
    "KeinStückAnanas",
    "ZugriffsAnanas",
    "ZugeklapptAnanas",
    "UnbekanntePizzaAnanas",
    "KüchenAnanas",
    "euro",
    "runden",
    "abs",
    "alsText",
    "ganz",
    "länge",
    "groß",
    "klein",
    "enthält",
    "zerlege",
    "ersetze",
    "trimme",
    "zeichen",
    "wiederhole",
    "beginntMit",
    "endetMit",
    "alsZahl",
    "istLeer",
    "inMs",
    "inSekunden",
    "inMinuten",
    "stück",
    "hinzu",
    "entferne",
    "setze",
    "belege",
    "filtere",
    "zusammenklappen",
    "summe",
    "erstes",
    "letztes",
    "umdrehen",
    "sortiere",
    "verbinde",
    "schneide",
    "kopie",
    "lege",
    "hole",
    "hat",
    "schlüssel",
    "werte",
    "name",
    "position",
    "nachricht",
    "holeNachricht",
    "typ",
    "aufklappen",
    "gehenlassen",
    "backen",
    "istAufgegangen",
    "trinkgeld",
    "warte",
    "wennDa",
    "istGeliefert",
    "pünktlich",
    "wert",
    "oderGratis",
    "istMatschig",
    "teilergebnis",
    "verbrauchteZeit",
    "mikrowelle",
    "frisch",
    "rufe",
    "sage",
    "fehler",
    "schreibe",
    "leeren",
    "lies",
    "frage",
    "liesZahl",
    "frageZahl",
    "hatMehr",
    "jetzt",
    "vorspulen",
    "wurzel",
    "max",
    "min",
    "boden",
    "decke",
    "potenz",
    "PI",
    "zahl",
    "felder",
    "stellen",
    "start",
    "temperatur",
    "zeit",
    "haltbar",
    "grund",
    "hauptgang",
    "Hawaii",
    "Blech",
    "Speisekarte",
    "salami",
    "funghi",
    "margherita",
    "diavolo",
    "Dauer",
    "hawaii",
    "text",
    "ersatz",
    "Theke",
    "Zutat",
    "Schild",
    "Knopf",
    "Eingabe",
    "Haken",
    "Stapel",
    "Reihe",
    "zeige",
    "bediene",
    "schliesse",
    "setzeTitel",
    "titel",
    "id",
    "sichtbar",
    "stil",
    "setzeText",
    "beiKlick",
    "aktiv",
    "setzeWert",
    "beiAenderung",
    "beiEnter",
    "an",
    "setzeAn",
    "kinder",
    "platzhalter",
    "breite",
    "hoehe",
    "kommazahl",
    "wahr",
    "wähle",
    "mische",
    "saat",
    "Vorratskammer",
    "tausender",
    "kompakt",
    "intervall",
    "setzeIntervall",
    "beiTakt",
    "Takt",
    "Fortschritt",
    "Abschnitt",
    "Tabelle",
    "Reiter",
    "hinweis",
    "spalten",
    "setzeSpalten",
    "zeilen",
    "setzeZeilen",
    "waehle",
    "gewaehlt",
    "seiten",
    "echt",
    "animiere",
    "uebergang",
    "schwebe",
    "art",
    "dauer",
    "bei",
    "farbe",
    "namensraum",
    "Auswahl",
    "Tastatur",
    "optionen",
    "setzeOptionen",
    "klappbar",
    "zu",
    "beiTaste",
    "log",
    "log10",
    "log2",
    "exp",
    "E",
];

pub const N_G_BOTE: u32 = 1;
pub const N_G_BESTELLANNAHME: u32 = 2;
pub const N_G_UHR: u32 = 3;
pub const N_G_MATHE: u32 = 4;
pub const N_G_ZUFALL: u32 = 5;
pub const N_G_SPIEGEL: u32 = 6;
pub const N_TEIG: u32 = 7;
pub const N_BESTELLE: u32 = 8;
pub const N_SCHIEB: u32 = 9;
pub const N_ZWISCHENSTAND: u32 = 10;
pub const N_AUTO: u32 = 11;
pub const N_G_ANANAS: u32 = 12;
pub const N_G_GEPRUEFTEANANAS: u32 = 13;
pub const N_G_VERBRANNTANANAS: u32 = 14;
pub const N_G_LIEFERANANAS: u32 = 15;
pub const N_G_LAUFZEITANANAS: u32 = 16;
pub const N_G_STREITANANAS: u32 = 17;
pub const N_G_RECHENANANAS: u32 = 18;
pub const N_G_LEERERKARTONANANAS: u32 = 19;
pub const N_G_ROHLINGANANAS: u32 = 20;
pub const N_G_GEBACKENANANAS: u32 = 21;
pub const N_G_TYPANANAS: u32 = 22;
pub const N_G_KEINSTUECKANANAS: u32 = 23;
pub const N_G_ZUGRIFFSANANAS: u32 = 24;
pub const N_G_ZUGEKLAPPTANANAS: u32 = 25;
pub const N_G_UNBEKANNTEPIZZAANANAS: u32 = 26;
pub const N_G_KUECHENANANAS: u32 = 27;
pub const N_EURO: u32 = 28;
pub const N_RUNDEN: u32 = 29;
pub const N_ABS: u32 = 30;
pub const N_ALSTEXT: u32 = 31;
pub const N_GANZ: u32 = 32;
pub const N_LAENGE: u32 = 33;
pub const N_GROSS: u32 = 34;
pub const N_KLEIN: u32 = 35;
pub const N_ENTHAELT: u32 = 36;
pub const N_ZERLEGE: u32 = 37;
pub const N_ERSETZE: u32 = 38;
pub const N_TRIMME: u32 = 39;
pub const N_ZEICHEN: u32 = 40;
pub const N_WIEDERHOLE: u32 = 41;
pub const N_BEGINNTMIT: u32 = 42;
pub const N_ENDETMIT: u32 = 43;
pub const N_ALSZAHL: u32 = 44;
pub const N_ISTLEER: u32 = 45;
pub const N_INMS: u32 = 46;
pub const N_INSEKUNDEN: u32 = 47;
pub const N_INMINUTEN: u32 = 48;
pub const N_STUECK: u32 = 49;
pub const N_HINZU: u32 = 50;
pub const N_ENTFERNE: u32 = 51;
pub const N_SETZE: u32 = 52;
pub const N_BELEGE: u32 = 53;
pub const N_FILTERE: u32 = 54;
pub const N_ZUSAMMENKLAPPEN: u32 = 55;
pub const N_SUMME: u32 = 56;
pub const N_ERSTES: u32 = 57;
pub const N_LETZTES: u32 = 58;
pub const N_UMDREHEN: u32 = 59;
pub const N_SORTIERE: u32 = 60;
pub const N_VERBINDE: u32 = 61;
pub const N_SCHNEIDE: u32 = 62;
pub const N_KOPIE: u32 = 63;
pub const N_LEGE: u32 = 64;
pub const N_HOLE: u32 = 65;
pub const N_HAT: u32 = 66;
pub const N_SCHLUESSEL: u32 = 67;
pub const N_WERTE: u32 = 68;
pub const N_NAME: u32 = 69;
pub const N_POSITION: u32 = 70;
pub const N_NACHRICHT: u32 = 71;
pub const N_HOLENACHRICHT: u32 = 72;
pub const N_TYP: u32 = 73;
pub const N_AUFKLAPPEN: u32 = 74;
pub const N_GEHENLASSEN: u32 = 75;
pub const N_BACKEN: u32 = 76;
pub const N_ISTAUFGEGANGEN: u32 = 77;
pub const N_TRINKGELD: u32 = 78;
pub const N_WARTE: u32 = 79;
pub const N_WENNDA: u32 = 80;
pub const N_ISTGELIEFERT: u32 = 81;
pub const N_PUENKTLICH: u32 = 82;
pub const N_WERT: u32 = 83;
pub const N_ODERGRATIS: u32 = 84;
pub const N_ISTMATSCHIG: u32 = 85;
pub const N_TEILERGEBNIS: u32 = 86;
pub const N_VERBRAUCHTEZEIT: u32 = 87;
pub const N_MIKROWELLE: u32 = 88;
pub const N_FRISCH: u32 = 89;
pub const N_RUFE: u32 = 90;
pub const N_SAGE: u32 = 91;
pub const N_FEHLER: u32 = 92;
pub const N_SCHREIBE: u32 = 93;
pub const N_LEEREN: u32 = 94;
pub const N_LIES: u32 = 95;
pub const N_FRAGE: u32 = 96;
pub const N_LIESZAHL: u32 = 97;
pub const N_FRAGEZAHL: u32 = 98;
pub const N_HATMEHR: u32 = 99;
pub const N_JETZT: u32 = 100;
pub const N_VORSPULEN: u32 = 101;
pub const N_WURZEL: u32 = 102;
pub const N_MAX: u32 = 103;
pub const N_MIN: u32 = 104;
pub const N_BODEN: u32 = 105;
pub const N_DECKE: u32 = 106;
pub const N_POTENZ: u32 = 107;
pub const N_G_PI: u32 = 108;
pub const N_ZAHL: u32 = 109;
pub const N_FELDER: u32 = 110;
pub const N_STELLEN: u32 = 111;
pub const N_START: u32 = 112;
pub const N_TEMPERATUR: u32 = 113;
pub const N_ZEIT: u32 = 114;
pub const N_HALTBAR: u32 = 115;
pub const N_GRUND: u32 = 116;
pub const N_HAUPTGANG: u32 = 117;
pub const N_G_HAWAII: u32 = 118;
pub const N_G_BLECH: u32 = 119;
pub const N_G_SPEISEKARTE: u32 = 120;
pub const N_SALAMI: u32 = 121;
pub const N_FUNGHI: u32 = 122;
pub const N_MARGHERITA: u32 = 123;
pub const N_DIAVOLO: u32 = 124;
pub const N_G_DAUER: u32 = 125;
pub const N_HAWAII: u32 = 126;

pub const N_TEXT: u32 = 127;
pub const N_ERSATZ: u32 = 128;

pub const N_G_THEKE: u32 = 129;
pub const N_G_ZUTAT: u32 = 130;
pub const N_G_SCHILD: u32 = 131;
pub const N_G_KNOPF: u32 = 132;
pub const N_G_EINGABE: u32 = 133;
pub const N_G_HAKEN: u32 = 134;
pub const N_G_STAPEL: u32 = 135;
pub const N_G_REIHE: u32 = 136;
pub const N_ZEIGE: u32 = 137;
pub const N_BEDIENE: u32 = 138;
pub const N_SCHLIESSE: u32 = 139;
pub const N_SETZETITEL: u32 = 140;
pub const N_TITEL: u32 = 141;
pub const N_ID: u32 = 142;
pub const N_SICHTBAR: u32 = 143;
pub const N_STIL: u32 = 144;
pub const N_SETZETEXT: u32 = 145;
pub const N_BEIKLICK: u32 = 146;
pub const N_AKTIV: u32 = 147;
pub const N_SETZEWERT: u32 = 148;
pub const N_BEIAENDERUNG: u32 = 149;
pub const N_BEIENTER: u32 = 150;
pub const N_AN: u32 = 151;
pub const N_SETZEAN: u32 = 152;
pub const N_KINDER: u32 = 153;
pub const N_PLATZHALTER: u32 = 154;
pub const N_BREITE: u32 = 155;
pub const N_HOEHE: u32 = 156;

pub const N_KOMMAZAHL: u32 = 157;
pub const N_WAHR: u32 = 158;
pub const N_WAEHLE: u32 = 159;
pub const N_MISCHE: u32 = 160;
pub const N_SAAT: u32 = 161;
pub const N_G_VORRATSKAMMER: u32 = 162;

pub const N_TAUSENDER: u32 = 163;
pub const N_KOMPAKT: u32 = 164;
pub const N_INTERVALL: u32 = 165;
pub const N_SETZEINTERVALL: u32 = 166;
pub const N_BEITAKT: u32 = 167;
pub const N_G_TAKT: u32 = 168;
pub const N_G_FORTSCHRITT: u32 = 169;
pub const N_G_ABSCHNITT: u32 = 170;
pub const N_G_TABELLE: u32 = 171;
pub const N_G_REITER: u32 = 172;
pub const N_HINWEIS: u32 = 173;
pub const N_SPALTEN: u32 = 174;
pub const N_SETZESPALTEN: u32 = 175;
pub const N_ZEILEN: u32 = 176;
pub const N_SETZEZEILEN: u32 = 177;
pub const N_WAEHLE_ASCII: u32 = 178;
pub const N_GEWAEHLT: u32 = 179;
pub const N_SEITEN: u32 = 180;
pub const N_ECHT: u32 = 181;
pub const N_ANIMIERE: u32 = 182;
pub const N_UEBERGANG: u32 = 183;
pub const N_SCHWEBE: u32 = 184;
pub const N_ART: u32 = 185;
pub const N_DAUER: u32 = 186;
pub const N_BEI: u32 = 187;
pub const N_FARBE: u32 = 188;
pub const N_NAMENSRAUM: u32 = 189;

// Theke v4 (K-107 … K-113) und Mathe (K-111)
pub const N_G_AUSWAHL: u32 = 190;
pub const N_G_TASTATUR: u32 = 191;
pub const N_OPTIONEN: u32 = 192;
pub const N_SETZEOPTIONEN: u32 = 193;
pub const N_KLAPPBAR: u32 = 194;
pub const N_ZU: u32 = 195;
pub const N_BEITASTE: u32 = 196;
pub const N_LOG: u32 = 197;
pub const N_LOG10: u32 = 198;
pub const N_LOG2: u32 = 199;
pub const N_EXP: u32 = 200;
pub const N_G_E: u32 = 201;

/// Klassen-Index der eingebauten Ananas (Reihenfolge wie ANANAS_BAUM, K-105: 16 Einträge = Indizes 0–15; eigene Klassen ab 16).
pub const K_ANANAS: u32 = 0;
pub const K_GEPRUEFTE: u32 = 1;
pub const K_VERBRANNT: u32 = 2;
pub const K_LIEFER: u32 = 3;
pub const K_LAUFZEIT: u32 = 4;
pub const K_STREIT: u32 = 5;
pub const K_RECHEN: u32 = 6;
pub const K_LEERERKARTON: u32 = 7;
pub const K_ROHLING: u32 = 8;
pub const K_GEBACKEN: u32 = 9;
pub const K_TYP: u32 = 10;
pub const K_KEINSTUECK: u32 = 11;
pub const K_ZUGRIFFS: u32 = 12;
pub const K_ZUGEKLAPPT: u32 = 13;
pub const K_UNBEKANNTEPIZZA: u32 = 14;
pub const K_KUECHE: u32 = 15;
pub const ANANAS_BAUM: [(u32, i32); 16] = [(N_G_ANANAS, -1), (N_G_GEPRUEFTEANANAS, 0), (N_G_VERBRANNTANANAS, 1), (N_G_LIEFERANANAS, 1), (N_G_LAUFZEITANANAS, 0), (N_G_STREITANANAS, 4), (N_G_RECHENANANAS, 4), (N_G_LEERERKARTONANANAS, 4), (N_G_ROHLINGANANAS, 4), (N_G_GEBACKENANANAS, 4), (N_G_TYPANANAS, 4), (N_G_KEINSTUECKANANAS, 4), (N_G_ZUGRIFFSANANAS, 4), (N_G_ZUGEKLAPPTANANAS, 4), (N_G_UNBEKANNTEPIZZAANANAS, 4), (N_G_KUECHENANANAS, 4)];
