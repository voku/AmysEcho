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
  then 1. The countdown also shows a child how the gesture works: press, watch it fill, something
  happens. That is cause and effect a child can learn. Recorded for cards NG-13 and NG-14.
- Letting go early resets the hold and shows "Zum Öffnen bitte 3 Sekunden gedrückt halten." A
  short tap does nothing else.
- The pointer leaving the control, a pointer cancel, the control losing focus and the page being
  hidden reset the hold without a word. "Leaving" holds for a mouse and in the tests. On touch
  screens browsers capture the pointer implicitly, so a finger that slides off the control may
  not reset the hold. Unverified until card NG-14.
- A key-down that is only a repeat does not start a hold, so Enter still held down on "Schließen"
  when focus comes back to the control does not open the area again.
- Key repeat does not count: a second key-down while holding neither restarts nor shortens the
  hold, and only the release of the key that started it ends it.
- The area never opens while the board is still starting (`data-startup` absent or `"pending"`);
  a hold that ends then shows "Die Tafel wird noch geladen. Bitte gleich noch einmal versuchen."

The timing is `createHold` in `src/caregiver.ts`: no DOM, an injected timer, time counted in ticks
of `HOLD_TICK_MS`, so a hold is never shorter than the duration.

Limits, stated plainly:

- **A first name is allowed; the storage is still unproven.** The owner decided on 2026-11-22
  (card NG-7) that a child's first name may be stored as the profile name. Still open on NG-7:
  how long data is kept, who counts as an authorised caregiver, and deletion. Still open on
  NG-14: the IndexedDB adapter has never run in a browser, so data entered now may not survive.
  There is no in-app removal of a single profile and no backup. Clearing the site data of the
  browser removes **all** profiles in this browser and the offline copy of the app, and a browser
  may remove stored data on its own (docs/storage.md).

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
stopped. Focus moves to the heading.

"Schließen" empties the area and calls `app.refreshBoard()`, after any write that is still under
way. Until that refresh has settled, the board region and the opening control stay hidden and the
caregiver region shows only "Die Tafel wird geladen.": the board region may still hold the board
of the profile that was active before, and that must not be tappable. Then the board region is
shown, the caregiver region is hidden and emptied, and focus returns to the opening control. The
area cannot be opened again while it waits. On closing, the edited profile is forgotten: the next
opening edits the active profile again.

**At the bound.** The wait has its own bound, `CLOSE_WAIT_MS` (2.5 s: the refresh bound of 1.5 s
plus a margin), because a refresh waits behind start-up and start-up may never be answered by
storage. What happens when the bound passes before the refresh has settled depends on whether the
mounted board can be out of date:

- It **cannot** be out of date through this page, and the board region is shown as it is (the normal return: caregiver region
  hidden and emptied, opening control available and focused), when the board region shows
  examples (`data-board-fallback` is set, or `data-startup` starts with `demo-`; the
  `unrenderable` state, in which nothing can be tapped, counts the same), or when nothing
  was written that the mounted board does not already reflect. Without storage nothing is ever
  written. Looking around, picking another profile for editing and a write that failed do not
  count. This is the case when storage never answered at start-up: the examples come back.
- It **can**, when a profile's own board is mounted and a write succeeded (creating a profile,
  making one active, any change of concepts) that no settled refresh has seen since, or a writing
  action was asked for and has not ended yet. This lasts across later openings without a write,
  until a refresh that was asked for after the write has answered.

**The state without a board** is what the second case leads to, and only that. The board region
stays hidden. The caregiver region shows one line ("Die Tafel konnte noch nicht neu geladen
werden. Deshalb wird gerade keine Tafel gezeigt. Bitte drücke „Tafel neu laden“, lade die Seite
neu oder gib einer Bezugsperson Bescheid.") and a "Tafel neu laden" button, and the opening
control is available again. In this state the child has **no board** until a refresh answers or
the page is reloaded. That is preferred over showing what was mounted before the area was opened:
on a shared tablet that can be another child's board, with that child's sentences, while a
different profile is the stored active one. No board is a visible fault a caregiver deals with; a
wrong board is not visible at all. The board appears by itself when the refresh that was asked for
settles after all, or when one asked for with the button does. The button waits `CLOSE_WAIT_MS`
and then returns to the line; an answer to that attempt that arrives after its own bound is
dropped, and the board appears only when the button is pressed again (or the originally queued
refresh answers). Only the latest closing may show the board: the late answer of an earlier
closing is out of date and is ignored. Not seen on a device.

**Closing by itself.** An open area is closed, the same way as with "Schließen" and with the
refresh, when the page becomes hidden, and after `IDLE_CLOSE_MS` (2 minutes, a guess) without a
pointer press, key or input event inside the area. Scrolling with a wheel or a trackpad does not
count. So a tablet that is put away or handed to the child does not stay in the caregiver area.
Whatever was typed into the name field and not sent is lost then.

**Storage.** The area uses the page's one store (`await app.store()`). If there is none, it shows
one sentence that storage cannot be reached and nothing can be changed, plus "Tafel neu laden" and
"Schließen". The same when the store is there but the profile list cannot be read, and when
`app.store()` has not answered after `STORE_WAIT_MS` (2.5 s): "Der Speicher wird gelesen." does not
stay for good. A store that answers later is used from the next opening.

**"Tafel neu laden".** Calls `app.refreshBoard()` and says what came of it, read off the board
region's `data-startup` and `data-board-fallback`: reloaded; not reloaded (the refresh time-out,
or no answer within `CLOSE_WAIT_MS`); storage not reachable, so the board shows examples; or the
board could not be drawn. Only the first is reported as a success. Afterwards the area is drawn
from the store again, so a list that could not be read before does not stay under a success
message.

