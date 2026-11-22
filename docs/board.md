# The child's screen

How the board looks and behaves for the child (card NG-30). What the board shows, and why examples
may stand in for the child's own board, is in [storage.md](storage.md); the area for caregivers is
in [caregiver.md](caregiver.md).

Code: `mountBoard`, `mountFailure`, `boardColumns`, `SPEECH_MAX_MS` and `SPEECH_GRACE_MS` in
`src/board.ts`; speech in `src/speech.ts`;
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

No text on the child's screen asks to "reload the page" without offering a button for it: an
installed app has no browser button for that, and pull-to-refresh is switched off (below).

- The last-resort line ("Die Tafel kann gerade nicht angezeigt werden. Bitte tippe auf „Seite neu
  laden“ oder hol eine Bezugsperson.") comes with a real button "Seite neu laden" that calls
  `location.reload()`. Nothing else in the app can recover that state.
- The two fallback sentences that used to ask for a reload (`timeout-kept`, `refresh-timeout`) now
  end with "Bitte hol eine Bezugsperson."; the caregiver area re-reads the board when it is closed
  and has "Tafel neu laden".
- The static line of `index.html`, which shows when the script does not start, says to close the
  app and open it again.

One line in the caregiver area (`src/caregiver.ts`, shown when the board could not be re-read
after closing) still offers "lade die Seite neu" next to its own button "Tafel neu laden"; that
file was outside this card.

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

No text while speech was asked for normally. One small line appears only when there is a problem:

| What the request found | Result of `requestLocalGermanSpeech` | Line |
| --- | --- | --- |
| The voice list is empty (it may still be loading), first request in a row | `"unavailable"` | "Keine Stimme. Bitte noch einmal tippen." |
| The voice list is empty again at the next request in a row | `"unavailable"` | "Keine deutsche Stimme. Hol eine Bezugsperson." |
| Voices are there, none is a German voice on the device (also when a German voice exists that needs the network) | `"no-voice"` | "Keine deutsche Stimme. Hol eine Bezugsperson." |
| No speech engine, or the browser cannot make an utterance | `"no-voice"` | "Keine deutsche Stimme. Hol eine Bezugsperson." |
| The engine threw, or reported an error for the latest request | `"failed"`, or `onFailure` later | "Vorlesen ging nicht. Bitte noch einmal tippen." |
| That happens again before any sentence reached its end | the same | "Vorlesen geht nicht. Hol eine Bezugsperson." |

"Tap again" is said once where tapping again may help, and not a second time in a row for the
same kind of problem. An empty
voice list cannot be told apart from one that has not loaded yet, so the first such tap gets the
benefit of the doubt and the second does not; that count has no time in it, so a quick double tap
uses it up. Any other result, and a voice that arrives, starts the empty-list count again.

A failure has a count of its own: the first says to tap again, a second one before any sentence
reached its end says to fetch a caregiver. Only two things start the failure count again: the end
of the sentence that is the current one (also when that sentence was cut off from outside the
board, as when the caregiver area opens), and a new board. A request the engine merely took, a
no-voice result, an arriving voice and the end of a sentence that another tap has already replaced
do not: no sentence was heard in between.

The line is cleared by the next request that the engine accepts. It is a polite live region.

An utterance that was stopped is not a failure: when the engine reports the error `interrupted`
or `canceled` (speech is cancelled when the caregiver area opens, for instance), the sentence
counts as ended and no line is shown.

**A bar that cannot speak looks different.** While a problem line shows, the bar has the class
`sentence-bar-mute`: a grey-brown bar instead of the green one, and a grey speaker with a
red-brown line through it (drawn in CSS on the bar's `::after`, no extra file). A child who cannot
read the line still sees that this is not the bar that speaks. Colours as computed in Chromium:

| Bar | Background | Border | Sentence colour, contrast | Speaker |
| --- | --- | --- | --- | --- |
| before a tap (idle) | rgb(238, 245, 247) | rgb(183, 207, 216) | rgb(74, 100, 114), 5.67:1 | opacity 0.35 |
| after a tap, speech asked for | rgb(224, 242, 236) | rgb(33, 92, 118) | rgb(20, 49, 70), 11.61:1 | full |
| problem line shows (muted) | rgb(230, 221, 208) | rgb(111, 94, 74) | rgb(20, 49, 70), 10.03:1 | opacity 0.45, grey, crossed out |

The problem line itself is rgb(47, 71, 87) on the muted bar, 7.23:1. Whether a child reads the
grey-brown, crossed-out bar as "no sound" has not been tried.

**For caregivers, when "Keine deutsche Stimme" shows:** the app only speaks with a German voice
that is installed on the device itself; it never uses a voice from the network. In general terms:
open the device's settings for text-to-speech (on Android usually under Accessibility or System,
"Text-to-speech output"; on iOS and iPadOS under Accessibility, "Spoken Content", "Voices"),
choose German and download the voice so that it works without a connection, then come back to the
app and tap again; if the line stays, close the app and open it again. A browser other than the
system's own may bring its own voices or none. All of this is from the systems' general
documentation: no device has been tried with this app, and it is not known which of the cases in
the table a given device reports (an empty list, a list without German, or only a German voice
that needs the network). This help is not on the child's screen.

**Voices that load late.** Browsers fill their voice list in the background. The app asks for the
list when the waiting line and when a board is mounted (`hasLocalGermanVoice` in `src/speech.ts`),
which starts the loading before the first tap. If a tap still finds no German voice, in any of the
cases above, the board listens for the engine's `voiceschanged` event (one listener, removed when
a voice has arrived, when a later tap finds a voice, and when the board is replaced by another
board, the waiting line or the last-resort line). When a local German voice has arrived, also one
that was installed while the app was open, the line goes and the bar is green again. Nothing is
spoken at that moment: a sentence that comes seconds after the tap would be wrong. The next tap
speaks. An engine without `addEventListener` gets none of this: the line stays until the next tap.

