# The child's screen

How the board looks and behaves for the child (card NG-30). What the board shows, and why examples
may stand in for the child's own board, is in [storage.md](storage.md); the area for caregivers is
in [caregiver.md](caregiver.md).

Code: `mountBoard`, `boardColumns` and `SPEECH_MAX_MS` in `src/board.ts`; speech in `src/speech.ts`;
the layout in `public/styles.css`; the page in `public/index.html`.

## Status

- The behaviour (sentence bar, repeat, mark on the tapped tile, speech line, a sentence that is
  still being spoken, voices that arrive late, the menu guard, columns) is tested in Node against a
  fake document and a fake speech engine (`test/board.test.mjs`, the tests named "screen: …";
  `test/speech.test.mjs`). The stylesheet is tested as text: that the rules described here exist,
  not what they look like.
- The layout was looked at by hand in headless Chromium at five window sizes, with the numbers
  below. There is no automated browser test.
- **Not tested:** a real phone or tablet, a child, a screen reader, a switch, iOS Safari, Firefox,
  an installed PWA, a device with a notch, and real speech: the Chromium that was used has no
  German voice, so every tap there showed the "no voice" line. In particular nobody has seen
  whether real engines report the end of an utterance (`onend`) and a changed voice list
  (`voiceschanged`) reliably; in Chromium both were only tried with a stand-in engine.
- **Not tested: larger text.** With the browser's text size or the system font size turned up the
  layout has not been adjusted or measured; at 200 % two of five tiles are visible at 360x640 and
  the board scrolls.

## Layout

The page is one screen high (`100dvh`, `100vh` for browsers without it) and is a column:

1. the **sentence bar**,
2. at most one **notice line** (why examples are shown, or that concepts of the own board could
   not be loaded as stored),
3. the **board**, which takes all the height that is left,
4. the small control for caregivers ("Für Bezugspersonen"), in its own row at the bottom right.

The app name is still an `h1`, for the document outline, but it is not visible
(`.visually-hidden`). The waiting line, the last-resort line and the static line of `index.html`
(`.board-line`) are drawn as a box where the sentence bar will be.

The board is a grid. Its rows share the height equally, so the tiles fill the board. A row is
never lower than `--tile-min`: 112 px, 88 px in a window at most 600 px high (the smallest
phones) and 80 px in a window at most 480 px high (a phone held sideways); a tile is never smaller
than 44 px in either direction. When the rows do not fit, the board scrolls inside itself
(`overflow-y: auto`, `overscroll-behavior: contain`); the page does not scroll and the bar stays.
That holds while the window is high enough for the bar, the notice, a board of at least 6rem and
the caregiver control. In a window lower than that the page itself scrolls and the bar scrolls
away with it (seen at 360x140); no phone or tablet is that low.

Pictures and labels scale with their tile through CSS container units (`cqh`, `cqw`, `cqmin`) with
viewport-based values first for a browser without them. Script measures nothing.

Padding respects the safe areas of a device with a notch or a home indicator
(`viewport-fit=cover` with `env(safe-area-inset-*)`; untested on such a device).

### Columns

`boardColumns(count, orientation)` gives the number of columns. `mountBoard` writes both numbers on
the board (`data-columns-portrait`, `data-columns-wide`) and the stylesheet picks one: "wide" is
`(orientation: landscape)`, everything else is "portrait". So turning the
device needs no script.

| Tiles | Portrait | Wide |
| --- | --- | --- |
| 1 | 1 | 1 |
| 2 | 2 | 2 |
| 3 | 2 | 3 |
| 4 | 2 | 2 (two rows) |
| 5-6 | 2 | 3 |
| 7-12 | 3 | 4 |
| 13 and more | 4 | 5 |

A board of examples keeps its dashed frame and its "Beispiele" badge. The badge has a low row of
its own above the tiles; the frame is thin enough that five examples are still two columns on a
360 px phone.

## Sentence bar

The first visible thing in the board region. It shows the sentence of the tapped tile in large
type; before any tap it shows "Tippe auf ein Feld." in a quieter look ("Feld", because a tile can
be a picture or text only).

