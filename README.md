# Kompass

Persönliches Werkzeug, um Aufgaben aus Mail, Jira, Confluence und Teams an einem Ort zu sammeln, zu sortieren und fokussiert abzuarbeiten. Gebaut für den Arbeitsalltag als Product Owner auf einem Windows-Dienstrechner ohne Admin-Rechte.

Die Idee und die Abwägungen dahinter stehen in [docs/KONZEPT.md](docs/KONZEPT.md).

## So läuft es

Kompass ist eine statische Web-App ohne Server und ohne Abhängigkeiten. Alle Daten liegen im `localStorage` des Browsers, in dem du sie benutzt, und verlassen den Rechner nicht.

Es gibt zwei Wege, sie zu starten:

1. **Über GitHub Pages (empfohlen).** Der Workflow `.github/workflows/pages.yml` veröffentlicht den Ordner `app/`. Einmalig nötig: im Repo unter *Settings → Pages* bei *Source* „GitHub Actions“ wählen. Für private Repos gibt es Pages nur mit einem bezahlten GitHub-Konto; der Code enthält keine persönlichen Daten, das Repo kann also auch öffentlich sein.
   In Edge dann über das Menü *Apps → Diese Website als App installieren*. Das geht ohne Admin-Rechte, Kompass bekommt ein eigenes Fenster und läuft auch offline.
2. **Als Einzeldatei.** `dist/kompass.html` herunterladen, z. B. in OneDrive ablegen und per Doppelklick in Edge öffnen. Keine Installation, kein Server. Bookmarklet, Offline-Cache und App-Installation gibt es so nicht. Achtung: Die Daten hängen am Speicherort der Datei. Wechselst du später zur Pages-Version, nimm sie per Backup mit.

## Täglicher Ablauf

| Schritt | Wo | Wie |
|---|---|---|
| Erfassen | Inbox | Text oder Link eintippen, `Strg+V` irgendwo in der App, Mail aus Outlook ins Fenster ziehen, Bookmarklet in Jira/Confluence |
| Sortieren | Inbox | Aufgabe wählen (`J`/`K`), dann `H` Heute, `W` Woche, `S` Später, `A` Warten auf, `G` Agenda, `Entf` Löschen |
| Planen | Heute | Reihenfolge per Drag & Drop, Aufgaben auf Listen links ziehen |
| Arbeiten | Fokus | `F` öffnet eine Aufgabe im Fokus, `T` startet den Timer, `Strg+Enter` erledigt sie |
| Nachfassen | Heute, Warten auf | Fällige Warten-auf-Einträge erscheinen oben auf „Heute“ |

Alle Kürzel zeigt `?` in der App. `Strg+K` sucht über alle Aufgaben und Befehle.

### Erfassen aus den einzelnen Quellen

- **Jira/Confluence (Cloud):** Bookmarklet aus den Einstellungen in die Favoritenleiste ziehen. Mit hinterlegter Jira-Adresse reicht auch `SHOP-142 Kriterien klären` in der Eingabe.
- **Teams:** Nachricht → *⋯ → Link kopieren*, dann in Kompass `Strg+V`.
- **Outlook (Desktop):** Mail aus der Liste ins Kompass-Fenster ziehen. Der Betreff wird zum Titel. Ein Rücksprung in die Mail ist von der Desktop-App aus nicht möglich.
- **`#Bereich`** in der Eingabe ordnet die Aufgabe einem Bereich zu (`#stake` → Stakeholder).

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
tools/build_single.py   baut dist/kompass.html
```

Nach Änderungen in `app/` die Einzeldatei neu bauen: `python3 tools/build_single.py`.

## Stand und nächste Schritte

- [x] Phase 1: Inbox mit Link-Erkennung, Bookmarklet, Drag & Drop aus Outlook, Sortieren, Heute, Woche, Später, Warten auf, Agenda, Fokus mit Timer, Suche, Tastenkürzel, Themes, Backup
- [ ] Phase 2: Tages- und Wochenkalender mit Drag & Drop, Outlook-Termine per `.ics` als Hintergrund, freie Kapazität pro Tag
- [ ] Phase 3: Wochenrückblick (Fokus- vs. Meetingzeit, Erledigtes, Überfälliges), Bereiche und Ziele
- [ ] Später: Sync mit dem iPhone; Microsoft-Graph-Anbindung, falls die IT sie erlaubt
