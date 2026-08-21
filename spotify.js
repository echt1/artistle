// ============================================================
// SPOTIFY: Login per PKCE (komplett ohne Server/Client-Secret) +
// Song zu "Meine Musik" hinzufuegen
// ============================================================
// PKCE = Proof Key for Code Exchange. Speziell fuer Apps gedacht, die
// keinen Server haben um ein Secret geheim zu halten (genau unser Fall).
// Ablauf: wir schicken den Browser zu Spotifys Login-Seite, Spotify
// schickt ihn mit einem "code" zurueck, den tauschen wir direkt aus dem
// Browser gegen ein Access-Token - kein Secret noetig, nur ein
// selbst generierter "code_verifier".

const SPOTIFY_TOKEN_KEY = "artistle_spotify_token";
const SPOTIFY_VERIFIER_KEY = "artistle_spotify_verifier";

function spotifyRandomString(length) {
  const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const randomValues = crypto.getRandomValues(new Uint8Array(length));
  let text = "";
  randomValues.forEach(v => { text += possible[v % possible.length]; });
  return text;
}

async function spotifySha256Base64Url(plain) {
  const data = new TextEncoder().encode(plain);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function spotifyRedirectUri() {
  // Muss 1:1 (inklusive Slash am Ende oder nicht) im Spotify Dashboard
  // als Redirect-URI eingetragen sein, sonst lehnt Spotify den Login ab.
  return window.location.origin + window.location.pathname;
}

/** Schickt den Browser zu Spotifys Login-Seite. */
async function startSpotifyLogin() {
  const verifier = spotifyRandomString(64);
  sessionStorage.setItem(SPOTIFY_VERIFIER_KEY, verifier);
  const challenge = await spotifySha256Base64Url(verifier);

  const params = new URLSearchParams({
    client_id: CONFIG.SPOTIFY_CLIENT_ID,
    response_type: "code",
    redirect_uri: spotifyRedirectUri(),
    scope: "user-library-modify user-library-read",
    code_challenge_method: "S256",
    code_challenge: challenge,
  });

  window.location.href = `https://accounts.spotify.com/authorize?${params.toString()}`;
}

/** Tauscht den von Spotify zurueckgegebenen "code" gegen ein Access-Token. */
async function exchangeSpotifyCode(code) {
  const verifier = sessionStorage.getItem(SPOTIFY_VERIFIER_KEY);
  if (!verifier) throw new Error("Kein code_verifier gefunden (Session abgelaufen?).");

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: spotifyRedirectUri(),
    client_id: CONFIG.SPOTIFY_CLIENT_ID,
    code_verifier: verifier,
  });

  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) throw new Error("Spotify-Login fehlgeschlagen (Code-Austausch).");

  const data = await res.json();
  sessionStorage.setItem(SPOTIFY_TOKEN_KEY, JSON.stringify({
    accessToken: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  }));
  sessionStorage.removeItem(SPOTIFY_VERIFIER_KEY);
  return data.access_token;
}

/** Liefert das gespeicherte Token, oder null wenn nicht eingeloggt/abgelaufen. */
function getStoredSpotifyToken() {
  const raw = sessionStorage.getItem(SPOTIFY_TOKEN_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (Date.now() >= parsed.expiresAt) return null;
    return parsed.accessToken;
  } catch {
    return null;
  }
}

/** Sucht den Track auf Spotify und legt ihn in "Meine Musik" ab. */
async function saveTrackToSpotify(artistName, trackTitle) {
  const token = getStoredSpotifyToken();
  if (!token) throw new Error("Nicht mit Spotify verbunden.");

  const q = encodeURIComponent(`track:${trackTitle} artist:${artistName}`);
  const searchRes = await fetch(`https://api.spotify.com/v1/search?type=track&limit=1&q=${q}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!searchRes.ok) throw new Error("Spotify-Suche fehlgeschlagen.");
  const searchData = await searchRes.json();
  const track = searchData.tracks && searchData.tracks.items && searchData.tracks.items[0];
  if (!track) throw new Error("Song nicht auf Spotify gefunden.");

  const saveRes = await fetch(`https://api.spotify.com/v1/me/tracks?ids=${track.id}`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!saveRes.ok) throw new Error("Speichern in Spotify-Bibliothek fehlgeschlagen.");
  return track;
}
