// ============================================================
// APP STATE
// ============================================================

const MAX_SNIPPET = CONFIG.SNIPPET_LENGTHS[CONFIG.SNIPPET_LENGTHS.length - 1];

const state = {
  artist: null,        // { id, name, picture_medium, nb_fan }
  topicChannelId: null, // "<Artist> - Topic"-Channel, falls vorhanden
  pool: [],              // Songtitel-Pool des Artists (fuer Autocomplete + Zufallsauswahl)
  targetTrack: null,    // { id, title, link }
  targetVideoId: null,  // gefundenes YouTube-Video fuer diese Runde
  attemptIndex: 0,
  wrongGuesses: [],
  finished: false,
  loadingRound: false,
  snippetTimer: null,
  challenge: null,       // { role: 'A'|'B', id, playerName } waehrend einer Challenge-Runde
};

const el = (id) => document.getElementById(id);

const steps = {
  search: el("step-search"),
  challengeIntro: el("step-challenge-intro"),
  game: el("step-game"),
};

function showStep(name) {
  Object.values(steps).forEach(s => s.classList.remove("active"));
  steps[name].classList.add("active");
}

// ============================================================
// STEP 1: ARTIST-SUCHE (Live-Dropdown)
// ============================================================

const artistInput = el("artistInput");
const artistDropdown = el("artistDropdown");
const ARTIST_SEARCH_MIN_CHARS = 2;
const ARTIST_SEARCH_DEBOUNCE_MS = 350;

let artistSearchDebounceTimer = null;
let artistSearchRequestId = 0;

artistInput.addEventListener("input", () => {
  const query = artistInput.value.trim();
  clearTimeout(artistSearchDebounceTimer);

  if (query.length < ARTIST_SEARCH_MIN_CHARS) {
    hideArtistDropdown();
    return;
  }

  showArtistDropdownLoading();
  artistSearchDebounceTimer = setTimeout(() => runArtistSearch(query), ARTIST_SEARCH_DEBOUNCE_MS);
});

el("searchForm").addEventListener("submit", (e) => {
  e.preventDefault();
  clearTimeout(artistSearchDebounceTimer);
  const query = artistInput.value.trim();
  if (query.length < ARTIST_SEARCH_MIN_CHARS) return;
  runArtistSearch(query);
});

async function runArtistSearch(query) {
  const requestId = ++artistSearchRequestId;
  el("searchStatus").textContent = "";

  try {
    const artists = await searchArtists(query);
    if (requestId !== artistSearchRequestId) return;
    renderArtistDropdown(artists);
  } catch (err) {
    if (requestId !== artistSearchRequestId) return;
    console.error(err);
    showArtistDropdownError();
  }
}

function showArtistDropdownLoading() {
  artistDropdown.innerHTML = `<div class="artist-suggestion-item loading">Suche läuft...</div>`;
  artistDropdown.classList.remove("hidden");
}

function showArtistDropdownError() {
  artistDropdown.innerHTML = `<div class="artist-suggestion-item empty">Fehler bei der Suche. Nochmal probieren?</div>`;
  artistDropdown.classList.remove("hidden");
}

function renderArtistDropdown(artists) {
  if (!artists.length) {
    artistDropdown.innerHTML = `<div class="artist-suggestion-item empty">Keine Artists gefunden</div>`;
    artistDropdown.classList.remove("hidden");
    return;
  }

  artistDropdown.innerHTML = "";
  artists.forEach(artist => {
    const item = document.createElement("div");
    item.className = "artist-suggestion-item";
    item.innerHTML = `
      <img src="${artist.picture_medium}" alt="${artist.name}" loading="lazy" />
      <div class="info">
        <span class="name">${artist.name}</span>
        <span class="fans">${formatFans(artist.nb_fan)} Fans</span>
      </div>
    `;
    item.addEventListener("click", () => {
      hideArtistDropdown();
      selectArtist(artist);
    });
    artistDropdown.appendChild(item);
  });
  artistDropdown.classList.remove("hidden");
}

