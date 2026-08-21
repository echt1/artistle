// ============================================================
// CHALLENGE-MODUS: Firestore speichert nur Ergebnisse, kein eigener
// Server noetig. Ablauf:
//   Spieler A startet Challenge -> spielt Runde -> Ergebnis + Song
//   werden in Firestore abgelegt -> Link mit Challenge-ID wird geteilt.
//   Spieler B oeffnet den Link (irgendwann, unabhaengig) -> spielt
//   exakt denselben (schon geprueften) Song -> Ergebnis wird an
//   denselben Firestore-Eintrag angehaengt. Sobald beide Ergebnisse da
//   sind, zeigt die Seite den Vergleich (live per onSnapshot, falls
//   beide Tabs gerade offen sind - sonst beim naechsten Laden/Checken).
// ============================================================

let firestoreDb = null;

function isFirebaseConfigured() {
  const cfg = CONFIG.FIREBASE_CONFIG;
  return cfg && cfg.apiKey && !cfg.apiKey.startsWith("DEIN_");
}

function getDb() {
  if (firestoreDb) return firestoreDb;
  if (!isFirebaseConfigured()) {
    throw new Error("Firebase ist nicht konfiguriert (FIREBASE_CONFIG in config.js).");
  }
  if (!firebase.apps.length) {
    firebase.initializeApp(CONFIG.FIREBASE_CONFIG);
  }
  firestoreDb = firebase.firestore();
  return firestoreDb;
}

function generateChallengeId() {
  return Array.from(crypto.getRandomValues(new Uint8Array(6)))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Legt eine neue Challenge an. `results` = [{ won, attemptsUsed }, ...], `score` = { correctCount, totalAttempts }. */
async function createChallenge({ artistName, artistPicture, rounds, pool, playerName, results, score }) {
  const db = getDb();
  const id = generateChallengeId();
  await db.collection("challenges").doc(id).set({
    artistName,
    artistPicture,
    rounds, // [{ title, videoId }, ...] - fest vorgegebene Songreihenfolge fuer beide Spieler
    pool,
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    playerA: {
      name: playerName,
      results,
      correctCount: score.correctCount,
      totalAttempts: score.totalAttempts,
    },
    playerB: null,
  });
  return id;
}

/** Traegt das Ergebnis von Spieler B in eine bestehende Challenge ein. */
async function submitChallengeResultAsB(challengeId, playerName, results, score) {
  const db = getDb();
  await db.collection("challenges").doc(challengeId).update({
    playerB: {
      name: playerName,
      results,
      correctCount: score.correctCount,
      totalAttempts: score.totalAttempts,
    },
  });
}

/** Holt eine Challenge einmalig (z.B. beim Ankommen ueber den Link). */
async function getChallenge(challengeId) {
  const db = getDb();
  const snap = await db.collection("challenges").doc(challengeId).get();
  if (!snap.exists) {
    throw new Error("Challenge nicht gefunden (falscher oder abgelaufener Link).");
  }
  return snap.data();
}

/** Live-Listener: feuert sofort einmal und dann bei jeder Aenderung. */
function listenToChallenge(challengeId, callback) {
  const db = getDb();
  return db.collection("challenges").doc(challengeId).onSnapshot(snap => {
    if (snap.exists) callback(snap.data());
  });
}
