// ============================================================
// APP STATE
// ============================================================

const state = {
  artist: null,       // { id, name, picture_medium, nb_fan }
  difficulty: null,    // "easy" | "medium" | "hard"
  pool: [],             // Track-Pool fuer die aktuelle Schwierigkeit (fuer Autocomplete)
  targetTrack: null,   // Der gesuchte Track dieser Runde
  attemptIndex: 0,      // Index in CONFIG.SNIPPET_LENGTHS
  wrongGuesses: [],
  finished: false,
  snippetTimer: null,
};

// Caches, damit man beim "Naechster Song" nicht alles neu laedt
const cache = {
  easyPool: [],
  mediumPool: [],
  hardPool: [],
};

// ============================================================
// DOM SHORTCUTS
// ============================================================

const el = (id) => document.getElementById(id);

const steps = {
  search: el("step-search"),
  difficulty: el("step-difficulty"),
  game: el("step-game"),
};

function showStep(name) {
  Object.values(steps).forEach(s => s.classList.remove("active"));
  steps[name].classList.add("active");
}

// ============================================================
// STEP 1: ARTIST-SUCHE
// ============================================================

const artistInput = el("artistInput");
const artistDropdown = el("artistDropdown");
const ARTIST_SEARCH_MIN_CHARS = 2;
const ARTIST_SEARCH_DEBOUNCE_MS = 350;

let artistSearchDebounceTimer = null;
let artistSearchRequestId = 0; // verhindert dass ein alter, langsamer Request neuere Ergebnisse ueberschreibt

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

// Enter im Feld -> sofort suchen, ohne auf das Debounce zu warten
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
    if (requestId !== artistSearchRequestId) return; // Antwort ist veraltet, verwerfen
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

function selectArtist(artist) {
  state.artist = artist;
  cache.easyPool = [];
  cache.mediumPool = [];
  cache.hardPool = [];

  const cardHtml = `
    <img src="${artist.picture_medium}" alt="${artist.name}" />
    <div>
      <div class="name">${artist.name}</div>
      <div class="fans">${formatFans(artist.nb_fan)} Fans</div>
    </div>
  `;
  el("chosenArtistCard").innerHTML = cardHtml;
  el("gameArtistCard").innerHTML = cardHtml;

  el("restartBtn").classList.remove("hidden");
  resetDifficultyButtons();
  showStep("difficulty");
}

el("restartBtn").addEventListener("click", () => {
  state.artist = null;
  artistInput.value = "";
  hideArtistDropdown();
  el("searchStatus").textContent = "";
  el("restartBtn").classList.add("hidden");
  showStep("search");
});

// ============================================================
// STEP 2: SCHWIERIGKEIT -> POOL BAUEN
// ============================================================

function resetDifficultyButtons() {
  document.querySelectorAll(".diff-btn").forEach(btn => {
    btn.disabled = false;
    btn.querySelector("span").dataset.original = btn.querySelector("span").dataset.original
      || btn.querySelector("span").textContent;
    btn.querySelector("span").textContent = btn.querySelector("span").dataset.original;
  });
  el("diffStatus").textContent = "";
}

document.querySelectorAll(".diff-btn").forEach(btn => {
  btn.addEventListener("click", () => startDifficulty(btn.dataset.diff, btn));
});

async function startDifficulty(diff, btnEl) {
  state.difficulty = diff;
  document.querySelectorAll(".diff-btn").forEach(b => b.disabled = true);
  const label = btnEl.querySelector("span");
  const original = label.textContent;
  label.textContent = "Lade Songs...";
  el("diffStatus").textContent = "";

  try {
    const pool = await getPoolForDifficulty(diff, state.artist.id);
    if (pool.length < 4) {
      throw new Error("Zu wenige Songs fuer diesen Modus gefunden.");
    }
    state.pool = pool;
    startNewRound();
    showStep("game");
  } catch (err) {
    console.error(err);
    el("diffStatus").textContent = "Fehler: " + err.message + " (Proxy überlastet? Nochmal probieren.)";
    document.querySelectorAll(".diff-btn").forEach(b => b.disabled = false);
  } finally {
    label.textContent = original;
  }
}

async function getPoolForDifficulty(diff, artistId) {
  if (diff === "easy") {
    if (!cache.easyPool.length) {
      const top = await getArtistTopTracks(artistId, CONFIG.POOL_SIZE_EASY);
      cache.easyPool = normalizeTracks(top);
    }
    return cache.easyPool;
  }

  if (diff === "medium") {
    if (!cache.mediumPool.length) {
      const top = await getArtistTopTracks(artistId, CONFIG.POOL_SIZE_MEDIUM_END);
      cache.mediumPool = normalizeTracks(top.slice(CONFIG.POOL_SIZE_EASY));
    }
    return cache.mediumPool;
  }

  // hard
  if (!cache.hardPool.length) {
    const top = await getArtistTopTracks(artistId, CONFIG.POOL_SIZE_MEDIUM_END);
    const excludeIds = new Set(top.map(t => t.id));
    const deepCuts = await buildDeepCutPool(artistId, excludeIds);
    cache.hardPool = normalizeTracks(deepCuts);
  }
  return cache.hardPool;
}

