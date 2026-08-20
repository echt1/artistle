// ============================================================
// APP STATE
// ============================================================

const MAX_SNIPPET = CONFIG.SNIPPET_LENGTHS[CONFIG.SNIPPET_LENGTHS.length - 1];

const state = {
  artist: null,        // { id, name, picture_medium, nb_fan }
  pool: [],              // Songtitel-Pool des Artists (fuer Autocomplete + Zufallsauswahl)
  targetTrack: null,    // { id, title, link }
  targetVideoId: null,  // gefundenes YouTube-Video fuer diese Runde
  attemptIndex: 0,
  wrongGuesses: [],
  finished: false,
  loadingRound: false,
  snippetTimer: null,
};

const el = (id) => document.getElementById(id);

const steps = {
  search: el("step-search"),
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
  artistInput.value = "";
  hideArtistDropdown();
  el("searchStatus").textContent = "";
  el("restartBtn").classList.add("hidden");
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
    const top = await getArtistTopTracks(artist.id, CONFIG.POOL_SIZE);
    state.pool = top.map(t => ({
      id: t.id,
      title: t.title_short || t.title,
      link: t.link,
    }));

    if (state.pool.length < 4) {
      throw new Error("Zu wenige Songs für diesen Artist gefunden.");
    }

    el("searchStatus").textContent = "";
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

async function startNewRound() {
  state.finished = false;
  state.attemptIndex = 0;
  state.wrongGuesses = [];
  state.targetTrack = null;
  state.targetVideoId = null;
  state.loadingRound = true;

  el("guessHistory").innerHTML = "";
  guessInput.value = "";
  suggestionsBox.classList.add("hidden");
  el("resultBanner").classList.add("hidden");
  el("nextRoundBtn").classList.add("hidden");
  el("gameStatus").textContent = "Suche Song auf YouTube...";

  setRoundControlsEnabled(false);
  renderTimeline();
  renderAttemptCounter();
  renderSnippetInfo();

  const maxTries = 5;
  let lastErr = null;

  for (let i = 0; i < maxTries; i++) {
    const candidateTrack = state.pool[Math.floor(Math.random() * state.pool.length)];
    try {
      const videoId = await loadPlayableYoutubeTrack(state.artist.name, candidateTrack.title);
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
  animatePlayhead(length);

  state.snippetTimer = playYoutubeSnippet(length, () => {
    playBtn.classList.remove("playing");
  });
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
}

el("nextRoundBtn").addEventListener("click", startNewRound);
