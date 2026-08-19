// ============================================================
// DEEZER API WRAPPER
// Alle Requests laufen ueber den CORS-Proxy aus config.js
// ============================================================

async function deezerFetch(path) {
  const targetUrl = CONFIG.DEEZER_BASE + path;
  const proxied = CONFIG.CORS_PROXY_PREFIX + encodeURIComponent(targetUrl);
  const res = await fetch(proxied);
  if (!res.ok) {
    throw new Error(`Deezer-Request fehlgeschlagen (${res.status}) fuer ${path}`);
  }
  return res.json();
}

/** Sucht Artists per Namen. Gibt die Top-Treffer zurueck. */
async function searchArtists(query) {
  const data = await deezerFetch(`/search/artist?q=${encodeURIComponent(query)}&limit=8`);
  return (data && data.data) || [];
}

/** Holt die Top-Tracks eines Artists, absteigend nach Popularitaet sortiert (Deezer liefert sie bereits so). */
async function getArtistTopTracks(artistId, limit = 50) {
  const data = await deezerFetch(`/artist/${artistId}/top?limit=${limit}`);
  return (data && data.data) || [];
}

/** Holt alle Alben eines Artists (fuer den Deep-Cut-Pool im Hard-Modus). */
async function getArtistAlbums(artistId, limit = CONFIG.MAX_ALBUMS_FOR_HARD_MODE) {
  const data = await deezerFetch(`/artist/${artistId}/albums?limit=${limit}`);
  return (data && data.data) || [];
}

/** Holt alle Tracks eines einzelnen Albums. */
async function getAlbumTracks(albumId) {
  const data = await deezerFetch(`/album/${albumId}`);
  return (data && data.tracks && data.tracks.data) || [];
}

/**
 * Baut den kompletten "Deep Cut"-Pool: alle Tracks aus allen Alben,
 * dedupliziert nach Titel, ohne die Tracks die schon im Easy/Medium-Pool sind.
 */
async function buildDeepCutPool(artistId, excludeIds) {
  const albums = await getArtistAlbums(artistId);
  // Nur echte Alben/EPs, keine Best-Of-Compilations o.ae. -> weniger Dopplungen
  const relevantAlbums = albums.filter(a => a.record_type !== "compile");

  // Sequenziell statt parallel laden: der kostenlose CORS-Proxy
  // blockt/droselt bei zu vielen gleichzeitigen Requests.
  const seenTitles = new Set();
  const pool = [];

  for (const album of relevantAlbums) {
    let tracks = [];
    try {
      tracks = await getAlbumTracks(album.id);
    } catch (e) {
      continue; // einzelnes Album ueberspringen statt ganzen Pool killen
    }
    for (const t of tracks) {
      if (excludeIds.has(t.id)) continue;
      const key = t.title.toLowerCase().trim();
      if (seenTitles.has(key)) continue;
      seenTitles.add(key);
      pool.push(t);
    }
  }
  return pool;
}