The whole bar is one `button`. A tap on it speaks the selected sentence again, through the same
path as a tap on a tile (same guard against stale speech reports, same rule for a sentence that
is still being spoken). It replaces
the earlier button "Sprache erneut versuchen". It carries a small speaker picture
(`public/icons/sprechen.svg`, `alt=""`).

Before a tile was tapped the bar does nothing: `aria-disabled="true"`, the name "Satz noch einmal
sprechen. Noch kein Feld gewählt.", and a click that does not touch the speech engine. Afterwards
its name is "Satz noch einmal sprechen".

The content of a button is not announced as a live region. So the sentence is also written into a
visually hidden line next to the bar (`p.message`, `role="status"`, `aria-live="polite"`); that
line is empty until the first tap. The bar and what is in it carry no `aria-live` and no `role`,
so the hidden line is the only live region that holds the sentence. Whether a screen reader then
speaks the sentence exactly once has not been tried.

## Tap feedback

- A tile changes colour the moment it is pressed (`:active`, no transition on the colour). Where
  the system does not ask for reduced motion it also shrinks a little (`transform: scale`, inside
  `@media (prefers-reduced-motion: no-preference)` only).
- The tapped tile stays marked: `aria-pressed="true"`, a thick dark ring and a yellow background.
  All other tiles have `aria-pressed="false"`. The mark moves with the next tap on another tile
  and is gone when the board is mounted again.
- Keyboard and switch focus shows as an orange ring inside the tile or the bar
  (`outline-offset: -5px`). It is drawn inside because the scrolling board would cut off a ring
  outside the tiles at its edge.

## Speech status

No text while speech was asked for normally. One small line appears only when there is a problem,
and while it shows the speaker picture in the bar is dimmed and grey (class `sentence-bar-mute`),
so the bar does not show a working speaker:

| Situation | Line |
| --- | --- |
| No local German voice, or no speech engine | "Keine Stimme. Bitte noch einmal tippen." |
| The engine threw, or reported an error for the latest request | "Vorlesen ging nicht. Bitte noch einmal tippen." |

The line is cleared by the next request that the engine accepts. It is a polite live region.

**For caregivers, when "Keine Stimme" stays:** the app only speaks with a German voice that is
installed on the device itself; it never uses a voice from the network. Install or switch on a
German voice in the device's text-to-speech settings (Android: Settings, Accessibility or System,
"Text-to-speech output", install German voice data; iOS and iPadOS: Settings, Accessibility,
"Spoken Content", Voices, German), then tap again or reload the app. These paths are from the
systems' documentation, not tried on a device with this app. This help is not on the child's
screen.

**Voices that load late.** Browsers fill their voice list in the background. The app asks for the
list when the waiting line and when a board is mounted (`hasLocalGermanVoice` in `src/speech.ts`),
which starts the loading before the first tap. If a tap still finds no voice, the board listens
for the engine's `voiceschanged` event (one listener, removed when a voice has arrived, when a
later tap finds a voice and when the board is mounted again). When a local German voice has
arrived, the "Keine Stimme" line goes and the speaker is no longer dimmed. Nothing is spoken at
that moment: a sentence that comes seconds after the tap would be wrong. The next tap speaks.

Where the browser knows `:has()`, the line is drawn inside the lower part of the sentence bar, in
room the bar has anyway, so the tiles do not move when it appears: a tile that moves under a
finger is a wrong word. That holds for a sentence of one line, and of two lines on a phone held
upright; a longer sentence makes the bar grow by one small line. In a browser without `:has()`
the line stands under the bar and the board gets that much lower. The line is one line
(`white-space: nowrap`); both texts fit a 320 px wide window at the normal text size (measured,
below). With larger text the end is cut off with an ellipsis.

## A sentence that is still being spoken

`requestLocalGermanSpeech` reports the end of an utterance (`utterance.onend`) and an error
(`utterance.onerror`) to the board. While the selected sentence is being spoken, a tap that asks
for the same sentence (its tile again, or the bar) is ignored: it does not cancel and restart the
sentence, however long the sentence is and however many taps come. An unsteady hand often lands
twice. As soon as the engine has reported the end, or an error, or when there was no voice, the
next tap speaks at once; so a child who taps "Mehr" again after hearing it gets it again. A tap on
**another** tile always takes over at once.

A report for an utterance that is no longer the latest request (the engine reports an end or an
error for an utterance that a newer request cancelled), or for a board that was replaced, changes
nothing.

