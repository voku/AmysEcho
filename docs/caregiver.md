# Caregiver area

Status: first slice (card NG-29). Code in `src/caregiver.ts`, tests in `test/caregiver.test.mjs`.

## Verification status

- Tested in Node against the in-memory backend and a hand-written fake DOM, with injected timers.
- **Not** run in a browser, on a touch device or with a screen reader. The pointer, keyboard and
  focus behaviour is what the code asks for, not what a device was seen to do (card NG-14).
- The hold gesture has **not** been tried with a child or a caregiver.

## What it does in this slice

A caregiver can, in the app and without a reload:

- see the profiles stored on this device, by name, and which one is the active board;
- create a profile (a name, no concepts);
- make a profile the active board;
- choose which catalogue concepts are on one profile's board and in which order;
- reload the board ("Tafel neu laden"), which is also the retry after a refresh ran into its
  time-out.

All text is German. The child's display name appears only inside the caregiver region; the region
is emptied when the area closes, so no name stays in the page behind a `hidden` attribute.

## Getting in: press and hold

Below the board, outside both regions, is a small control "Für Bezugspersonen" (`#caregiver-entry`
in `index.html`; the script fills that element and shows it, so a page without a running script
has no dead control).

- The area opens after the control was held for `HOLD_DURATION_MS` (3 seconds) without a break,
  with a pointer or with Enter or Space.
- While holding, a progress bar fills and a line counts down: "Weiter halten … 3", then 2,
  then 1.
- Letting go early resets the hold and shows "Zum Öffnen bitte 3 Sekunden gedrückt halten." A
  short tap does nothing else.
- The pointer leaving the control, a pointer cancel, the control losing focus and the page being
  hidden reset the hold without a word.
- Key repeat does not count: a second key-down while holding neither restarts nor shortens the
  hold, and only the release of the key that started it ends it.
- The area never opens while the board is still starting (`data-startup` absent or `"pending"`);
  a hold that ends then shows "Die Tafel wird noch geladen. Bitte gleich noch einmal versuchen."

The timing is `createHold` in `src/caregiver.ts`: no DOM, an injected timer, time counted in ticks
of `HOLD_TICK_MS`, so a hold is never shorter than the duration.

Limits, stated plainly:

- **This is not security.** There is no password or PIN. It is a hurdle for a small child who
  taps; anyone who can read the line and hold for three seconds gets in. A child can learn it.
- Three seconds is a guess. Too short and a child opens it by resting a finger; too long and a
  caregiver with limited hand control cannot.
- The control has no `click` handler. Assistive technology that activates a button with a
  synthetic click only (some switch access and screen reader setups) cannot open the area. Not
  tested; a later slice has to decide on another way in.
- On touch devices the browser may cancel a long press (scrolling, text selection, context menu).
  The styles and a `contextmenu` handler ask it not to; whether that holds on the target device is
  unverified.

## Inside the area

While the area is open the board region and the opening control are hidden and running speech is
stopped. Focus moves to the heading. "Schließen" hides and empties the area, shows the board
region, returns focus to the opening control and calls `app.refreshBoard()`.

**Storage.** The area uses the page's one store (`await app.store()`). If there is none, it shows
one sentence that storage cannot be reached and nothing can be changed, plus "Tafel neu laden" and
"Schließen". The same when the store is there but the profile list cannot be read.

**Profiles.** Readable profiles from `store.list()`, sorted by name, each with "Aktive Tafel" or a
button "Als aktive Tafel verwenden", and a button "Begriffe auswählen". Damaged entries are
counted in one note that says they stay stored unchanged and that a later version will help.
`store.getActive()` is null while the active profile's record is unreadable; then no profile is
marked active and the note is what tells the caregiver.

**Creating.** A labelled text field and "Profil anlegen". The name is checked by the store
(`store.create`); a refusal becomes one German sentence (empty, too long, invisible or control
characters) and the typed text stays in the field. The store reports all three as
`ProfileFormatError`, so the screen reads the reason off the input by the store's own rules. A new
profile has no concepts and is not made active, except when the device held no stored profile at
all, readable or damaged: then it becomes the active board and the status line says so.

