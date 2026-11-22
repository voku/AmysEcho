# Caregiver area

Status: second slice (cards NG-29 and NG-31). Code in `src/caregiver.ts`, styles in
`public/styles.css`, tests in `test/caregiver.test.mjs`.

## Verification status

- Tested in Node against the in-memory backend and a hand-written fake DOM, with injected timers.
  One test reads rules of the style sheet as text.
- Looked at in headless Chromium with a script that is run by hand and is not part of the
  repository or of CI (card NG-31), at 320, 360, 390 and 820 px width and in a 640 x 360 window:
  - the block at the top and "Fertig" were inside the window with the area scrolled to the top,
    the middle and the bottom;
  - nothing was wider than the window;
  - one walk: open by holding, create a profile, add four concepts, move one, remove one, undo,
    rename, create a second profile, delete it (cancel once, then confirm), "Fertig", the board
    shows the result, and still shows it after a page reload; Escape cancels a confirmation and
    then closes;
  - no console error and no Content-Security-Policy violation during that walk.
- **Not** tested: a real phone or tablet, a touch screen (the script uses a mouse), an on-screen
  keyboard, a screen reader or switch access, text enlarged by the user, an installed app, and
  whether a caregiver finds their way (no caregiver trial). The focus behaviour is what the code
  asks for and what the script saw in Chromium, not what assistive technology announces
  (card NG-14).
- The hold gesture has **not** been tried with a child or a caregiver.

## What it does

A caregiver can, in the app and without a reload:

- see which board the child gets after closing, in a line that stays at the top;
- see the profiles stored on this device as cards, and which one is the active board;
- create a profile (a name, no concepts), rename one and delete one;
- make a profile the active board;
- choose which catalogue concepts are on one profile's board and in which order, and take back
  the last removal;
- reload the board ("Tafel neu laden", under "Hilfe bei Problemen"), which is also the retry after
  a refresh ran into its time-out.

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
- A key-down that is only a repeat does not start a hold, so Enter still held down on "Fertig"
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
  NG-14: the IndexedDB adapter has no automated browser test and has not run on a target device,
  so data entered now may not survive. A profile can be deleted in the area; there is no backup.
  Clearing the site data of the browser removes **all** profiles in this browser and the offline
  copy of the app, and a browser may remove stored data on its own (docs/storage.md).

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

The caregiver region holds three parts: a block that stays at the top while the rest scrolls, the
body (profiles, create form, board editor), and a help section at the bottom.

**The block at the top** (`position: sticky`, with its own background and a line under it):

- the title "Für Bezugspersonen";
- one line that says which board the child sees after closing, read from the store the way
  start-up reads it and written again after every action:
  - "Nach dem Schließen: Tafel von „<name>“" when a profile is active and its board has at least
    one concept that can be shown;
  - otherwise "Nach dem Schließen: Beispiele – …" with the reason: no board is active; the active
    board has no concept yet; the active board cannot be read; the profiles cannot be read;
    storage is not reachable.

  The line is what the store holds, not what the board region shows. It does not know about a
  board that cannot be drawn or a refresh that runs into its bound.
- the button "Fertig", which closes;
- directly under these the status line (`role="status"`), and next to it the button "Rückgängig"
  while a removal can be taken back.

**Closing.** "Fertig" and the Escape key close the area. While a rename field or a delete
confirmation is open, Escape closes that instead and the area stays open. Closing empties the
area and calls `app.refreshBoard()`, after any write that is still under
way. Until that refresh has settled, the board region and the opening control stay hidden and the
caregiver region shows only "Die Tafel wird geladen.": the board region may still hold the board
of the profile that was active before, and that must not be tappable. Then the board region is
shown, the caregiver region is hidden and emptied, and focus returns to the opening control. The
area cannot be opened again while it waits. On closing, the edited profile is forgotten: the next
opening edits the active profile again. An open rename field or confirmation and an undo offer
are gone as well.

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
- It **can**, when a profile's own board is mounted and a write succeeded (creating, renaming or
  deleting a profile, making one active, any change of concepts, an undo) that no settled refresh
  has seen since, or a writing
  action was asked for and has not ended yet. This lasts across later openings without a write,
  until a refresh that was asked for after the write has answered.

