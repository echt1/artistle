# Artistle

Heardle-Klon, aber der Songpool ist auf einen selbst gewählten Künstler beschränkt.
Läuft komplett clientseitig (HTML/CSS/Vanilla-JS), keine Datenbank, kein Backend.

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

1. Neues Repo erstellen, diese 5 Dateien reinpushen (`index.html`, `style.css`,
   `config.js`, `deezer.js`, `app.js`, `README.md`).
2. GitHub → Repo → Settings → Pages → Branch auf `main` (Ordner `/root`) stellen.
3. Nach ca. 1 Minute ist es live unter `https://<dein-username>.github.io/<repo-name>/`.

Kein API-Key, kein Firebase, kein Build-Step nötig.

## Wie der Songpool zustande kommt

- **Leicht**: Rang 1–10 der Top-Tracks des Artists (Deezer liefert `/artist/{id}/top`
  bereits nach Popularität sortiert).
- **Mittel**: Rang 11–40.
- **Schwer**: alle Tracks aus allen Alben/EPs (bis zu 25 Releases), abzüglich der
  Top-40-Songs → das sind die tatsächlichen Deep Cuts. Kann ein paar Sekunden
  laden, weil dafür pro Album ein eigener Request nötig ist.

## Bekannte Einschränkungen / mögliche nächste Schritte

- **CORS-Proxy**: läuft über den kostenlosen `allorigins.win`-Proxy (config.js,
  `CORS_PROXY_PREFIX`). Kein Setup nötig, aber theoretisch weniger zuverlässig
  als ein eigener Proxy. Falls er mal streikt, einfach melden — Umstieg auf
  z.B. einen eigenen Cloudflare Worker ist eine Zeile Code.
- Manche Songs eines Artists haben keine Deezer-Preview (Lizenzlücken) —
  die werden automatisch aus dem Pool gefiltert.
- Deep-Cut-Dedupe läuft nur über den Songtitel, nicht über die exakte
  Aufnahme — bei Artists mit vielen Re-Releases/Remixes können in seltenen
  Fällen leicht unterschiedliche Versionen als "gleicher" Titel zählen.
- Kein Spielstand-Speicher (Absicht laut Anforderung) — bei Reload ist die
  Runde vorbei.
