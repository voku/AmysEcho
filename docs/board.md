# The child's screen

How the board looks and behaves for the child (card NG-30). What the board shows, and why examples
may stand in for the child's own board, is in [storage.md](storage.md); the area for caregivers is
in [caregiver.md](caregiver.md).

Code: `mountBoard`, `boardColumns` and `REPEAT_WINDOW_MS` in `src/board.ts`; the layout in
`public/styles.css`; the page in `public/index.html`.

## Status

- The behaviour (sentence bar, repeat, mark on the tapped tile, speech line, repeat window, columns)
  is tested in Node against a fake document (`test/board.test.mjs`, the tests named "screen: …").
  The stylesheet is tested as text: that the rules described here exist, not what they look like.
- The layout was looked at by hand in headless Chromium at four window sizes, with the numbers
  below. There is no automated browser test.
- **Not tested:** a real phone or tablet, a child, a screen reader, a switch, iOS Safari, Firefox,
  an installed PWA, a device with a notch, and real speech (the Chromium that was used has no
  German voice, so every tap there showed the "no voice" line).

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
never lower than `--tile-min`: 112 px, or 80 px in a window at most 480 px high (a phone held
sideways), and a tile is never smaller than 44 px in either direction. When the rows do not fit,
the board scrolls inside itself (`overflow-y: auto`, `overscroll-behavior: contain`); the page does
not scroll and the bar stays. The bar is also `position: sticky`, for a window so small that the
page has to scroll after all.

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
type; before any tap it shows "Tippe auf ein Bild." in a quieter look.

The whole bar is one `button`. A tap on it speaks the selected sentence again, through the same
path as a tap on a tile (same guard against stale speech errors, same repeat window). It replaces
the earlier button "Sprache erneut versuchen". It carries a small speaker picture
(`public/icons/sprechen.svg`, `alt=""`).

Before a tile was tapped the bar does nothing: `aria-disabled="true"`, the name "Satz noch einmal
sprechen. Noch kein Bild gewählt.", and a click that does not touch the speech engine. Afterwards
its name is "Satz noch einmal sprechen".

The content of a button is not announced as a live region. So the sentence is also written into a
visually hidden line next to the bar (`p.message`, `role="status"`, `aria-live="polite"`); that
line is empty until the first tap. Whether a screen reader then speaks the sentence exactly once
has not been tried.

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

No text while speech was asked for normally. One small line appears only when there is a problem:

| Situation | Line |
| --- | --- |
| No local German voice, or no speech engine | "Dieses Gerät hat gerade keine Stimme." |
| The engine threw, or reported an error for the latest request | "Das Vorlesen hat gerade nicht geklappt." |

The line is cleared by the next request that the engine accepts. It is a polite live region.

Where the browser knows `:has()`, the line is drawn inside the lower part of the sentence bar, in
room the bar has anyway, so the tiles do not move when it appears: a tile that moves under a
finger is a wrong word. That holds for a sentence of one line, and of two lines on a phone held
upright; a longer sentence makes the bar grow by one small line. In a browser without `:has()`
the line stands under the bar and the board gets that much lower. The lines are kept short
because they must fit on one line there; a line that still does not fit is cut off with an
ellipsis.

## Touch behaviour and the repeat window

Tiles and bar: `touch-action: manipulation` (no double-tap zoom, no delay), no text selection, no
tap highlight flash, no long-press callout; the pictures cannot be dragged.

`REPEAT_WINDOW_MS` (700 ms): a tap that asks for the sentence that is already being spoken (the
same tile again, or the bar) does not cancel and restart it while such taps follow each other
faster than that. The window runs from the latest of these taps, so a row of quick taps restarts
nothing; after a pause of 700 ms the next tap speaks again. A tap on **another** tile is never
held back. The window does not apply when nothing is being spoken as far as the app knows (no
voice, or an error for the latest request): then the next tap tries again at once. The app cannot
see when an utterance has ended, so a tap shortly after a short sentence has finished is also
held back for the rest of the window. 700 ms is a guess; it has not been tried with a child.

## What was checked in Chromium

Headless Chromium (Playwright), touch enabled, device scale factor 1, service worker blocked,
22 November 2026. The examples are the five example concepts on a device without a profile. The
own boards belong to a profile that was created through the caregiver area (hold, name, "Profil
anlegen", one concept ticked: the board of 1); the boards of 3 and 9 tiles were set through the
board-data functions from the page, because the catalogue has five concepts (four text-only
custom concepts were added for 9). Each state was measured before and after a tap on one tile.

| Window | Board | Page height / window | Columns | Smallest tile | Bar (top..bottom) | All tiles visible without scrolling |
| --- | --- | --- | --- | --- | --- | --- |
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
| 844x390 | examples, 5 | 390 / 390 | 3 | 267x96 | 6..68 | yes |
| 844x390 | own, 1 | 390 / 390 | 1 | 828x265 | 6..68 | yes |
| 844x390 | own, 3 | 390 / 390 | 3 | 272x265 | 6..68 | yes |
| 844x390 | own, 9 | 390 / 390 | 4 | 202x84 | 6..68 | yes |

The numbers were the same before and after the tap in all sixteen states: the tap, the mark and
the "no voice" line moved nothing. No console error, no page error and no Content-Security-Policy
violation were reported.

Also looked at, at 360x640:

- With storage switched off the examples stand under the three-line storage sentence; the five
  tiles are then 158x114 and still fit.
- A board of 14 tiles (4 columns, tiles 80x116) fits. With a sentence of 130 characters in the bar
  (the bar is then 187 px high) the same board scrolls inside itself (472 px of rows in 382 px);
  the page stays 640 px high and the bar stays at the top.
- A label of 39 characters in an 80 px wide tile does not fit and is cut off at the bottom.
- The focus ring is visible on a tile in the middle and at the edge of the board.
- With reduced motion a pressed tile changes colour and does not shrink.

## Known limits

- Tiles in a window at most 480 px high are allowed down to 80 px high, below the 112 px used
  elsewhere: with 112 px five examples, or nine own tiles, would not fit a phone held sideways
  without scrolling. Whether 80 px is enough for an unsteady hand is untested.
- An upright tablet uses the portrait column table, so three tiles are two columns there; whether
  a larger tablet wants more columns than a phone has not been tried.
- A very long label in a narrow tile is cut off (see above); labels may be up to 40 characters.
- The static line of `index.html` is longer than one line on a phone, so its box is higher than
  the bar that replaces it. Nothing can be tapped while it shows.
- The repeat window cannot tell a short sentence that has ended from one that is still spoken.
- Everything under "Not tested" above.
