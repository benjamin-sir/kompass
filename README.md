# Kompass

Persönliches Werkzeug, um Aufgaben aus Mail, Jira, Confluence und Teams an einem Ort zu sammeln, zu sortieren und fokussiert abzuarbeiten. Gebaut für den Arbeitsalltag als Product Owner auf einem Windows-Dienstrechner ohne Admin-Rechte.

Die Idee und die Abwägungen dahinter stehen in [docs/KONZEPT.md](docs/KONZEPT.md).

## So läuft es

Kompass ist eine statische Web-App ohne Server und ohne Abhängigkeiten. Alle Daten liegen im `localStorage` des Browsers, in dem du sie benutzt, und verlassen den Rechner nicht.

Es gibt zwei Wege, sie zu starten:

1. **Über GitHub Pages (empfohlen):** https://benjamin-sir.github.io/kompass/
   Pages veröffentlicht den Branch `main` direkt (*Settings → Pages → Deploy from a branch*, `main`, Ordner `/`). Die Startseite leitet auf `app/` weiter; `.nojekyll` sorgt dafür, dass die Dateien unverändert ausgeliefert werden. Jeder Push auf `main` ist nach ein bis zwei Minuten online.
   In Edge dann über das Menü *Apps → Diese Website als App installieren*. Das geht ohne Admin-Rechte, Kompass bekommt ein eigenes Fenster und läuft auch offline.
2. **Als Einzeldatei.** `dist/kompass.html` herunterladen, z. B. in OneDrive ablegen und per Doppelklick in Edge öffnen. Keine Installation, kein Server. Bookmarklet, Offline-Cache und App-Installation gibt es so nicht. Achtung: Die Daten hängen am Speicherort der Datei. Wechselst du später zur Pages-Version, nimm sie per Backup mit.

## Täglicher Ablauf

| Schritt | Wo | Wie |
|---|---|---|
| Erfassen | Inbox | Text oder Link eintippen, `Strg+V` irgendwo in der App, Mail aus Outlook ins Fenster ziehen, Bookmarklet in Jira/Confluence |
| Sortieren | Inbox | Aufgabe wählen (`J`/`K`), dann `H` Heute, `W` Woche, `S` Später, `A` Warten auf, `G` Agenda, `Entf` Löschen |
| Planen | Heute, Kalender | Aufgabe in die Zeitleiste ziehen oder `P` für die nächste freie Lücke; Outlook-Termine liegen grau im Hintergrund |
| Arbeiten | Fokus | `F` öffnet eine Aufgabe im Fokus, `T` startet den Timer, `Strg+Enter` erledigt sie |
| Nachfassen | Heute, Warten auf | Fällige Warten-auf-Einträge erscheinen oben auf „Heute“ |
| Zurückblicken | Rückblick (`9`) | Freitags: Fokus- gegen Meetingzeit, Fokus pro Bereich, Liegengebliebenes, Abschluss-Checkliste, Wochenfokus für nächste Woche |

Alle Kürzel zeigt `?` in der App. `Strg+K` sucht über alle Aufgaben und Befehle.

### Erfassen aus den einzelnen Quellen

- **Jira/Confluence (Cloud):** Bookmarklet aus den Einstellungen in die Favoritenleiste ziehen. Mit hinterlegter Jira-Adresse reicht auch `SHOP-142 Kriterien klären` in der Eingabe.
- **Teams:** Nachricht → *⋯ → Link kopieren*, dann in Kompass `Strg+V`.
- **Outlook (Desktop):** Mail aus der Liste ins Kompass-Fenster ziehen. Der Betreff wird zum Titel. Ein Rücksprung in die Mail ist von der Desktop-App aus nicht möglich.
- **`#Bereich`** in der Eingabe ordnet die Aufgabe einem Bereich zu (`#stake` → Stakeholder).

## Outlook-Kalender

Kompass zeigt deine Outlook-Termine nur lesend an und legt deine eigenen Zeitblöcke darüber. Pro Tag rechnet es aus, wie viel Arbeitszeit nach den Meetings frei bleibt und wie viel du schon eingeplant hast.

1. In Outlook Web unter *Einstellungen → Kalender → Freigegebene Kalender → Kalender veröffentlichen* den **ICS-Link** kopieren (endet auf `.ics`, nicht den HTML-Link).
2. In Kompass unter *Einstellungen → Outlook-Kalender* einfügen. Kompass lädt die Termine und aktualisiert sie alle 15 Minuten.
3. Blockiert der Browser den direkten Abruf (Outlook sendet dafür womöglich keine CORS-Freigabe), zeigt Kompass das an. Dann: *Link öffnen* klicken, Edge lädt `calendar.ics` herunter, die Datei in Kompass ziehen.

Der ICS-Link wirkt wie ein Passwort. Er bleibt im Browser und steht im Backup.

## Backup

Wenn die IT das Browser-Profil zurücksetzt, sind die Daten weg. Kompass erinnert nach sieben Tagen ohne Backup. Export und Import liegen in den Einstellungen; die JSON-Datei am besten ins OneDrive legen.

## Aufbau

```
app/
  index.html            Gerüst
  styles.css            Gestaltung, helles und dunkles Theme
  js/store.js           Datenmodell und Speicherung
  js/links.js           Erkennung von Jira, Confluence, Teams, Outlook, SharePoint
  js/app.js             Oberfläche, Tastenkürzel, Drag & Drop
  sw.js, manifest       Offline-Betrieb und Installation als App
  js/ics.js             liest .ics-Dateien inkl. Serienterminen und Zeitzonen
  js/calendar.js        Zeitleiste, Wochenansicht, freie Zeit, Zeitblöcke
  js/review.js          Wochenrückblick, Wochenfokus, Abschluss-Checkliste
tools/build_single.py   baut dist/kompass.html
```

Nach Änderungen in `app/` die Einzeldatei neu bauen (`python3 tools/build_single.py`) und mit committen.

## Stand und nächste Schritte

- [x] Phase 1: Inbox mit Link-Erkennung, Bookmarklet, Drag & Drop aus Outlook, Sortieren, Heute, Woche, Später, Warten auf, Agenda, Fokus mit Timer, Suche, Tastenkürzel, Themes, Backup
- [x] Phase 2: Tageszeitleiste auf „Heute“, Wochenkalender, Zeitblöcke per Drag & Drop (verschieben, Länge ändern), `P` plant in die nächste Lücke, Outlook-Termine per ICS-Link oder `.ics`-Datei, freie Zeit pro Tag
- [x] Phase 3: Wochenrückblick (Fokus- vs. Meetingzeit pro Tag, Fokus pro Bereich mit Wochenziel, Erledigtes, was Aufmerksamkeit braucht), Wochenfokus mit bis zu drei Punkten (auch auf „Heute“), Abschluss-Checkliste mit Notiz, Hinweis am Freitagnachmittag
- [ ] Später: Sync mit dem iPhone; Microsoft-Graph-Anbindung, falls die IT sie erlaubt