Where the browser knows `:has()`, the line is drawn inside the lower part of the sentence bar, in
room the bar has anyway, so the tiles do not move when it appears: a tile that moves under a
finger is a wrong word. That holds for a sentence of one line, and of two lines on a phone held
upright; a longer sentence makes the bar grow by one small line. In a browser without `:has()`
the line stands under the bar and the board gets that much lower. The line is one line
(`white-space: nowrap`); all four texts fit a 320 px wide window that is higher than 480 px at
the normal text size (measured, below). In a window of 480 px height or less, or with larger
text, the end is cut off with an ellipsis.

## A sentence that is still being spoken

`requestLocalGermanSpeech` reports the end of an utterance (`utterance.onend`) and an error
(`utterance.onerror`) to the board. While the selected sentence is being spoken, a tap that asks
for the same sentence (its tile again, or the bar) is ignored: it does not cancel and restart the
sentence, however many taps come, for as long as the app takes the sentence to be running. That
is until the engine reports its end or an error, until the engine says it is doing nothing
(below), and at most `SPEECH_MAX_MS`. An unsteady hand often lands twice. As soon as the engine has reported the end, or an error, or when there was no voice, the
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

**An engine that took the sentence and stays silent.** The engine's own word is asked as well
(`speechActivity` in `src/speech.ts`): when it says that it is neither speaking nor has anything
queued (`speaking` and `pending` both false), the sentence is not running and the next tap
speaks. So a tile does not look dead for eight seconds when the engine accepted the utterance and
did nothing, or ended it without a report. This is not asked during the first `SPEECH_GRACE_MS`
(300 ms, a guess) after a request, because `speaking` may turn true a moment late. An engine that
does not have both properties as booleans is treated as unknown, and then only end, error and
`SPEECH_MAX_MS` count. What real engines report in `speaking` and `pending`, and when, is
untested on devices.

## Touch behaviour and stray gestures

