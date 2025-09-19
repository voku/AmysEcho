# Speech Deduplication Learnings

While localizing the DGS toggle and adding Text-to-Speech (TTS) de-duplication, we noted a few guidelines for future work:

- Halte mission-kritische UI-Texte direkt im Code, damit Sprach-Feedback auch ohne Übersetzungsdateien verfügbar bleibt.
- Normalize speech input (`trim().toLowerCase()`) and track the last spoken phrase with a debounce window to avoid rapid repeats.
- Tests should assert duplicate suppression, queue de-duplication, and proper behaviour when the debounce window expires.
- Consider making the debounce window configurable and allowing explicit overrides when repeated speech is desired.