**Concepts.** For the selected profile (the active one unless another was picked): the board's
concepts in board order with a ticked checkbox and "nach oben" / "nach unten", then the remaining
catalogue concepts unticked. A chosen concept shows the wording stored in the profile, which is
what the board shows. Every tick and every move is saved at once through
`setBoardConcepts(store, profileId, ids, catalogue)`; there is no separate save step and no
unsaved state. After every action, successful or not, the area reads the store again and draws
what is stored.

Ids on the board that this screen does not edit are shown as ticked, disabled rows with "Dieser
Begriff kann in dieser Version nicht bearbeitet werden.":

- a custom concept (shown with its label and sentence), also one under a catalogue id;
- a retired concept (stored label and sentence, and "Dieser Begriff ist nicht mehr in der
  Auswahl.");
- an id `resolveBoard` leaves off the board: no entry, an unreadable entry, an entry written by a
  newer app version, or an id board data cannot address (shown as "Begriff „<id>“").

Such an id is never dropped and never moved by this screen. A new concept is appended at the end.
Removing a concept leaves the others in order. "nach oben" / "nach unten" exchange the concept
with the previous or next *editable* concept; every other id keeps its index, so a move can jump
over a disabled row.

**Errors.** A refusal from `setBoardConcepts` and a store error (`ProfileSizeError`, a profile
that is gone or unreadable, a failed write) become one German sentence in the status line. No
English message and no stack reaches the screen.

**Accessibility as built.** `#caregiver-region` is a labelled region with an `h1`; controls are
buttons, a labelled text field and labelled checkboxes; messages go to a `role="status"` live
region; after an action focus returns to the control that was used, or to its neighbour when that
one is now disabled. Tap targets are at least 44 px by the style sheet. None of this was checked
with assistive technology.

## Deliberately missing

- Rewording a concept, custom concepts, symbols for them (NG-27).
- Export, import and backup (NG-22).
- Renaming and deleting a profile.
- Deleting or repairing damaged profiles and unreadable concept entries.
- Editing custom and retired concepts on a board: they cannot be moved or taken off here.
- A warning before the profile's storage is full (`store.usage`).
- Any protection beyond the hold gesture.

## Known gaps

- After closing, the board region is shown at once and the refresh follows. For the moment in
  between (bounded by the refresh time-out, 1.5 s) the previous board is on screen, and it may be
  the board of the profile that was active before.
- "Tafel neu laden" and closing wait for `app.refreshBoard()`. If storage never answered at
  start-up, a refresh never finishes (see docs/storage.md), and actions asked for after it wait
  with it. The area can still be closed.
- Two tabs are not coordinated (docs/storage.md). The area re-reads after each action, not when
  another tab writes.

## Rules for later slices

1. **Always pass the profile's full `conceptIds`.** Build a new board from the ids read from the
   store, never from `resolveBoard().entries` or from the rows the caregiver can edit: that drops
   ids this version cannot show, and their problem reports with them.
2. **Boards are written only through `setBoardConcepts`**, never through `store.setConceptIds` or
   `store.create(name, ids)`. Only `setBoardConcepts` copies the wording into the profile and
   refuses ids that have nothing behind them. Create a profile with an empty list, then set its
   board.
3. **Offer no deletion for what a newer version wrote**: a damaged profile of kind
   `unsupported-version`, and a concept entry with damage `unsupported-version`. They are probably
   intact. Say that the app needs an update.
4. Do not run two board changes for one profile at the same time; `setBoardConcepts` reads before
   it writes. This slice queues every action.
5. After a change, show what the store holds, not what the screen assumed.
6. The display name stays inside the caregiver region, and the region is emptied on closing.
7. `getActive() === null` together with damaged entries is not a new device: do not make a newly
   created profile active by itself then.