**Profiles.** Readable profiles from `store.list()`, sorted by name, each with "Aktive Tafel" or a
button "Als aktive Tafel verwenden", and a button "Begriffe auswählen". Damaged entries are
counted in one note that says they stay stored unchanged and that a later version will help.
With damaged entries and no readable profile the area does not say that there is no profile yet;
it says that no stored profile can be read in this version and that the child sees examples.
`store.getActive()` is null while the active profile's record is unreadable; then no profile is
marked active and the note is what tells the caregiver.

**Which board the child sees** is said in lines that stay, not only in the status line, which the
next action replaces:

- profiles exist but none is active: "Gerade ist keine Tafel aktiv. Das Kind sieht Beispiele, …"
  under the list;
- the edited profile is not the active one: "Diese Tafel ist gerade nicht aktiv. Das Kind sieht
  eine andere Tafel." above its concepts. The second sentence is "… sieht Beispiele." when none
  is active or the active profile has no concept the board can show, and is left out when the
  active board cannot be read;
- the active profile has no concept the board can show: "… Das Kind sieht Beispiele, bis
  mindestens ein Begriff angekreuzt ist."

**Creating.** A labelled text field and "Profil anlegen". The name is checked by the store
(`store.create`); a refusal becomes one German sentence (empty, too long, invisible or control
characters) and the typed text stays in the field. The store reports all three as
`ProfileFormatError`, so the screen reads the reason off the input by the store's own rules. A new
profile has no concepts and is not made active, except when the device held no stored profile at
all, readable or damaged: then it becomes the active board and the status line says so. A newly
created profile becomes the one being edited, not the active one; the line above its concepts
says that the child sees another board. A name that is typed but not sent yet survives the
redraw after another action.

The name is the one in the field when the form is sent, also when the action waits behind
another and the caregiver types on.

Next to the field one paragraph says what is true today: this is a test version; a first name or
nickname is enough and no surname should be entered (owner decision on card NG-7); the name and
the chosen concepts are stored only in this browser on this device; the app sends nothing, but
the device's keyboard may process what is typed on its own; this version cannot rename or delete
a single profile and has no backup; clearing the website data in the browser removes all profiles
in this browser and the offline copy of the app; the browser may remove the data on its own.
The field has `autocomplete="off"`, `spellcheck=false`, `autocapitalize="off"` and
`autocorrect="off"`, because a browser's spell checking can send typed text to a service. Whether
a given browser or on-screen keyboard honours these is unverified.

**Concepts.** For the selected profile (the active one unless another was picked): the board's
concepts in board order with a ticked checkbox and "nach oben" / "nach unten", then the remaining
catalogue concepts unticked. A chosen concept shows the wording stored in the profile, which is
what the board shows. Every tick and every move is saved at once through
`setBoardConcepts(store, profileId, ids, catalogue)`; there is no separate save step and no
unsaved state, and one sentence above the list says so and that a newly ticked concept goes to
the end of the board. Actions are carried out one after another in the order they were asked for,
each built from the list the store holds at that moment, also when they are asked for faster than
storage answers. After every action, successful or not, the area reads the store again and draws
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

- If storage never answered at start-up, a refresh never finishes (see docs/storage.md). "Tafel
  neu laden" and closing stop waiting after `CLOSE_WAIT_MS`; closing then returns to the examples
  board that start-up mounted.
- A board that is shown at the bound is replaced when the refresh that closing asked for answers
  later. If the child has tapped a concept on it meanwhile, the selection is lost and running
  speech is stopped; the board that arrives is the correct one. This overrides the start-up rule
  that a board in use is kept (docs/storage.md, start-up sequence). A fix needs the controller to
  let a refresh leave a board in use alone (card NG-13).
- "Nothing was written" means: by this page. Another tab, or the installed app next to a browser
  tab, can change the active profile; a board shown at the bound can then be another profile's,
  as it already can without opening the area (two tabs, docs/storage.md).
- The state without a board does not end by itself while a write hangs, because the refresh that
  closing asked for waits behind that write. One press of "Tafel neu laden" ends it.
- Closing by itself is silent, and nothing at the moment of closing, by hand or by itself, names
  which board will be shown (card NG-13).
- A refresh started while the page is in the background (the close on a hidden page) may run into
  its time-out, because browsers slow timers and storage down there. A caregiver who returns then
  sees examples with the refresh-time-out line, or the state without a board (card NG-14).
- The Content-Security-Policy in `index.html` has no `form-action` directive. The create form is
  never submitted to a URL (the script prevents the default), but the policy does not enforce
  that (card NG-14).
- A write that hangs holds up every action asked for after it; nothing bounds a single write.
- The idle period counts pointer presses, keys and input inside the area only. Reading or
  scrolling with a wheel for two minutes closes it.
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
8. Never show a board that may be out of date after the area was open. Only the latest closing
   shows the board, and only on the answer of a refresh asked for by it or after it, or at the
   bound when the mounted board cannot be out of date ("At the bound" above). Every new action
   that writes has to be counted there. This depends on `app.refreshBoard()` never rejecting and
   resolving only after it has mounted what it read; the area treats a rejection as "not
   refreshed" for the stale check, but still returns to the board.
9. Keep the notice at the name field true: change it in the same change that adds renaming,
   deleting, export or anything that sends data.
