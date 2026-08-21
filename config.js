// ============================================================
// ZENTRALE KONFIGURATION
// ============================================================

const CONFIG = {
  // ---- YouTube Data API (fuer die Songsuche + echten Vollton) ----
  // Hier deinen eigenen kostenlosen API-Key eintragen (siehe README.md,
  // Abschnitt "YouTube API-Key holen"). Ohne Key funktioniert nichts.
  YOUTUBE_API_KEY: "DEIN_YOUTUBE_API_KEY_HIER",

  // Wie viele YouTube-Treffer pro Song probiert werden, falls der erste
  // Treffer nicht einbettbar ist (Lizenz-Sperren o.ae.).
  YOUTUBE_SEARCH_RESULT_COUNT: 3,

  // ---- Spotify (optional: Song zu "Meine Musik" hinzufuegen) ----
  // Siehe README.md, Abschnitt "Spotify verbinden". Ohne Client-ID
  // bleibt der Spotify-Button einfach inaktiv, der Rest des Spiels
  // funktioniert trotzdem ganz normal.
  SPOTIFY_CLIENT_ID: "DEIN_SPOTIFY_CLIENT_ID_HIER",

  // ---- Firebase/Firestore (fuer den Challenge-Modus) ----
  // Nur zum Speichern von Challenge-Ergebnissen, kein Cloud Functions/
  // Blaze-Tarif noetig - Firestore direkt aus dem Browser laeuft auf dem
  // kostenlosen Spark-Tarif. Siehe README.md, Abschnitt "Challenge-Modus".
  FIREBASE_CONFIG: {
    apiKey: "DEIN_FIREBASE_API_KEY",
    authDomain: "DEIN_PROJEKT.firebaseapp.com",
    projectId: "DEIN_PROJEKT_ID",
    storageBucket: "DEIN_PROJEKT.appspot.com",
    messagingSenderId: "DEINE_SENDER_ID",
    appId: "DEINE_APP_ID",
  },

  // ---- Deezer (nur noch fuer Artist-Suche + Songtitel-Liste) ----
  DEEZER_BASE: "https://api.deezer.com",

  // Groesse des Songpools (Top-Tracks des gewaehlten Artists).
  POOL_SIZE: 50,

  // ---- Spiel-Einstellungen ----
  // Snippet-Laengen in Sekunden, in der Reihenfolge wie sie
  // bei falschen Antworten freigeschaltet werden.
  SNIPPET_LENGTHS: [0.1, 0.5, 2, 4, 8, 15],

  // Ab wie vielen eingegebenen Zeichen Autocomplete-Vorschlaege erscheinen.
  AUTOCOMPLETE_MIN_CHARS: 4,

  MAX_AUTOCOMPLETE_RESULTS: 8,

  // Timeout fuer einzelne Netzwerk-Requests (Deezer JSONP, YouTube-Suche).
  REQUEST_TIMEOUT_MS: 8000,
};
