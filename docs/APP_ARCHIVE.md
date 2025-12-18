# Archivierung der mobilen App (`app/`)

Die frühere React-Native/Expo-App unter `app/` diente nur noch als Referenz, nachdem alle relevanten DGS-Funktionen in die Browser-Webapp migriert wurden. Um den Wartungsaufwand zu senken und Verwirrung zu vermeiden, wurde der Ordner entfernt.

## Warum entfernt?
- **Funktionsparität erreicht**: Sign-Spracherkennung, Training und Modell-Updates laufen vollständig im Webapp-Stack (`webapp/`).
- **Kein aktiver Einsatz**: Die Expo-App wurde nicht mehr gebaut, getestet oder ausgeliefert.
- **Geringerer Pflegeaufwand**: Weniger Abhängigkeiten, keine veralteten Build-Skripte oder CI-Pfade.

## Was tun bei Bedarf?
- **Historie einsehen**: Hole die letzte Version über die Git-Historie (z.B. `git checkout <commit> -- app`).
- **Artefakte vergleichen**: Die Mapping-Dokumente (z.B. `docs/MIGRATION_COMPARISON.md`) bleiben als historische Referenz bestehen.
- **Neustart planen**: Falls erneut eine mobile App benötigt wird, kann die Webapp-Logik als Quelle dienen.

## Hinweis zur Dokumentation

Viele Dokumente im `docs/` Verzeichnis enthalten noch Verweise auf `app/src/` oder `app/webview/`. Diese sind **historische Referenzen** und beschreiben die alte App-Architektur. Die entsprechenden Funktionen befinden sich jetzt in:
- `webapp/src/components/` - UI-Komponenten (ehemals `app/src/screens/` und `app/src/components/`)
- `webapp/src/gesture/` - Gestenerkennungs-Pipeline (ehemals `app/webview/`)
- `webapp/src/services/` - Dienste (ehemals `app/src/services/`)

Siehe `docs/MIGRATION_COMPARISON.md` für eine vollständige Zuordnung.
