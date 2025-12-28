# Localization Learnings

While wiring the DGS-video toggle we discovered that any dependency on a translation service can leave Amy without feedback if localization fails. After moving the MediaPipe bundle inline we followed through by removing the `LanguageManager` entirely. Everything the recognition flow, overlays, and settings screens need now lives directly in German so the app keeps talking even if a resource file goes missing. The updated priorities are:

- Keep mission-critical status strings inline so the gesture pipeline and recognition hooks always have text available, even if configuration drift occurs.
- Document how to reintroduce additional languages in the future by rebuilding a translation layer around the new inline constants.
- Although Amy currently only needs German, plan future surfaces so another child could opt into their own language without regressing reliability.
