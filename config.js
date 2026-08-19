// ============================================================
// ZENTRALE KONFIGURATION
// ============================================================

const CONFIG = {
  // Deezers JSON-API sendet keine CORS-Header, deshalb Requests
  // ueber oeffentliche Proxies leiten. Mehrere Proxies als Fallback,
  // weil die kostenlosen Dienste alle mal haengen/down sind - wenn
  // der erste nicht innerhalb von REQUEST_TIMEOUT_MS antwortet,
  // wird automatisch der naechste probiert.
  CORS_PROXIES: [
    "https://api.codetabs.com/v1/proxy/?quest=",
    "https://proxy.corsfix.com/?",
    "https://api.allorigins.win/raw?url=",
  ],
  REQUEST_TIMEOUT_MS: 6000,

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