function hideArtistDropdown() {
  artistDropdown.classList.add("hidden");
  artistDropdown.innerHTML = "";
}

document.addEventListener("click", (e) => {
  if (!e.target.closest("#searchForm .autocomplete-wrap")) {
    hideArtistDropdown();
  }
});

function formatFans(n) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(0) + "K";
  return String(n);
}

el("restartBtn").addEventListener("click", () => {
  state.artist = null;
  state.pool = [];
  state.challenge = null;
  artistInput.value = "";
  hideArtistDropdown();
  el("searchStatus").textContent = "";
  el("restartBtn").classList.add("hidden");
  el("startChallengeBtn").classList.add("hidden");
  showStep("search");
});

// ============================================================
// ARTIST WÄHLEN -> POOL LADEN -> SPIEL STARTEN
// ============================================================

async function selectArtist(artist) {
  state.artist = artist;
  artistInput.value = artist.name;

  const cardHtml = `
    <img src="${artist.picture_medium}" alt="${artist.name}" />
    <div>
      <div class="name">${artist.name}</div>
      <div class="fans">${formatFans(artist.nb_fan)} Fans</div>
    </div>
  `;
  el("gameArtistCard").innerHTML = cardHtml;
  el("restartBtn").classList.remove("hidden");

  el("searchStatus").textContent = "Lade Songs...";

  try {
    const [top] = await Promise.all([
      getArtistTopTracks(artist.id, CONFIG.POOL_SIZE),
      findTopicChannelId(artist.name).then(id => { state.topicChannelId = id; }),
    ]);
    state.pool = top.map(t => ({
      id: t.id,
      title: t.title_short || t.title,
      link: t.link,
    }));

    if (state.pool.length < 4) {
      throw new Error("Zu wenige Songs für diesen Artist gefunden.");
    }

    el("searchStatus").textContent = "";
    el("startChallengeBtn").classList.remove("hidden");
    showStep("game");
    startNewRound();
  } catch (err) {
    console.error(err);
    el("searchStatus").textContent = "Fehler: " + err.message;
  }
}

// ============================================================
// RUNDE STARTEN (inkl. YouTube-Songsuche)
// ============================================================

async function startNewRound(preserveChallenge = false) {
  state.finished = false;
  state.attemptIndex = 0;
  state.wrongGuesses = [];
  state.targetTrack = null;
  state.targetVideoId = null;
  state.loadingRound = true;
  if (!preserveChallenge) state.challenge = null;

  el("guessHistory").innerHTML = "";
  guessInput.value = "";
  suggestionsBox.classList.add("hidden");
  el("resultBanner").classList.add("hidden");
  el("nextRoundBtn").classList.add("hidden");
  el("challengePanel").classList.add("hidden");
  el("challengePanel").innerHTML = "";
  el("gameStatus").textContent = "Suche Song auf YouTube...";
  resetPostGuessControls();

  setRoundControlsEnabled(false);
  renderTimeline();
  renderAttemptCounter();
  renderSnippetInfo();

  const maxTries = 5;
  let lastErr = null;

  for (let i = 0; i < maxTries; i++) {
    const candidateTrack = state.pool[Math.floor(Math.random() * state.pool.length)];
    try {
      const videoId = await loadPlayableYoutubeTrack(state.artist.name, candidateTrack.title, state.topicChannelId);
      state.targetTrack = candidateTrack;
      state.targetVideoId = videoId;
      state.loadingRound = false;
      el("gameStatus").textContent = "";
      setRoundControlsEnabled(true);
      return;
    } catch (err) {
      lastErr = err;
    }
  }

  state.loadingRound = false;
  el("gameStatus").textContent = "Konnte keinen abspielbaren Song finden. "
    + "Nochmal probieren: " + (lastErr ? lastErr.message : "");
  el("nextRoundBtn").textContent = "Nochmal versuchen";
  el("nextRoundBtn").classList.remove("hidden");
}

