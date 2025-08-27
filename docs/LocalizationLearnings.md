# Localization Learnings

While wiring the DGS-video toggle through `LanguageManager`, we noted several follow-up ideas:

- Route all user-visible strings through `LanguageManager` instead of hardcoding German text.
- Simplify the `LanguageManager` so adding new languages is straightforward.
- Although Amy currently only needs German, design the system so other children can switch to their preferred language in the future.

