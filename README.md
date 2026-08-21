# Artistle

Heardle-Klon, aber der Songpool ist auf einen selbst gewählten Künstler beschränkt.
Läuft komplett clientseitig (HTML/CSS/Vanilla-JS), keine Datenbank, kein Backend.

## YouTube API-Key holen (einmalig nötig)

Die Songs werden als echte Volltracks über YouTube abgespielt (nicht über
30s-Preview-Schnipsel — die starten nämlich nicht garantiert am Songanfang).
Dafür brauchst du einen **kostenlosen** Google-API-Key:

1. Gehe zu [console.cloud.google.com](https://console.cloud.google.com/) und logg dich mit einem Google-Account ein.
2. Oben ein neues Projekt erstellen (z.B. "artistle").
3. Im Menü zu **APIs & Dienste → Bibliothek**, nach "YouTube Data API v3" suchen, anklicken, **Aktivieren**.
4. Zu **APIs & Dienste → Anmeldedaten → Anmeldedaten erstellen → API-Schlüssel**. Der Key wird sofort angezeigt.
5. (Empfohlen) Auf den Key klicken → unter "Anwendungseinschränkungen" **Websites (HTTP-Referrer)** wählen und deine
   GitHub-Pages-URL eintragen (z.B. `https://dein-username.github.io/*`), damit niemand sonst deinen Key benutzen kann.
6. Den Key in `config.js` bei `YOUTUBE_API_KEY` eintragen.

Kein Kreditkarte nötig. Kostenlos: 10.000 Quota-Einheiten/Tag, eine Songsuche
kostet 100 Einheiten → ca. 100 Songrunden pro Tag. Für privaten Gebrauch mehr
als genug.

## Spotify verbinden (optional)

Lässt dich den gerade gesuchten/erratenen Song direkt zu "Meine Musik" auf
Spotify hinzufügen. Läuft komplett ohne Server über den offiziellen
**PKCE-Login-Flow** (extra für Apps gemacht, die kein Backend haben, um ein
Secret geheim zu halten).

1. Gehe zu [developer.spotify.com/dashboard](https://developer.spotify.com/dashboard), logg dich ein, **Create app**.
2. App-Name/Beschreibung frei wählen. Bei **Redirect URIs** ganz genau die URL eintragen, unter der dein Spiel
   später läuft (z.B. `https://dein-username.github.io/artist-heardle/` — **mit** Slash am Ende, wenn du es
   lokal ohne Pfad testest reicht `http://127.0.0.1:8080/`). Muss exakt matchen, sonst lehnt Spotify den Login ab.
3. Unter **APIs used** "Web API" anhaken.
4. Speichern, dann in den App-Settings die **Client ID** kopieren (kein Secret nötig!).
5. In `config.js` bei `SPOTIFY_CLIENT_ID` eintragen.

Wichtige Einschränkung: Der Login schickt den Browser komplett weg zu
Spotify und wieder zurück (echter Redirect, kein Popup) — die Seite lädt
dabei neu, du landest danach wieder beim Artist-suchen-Screen. Ist eine
Nebenwirkung des serverlosen Ansatzes.

## Challenge-Modus verbinden (optional)

Herausfordern per Link: du spielst **5 Songs** desselben Artists nacheinander,
der Link geht an eine andere Person, die spielt (wann sie will, unabhängig
von dir) exakt dieselben 5 Songs in derselben Reihenfolge — sobald beide
fertig sind, zeigt die Seite den Vergleich (Anzahl richtig erratener Songs,
bei Gleichstand die Gesamt-Versuche). Läuft über **Firestore** (nur die
Datenbank, kein Cloud Functions/Blaze-Zwang wie beim früheren
CORS-Proxy-Thema).

1. Gehe zu [console.firebase.google.com](https://console.firebase.google.com/), **Projekt erstellen** (kostenloser Spark-Tarif, kein Kreditkarte nötig).
2. Im Projekt: **Build → Firestore Database → Datenbank erstellen**. Modus: **Produktionsmodus** (die Regeln unten machen es trotzdem nutzbar), Standort frei wählbar (z.B. `eur3`).
3. Unter **Firestore Database → Regeln** folgendes eintragen und veröffentlichen:

   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /challenges/{challengeId} {
         allow read: if true;
         allow create: if request.resource.data.playerB == null;
         allow update: if resource.data.playerB == null
                       && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['playerB']);
       }
     }
   }
   ```

   Das erlaubt: jeder kann eine Challenge anlegen und lesen, aber `playerB`
   kann nur **einmal** gesetzt werden und sonst nichts an einem bestehenden
   Eintrag verändert werden. Für ein privates Spiel reicht das — es ist
   kein Login/Auth eingebaut, also technisch von außen theoretisch
   auffindbar, wenn jemand die Projekt-ID errät UND die zufällige
   Challenge-ID kennt (12 hex-Zeichen, praktisch nicht erratbar).

4. Zu **Projekteinstellungen (Zahnrad oben links) → Allgemein → Meine Apps → Web-App hinzufügen** (das `</>`-Symbol), einen Namen vergeben, **keine** Firebase-Hosting-Option nötig.
5. Das angezeigte `firebaseConfig`-Objekt komplett in `config.js` bei `FIREBASE_CONFIG` einfügen.

## Lokal testen

Einfach `index.html` per Live-Server öffnen (nicht per Doppelklick als `file://`,
sonst blockt der Browser teilweise die Fetch-Requests). Am einfachsten z.B.:

