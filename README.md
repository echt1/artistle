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
   `config.js`, `deezer.js`, `youtube.js`, `app.js`, `README.md`).
2. GitHub → Repo → Settings → Pages → Branch auf `main` (Ordner `/root`) stellen.
3. Nach ca. 1 Minute ist es live unter `https://<dein-username>.github.io/<repo-name>/`.
4. Nicht vergessen: den API-Key-Referrer-Schutz (Schritt 5 oben) auf genau diese URL setzen.

## Wie es technisch funktioniert

- **Artist-Suche & Songtitel-Liste**: Deezer API, über offizielles JSONP
  (`output=jsonp`) direkt im Browser, kein Proxy nötig.
- **Songwiedergabe**: Für die Runde wird ein zufälliger Songtitel aus dem
  Deezer-Pool genommen und auf YouTube gesucht ("Artist Songtitel official
  audio"). Der YouTube IFrame Player lädt das Video unsichtbar (nur Ton,
  kein Bild — sonst wäre der Songname/Cover sofort sichtbar) und wir steuern
  Start/Stop selbst per JS, immer ab Sekunde 0.
- Ist ein Video nicht einbettbar (Label-Sperre), wird automatisch der nächste
  Suchtreffer bzw. bei Bedarf ein komplett anderer Song aus dem Pool probiert.

## Bekannte Einschränkungen

- YouTube-Suchtreffer sind nicht 100% garantiert der exakt richtige Track
  (z.B. Cover-Versionen, Lyric-Videos). Der Suchbegriff enthält bewusst
  "official audio" um das zu minimieren, ist aber keine Garantie.
- 100 Songrunden/Tag Limit durch YouTube-Quota — für privates Spielen kein Thema.
- Kein Spielstand-Speicher (Absicht) — bei Reload ist die Runde vorbei.