function setRoundControlsEnabled(enabled) {
  playBtn.disabled = !enabled;
  guessInput.disabled = !enabled;
  document.querySelector('#guessForm button[type="submit"]').disabled = !enabled;
  el("skipBtn").disabled = !enabled;
}

// ============================================================
// TIMELINE (segmentierte Zeitleiste statt Ein-Ausschnitt-Balken)
// ============================================================

const timelineFill = el("timelineFill");
const timelinePlayhead = el("timelinePlayhead");
const timelineTicks = el("timelineTicks");

function timelinePercent(seconds) {
  return Math.sqrt(seconds / MAX_SNIPPET) * 100;
}

function renderTimeline() {
  timelineTicks.innerHTML = "";
  CONFIG.SNIPPET_LENGTHS.forEach((seconds, i) => {
    const tick = document.createElement("div");
    tick.className = "tick";
    tick.style.left = `${timelinePercent(seconds)}%`;
    tick.dataset.index = i;
    tick.innerHTML = `
      <div class="tick-mark"></div>
      <div class="tick-label">${seconds}s</div>
    `;
    timelineTicks.appendChild(tick);
  });
  updateTimelineState();
  resetPlayhead();
}

function updateTimelineState() {
  const boundaryPercent = timelinePercent(CONFIG.SNIPPET_LENGTHS[state.attemptIndex]);
  timelineFill.style.width = `${boundaryPercent}%`;

  timelineTicks.querySelectorAll(".tick").forEach(tick => {
    const i = Number(tick.dataset.index);
    tick.classList.remove("past", "current", "future");
    if (i < state.attemptIndex) tick.classList.add("past");
    else if (i === state.attemptIndex) tick.classList.add("current");
    else tick.classList.add("future");
  });
}

function resetPlayhead() {
  timelinePlayhead.style.transition = "none";
  timelinePlayhead.style.left = "0%";
}

function animatePlayhead(seconds) {
  const boundaryPercent = timelinePercent(seconds);
  timelinePlayhead.style.transition = "none";
  timelinePlayhead.style.left = "0%";
  void timelinePlayhead.offsetWidth; // reflow, damit die Transition sauber neu startet
  timelinePlayhead.style.transition = `left ${seconds}s linear`;
  timelinePlayhead.style.left = `${boundaryPercent}%`;
}

function renderAttemptCounter() {
  el("attemptCounter").textContent = `Versuch ${state.attemptIndex + 1}/${CONFIG.SNIPPET_LENGTHS.length}`;
}

function renderSnippetInfo() {
  el("currentSnippetLength").textContent = `${CONFIG.SNIPPET_LENGTHS[state.attemptIndex]}s`;
}

// ============================================================
// AUDIO-WIEDERGABE (YouTube)
// ============================================================

const playBtn = el("playBtn");

playBtn.addEventListener("click", playCurrentSnippet);

function playCurrentSnippet() {
  if (!state.targetVideoId || state.loadingRound) return;
  clearTimeout(state.snippetTimer);

  const length = CONFIG.SNIPPET_LENGTHS[state.attemptIndex];
  playBtn.classList.add("playing");
  freeListenBtn.classList.remove("listening");
  freeListenPlaying = false;
  animatePlayhead(length);

  state.snippetTimer = playYoutubeSnippet(length, () => {
    playBtn.classList.remove("playing");
  });
}

// ---- "Ganzen Song weiterhören": nach dem ersten Guess/Skip freigeschaltet,
// spielt frei (ohne Timer-Cutoff) ab der aktuellen Position weiter. ----

const freeListenBtn = el("continueListenBtn");
let freeListenPlaying = false;

