# Localization Learnings

While wiring the DGS-video toggle through `LanguageManager`, we noted several follow-up ideas. After the inline MediaPipe bundle work we decided to inline the most critical recognition copy directly in German to avoid any dependency on translation lookups during recovery. The updated priorities are:

- Keep mission-critical status strings inline so the WebView and recognition hooks always have text available, even if localization services fail.
- Simplify the `LanguageManager` so adding new languages remains straightforward for less time-sensitive surfaces.
- Although Amy currently only needs German, design the system so other children can switch to their preferred language in the future.
