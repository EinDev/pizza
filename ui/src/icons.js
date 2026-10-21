// Einheitliches Inline-SVG-Iconset (Stil wie Lucide: 24er-Raster, Stroke 1.75, currentColor).
// Alle Icons der App kommen von hier – keine Emoji/Unicode-Glyphen als Icons.

const P = {
  play: '<path d="M7 4.5v15l12-7.5z" fill="currentColor" stroke-linejoin="round"/>',
  stop: '<rect x="6" y="6" width="12" height="12" rx="1.5"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  chevronDown: '<path d="m6 9 6 6 6-6"/>',
  chevronRight: '<path d="m9 18 6-6-6-6"/>',
  more: '<circle cx="5" cy="12" r="1.2" fill="currentColor"/><circle cx="12" cy="12" r="1.2" fill="currentColor"/><circle cx="19" cy="12" r="1.2" fill="currentColor"/>',
  pin: '<path d="M12 17v5"/><path d="M9 10.8V5h6v5.8l2.4 2.9a1 1 0 0 1-.8 1.6H7.4a1 1 0 0 1-.8-1.6z"/><path d="M8 5h8"/>',
  pinOff: '<path d="M12 17v5"/><path d="M15 9.3V5h1M8 5h4"/><path d="M9 9v1.8l-2.4 2.9a1 1 0 0 0 .8 1.6H15"/><path d="m2 2 20 20"/>',
  copy: '<rect x="8" y="8" width="13" height="13" rx="2"/><path d="M4 16a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2"/>',
  pencil: '<path d="M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z"/><path d="m15 5 4 4"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/>',
  monitor: '<rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>',
  share: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>',
  restore: '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.7 2.7L3 8"/><path d="M3 3v5h5"/>',
  folderOpen: '<path d="m6 14 1.5-2.9A2 2 0 0 1 9.2 10H20a2 2 0 0 1 1.9 2.5l-1.5 6A2 2 0 0 1 18.4 20H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.7.9l.8 1.2a2 2 0 0 0 1.7.9H18a2 2 0 0 1 2 2v2"/>',
  file: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7z"/><path d="M14 2v5h6"/>',
  files: '<path d="M15.5 2H8.6c-.4 0-.8.2-1.1.5-.3.3-.5.7-.5 1.1v12.8c0 .4.2.8.5 1.1.3.3.7.5 1.1.5h9.8c.4 0 .8-.2 1.1-.5.3-.3.5-.7.5-1.1V6.5z"/><path d="M3 7.6v12.8c0 .4.2.8.5 1.1.3.3.7.5 1.1.5h9.8"/><path d="M15 2v5h5"/>',
  closeAll: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="m15 9-6 6M9 9l6 6"/>',
  closeOthers: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18"/><path d="m16 10-4 4M12 10l4 4"/>',
  closeRight: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M15 3v18"/><path d="m7 10 4 4M11 10l-4 4"/>',
  saved: '<path d="M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7"/><path d="M7 3v4a1 1 0 0 0 1 1h7"/>',
  dot: '<circle cx="12" cy="12" r="4" fill="currentColor" stroke="none"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  zap: '<path d="M13 2 3 14h9l-1 8 10-12h-9z"/>',
  cpu: '<rect x="5" y="5" width="14" height="14" rx="2"/><rect x="9" y="9" width="6" height="6" rx="1"/><path d="M9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3"/>',
  package: '<path d="M11 21.7a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16V8a2 2 0 0 0-1-1.7l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.7z"/><path d="M12 22V12M3.3 7 12 12l8.7-5"/>',
  terminal: '<path d="m4 17 6-6-6-6M12 19h8"/>',
  command: '<rect x="3" y="4" width="18" height="16" rx="2.5"/><path d="m7 10 3 2-3 2M12 15h5"/>',
  panel: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M15 3v18"/>',
  book: '<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>',
  maximize: '<path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9z"/>',
  trash: '<path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
  info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>',
  warn: '<path d="m21.7 18-8-14a2 2 0 0 0-3.5 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.7-3"/><path d="M12 9v4M12 17h.01"/>',
  error: '<circle cx="12" cy="12" r="10"/><path d="m15 9-6 6M9 9l6 6"/>',
  externalLink: '<path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
  gamepad: '<path d="M6 11h4M8 9v4M15 12h.01M18 10h.01"/><rect x="2" y="6" width="20" height="12" rx="4"/>',
  keyboard: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M6 9h.01M10 9h.01M14 9h.01M18 9h.01M7 15h10"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/>',
  pizza: '<path d="M12 3 2.5 19.5A1 1 0 0 0 3.4 21h17.2a1 1 0 0 0 .9-1.5z"/><path d="M4.6 17.5h14.8"/><circle cx="10" cy="13" r="1"/><circle cx="14" cy="15" r="1"/><circle cx="12" cy="9" r="1"/>',
  ananas: '<path d="M12 9c-3 0-5 2.6-5 6.2S9 21 12 21s5-2.2 5-5.8S15 9 12 9z"/><path d="M12 9V6M12 6 9 3M12 6l3-3M12 6l-4 1M12 6l4 1"/><path d="m9.5 12 5 5M14.5 12l-5 5"/>',
  hash: '<path d="M4 9h16M4 15h16M10 3 8 21M16 3l-2 18"/>',
  // Autovervollständigung
  ckeyword: '<path d="M4 7V5h16v2M9 19h6M12 5v14"/>',
  cfunction: '<path d="M10 20c1.5 0 2-1 2.4-3l2.2-11c.4-2 .9-3 2.4-3M8 10h8"/>',
  cmethod: '<path d="m12 3 8 4.5v9L12 21l-8-4.5v-9z"/><path d="M12 12 4 7.5M12 12l8-4.5M12 12v9"/>',
  cvariable: '<path d="M8 21s-4-3-4-9 4-9 4-9M16 3s4 3 4 9-4 9-4 9M9 9l6 6M15 9l-6 6"/>',
  cclass: '<path d="M3 7.5 12 3l9 4.5v9L12 21l-9-4.5z"/><path d="M12 12v9M12 12l9-4.5M12 12 3 7.5"/>',
  ctype: '<path d="M4 7V4h16v3M9 20h6M12 4v16"/>',
  cconstant: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M9 9h6M9 15h6"/>',
  cnamespace: '<path d="M8 3H7a2 2 0 0 0-2 2v5a2 2 0 0 1-2 2 2 2 0 0 1 2 2v5a2 2 0 0 0 2 2h1M16 21h1a2 2 0 0 0 2-2v-5a2 2 0 0 1 2-2 2 2 0 0 1-2-2V5a2 2 0 0 0-2-2h-1"/>',
  cannotation: '<circle cx="12" cy="12" r="4"/><path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-4 8"/>',
  csnippet: '<path d="m16 18 6-6-6-6M8 6l-6 6 6 6"/>',
};

/** SVG-Markup eines Icons (für innerHTML in eigenen, statischen Vorlagen). */
export function iconSvg(name, klasse = "") {
  const p = P[name] || P.dot;
  return `<svg class="icon${klasse ? " " + klasse : ""}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${p}</svg>`;
}

/** Icon als DOM-Element (span.icon-box mit SVG). */
export function icon(name, klasse = "") {
  const s = document.createElement("span");
  s.className = "icon-box" + (klasse ? " " + klasse : "");
  s.setAttribute("aria-hidden", "true");
  s.innerHTML = iconSvg(name);
  return s;
}

export const ICON_NAMEN = Object.keys(P);
