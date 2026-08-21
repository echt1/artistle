// ============================================================
// YOUTUBE: Songsuche (Data API) + Wiedergabe (IFrame Player API)
// ============================================================
// Warum YouTube statt Deezer-Preview: Deezer/Spotify-Previews sind
// algorithmisch gewaehlte Ausschnitte (oft der Refrain), nicht der
// Songanfang. YouTube "Official Audio"-Videos sind Volltracks, wir
// steuern selbst per JS ab welcher Sekunde abgespielt wird.

/**
 * Sucht den offiziellen "<Artist> - Topic"-Channel (YouTubes automatisch
 * generierter Channel mit reinen Audio-Uploads, ohne Musikvideo-Intro/
 * Stille/Skits davor). Existiert er, spielen wir bevorzugt von dort.
 * Gibt null zurueck wenn kein exakt passender Topic-Channel existiert.
 */
async function findTopicChannelId(artistName) {
  const q = encodeURIComponent(`${artistName} - Topic`);
  const url = `https://www.googleapis.com/youtube/v3/search`
    + `?part=snippet&type=channel&maxResults=5&q=${q}&key=${CONFIG.YOUTUBE_API_KEY}`;

  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    const target = `${artistName.toLowerCase()} - topic`;
    const match = (data.items || []).find(
      item => item.snippet.title.toLowerCase() === target
    );
    return match ? match.snippet.channelId : null;
  } catch {
    return null; // Topic-Channel-Suche ist ein Nice-to-have, nie hart failen
  }
}

async function runYoutubeVideoSearch(query, channelId) {
  let url = `https://www.googleapis.com/youtube/v3/search`
    + `?part=snippet&type=video&videoEmbeddable=true`
    + `&maxResults=${CONFIG.YOUTUBE_SEARCH_RESULT_COUNT}&q=${encodeURIComponent(query)}`
    + `&key=${CONFIG.YOUTUBE_API_KEY}`;

  if (channelId) {
    url += `&channelId=${channelId}`;
  } else {
    url += `&videoCategoryId=10`; // Musik-Kategorie, hilft bei allgemeiner Suche
  }

  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    const msg = body?.error?.message || `HTTP ${res.status}`;
    throw new Error(`YouTube-Suche fehlgeschlagen: ${msg}`);
  }
  const data = await res.json();
  return (data.items || [])
    .filter(item => item.id && item.id.videoId)
    .map(item => ({ videoId: item.id.videoId, title: item.snippet.title }));
}

/**
 * Sucht auf YouTube nach dem Track. Wenn ein Topic-Channel bekannt ist,
 * wird zuerst dort gesucht (reines Audio, startet garantiert ohne
 * Musikvideo-Intro-Stille) - erst wenn das nichts findet, kommt die
 * allgemeine Suche mit "official audio" als Fallback.
 */
async function searchYoutubeCandidates(artistName, trackTitle, topicChannelId) {
  if (topicChannelId) {
    const topicResults = await runYoutubeVideoSearch(trackTitle, topicChannelId);
    if (topicResults.length) return topicResults;
  }
  return runYoutubeVideoSearch(`${artistName} ${trackTitle} official audio`, null);
}

// ---- IFrame Player Setup ----

let ytApiReadyPromise = null;

function loadYoutubeIframeApi() {
  if (ytApiReadyPromise) return ytApiReadyPromise;
  ytApiReadyPromise = new Promise((resolve) => {
    if (window.YT && window.YT.Player) {
      resolve();
      return;
    }
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      if (typeof previous === "function") previous();
      resolve();
    };
  });
  return ytApiReadyPromise;
}

let ytPlayer = null;
let ytPlayerReadyResolvers = [];
let ytPlayerReady = false;
let currentLoadResolver = null;

function getYtPlayer() {
  if (ytPlayer && ytPlayerReady) return Promise.resolve(ytPlayer);

  return new Promise((resolve) => {
    ytPlayerReadyResolvers.push(resolve);
    if (ytPlayer) return; // Player wird schon initialisiert

    loadYoutubeIframeApi().then(() => {
      ytPlayer = new YT.Player("ytPlayer", {
        height: "1",
        width: "1",
        playerVars: { autoplay: 0, controls: 0, disablekb: 1, modestbranding: 1, rel: 0 },
        events: {
          onReady: () => {
            ytPlayerReady = true;
            ytPlayerReadyResolvers.forEach(r => r(ytPlayer));
            ytPlayerReadyResolvers = [];
          },
          onError: () => {
            if (currentLoadResolver) {
              currentLoadResolver(false);
              currentLoadResolver = null;
            }
          },
          onStateChange: (e) => {
            const ok = e.data === YT.PlayerState.CUED || e.data === YT.PlayerState.PLAYING;
            if (ok && currentLoadResolver) {
              currentLoadResolver(true);
              currentLoadResolver = null;
            }
          },
        },
      });
    });
  });
}

/** Versucht ein Video zu laden (nicht abspielen). Resolved false bei Embed-Fehler. */
function tryLoadVideo(player, videoId) {
  return new Promise((resolve) => {
    currentLoadResolver = resolve;
    player.cueVideoById(videoId);
    // Sicherheits-Timeout, falls weder onError noch onStateChange feuern.
    setTimeout(() => {
      if (currentLoadResolver === resolve) {
        currentLoadResolver = null;
        resolve(false);
      }
    }, 4000);
  });
}

/**
 * Sucht den Track auf YouTube und laedt den ersten Kandidaten, der sich
 * tatsaechlich einbetten laesst. Wirft, wenn gar keiner klappt.
 */
async function loadPlayableYoutubeTrack(artistName, trackTitle, topicChannelId) {
  const candidates = await searchYoutubeCandidates(artistName, trackTitle, topicChannelId);
  if (!candidates.length) {
    throw new Error(`Kein YouTube-Video fuer "${trackTitle}" gefunden.`);
  }

  const player = await getYtPlayer();

  for (const candidate of candidates) {
    const works = await tryLoadVideo(player, candidate.videoId);
    if (works) return candidate.videoId;
  }
  throw new Error(`Kein einbettbares Video fuer "${trackTitle}" gefunden.`);
}

/** Spielt die aktuelle Runde ab Sekunde 0 fuer die angegebene Dauer. */
function playYoutubeSnippet(seconds, onDone) {
  ytPlayer.seekTo(0, true);
  ytPlayer.playVideo();
  return setTimeout(() => {
    ytPlayer.pauseVideo();
    if (onDone) onDone();
  }, seconds * 1000);
}