**The state without a board** is what the second case leads to, and only that. The board region
stays hidden. The caregiver region shows one line ("Die Tafel konnte noch nicht neu geladen
werden. Deshalb wird gerade keine Tafel gezeigt. Bitte drücke „Tafel neu laden“ oder gib einer
Bezugsperson Bescheid.") and a "Tafel neu laden" button, and the opening control is available
again. The line does not ask to reload the page: an installed app has no gesture for that. In
this state the child has **no board** until a refresh answers or the app is opened again. That is preferred over showing what was mounted before the area was opened:
on a shared tablet that can be another child's board, with that child's sentences, while a
different profile is the stored active one. No board is a visible fault a caregiver deals with; a
wrong board is not visible at all. The board appears by itself when the refresh that was asked for
settles after all, or when one asked for with the button does. The button waits `CLOSE_WAIT_MS`
and then returns to the line; an answer to that attempt that arrives after its own bound is
dropped, and the board appears only when the button is pressed again (or the originally queued
refresh answers). Only the latest closing may show the board: the late answer of an earlier
closing is out of date and is ignored. Not seen on a device.

**Closing by itself.** An open area is closed, the same way as with "Fertig" and with the
refresh, when the page becomes hidden, and after `IDLE_CLOSE_MS` (2 minutes, a guess) without a
pointer press, key or input event inside the area. Scrolling with a wheel or a trackpad does not
count. So a tablet that is put away or handed to the child does not stay in the caregiver area.
Whatever was typed into a name field and not sent is lost then.

**Storage.** The area uses the page's one store (`await app.store()`). If there is none, the body
is one sentence that storage cannot be reached and nothing can be changed; the header line says
the same in short, "Fertig" stays, and the help section is opened so that "Tafel neu laden" is in
reach. The same when the store is there but the profile list cannot be read, and when
`app.store()` has not answered after `STORE_WAIT_MS` (2.5 s): "Der Speicher wird gelesen." does not
stay for good. A store that answers later is used from the next opening.

**Profiles.** Readable profiles from `store.list()`, sorted by name, each as a card: the name, the
badge "Aktive Tafel" on the active one, and buttons "Als aktive Tafel verwenden" (not on the
active one), "Tafel bearbeiten", "Umbenennen" and "Löschen". Each button carries the profile's
name in its `aria-label`. Damaged entries are counted in one note that says they stay stored
unchanged and that a later version will help; they get no card, no rename and no delete.
With damaged entries and no readable profile the area does not say that there is no profile yet;
it says that no stored profile can be read in this version and that the child sees examples.
`store.getActive()` is null while the active profile's record is unreadable; then no profile is
marked active and the note is what tells the caregiver.

**Renaming.** "Umbenennen" turns the name on the card into a labelled text field ("Neuer Name für
„<name>“", filled with the stored name) with "Speichern" and "Abbrechen"; the card's other buttons
are gone while it is open, and focus is in the field. Saving calls `store.rename`. A refusal is
answered with the same German sentences as for creating (`nameErrorLine`), the field stays open
with what was typed, and the label still names the stored name. The same after a write that
failed. After a rename the area is drawn from the store. "Abbrechen" and Escape put the card back
and write nothing. The field has the same attributes as the create field.

**Deleting.** Two steps, inside the card, without a dialog element. "Löschen" turns the card into a
confirmation: "Profil „<name>“ löschen?", "Alle ausgewählten Begriffe dieses Profils gehen
verloren. Eine Sicherung gibt es noch nicht.", for the active profile also "Das Kind sieht danach
Beispiele, bis eine andere Tafel aktiv ist.", and the buttons "Endgültig löschen" and "Abbrechen".
Focus goes to "Abbrechen". Only "Endgültig löschen" calls `store.remove`, which deletes the
profile with everything stored for it and clears the active pointer when it named this profile.
The area makes no other profile active in its place. After a write that failed the card is back,
the status line has the error, and the profile is still stored. Deleting counts as a write for
the rule "At the bound" above.

**One thing open.** At most one rename field or confirmation is open. Opening another closes the
first, and so does every other action (make active, pick for editing, create, add, move, remove,
undo, reload). What is open is changed only by queued tasks, like everything else.

**Which board the child sees** is said in the header line and in lines that stay in the body, not
only in the status line, which the next action replaces:

- profiles exist but none is active: "Gerade ist keine Tafel aktiv. Das Kind sieht Beispiele, …"
  under the list;
- the edited profile is not the active one: "Diese Tafel ist gerade nicht aktiv. Das Kind sieht
  eine andere Tafel." above its lists. The second sentence is "… sieht Beispiele." when none
  is active or the active profile has no concept the board can show, and is left out when the
  active board cannot be read;
- the active profile has no concept the board can show: "… Das Kind sieht Beispiele, bis
  mindestens ein Begriff hinzugefügt ist."

**Creating.** A labelled text field and "Profil anlegen". The name is checked by the store
(`store.create`); a refusal becomes one German sentence (empty, too long, invisible or control
characters) and the typed text stays in the field. The store reports all three as
`ProfileFormatError`, so the screen reads the reason off the input by the store's own rules. A new
profile has no concepts and is not made active, except when the device held no stored profile at
all, readable or damaged: then it becomes the active board and the status line says so. A newly
created profile becomes the one being edited, not the active one; the line above its lists
says that the child sees another board. A name that is typed but not sent yet survives the
redraw after another action.

The name is the one in the field when the form is sent, also when the action waits behind
another and the caregiver types on. The same holds for renaming.

Under the field is one short line, which is also the field's description (`aria-describedby`):
"Wird nur in diesem Browser auf diesem Gerät gespeichert. Ein Vorname oder Spitzname genügt."
The full notice is behind "Was wird gespeichert?" (a `<details>`): this is a test version; a first
name or nickname is enough and no surname should be entered (owner decision on card NG-7); the
name and the chosen concepts are stored only in this browser on this device; the app sends
nothing, but the device's keyboard may process what is typed on its own; a profile can be renamed
and deleted here and there is no backup; clearing the website data in the browser removes all
profiles in this browser and the offline copy of the app; the browser may remove the data on its
own.
The field has `autocomplete="off"`, `spellcheck=false`, `autocapitalize="off"` and
`autocorrect="off"`, because a browser's spell checking can send typed text to a service. Whether
a given browser or on-screen keyboard honours these is unverified.

**Board editor.** For the selected profile (the active one unless another was picked), under
"Tafel von „<name>“ bearbeiten", two lists:

- "Auf der Tafel": the profile's concept ids in board order. A catalogue concept shows its
  picture, the label and sentence stored in the profile (which is what the board shows), and the
  buttons "nach oben", "nach unten" and "Entfernen". "nach oben" and "nach unten" are disabled at
  the ends of the editable sequence.
- "Weitere Begriffe": the catalogue concepts that are not on the board, in catalogue order, each
  with one button "Hinzufügen". A concept in this list shows the catalogue wording, also when the
  profile still holds a caregiver's own wording for it.

There are no checkboxes: in the first slice a ticked row moved to the top under the finger. Now
a row changes its place only when it is the one acted on, and a move exchanges two rows.

Every action is saved at once through `setBoardConcepts(store, profileId, ids, catalogue)`; there
is no separate save step and no unsaved state, and one sentence above the lists says so.
Actions are carried out one after another in the order they were asked for,
each built from the list the store holds at that moment, also when they are asked for faster than
storage answers. After every action, successful or not, the area reads the store again and draws
what is stored.

- "Hinzufügen" appends the id at the end of the list.
- "Entfernen" takes that id out and leaves the others in order.
- "nach oben" / "nach unten" exchange the concept with the previous or next *editable* concept;
  every other id keeps its index, so a move can jump over a locked row.

**Focus after an action.** After a move: the same button of the moved row, or the opposite one
when that is now disabled. After "Entfernen": the next editable row's "Entfernen", else the
previous one's, else the heading "Weitere Begriffe". After "Hinzufügen": the next "Hinzufügen",
else the previous one, else the new row on the board. After a delete: the heading "Profile". The
targets are chosen from the screen as it was when the button was pressed.

**Undo.** After "Entfernen" the status line says "„<label>“ wurde von der Tafel genommen." and the
button "Rückgängig" appears next to it. It puts the id back through the same queued
`setBoardConcepts` path, built from the stored list at that moment: before the id that followed
it when it was removed, if that id is still on the board, else at the end. Board data keeps a
caregiver's own wording when a concept leaves the board, so it comes back with the concept. Only
the last removal is offered. The offer goes away with the next action that succeeds (also a move,
which then cannot be combined with the undo), when another profile is picked, and when the area
closes. An action that fails leaves it. If the concept is already back on the board, the button
writes nothing and goes away.

**A large board.** When the board has more than `BOARD_COMFORT_MAX` (12) concepts that can be
shown, a line says "Mehr als 12 Begriffe: Auf einem Handy werden die Felder klein und die Tafel
muss gescrollt werden." (docs/board.md, tile sizes). Ids that cannot be shown do not count.
Nothing is refused.

**Locked rows.** Ids on the board that this screen does not edit are shown at their real place in
"Auf der Tafel", without buttons, with "Dieser Begriff kann in dieser Version nicht bearbeitet
werden.":

- a custom concept (shown with its label and sentence), also one under a catalogue id;
- a retired concept (stored label and sentence, and "Dieser Begriff ist nicht mehr in der
  Auswahl.");
- an id `resolveBoard` leaves off the board: no entry, an unreadable entry, an entry written by a
  newer app version, or an id board data cannot address (shown as "Begriff „<id>“").

Such an id is not dropped and not moved by this screen: add and move leave it at its index, and a
removal or an undo of another concept shifts it only as far as that one id takes or gives room.

**Help.** At the bottom, behind "Hilfe bei Problemen" (a `<details>`): "Tafel neu laden" with one
sentence that says what it does, and a text for a device that does not speak: "Spricht das Gerät
nicht? Dann fehlt eine deutsche Stimme. Sie wird in den Einstellungen des Geräts bei
„Sprachausgabe“ oder „Text-in-Sprache“ installiert." The text is static; the area does not look
at the voices. It names one cause; a muted device or a failing speech engine are others
(docs/board.md).

**"Tafel neu laden".** Calls `app.refreshBoard()` and says what came of it, read off the board
region's `data-startup` and `data-board-fallback`: reloaded; not reloaded (the refresh time-out,
or no answer within `CLOSE_WAIT_MS`); storage not reachable, so the board shows examples; or the
board could not be drawn. Only the first is reported as a success. Afterwards the area is drawn
from the store again, so a list that could not be read before does not stay under a success
message.

**Errors.** A refusal from `setBoardConcepts` and a store error (`ProfileSizeError`, a profile
that is gone or unreadable, a failed write) become one German sentence in the status line. No
English message and no stack reaches the screen.

**Layout.** Profiles and concepts are blocks (cards and rows) with their buttons under the text;
from 640 px width a concept row has its buttons at the right. Buttons, fields and the two
summaries are at least 44 px high by the style sheet, and neighbouring buttons are 0.6 rem apart.
"Fertig" and "Speichern" are filled dark blue; "Endgültig löschen" is filled red and "Löschen" has
a red outline. The block at the top has safe-area padding. Names, labels and sentences wrap.

**Accessibility as built.** `#caregiver-region` is a labelled region with an `h1`; sections have
`h2` and the two lists `h3`; controls are buttons and labelled text fields; messages go to a
`role="status"` live region; focus is placed after every action (above). The header line is not a
live region. None of this was checked with assistive technology.

## Deliberately missing

- Rewording a concept, custom concepts, symbols for them (NG-27).
- Export, import and backup (NG-22). Deleting a profile is final.
- Deleting or repairing damaged profiles and unreadable concept entries.
- Undo for anything but the last removal of a concept; a deleted profile cannot be brought back.
- Moving a concept by more than one place at a time, or by dragging.
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
- Closing by itself is silent. The header says which board comes after closing only while the
  area is open, and only as far as the store tells (see "The block at the top").
- The block at the top takes room: with a status message of three lines it was about a third of
  a 360 x 640 window and more of a phone held sideways. A status message stays until the next
  action.
- At 320 to 390 px width the three buttons of a board row do not fit one line; "Entfernen" wraps
  under the two move buttons.
- The catalogue has a concept labelled "Fertig", and the button that closes is "Fertig" too. The
  two look different and sit in different places; whether that confuses is for a caregiver trial.
- Escape also closes the area while a name is being typed into the create field; the text is
  lost.
- A concept in "Weitere Begriffe" shows the catalogue wording although adding it brings back a
  caregiver's own wording, if the profile holds one.
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
   it writes. Every action goes through the one queue (`run` / `runWrite`), also rename, delete,
   undo and opening or closing a rename field or confirmation.
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
9. Keep the notice behind "Was wird gespeichert?" and the short line under the name field true:
   change them in the same change that adds export, a backup or anything that sends data.
10. A row or card changes its place only when it is the one acted on. Do not sort a list by a
    state the caregiver has just changed under the finger.
11. After an action, put the focus on a control that still exists, chosen so that a second press
    does the natural next thing, and not on a button that deletes for good.
12. Deleting stays two steps with the focus on "Abbrechen", names what is lost, and makes no other
    profile active by itself.
13. An undo is built from the stored list at the moment it is pressed, not from a remembered
    list, and goes through `setBoardConcepts`.
14. The header line and the lines about the active board must come from the store in the same
    reading as the rest of the body; a new reason for examples needs its own wording there.
15. The opening control, "Fertig" and the block at the top keep their place: nothing new goes
    above the header, and the way out is not moved back below the content.