function normalizeTracks(tracks) {
  return tracks
    .filter(t => t && t.preview) // Tracks ohne Preview koennen wir nicht spielen
    .map(t => ({
      id: t.id,
      title: t.title_short || t.title,
      preview: t.preview,
      link: t.link,
    }));
}

// ============================================================
// STEP 3: GAME ROUND
// ============================================================

function startNewRound() {
  state.targetTrack = state.pool[Math.floor(Math.random() * state.pool.length)];
  state.attemptIndex = 0;
  state.wrongGuesses = [];
  state.finished = false;

  el("audioPlayer").src = state.targetTrack.preview;
  el("audioPlayer").load();

  el("guessHistory").innerHTML = "";
  el("guessInput").value = "";
  el("guessInput").disabled = false;
  el("suggestions").classList.add("hidden");
  el("resultBanner").classList.add("hidden");
  el("nextRoundBtn").classList.add("hidden");
  document.querySelector('#guessForm button[type="submit"]').disabled = false;
  el("skipBtn").disabled = false;

  renderAttempts();
  renderSnippetInfo();
  resetProgressBar();
}

function renderAttempts() {
  const container = el("attemptsDisplay");
  container.innerHTML = "";
  CONFIG.SNIPPET_LENGTHS.forEach((_, i) => {
    const dot = document.createElement("div");
    dot.className = "attempt-dot";
    if (i < state.attemptIndex) dot.classList.add("used");
    else if (i === state.attemptIndex) dot.classList.add("current");
    container.appendChild(dot);
  });
}

function renderSnippetInfo() {
  const length = CONFIG.SNIPPET_LENGTHS[state.attemptIndex];
  el("currentSnippetLength").textContent = `${length}s`;

  const dotsContainer = el("snippetDots");
  dotsContainer.innerHTML = "";
  CONFIG.SNIPPET_LENGTHS.forEach((_, i) => {
    const d = document.createElement("div");
    d.className = "sdot" + (i <= state.attemptIndex ? " active" : "");
    dotsContainer.appendChild(d);
  });
}

// ---- Audio Snippet Playback ----

const audio = el("audioPlayer");
const playBtn = el("playBtn");
const progressBar = el("progressBar");

playBtn.addEventListener("click", playCurrentSnippet);

function playCurrentSnippet() {
  clearTimeout(state.snippetTimer);
  const length = CONFIG.SNIPPET_LENGTHS[state.attemptIndex];

  audio.currentTime = 0;
  audio.play().catch(err => console.warn("Autoplay verhindert:", err));

  playBtn.classList.add("playing");
  animateProgress(length);

  state.snippetTimer = setTimeout(() => {
    audio.pause();
    playBtn.classList.remove("playing");
  }, length * 1000);
}

function animateProgress(length) {
  progressBar.style.transition = "none";
  progressBar.style.width = "0%";
  // Force reflow damit die Transition sauber neu startet
  void progressBar.offsetWidth;
  progressBar.style.transition = `width ${length}s linear`;
  progressBar.style.width = "100%";
}

function resetProgressBar() {
  progressBar.style.transition = "none";
  progressBar.style.width = "0%";
}

// ---- Autocomplete ----

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
  if (!e.target.closest(".autocomplete-wrap")) {
    suggestionsBox.classList.add("hidden");
  }
});

// ---- Guessing ----

el("guessForm").addEventListener("submit", (e) => {
  e.preventDefault();
  if (state.finished) return;

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
  if (state.finished) return;
  registerWrongGuess(null); // null = "geskippt"
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

  renderAttempts();
  renderSnippetInfo();
  resetProgressBar();
}

function endRound(won) {
  state.finished = true;
  clearTimeout(state.snippetTimer);
  audio.pause();
  playBtn.classList.remove("playing");

  guessInput.disabled = true;
  document.querySelector('#guessForm button[type="submit"]').disabled = true;
  el("skipBtn").disabled = true;

  const banner = el("resultBanner");
  banner.classList.remove("hidden", "win", "lose");
  banner.classList.add(won ? "win" : "lose");

  if (won) {
    banner.innerHTML = `🎉 Richtig! Es war <strong>${state.targetTrack.title}</strong> ` +
      `(Versuch ${state.attemptIndex + 1}/${CONFIG.SNIPPET_LENGTHS.length}). ` +
      `<a href="${state.targetTrack.link}" target="_blank" rel="noopener">Auf Deezer anhören ↗</a>`;
  } else {
    banner.innerHTML = `😬 Leider nicht erraten. Der Song war <strong>${state.targetTrack.title}</strong>. ` +
      `<a href="${state.targetTrack.link}" target="_blank" rel="noopener">Auf Deezer anhören ↗</a>`;
  }

  el("nextRoundBtn").classList.remove("hidden");
}

el("nextRoundBtn").addEventListener("click", startNewRound);