Tiles and bar: `touch-action: manipulation` (no double-tap zoom, no delay), no text selection, no
tap highlight flash, no long-press callout; the pictures cannot be dragged and do not take the
press themselves (`pointer-events: none`). A long press does not open the browser's context menu
on a tile or on the bar (`contextmenu` is prevented there; the hold button of the caregiver area
prevents it too, see [caregiver.md](caregiver.md); notices and the rest of the page do not).

`overscroll-behavior: none` on `html` and `body`: a pull that starts on the bar or on a notice
should not reach the browser's pull-to-refresh. The computed style was checked in Chromium; that
a pull really reloads nothing is untested on a device.

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
| `timeout-kept` | 2 | 158x120 | yes |
| `render-failed` | 3 | 158x114 | yes |
| `refresh-timeout` | 3 | 158x114 | yes |

The four speech lines on their one line, text width / room in px: "Keine Stimme. Bitte noch
einmal tippen." 209 / 272 at 320 px and 229 / 312 at 360 px; "Keine deutsche Stimme. Hol eine
Bezugsperson." 256 / 272 and 280 / 312; "Vorlesen ging nicht. Bitte noch einmal tippen."
239 / 272 and 261 / 312; "Vorlesen geht nicht. Hol eine Bezugsperson." 235 / 272 and 256 / 312.
None is cut off there. In a 320x480 window the room is 222 px: the first line fits, the other
three end in an ellipsis.

Also looked at:

- At 360x640 a board of 14 tiles (4 columns, tiles 80x114) fits. With a sentence of 130 characters
  in the bar (the bar is then 187 px high) the same board scrolls inside itself (472 px of rows in
  382 px); the page stays 640 px high and the bar stays at the top.
- A label of 39 characters in an 80 px wide tile does not fit and is cut off at the bottom.
- The focus ring is visible on a tile in the middle and at the edge of the board.
- With reduced motion a pressed tile changes colour and does not shrink.
- With a stand-in speech engine put into the page at 320x568 (no real voice was available): the
  voice list was asked for twice before any tap; a tap without a voice showed the line and the
  muted bar; when a voice arrived the line went, the speaker was at full
  strength and nothing was spoken; the next tap on the bar spoke; ten quick taps on tile and bar
  during that utterance caused no further `speak` and no `cancel`; after the engine's end event
  the next tap spoke at once; another tile took over at once.
- With a stand-in engine at 320x568, 360x640 and 844x390: idle, active and muted bars as in the
  colour table above; neither the bar's height nor the first tile's position changed between the
  three (bar 88 px, 62 px at 844x390). An engine with `speaking` and `pending` false: a second tap
  at once was ignored, a tap 400 ms later spoke; with `speaking` true the tap was ignored; after
  an `interrupted` error no line showed and the next tap spoke.
- The last-resort line with its button "Seite neu laden" (188x54 px) fits all three windows; a
  tap called the reload function once.
- `contextmenu` was prevented on a tile and on the bar and not on a notice; `html` and `body`
  computed to `overscroll-behavior: none`.

## Known limits

- On an engine that reports neither `speaking` nor `pending` for longer than `SPEECH_GRACE_MS`
  (300 ms) after it took a sentence, or that never reports them truthfully, a second tap on the
  same field after that time restarts the sentence: the protection against a double tap shrinks to
  300 ms there. This is the price for not leaving a field dead for 8 s on a silent engine; which
  engines behave like this is untested.
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
- A long sentence that is being spoken can only be stopped by tapping another field, which speaks
  something else; there is no "stop".
- An engine without `addEventListener` (older Safari) gets no late-voice handling: a "no voice"
  line stays until the next tap.
- With pull-to-refresh switched off, an installed app has no gesture to reload the page; only the
  last-resort line has a reload button. A board of examples that stays wrong needs the caregiver
  area, or closing and opening the app.
- A zoomed board has no on-screen way back.
- Everything under "Not tested" above.
