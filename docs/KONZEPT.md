# Kompass – Konzept

Stand: 25. November 2026

## Ausgangslage

Als Product Owner kommen Aufgaben aus Mails, Jira, Confluence und Teams. Sie sollen an einem Ort landen, von dort aus sortiert und priorisiert werden, und die wichtigen sollen echte Fokuszeit bekommen. Vorbild war quest.app (Ziele, Tagesplan, Fokus-Timer, Kalender, Wochenrückblick). Kompass übernimmt die Ideen, aber weder Code noch Gestaltung.

Rahmenbedingungen:

- Windows-Dienstrechner ohne Admin-Rechte, Edge oder Chrome
- Jira und Confluence in der Cloud (`*.atlassian.net`), Outlook als Desktop-App, Teams
- vorerst nur ein Gerät; Sync mit dem iPhone später

## Was von Quest übernommen wird und was nicht

| Quest | Kompass |
|---|---|
| Quests als langfristige Ziele | Bereiche (Produktziel, Refinement, Stakeholder, Team, Admin); Ziele optional später |
| Timer an jeder Aufgabe | Timer nur im Fokus; ständiges Tracken hält im PO-Alltag niemand durch |
| Quest-Hours als Kennzahl | Fokuszeit pro Tag mit Tagesziel, später Fokus- vs. Meetingzeit |
| fehlt | Inbox, Warten auf (mit Nachfass-Datum), Agenda pro Person oder Meeting |

## Grundsätze

1. **Jira bleibt führend.** Ein Eintrag in Kompass beschreibt den eigenen nächsten Schritt und verlinkt die Quelle. Keine Kopie von Tickets, damit nichts auseinanderläuft.
2. **Erfassen in unter fünf Sekunden.** Automatische Integrationen scheitern auf dem Dienstrechner an Browser-Sicherheit (CORS) und an IT-Freigaben. Deshalb: Link einfügen, Bookmarklet, Mail ins Fenster ziehen.
3. **Daten bleiben lokal.** Nichts verlässt den Rechner. Dafür regelmäßiges Backup als Datei.
4. **Schlank bleiben.** Nach jeder Phase zwei Wochen im Alltag nutzen, bevor die nächste startet.

## Outlook-Kalender

Ziel: eigene Termine nur lesend sehen und eigene Fokusblöcke darüberlegen.

- „Kalender veröffentlichen“ (ICS-Link) ist in vielen Firmen abgeschaltet oder gibt nur Frei/Gebucht frei. Prüfen: Outlook Web → Einstellungen → Kalender → Freigegebene Kalender.
- Selbst ein ICS-Link lässt sich aus der Web-App heraus voraussichtlich nicht direkt laden (CORS). Ein Proxy würde Firmentermine über einen fremden Server leiten; das scheidet aus.
- Sicherer Weg für Phase 2: Kalender als `.ics`-Datei exportieren und in Kompass ziehen. Termine erscheinen grau im Hintergrund. Der ICS-Link wird trotzdem früh getestet.

## Später

- **Microsoft Graph** (Kalender, markierte Mails, Teams) braucht eine App-Registrierung, die die IT erlauben muss. Erst angehen, wenn Kompass sich im Alltag bewährt hat.
- **Sync mit dem iPhone:** Das Datenmodell hat dafür schon IDs, Zeitstempel und weiche Löschungen. Nötig wäre ein Backend mit Login (z. B. Supabase); dann liegen Arbeitsdaten bei einem externen Anbieter, das muss zur Firmenrichtlinie passen.
- **Vergleich mit Microsoft To Do:** zeigt markierte Mails automatisch an und deckt einen Teil des Bedarfs ohne Aufwand ab. Es fehlen Kalenderplanung, Fokus, Wochenrückblick, Warten auf und Agenda an einem Ort.
