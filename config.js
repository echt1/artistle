// ============================================================
// ZENTRALE KONFIGURATION
// ============================================================

const CONFIG = {
  // Deezers JSON-API sendet keine CORS-Header, deshalb Requests
  // ueber einen oeffentlichen Proxy leiten. Falls dieser Proxy
  // mal ausfaellt, reicht es diese eine Zeile zu ersetzen
  // (z.B. durch einen selbst gehosteten Cloudflare Worker).
  CORS_PROXY_PREFIX: "https://api.allorigins.win/raw?url=",

  DEEZER_BASE: "https://api.deezer.com",

  // Snippet-Laengen in Sekunden, in der Reihenfolge wie sie
  // bei falschen Antworten freigeschaltet werden.
  SNIPPET_LENGTHS: [0.1, 0.5, 1, 2, 4, 8, 15],

  // Wie viele Songs pro Schwierigkeitsstufe im Pool landen.
  POOL_SIZE_EASY: 10,      // Rang 1-10 (Top-Hits)
  POOL_SIZE_MEDIUM_END: 40, // Rang 11-40 (bekannt, aber nicht die groessten Hits)

  // Wie viele Alben maximal nach Deep-Cuts durchsucht werden
  // (Sicherheitslimit gegen zu viele Requests bei sehr aktiven Artists).
  MAX_ALBUMS_FOR_HARD_MODE: 25,

  // Ab wie vielen eingegebenen Zeichen Autocomplete-Vorschlaege erscheinen.
  AUTOCOMPLETE_MIN_CHARS: 4,

  MAX_AUTOCOMPLETE_RESULTS: 8,
};
