// ============================================================
// DEEZER API WRAPPER (via JSONP, siehe deezerFetch)
// ============================================================

let jsonpCounter = 0;

/**
 * Deezer via JSONP abfragen (offiziell von Deezer unterstuetzt, siehe
 * Deezer Developer FAQ). Erzeugt ein <script>-Tag, das Deezer laedt;
 * Deezer ruft dann selbst unsere Callback-Funktion mit den Daten auf.
 * Kein CORS-Proxy noetig, kein Drittanbieter im Spiel.
 */
function deezerFetch(path) {
  return new Promise((resolve, reject) => {
    const callbackName = `__deezerJsonp_${Date.now()}_${jsonpCounter++}`;
    const separator = path.includes("?") ? "&" : "?";
    const url = `${CONFIG.DEEZER_BASE}${path}${separator}output=jsonp&callback=${callbackName}`;

    const script = document.createElement("script");
    let settled = false;

    const timer = setTimeout(() => {
      finish(() => reject(new Error(`Deezer-Timeout fuer ${path}`)));
    }, CONFIG.REQUEST_TIMEOUT_MS);

    function finish(action) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      delete window[callbackName];
      script.remove();
      action();
    }

    window[callbackName] = (data) => {
      finish(() => {
        if (data && data.error) {
          reject(new Error(`Deezer-API-Error: ${data.error.message || JSON.stringify(data.error)}`));
        } else {
          resolve(data);
        }
      });
    };

    script.onerror = () => {
      finish(() => reject(new Error(`Konnte Deezer nicht erreichen (${path})`)));
    };

    script.src = url;
    document.head.appendChild(script);
  });
}

/** Sucht Artists per Namen. Gibt die Top-Treffer zurueck. */
async function searchArtists(query) {
  const data = await deezerFetch(`/search/artist?q=${encodeURIComponent(query)}&limit=8`);
  return (data && data.data) || [];
}

/** Holt die Top-Tracks eines Artists (Songpool fuer die Runde). */
async function getArtistTopTracks(artistId, limit = CONFIG.POOL_SIZE) {
  const data = await deezerFetch(`/artist/${artistId}/top?limit=${limit}`);
  return (data && data.data) || [];
}