`SPEECH_MAX_MS` (8000 ms) is the fallback for an engine that reports neither end nor error: that
long after the request the app stops treating the sentence as being spoken, and the next tap
speaks. The value is a guess. A sentence that really takes longer than 8 s (sentences may be up to
200 characters) is cut off and restarted by a tap after that time. Whether engines on real devices
report the end reliably is untested.

## Touch behaviour and stray gestures

Tiles and bar: `touch-action: manipulation` (no double-tap zoom, no delay), no text selection, no
tap highlight flash, no long-press callout; the pictures cannot be dragged and do not take the
press themselves (`pointer-events: none`). A long press does not open the browser's context menu
on a tile or on the bar (`contextmenu` is prevented there, and only there).

`overscroll-behavior: none` on `html` and `body`: a pull that starts on the bar or on a notice does
not reach the browser's pull-to-refresh. The fallback sentences still say "lade die Seite neu";
how a caregiver reloads an installed app that has no browser buttons is not solved here.

Pinch zoom is left possible on purpose, for people who need it. A zoomed board has no on-screen way
back: someone has to pinch out again.

## What was checked in Chromium

Headless Chromium (Playwright), touch enabled, device scale factor 1, service worker blocked,
22 November 2026. The examples are the five example concepts on a device without a profile. The
own boards belong to a profile that was created through the caregiver area (hold, name, "Profil
anlegen", one concept ticked: the board of 1); the boards of 3 and 9 tiles were set through the
board-data functions from the page, because the catalogue has five concepts (four text-only
custom concepts were added for 9). Each state was measured before and after a tap on one tile.

| Window | Board | Page height / window | Columns | Smallest tile | Bar (top..bottom) | All tiles visible without scrolling |
| --- | --- | --- | --- | --- | --- | --- |
| 320x568 | examples, 5 | 568 / 568 | 2 | 142x107 | 8..96 | yes |
| 320x568 | own, 1 | 568 / 568 | 1 | 304x410 | 8..96 | yes |
| 320x568 | own, 3 | 568 / 568 | 2 | 149x202 | 8..96 | yes |
| 320x568 | own, 9 | 568 / 568 | 3 | 97x133 | 8..96 | yes |
| 360x640 | examples, 5 | 640 / 640 | 2 | 158x123 | 8..96 | yes |
| 360x640 | own, 1 | 640 / 640 | 1 | 344x481 | 8..96 | yes |
| 360x640 | own, 3 | 640 / 640 | 2 | 168x236 | 8..96 | yes |
| 360x640 | own, 9 | 640 / 640 | 3 | 109x155 | 8..96 | yes |
| 390x844 | examples, 5 | 844 / 844 | 2 | 173x196 | 8..101 | yes |
| 390x844 | own, 1 | 844 / 844 | 1 | 374x680 | 8..101 | yes |
| 390x844 | own, 3 | 844 / 844 | 2 | 183x336 | 8..101 | yes |
| 390x844 | own, 9 | 844 / 844 | 3 | 119x221 | 8..101 | yes |
| 820x1180 | examples, 5 | 1180 / 1180 | 2 | 388x304 | 8..112 | yes |
| 820x1180 | own, 1 | 1180 / 1180 | 1 | 804x1005 | 8..112 | yes |
| 820x1180 | own, 3 | 1180 / 1180 | 2 | 398x498 | 8..112 | yes |
| 820x1180 | own, 9 | 1180 / 1180 | 3 | 263x330 | 8..112 | yes |
| 844x390 | examples, 5 | 390 / 390 | 3 | 267x100 | 6..68 | yes |
| 844x390 | own, 1 | 390 / 390 | 1 | 828x265 | 6..68 | yes |
| 844x390 | own, 3 | 390 / 390 | 3 | 272x265 | 6..68 | yes |
| 844x390 | own, 9 | 390 / 390 | 4 | 202x84 | 6..68 | yes |

The numbers were the same before and after the tap in all twenty states: the tap, the mark and
the "no voice" line moved nothing. No console error, no page error and no Content-Security-Policy
violation were reported.

### Every reason for examples, on the two smallest windows

Each of the nine fallback sentences and the plain line of a device without profiles, mounted over
the five examples, one tile tapped (so the "no voice" line shows too). "Lines" is the height of
the notice in text lines.

320x568:

| Notice | Lines | Smallest tile | All five tiles visible without scrolling |
| --- | --- | --- | --- |
| plain (no profile) | 2 | 142x107 | yes |
| `storage-unavailable` | 3 | 142x100 | yes |
| `damaged` | 3 | 142x100 | yes |
| `no-active` | 3 | 142x100 | yes |
| `empty-profile` | 3 | 142x100 | yes |
| `unloadable-profile` | 4 | 142x94 | yes |
| `timeout` | 2 | 142x105 | yes |
| `timeout-kept` | 3 | 142x100 | yes |
| `render-failed` | 3 | 142x100 | yes |
| `refresh-timeout` | 3 | 142x100 | yes |

360x640:

| Notice | Lines | Smallest tile | All five tiles visible without scrolling |
| --- | --- | --- | --- |
| plain (no profile) | 2 | 158x123 | yes |
| `storage-unavailable` | 3 | 158x114 | yes |
| `damaged` | 3 | 158x114 | yes |
| `no-active` | 3 | 158x114 | yes |
| `empty-profile` | 2 | 158x120 | yes |
| `unloadable-profile` | 3 | 158x114 | yes |
| `timeout` | 2 | 158x120 | yes |
| `timeout-kept` | 3 | 158x114 | yes |
| `render-failed` | 3 | 158x114 | yes |
| `refresh-timeout` | 3 | 158x114 | yes |

Both speech lines fit their one line in both windows (text width equal to the line's width, no
ellipsis).

Also looked at:

- At 360x640 a board of 14 tiles (4 columns, tiles 80x114) fits. With a sentence of 130 characters
  in the bar (the bar is then 187 px high) the same board scrolls inside itself (472 px of rows in
  382 px); the page stays 640 px high and the bar stays at the top.
- A label of 39 characters in an 80 px wide tile does not fit and is cut off at the bottom.
- The focus ring is visible on a tile in the middle and at the edge of the board.
- With reduced motion a pressed tile changes colour and does not shrink.
- With a stand-in speech engine put into the page at 320x568 (no real voice was available): the
  voice list was asked for twice before any tap; a tap without a voice showed the line and the
  dimmed speaker (opacity 0.3); when a voice arrived the line went, the speaker was at full
  strength and nothing was spoken; the next tap on the bar spoke; ten quick taps on tile and bar
  during that utterance caused no further `speak` and no `cancel`; after the engine's end event
  the next tap spoke at once; another tile took over at once.
- `contextmenu` was prevented on a tile and on the bar and not on a notice; `html` and `body`
  computed to `overscroll-behavior: none`.

## Known limits

- Tiles are allowed down to 88 px high in a window at most 600 px high and down to 80 px in one at
  most 480 px high, below the 112 px used elsewhere: with 112 px five examples would not fit the
  smallest phones, and five examples or nine own tiles would not fit a phone held sideways,
  without scrolling. Whether that is enough for an unsteady hand is untested.
- Above 12 tiles a phone held upright gets 4 columns, and tiles are then 70 to 88 px wide. With
  still more tiles the board scrolls, and a scrolling board hides words from a child who cannot
  know to scroll. The caregiver area should warn before a board gets that large (card NG-13).
- Turning the device keeps the selection and the sentence but moves every tile, because the
  number of columns changes.
- The mark on the tapped tile and the sentence in the bar stay for good, until another tile is
  tapped or the board is mounted again. Whether they should fade after a while is a question for
  a trial with a child.
- An upright tablet uses the portrait column table, so three tiles are two columns there; whether
  a larger tablet wants more columns than a phone has not been tried.
- A very long label in a narrow tile is cut off (see above); labels may be up to 40 characters.
- The static line of `index.html` is longer than one line on a phone, so its box is higher than
  the bar that replaces it. Nothing can be tapped while it shows.
- An engine that never reports the end of an utterance holds repeats of the same sentence back for
  8 s (`SPEECH_MAX_MS`); a sentence longer than 8 s can be restarted by a tap after that time.
- With pull-to-refresh switched off, an installed app has no gesture to reload the page.
- A zoomed board has no on-screen way back.
- Everything under "Not tested" above.