```bash
npx serve .
# oder
python3 -m http.server 8080
```

Dann im Browser `http://localhost:8080` (bzw. den von `serve` ausgegebenen Port) öffnen.

## Deploy auf GitHub Pages

1. Neues Repo erstellen, alle Dateien reinpushen (`index.html`, `style.css`,
   `config.js`, `deezer.js`, `youtube.js`, `spotify.js`, `challenge.js`, `app.js`, `README.md`).
2. GitHub → Repo → Settings → Pages → Branch auf `main` (Ordner `/root`) stellen.
3. Nach ca. 1 Minute ist es live unter `https://<dein-username>.github.io/<repo-name>/`.
4. Nicht vergessen: den API-Key-Referrer-Schutz (Schritt 5 oben) auf genau diese URL setzen.

## Wie es technisch funktioniert

- **Artist-Suche & Songtitel-Liste**: Deezer API, über offizielles JSONP
  (`output=jsonp`) direkt im Browser, kein Proxy nötig.
- **Songwiedergabe**: Für die Runde wird ein zufälliger Songtitel aus dem
  Deezer-Pool genommen. Zuerst wird geprüft, ob YouTube einen offiziellen
  "`<Artist> - Topic`"-Channel hat (automatisch generierte, reine
  Audio-Uploads ohne Musikvideo-Intro/Stille) und dort gesucht — nur wenn
  das nichts findet, greift die allgemeine Suche ("Artist Songtitel
  official audio"). Der YouTube IFrame Player lädt das Video unsichtbar
  (nur Ton, kein Bild — sonst wäre der Songname/Cover sofort sichtbar) und
  wir steuern Start/Stop selbst per JS, immer ab Sekunde 0.
- Ist ein Video nicht einbettbar (Label-Sperre), wird automatisch der nächste
  Suchtreffer bzw. bei Bedarf ein komplett anderer Song aus dem Pool probiert.
- **Weiterhören**: Nach dem ersten Guess/Skip einer Runde wird ein Button
  freigeschaltet, mit dem man den kompletten Song frei (ohne die
  Snippet-Zeit-Begrenzung) anhören kann.

## Bekannte Einschränkungen

- YouTube-Suchtreffer sind nicht 100% garantiert der exakt richtige Track
  (z.B. Cover-Versionen, Lyric-Videos). Der Suchbegriff enthält bewusst
  "official audio" um das zu minimieren, ist aber keine Garantie.
- 100 Songrunden/Tag Limit durch YouTube-Quota — für privates Spielen kein Thema.
- Kein Spielstand-Speicher (Absicht) — bei Reload ist die Runde vorbei.