freeListenBtn.addEventListener("click", () => {
  if (!ytPlayer || !state.targetVideoId) return;
  clearTimeout(state.snippetTimer);
  playBtn.classList.remove("playing");

  if (freeListenPlaying) {
    ytPlayer.pauseVideo();
    freeListenPlaying = false;
    freeListenBtn.textContent = "▶ Ganzen Song weiterhören";
    freeListenBtn.classList.remove("listening");
  } else {
    ytPlayer.playVideo();
    freeListenPlaying = true;
    freeListenBtn.textContent = "⏸ Pause";
    freeListenBtn.classList.add("listening");
  }
});

/** Nach jedem Guess/Skip (egal ob richtig/falsch) freischalten: weiterhören + zu Spotify hinzufuegen. */
function unlockPostGuessControls() {
  freeListenBtn.classList.remove("hidden");
  if (getStoredSpotifyToken()) {
    spotifySaveBtn.classList.remove("hidden");
    spotifySaveBtn.disabled = false;
    spotifyStatus.textContent = "";
  }
}

function resetPostGuessControls() {
  freeListenBtn.classList.add("hidden");
  freeListenBtn.textContent = "▶ Ganzen Song weiterhören";
  freeListenBtn.classList.remove("listening");
  freeListenPlaying = false;
  spotifySaveBtn.classList.add("hidden");
  spotifyStatus.textContent = "";
}

// ============================================================
// AUTOCOMPLETE
// ============================================================

const guessInput = el("guessInput");
const suggestionsBox = el("suggestions");

guessInput.addEventListener("input", () => {
  const val = guessInput.value.trim();
  if (val.length < CONFIG.AUTOCOMPLETE_MIN_CHARS) {
    suggestionsBox.classList.add("hidden");
    suggestionsBox.innerHTML = "";
    return;
  }

  const matches = state.pool
    .filter(t => t.title.toLowerCase().includes(val.toLowerCase()))
    .slice(0, CONFIG.MAX_AUTOCOMPLETE_RESULTS);

  if (!matches.length) {
    suggestionsBox.classList.add("hidden");
    suggestionsBox.innerHTML = "";
    return;
  }

  suggestionsBox.innerHTML = "";
  matches.forEach(track => {
    const item = document.createElement("div");
    item.className = "suggestion-item";
    item.textContent = track.title;
    item.addEventListener("click", () => {
      guessInput.value = track.title;
      suggestionsBox.classList.add("hidden");
      guessInput.focus();
    });
    suggestionsBox.appendChild(item);
  });
  suggestionsBox.classList.remove("hidden");
});

document.addEventListener("click", (e) => {
  if (!e.target.closest("#guessForm .autocomplete-wrap")) {
    suggestionsBox.classList.add("hidden");
  }
});

// ============================================================
// GUESSING
// ============================================================

el("guessForm").addEventListener("submit", (e) => {
  e.preventDefault();
  if (state.finished || state.loadingRound) return;

  const guess = guessInput.value.trim();
  if (!guess) return;

  suggestionsBox.classList.add("hidden");

  if (normalizeStr(guess) === normalizeStr(state.targetTrack.title)) {
    endRound(true);
  } else {
    registerWrongGuess(guess);
  }
});

el("skipBtn").addEventListener("click", () => {
  if (state.finished || state.loadingRound) return;
  registerWrongGuess(null);
});

function normalizeStr(s) {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function registerWrongGuess(guessText) {
  state.wrongGuesses.push(guessText);

  const li = document.createElement("li");
  li.textContent = guessText ? `❌ ${guessText}` : "⏭️ Geskippt";
  el("guessHistory").prepend(li);

  guessInput.value = "";
  state.attemptIndex++;
  unlockPostGuessControls();

  if (state.attemptIndex >= CONFIG.SNIPPET_LENGTHS.length) {
    endRound(false);
    return;
  }

  renderAttemptCounter();
  renderSnippetInfo();
  updateTimelineState();
  resetPlayhead();
}

function endRound(won) {
  state.finished = true;
  clearTimeout(state.snippetTimer);
  if (ytPlayer) ytPlayer.pauseVideo();
  playBtn.classList.remove("playing");
  freeListenPlaying = false;
  freeListenBtn.textContent = "▶ Ganzen Song weiterhören";
  freeListenBtn.classList.remove("listening");
  unlockPostGuessControls();

  setRoundControlsEnabled(false);

  const banner = el("resultBanner");
  banner.classList.remove("hidden", "win", "lose");
  banner.classList.add(won ? "win" : "lose");

  const ytLink = `https://www.youtube.com/watch?v=${state.targetVideoId}`;
  const attemptsUsed = state.attemptIndex + 1;

  if (won) {
    banner.innerHTML = `🎉 Richtig! Es war <strong>${state.targetTrack.title}</strong> `
      + `(Versuch ${attemptsUsed}/${CONFIG.SNIPPET_LENGTHS.length}). `
      + `<a href="${ytLink}" target="_blank" rel="noopener">Auf YouTube ansehen ↗</a>`;
  } else {
    banner.innerHTML = `😬 Leider nicht erraten. Der Song war <strong>${state.targetTrack.title}</strong>. `
      + `<a href="${ytLink}" target="_blank" rel="noopener">Auf YouTube ansehen ↗</a>`;
  }

  el("nextRoundBtn").textContent = "Nächster Song";
  el("nextRoundBtn").classList.remove("hidden");

  if (state.challenge) {
    handleChallengeRoundEnd(won);
  }
}

el("nextRoundBtn").addEventListener("click", () => startNewRound());

// ============================================================
// SPOTIFY INTEGRATION
// ============================================================

const spotifyLoginBtn = el("spotifyLoginBtn");
const spotifySaveBtn = el("spotifySaveBtn");
const spotifyStatus = el("spotifyStatus");

function isSpotifyConfigured() {
  return CONFIG.SPOTIFY_CLIENT_ID && !CONFIG.SPOTIFY_CLIENT_ID.startsWith("DEIN_");
}

function updateSpotifyLoginUI() {
  if (!isSpotifyConfigured()) {
    spotifyLoginBtn.textContent = "Spotify (kein Client-ID hinterlegt)";
    spotifyLoginBtn.disabled = true;
    return;
  }
  const loggedIn = !!getStoredSpotifyToken();
  spotifyLoginBtn.textContent = loggedIn ? "✓ Mit Spotify verbunden" : "Mit Spotify verbinden";
  spotifyLoginBtn.disabled = loggedIn;
}

spotifyLoginBtn.addEventListener("click", () => {
  startSpotifyLogin();
});

spotifySaveBtn.addEventListener("click", async () => {
  spotifySaveBtn.disabled = true;
  spotifyStatus.textContent = "Speichere...";
  try {
    await saveTrackToSpotify(state.artist.name, state.targetTrack.title);
    spotifyStatus.textContent = "✓ Zu Spotify hinzugefügt";
  } catch (err) {
    console.error(err);
    spotifyStatus.textContent = "Fehler: " + err.message;
    spotifySaveBtn.disabled = false;
  }
});

/**
 * Nach dem Redirect von Spotify zurueck (URL enthaelt ?code=...) das
 * Access-Token holen. Achtung: die Seite laedt dabei komplett neu, der
 * bisherige Spielstand (gewaehlter Artist etc.) geht verloren - man landet
 * wieder bei der Artist-Suche. Ist eine bekannte Einschraenkung des
 * serverlosen Login-Flows.
 */
async function handleSpotifyRedirectIfNeeded() {
  const params = new URLSearchParams(window.location.search);
  const code = params.get("code");
  if (!code) return;

  try {
    await exchangeSpotifyCode(code);
  } catch (err) {
    console.error(err);
  } finally {
    window.history.replaceState({}, document.title, window.location.pathname);
    updateSpotifyLoginUI();
  }
}

handleSpotifyRedirectIfNeeded();
updateSpotifyLoginUI();
handleIncomingChallengeIfNeeded();

// ============================================================
// CHALLENGE-MODUS
// ============================================================

el("startChallengeBtn").addEventListener("click", () => {
  if (!isFirebaseConfigured()) {
    alert("Erst FIREBASE_CONFIG in config.js eintragen (siehe README, Abschnitt Challenge-Modus).");
    return;
  }
  const name = (window.prompt("Dein Name (wird deiner Gegner-Person angezeigt):", "") || "").trim();
  if (!name) return;

  state.challenge = { role: "A", playerName: name };
  startNewRound(true);
});

/** Wird von endRound() aufgerufen, wenn state.challenge gesetzt ist. */
async function handleChallengeRoundEnd(won) {
  const panel = el("challengePanel");
  panel.classList.remove("hidden");
  const result = { won, attemptsUsed: state.attemptIndex + 1 };

  if (state.challenge.role === "A") {
    panel.innerHTML = `<p class="status">Challenge wird erstellt...</p>`;
    try {
      const id = await createChallenge({
        artistName: state.artist.name,
        artistPicture: state.artist.picture_medium,
        trackTitle: state.targetTrack.title,
        videoId: state.targetVideoId,
        pool: state.pool.map(t => t.title),
        playerName: state.challenge.playerName,
        result,
      });
      state.challenge.id = id;
      const shareUrl = `${window.location.origin}${window.location.pathname}?challenge=${id}`;
      renderChallengeWaiting(shareUrl);
      listenToChallenge(id, (data) => {
        if (data.playerB) renderChallengeComparison(data);
      });
    } catch (err) {
      console.error(err);
      panel.innerHTML = `<p class="status">Challenge konnte nicht erstellt werden: ${err.message}</p>`;
    }
    return;
  }

  // role === "B"
  panel.innerHTML = `<p class="status">Ergebnis wird übermittelt...</p>`;
  try {
    await submitChallengeResultAsB(state.challenge.id, state.challenge.playerName, result);
    const data = await getChallenge(state.challenge.id);
    renderChallengeComparison({ ...data, playerB: { name: state.challenge.playerName, ...result } });
  } catch (err) {
    console.error(err);
    panel.innerHTML = `<p class="status">Ergebnis konnte nicht übermittelt werden: ${err.message}</p>`;
  }
}

function renderChallengeWaiting(shareUrl) {
  const panel = el("challengePanel");
  panel.innerHTML = `
    <h3>Challenge erstellt!</h3>
    <p class="status">Link an deine Gegner-Person schicken:</p>
    <div class="challenge-link-row">
      <input type="text" readonly value="${shareUrl}" id="challengeLinkInput" />
      <button id="copyChallengeLinkBtn" class="ghost-btn">Kopieren</button>
    </div>
    <p class="status">Diese Seite aktualisiert sich automatisch, sobald das Ergebnis da ist
      (falls du sie offen lässt) — sonst reicht es, den Link später nochmal zu öffnen.</p>
  `;
  el("copyChallengeLinkBtn").addEventListener("click", () => {
    navigator.clipboard.writeText(shareUrl).then(() => {
      el("copyChallengeLinkBtn").textContent = "Kopiert!";
    });
  });
}

function renderChallengeComparison(data) {
  const panel = el("challengePanel");
  const a = data.playerA;
  const b = data.playerB;
  const total = CONFIG.SNIPPET_LENGTHS.length;
  const aScoreText = a.won ? `${a.attemptsUsed}/${total}` : "Nicht erraten";
  const bScoreText = b.won ? `${b.attemptsUsed}/${total}` : "Nicht erraten";
  const aWins = a.won && (!b.won || a.attemptsUsed <= b.attemptsUsed);
  const bWins = b.won && (!a.won || b.attemptsUsed < a.attemptsUsed);

  panel.innerHTML = `
    <h3>Challenge-Ergebnis</h3>
    <div class="challenge-results">
      <div class="challenge-result-card ${aWins ? "winner" : ""}">
        <div class="name">${a.name}</div>
        <div class="score">${aScoreText}</div>
      </div>
      <div class="challenge-vs">vs</div>
      <div class="challenge-result-card ${bWins ? "winner" : ""}">
        <div class="name">${b.name}</div>
        <div class="score">${bScoreText}</div>
      </div>
    </div>
  `;
}

/** Beim Laden prüfen, ob die URL ?challenge=<id> enthält (jemand hat uns geschickt). */
async function handleIncomingChallengeIfNeeded() {
  const params = new URLSearchParams(window.location.search);
  const challengeId = params.get("challenge");
  if (!challengeId) return;

  showStep("challengeIntro");
  const container = el("challengeIntro");
  container.innerHTML = `<p class="status">Lade Challenge...</p>`;

  if (!isFirebaseConfigured()) {
    container.innerHTML = `<p class="status">Challenge-Link erkannt, aber FIREBASE_CONFIG fehlt in config.js.</p>`;
    return;
  }

  try {
    const data = await getChallenge(challengeId);
    const total = CONFIG.SNIPPET_LENGTHS.length;
    const aScoreText = data.playerA.won ? `in ${data.playerA.attemptsUsed}/${total} Versuchen erraten` : "nicht erraten";

    container.innerHTML = `
      <div class="chosen-artist">
        <img src="${data.artistPicture}" alt="${data.artistName}" />
        <div><div class="name">${data.artistName}</div></div>
      </div>
      <h2>${data.playerA.name} fordert dich heraus!</h2>
      <p class="sub">${data.playerA.name} hat den Song ${aScoreText}. Kannst du es besser?</p>
      <input type="text" id="challengeNameInput" placeholder="Dein Name" />
      <button id="acceptChallengeBtn" class="primary-btn">Challenge annehmen</button>
    `;
    el("acceptChallengeBtn").addEventListener("click", () => acceptChallenge(challengeId, data));
  } catch (err) {
    console.error(err);
    container.innerHTML = `<p class="status">Konnte Challenge nicht laden: ${err.message}</p>`;
  }
}

function acceptChallenge(challengeId, data) {
  const name = (el("challengeNameInput").value || "").trim() || "Spieler";

  state.artist = { name: data.artistName, picture_medium: data.artistPicture };
  state.pool = data.pool.map(title => ({ title }));
  state.topicChannelId = null;
  state.challenge = { role: "B", id: challengeId, playerName: name };

  el("gameArtistCard").innerHTML = `
    <img src="${data.artistPicture}" alt="${data.artistName}" />
    <div><div class="name">${data.artistName}</div></div>
  `;
  el("restartBtn").classList.remove("hidden");
  el("startChallengeBtn").classList.add("hidden");

  showStep("game");
  startChallengeRoundAsB(data);
}

/** Wie startNewRound(), aber mit dem schon bekannten (und geprüften) Song statt Zufallsauswahl. */
async function startChallengeRoundAsB(data) {
  state.finished = false;
  state.attemptIndex = 0;
  state.wrongGuesses = [];
  state.targetTrack = { title: data.trackTitle };
  state.targetVideoId = data.videoId;
  state.loadingRound = true;

  el("guessHistory").innerHTML = "";
  guessInput.value = "";
  suggestionsBox.classList.add("hidden");
  el("resultBanner").classList.add("hidden");
  el("nextRoundBtn").classList.add("hidden");
  el("challengePanel").classList.add("hidden");
  el("gameStatus").textContent = "Lade Song...";
  resetPostGuessControls();
  setRoundControlsEnabled(false);
  renderTimeline();
  renderAttemptCounter();
  renderSnippetInfo();

  try {
    const player = await getYtPlayer();
    const works = await tryLoadVideo(player, data.videoId);
    if (!works) throw new Error("Song ist nicht mehr abspielbar.");
    state.loadingRound = false;
    el("gameStatus").textContent = "";
    setRoundControlsEnabled(true);
  } catch (err) {
    console.error(err);
    el("gameStatus").textContent = "Konnte Song nicht laden: " + err.message;
  }
}
