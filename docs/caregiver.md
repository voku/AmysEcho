# Caregiver area

Status: second slice (cards NG-29 and NG-31), rewording (NG-33), teaching gestures (NG-19), own
concepts (NG-34) and own pictures (card NG-8673323346005092805). Code in
`src/caregiver.ts`, styles in `public/styles.css`, tests in `test/caregiver.test.mjs`.

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
  - no console error and no Content-Security-Policy violation during that walk;
  - with emulated touch, also at 344, 667 x 375 and with names of 40 characters: taps on one
    spot of "Löschen", "Endgültig löschen", "Entfernen" and "Rückgängig" in several rhythms (two
    and three taps, and steady tapping for five seconds); a hold on "Endgültig löschen" that is
    let go early and one that is kept; where the editor heading, a rename field, a moved row's
    button and a confirmation come to rest after they get the focus; Escape with text in the
    create field and with the focus on nothing;
  - with storage slowed down, so that writes and redraws are under way while fingers are: a tap
    where "Endgültig löschen" is about to be drawn; a finger that stays down across "Abbrechen"
    and a second "Löschen"; a finger that slides off the button during and after a hold; the
    lift after a completed hold; a tap right after a tap that retires the status message.
- Teaching a gesture (card NG-19) was driven once by hand in headless Chromium with a probe that
  is not part of the repository or of CI, with Chromium's fake camera playing a DGS video from
  `main_old` (as the browser test reads them; deleted after use), at 390 px width: open by
  holding, create a profile, add "Trinken", "Gebärde beibringen", "Kamera starten" (no tracker
  file and no camera requested before that tap; the camera ran after about 0.8 s with the tracker
  cached), live line, two recordings of about 3.5 s, "Behalten", one recording left to stop by
  itself after 8 s, "Zurück". With `trinken_main_trinken.mp4` both recordings were usable "mit
  einer Hand (rechts)" (27 and 40 frames, stored records of about 12.9 kB, shoulders anchor);
  with `trinken_main_kaffee.mp4` the first was refused as hands unclear and the second usable
  "mit beiden Händen" (34 frames, about 20 kB). The 8-second recordings, which ran over the end of
  the looping video, were refused as hands unclear. The stored IndexedDB entries held exactly the
  record's fields; after "Zurück" no video element was left; the row showed "Gebärde: 2
  Beispiele"; no console error and no request left the origin. The probe clicks with a mouse.
- Second build of card NG-19, the same kind of probe with `trinken_main_trinken.mp4`, three
  examples each at 360 x 640 and 640 x 360, measured in 16 states (camera off; per example ready,
  countdown, recording, result; after the third): the record button ("Kamera starten", "Aufnahme
  starten", "Abbrechen", "Aufnahme beenden", "Behalten", always in one place) at y = 270 to 314 and
  the live line at y = 167 to 214 at 360 x 640, and at y = 226 to 270 and 122 to 169 at 640 x 360,
  in every state, all inside the window. Two of the three recordings were usable, one was refused
  (no hand in the part of the looping video that was recorded); no console error.
- **Not** tested: a real phone or tablet, a real touch screen and a finger (the scripts use a
  mouse and emulated taps), an on-screen keyboard, a screen reader or switch access, text
  enlarged by the user, an installed app, and
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
  removals made during the visit;
- reload the board ("Tafel neu laden", under "Hilfe bei Problemen"), which is also the retry after
  a refresh ran into its time-out;
- teach a gesture for a tile on the board: record examples with the camera, keep or discard
  them, and delete them (card NG-19, "Teaching a gesture" below). Recognising a gesture on the
  child's board is card NG-20 and not built.

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
  hidden reset the hold without a word.
- **The finger has to stay on the control.** A touch is captured by the element it began on, so
  a browser does not report a finger that slides off as leaving. The control therefore gives the
  capture up when the press begins (`releasePointerCapture`) and also watches the moves of the
  pointer: a move or a lift more than `HOLD_SLOP_PX` (8 px) outside its rectangle ends the hold.
  The same holds for "Endgültig löschen" (below); both are `heldButton` in the code. Seen with
  emulated touch in Chromium; a real touch screen is untested (card NG-14).
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
  so data entered now may not survive. A profile can be deleted in the area; since card NG-58 a
  password-protected backup file can be saved and restored ("Backup", below).
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
  - otherwise "Nach dem Schließen: Beispiele – …" with the reason: no board is active; one or
    several stored profiles cannot be read in this version, in the words of the note in the body
    (no readable profile is active and `list()` reports damaged entries, which is when start-up
    shows examples for that reason); the active board has no concept yet;
    the active board cannot be read; the profiles cannot be read; storage is not reachable.

  The line is what the store holds, not what the board region shows. It does not know about a
  board that cannot be drawn or a refresh that runs into its bound. The store does not tell
  whether the damaged entry is the active one, so the line does not claim that.
- the button "Fertig", which closes;
- under these the status line (`role="status"`), which shows three lines at most (the full text
  stays in the element), and under it the button "Rückgängig: „<label>“" while a removal can be
  taken back.

**The status line does not linger, and does not jump.** A press on any button of the area
retires the message that is shown, and so does opening or leaving a rename field or confirmation.
The text keeps its place until the redraw for that press, where the answer replaces it or it is
cleared: taking it away at the press would move everything below the block while a finger may be
on its way to a second tap. Messages have a kind. What is only good to know (saved, removed,
renamed, "Bitte kurz warten.") also goes when the caregiver scrolls the area by wheel or touch.
An error (a refusal, a write or reload that failed, a profile that is gone) stays through
scrolling until the redraw of the next press, and is drawn in the colour of the warnings. The undo
button stays. The area scrolling by itself after a focus move does not count.

**A press must be aimed at what is on screen.** The area draws itself again after every action,
and storage decides when. A finger that is down, or on its way down, when that happens was aimed
at what was there before. Four rules keep such a press from acting on something else:

- **A. The press shield.** The area notes when content was last put on screen or moved (every
  swap of the body, a new or removed undo button, a change of the status line, the lines shown
  while and after closing, also each time the line of the state without a board changes). The
  time is monotonic (`performance.now()`, the wall clock only where that is missing), so a clock
  that is set back does not leave the buttons dead. A click counts only if its press began at least `SHIELD_GRACE_MS`
  (300 ms) after that: for a pointer the moment it went down, for a key the first key-down (a
  repeat is not a new press; Space clicks on the key-up and is judged by its key-down), for a
  click without a press of its own (assistive technology) the moment it arrives. A pointer whose
  press the area did not see counts as "before". Every other click is swallowed in the capture
  phase on the region, before any button hears it. The same test decides whether a hold on
  "Endgültig löschen" may start and whether a form is sent. Not shielded: typing, Tab, Escape,
  and the two `<details>` summaries. Folding or unfolding one counts as a swap, because it moves
  what is below it. A swallowed press says nothing.
- **B. A hold belongs to its button.** The held buttons of the body are registered with it. When
  the body is swapped, every hold on the content that goes ends at that moment. A button that is
  no longer the registered one can neither start a hold nor act.
- **C. A hold needs the finger on the button** (see "Getting in").
- **D. The delete confirmation takes over, and deletes on the release** (see "Deleting").

**Nothing that gets the focus stays under the block.** After every focus move the area measures
the focused element (`getBoundingClientRect`) and scrolls the region so that its top edge is
below the block; for a rename field and a confirmation the edge of the whole card is used, and a
focused button that would then end below the region is scrolled into it. The editor heading is
brought to just under the block also from further down. Where the DOM has no geometry, nothing is
done.

**Closing.** "Fertig" and the Escape key close the area. Escape leaves the innermost thing first:
while a rename field or a delete confirmation is open it closes that, and the area stays open;
with the focus in a text field that holds text it moves the focus to the title, keeps the text
and closes nothing; only the next Escape closes. A rename field or confirmation counts as open
from the press on its button, also while an earlier write is still under way. Escape is heard on
the document as well, so it works with the focus on nothing inside the area (after a tap on
text); while the area is closed that listener does nothing and leaves the key alone. Closing empties the
area and calls `app.refreshBoard()`, after any write that is still under
way. Until that refresh has settled, the board region and the opening control stay hidden and the
caregiver region shows only "Die Tafel wird geladen.": the board region may still hold the board
of the profile that was active before, and that must not be tappable. Then the board region is
shown, the caregiver region is hidden and emptied, and focus returns to the opening control. The
area cannot be opened again while it waits. On closing, the edited profile is forgotten: the next
opening edits the active profile again. An open rename field or confirmation and the undo offers
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
answered with the same German sentences as for creating (`nameErrorLine`, and the sentence for a
name that is taken, below), the field stays open with what was typed, and the label still names
the stored name. The same after a write that
failed. After a rename the area is drawn from the store. "Abbrechen" and Escape put the card back
and write nothing. The field has the same attributes as the create field.

**Deleting.** Two steps, without a dialog element. "Löschen" replaces the whole body by the
confirmation: "Profil „<name>“ löschen?", "Alle ausgewählten Begriffe und beigebrachten Gebärden
dieses Profils gehen verloren, außer sie stehen in einer Sicherung.", for the active profile also "Das Kind sieht danach
Beispiele, bis eine andere Tafel aktiv ist.", a field "Zum Bestätigen den Namen „<name>“
eingeben" (the stored name, not the "(2)" label), the buttons "Abbrechen" and "Endgültig löschen",
in that order, and under them the line "Zum Löschen 2 Sekunden gedrückt halten." Focus goes to the
name field, and the confirmation starts right under the block.

**The name has to be typed** (owner decision of 2026-11-24 on card NG-13, card
NG-8673320459971200034, polished on card NG-8673319027843774136). Until the field holds the stored
name, "Endgültig löschen" has `aria-disabled="true"` and a hold on it (pointer, Enter or Space)
does nothing; pressing it replaces the line under it with "Der Name stimmt noch nicht. Bitte genau
„<name>“ eingeben. Es wurde nichts gelöscht.", with " Achte auf die Leerzeichen." or " Achte auf
große und kleine Buchstaben." before the last sentence when only the spaces or only the capitals
differ. Both sides are compared in NFC, without the emoji presentation mark U+FE0F, with every
run of white space (also a no-break space) as one space and the ends trimmed; capitals and every
other character count. The line follows the field: as soon as the name is right it says the hold
hint again. A name changed during a running hold deletes nothing at the release, and the line
says why. Once the name matches, the hold and release below apply unchanged. The field's
`aria-describedby` names the title, the loss text and, for the active profile, what the child
sees afterwards, so a screen reader that starts at the field hears them; the label wraps long
names. The field has the attributes of the create field (no spell checking or
correction). What was typed is kept while the confirmation stays open. A small child who got into
the area cannot type the name; a caregiver who reads it can. It is not security. Deleting an own
concept or gesture examples keeps the hold only. While it is open there is no
card, no editor, no create form and no help section: nothing else can be hit, and no redraw can
put another control under a finger. "Abbrechen" (or Escape) brings the normal body back, with
focus on that profile's "Löschen" and with what was typed into the create field.

**"Endgültig löschen" is a hold and then a release, not a tap.** Deleting cannot be taken back
(only a backup saved before brings the profile back), and a tap by a caregiver cannot be told from a tap by a child or from the
later taps of someone tapping on one spot. So the button works like the opening control
(`heldButton`, `createHold`, the injected timer): it has no `click` handler and has to be pressed
and held for `DELETE_HOLD_MS` (2 seconds), with a pointer or with Enter or Space. While holding,
a progress bar fills and the line counts down ("Weiter halten … 2"). When the time is up the line
says "Loslassen zum Löschen. Zum Abbrechen den Finger wegziehen." and nothing happens yet: the profile is deleted when the finger, or
the key, is let go **on the button**. That way the redraw after the delete does not happen under the
finger that held, and its lift cannot press what the redraw put there. A tap, in any number
and rhythm, shows the line and deletes nothing.

- Letting go early, the pointer leaving the button or straying from it (rule C), a pointer
  cancel and the button losing focus end the hold, also one that is complete and waits for the
  release; the next one starts from zero. Key repeat neither restarts nor shortens it, and only
  the release of the key that started it counts.
- "Abbrechen", Escape, any other action, a redraw that replaces the button (rule B) and the area
  closing (also by itself, on a hidden page) end it as well.
- So does a second finger: any pointer that goes down in the area on something other than the
  held button ends the hold, also a completed one, and the first finger's lift then deletes
  nothing. The confirmation stays open: Chromium sends no click for a tap made while another
  finger is down, so "Abbrechen" needs a tap of its own afterwards.
- On a screen narrower than 640 px the line under the button keeps room for three lines, so the
  button does not move (and end the hold by rule C) when the countdown replaces the instruction.
- A hold does not start while the confirmation has only just appeared (rule A).
- The delete is carried out only if the confirmation for that profile is the open one when the
  button is let go, and still is when the queued delete starts: one that waited behind a slow
  write is dropped after "Abbrechen" or Escape, and a second hold in that time is not a second
  delete or a second message.

Only then is `store.remove` called, which deletes the profile with everything stored for it and
clears the active pointer when it named this profile. The area makes no other profile active in
its place. Afterwards the normal body is back, the status line says "Das Profil „<name>“ wurde
gelöscht.", and focus is on the heading "Profile". After a write that failed the normal body is
back as well, the status line has the error, and the profile is still stored. Deleting counts as a
write for the rule "At the bound" above. As with the opening control, assistive technology that
activates a button with a synthetic click only cannot delete; not tested.

**Guard against a second tap** (`GUARD_MS`, 800 ms, a guess; timed by the injected timer), for
"Entfernen" and "Rückgängig". Both can be put right (a removal by "Rückgängig", a restore by
"Entfernen"), so a time guard is enough here. After one of them the list is drawn again and
another row, or the next undo, is where the finger was:

- From a press on an "Entfernen" every "Entfernen" ignores presses, and looks inactive
  (`aria-disabled="true"`, not `disabled`, so it keeps its place in the tab order), until the
  guard time has passed **after the list was redrawn** without that row. The time does not start
  when the write ends: on a slow device the old list can still be on screen then.
- A press that is ignored while the time runs starts it again, so steady tapping on one spot
  keeps being ignored and takes one concept off. The status line then says "Bitte kurz warten.",
  which explains the grey buttons.
- If nothing was removed (a write that failed), they count again at once, so that a retry is not
  swallowed.
- When the time is over, "Bitte kurz warten." gives the line back to the message it replaced
  (what was removed, or an error), or clears it.
- The buttons show the state of the guard as it is when they are put on screen, and are updated
  when it ends.
- "Rückgängig" has a guard of its own with the same rules. The two do not hold each other back: a
  removal can be taken back at once, also when the guard of an earlier undo is still running (a
  removal that succeeds resets it). The guards start afresh with every opening.

"Hinzufügen", the move buttons and the buttons of a profile card have no guard: pressed twice they
add two concepts, move two places, or open something that "Abbrechen" closes, and all of that can
be put right by hand.

**Names.** The area refuses a second profile of the same name, on creating and on renaming:
"Diesen Namen gibt es schon. Bitte wähle einen anderen, zum Beispiel „Amy 2“." The example is the
typed name with the first number from 2 that is free; it shows a way out that is not a surname,
and is left out when it would be longer than a name may be. Names are compared in NFC, trimmed,
without regard to case (`toLocaleLowerCase("de")`), against the readable profiles the store holds
at that moment; a profile may keep its own name in another spelling. The store itself does not
enforce this, so data from before this rule, or written by another tab at the same moment, can
hold two profiles of one name. They are told apart on screen only: in the sorted list the second
is shown as "<name> (2)", the third as "<name> (3)", in cards, button labels, the editor heading,
the header line, the confirmation and the messages. The stored names are not changed, the rename
field starts from the stored name, and the suffix never leaves the caregiver region.

**One thing open.** At most one rename field or confirmation is open. Opening another closes the
first, and so does every other action (make active, pick for editing, create, add, move, remove,
undo, reload); while a confirmation is open, the only such action left on screen is
"Rückgängig" in the block at the top. A rename that was sent from a form that is gone by then
does not close whatever is open instead. What is open changes at the press of a button, not when the queue gets to it;
the drawing follows in the queue.

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

**First use.** After the first profile was created, focus and view go to the heading of its
editor, and the status line says "Das Profil „<name>“ ist angelegt und jetzt die aktive Tafel.
Füge unten Begriffe hinzu." After a further profile, focus stays in the list, on the new card's
"Als aktive Tafel verwenden", and the status line says that it is not the active board yet.
"Tafel bearbeiten" likewise moves focus and view to the editor heading and says "Tafel von
„<name>“ wird bearbeitet."; on a phone the editor is below the fold. After a name that was
refused, focus stays in the name field.

The name is the one in the field when the form is sent, also when the action waits behind
another and the caregiver types on. The same holds for renaming.

Under the field is one short line, which is also the field's description (`aria-describedby`):
"Wird nur in diesem Browser auf diesem Gerät gespeichert. Ein Vorname oder Spitzname genügt."
The full notice is behind "Was wird gespeichert?" (a `<details>`): this is a test version; a first
name or nickname is enough and no surname should be entered (owner decision on card NG-7); the
name, the chosen concepts, own texts for them and taught gestures are stored only in this browser on this
device, and of a gesture only numbers about the movement of the hands, no picture and no video (card NG-19), the only
video being a demo clip a caregiver records of themselves (card NG-56); the app sends
nothing, but the device's keyboard may process what is typed on its own; a profile can be renamed
and deleted here, and that "Sicherung speichern" puts it into a password-protected file that can be
restored on another device (card NG-58); clearing the website data in the browser removes all
profiles in this browser and the offline copy of the app; the browser may remove the data on its
own.
The field has `autocomplete="off"`, `spellcheck=false`, `autocapitalize="off"` and
`autocorrect="off"`, because a browser's spell checking can send typed text to a service. Whether
a given browser or on-screen keyboard honours these is unverified.

**Board editor.** For the selected profile (the active one unless another was picked), under
"Tafel von „<name>“ bearbeiten", two lists:

- "Auf der Tafel": the profile's concept ids in board order. A catalogue concept shows its
  picture, the label and sentence stored in the profile (which is what the board shows), a line
  "Gebärde: 3 Beispiele" when gesture examples are stored for it, and the buttons "nach oben",
  "nach unten", "Text ändern", "Gebärde beibringen" and "Entfernen". "nach oben" and "nach unten" are disabled at
  the ends of the editable sequence.
- "Weitere Begriffe": the catalogue concepts that are not on the board, in catalogue order, each
  with one button "Hinzufügen". A concept in this list shows the catalogue wording, also when the
  profile still holds a caregiver's own wording for it.

There are no checkboxes: in the first slice a ticked row moved to the top under the finger. Now
no row is re-sorted by an action. A move exchanges two rows; an added concept goes to the end of
"Auf der Tafel"; a removed one goes to its catalogue place in "Weitere Begriffe". The rows below
a row that left a list move up by one, so after "Entfernen" the next row is where the removed
one was (hence the guard above).

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
targets are chosen from the screen as it was when the button was pressed. After an add, a move
or a removal that was **not** saved, focus stays on the button that was pressed, so that a second
press acts on the same concept.

**Undo.** After "Entfernen" the status line says "„<label>“ wurde von der Tafel genommen." and the
button "Rückgängig: „<label>“" appears under it. The area keeps a stack of the removals made on
the edited profile during this visit. The button names and restores the latest one and stays
while the stack is not empty, so several removals can be taken back one after another; while
more than one is stacked it says so ("Rückgängig: „Pause“ (noch 2 weitere)"). It has the guard
described above. Each
restore goes through the same queued `setBoardConcepts` path, built from the stored list at that
moment: before the id that followed the concept when it was removed, if that id is still on the
board, else at the end. Board data keeps a caregiver's own wording when a concept leaves the
board, so it comes back with the concept.

The stack is emptied when another profile gets into the editor (picked, newly created, or because
the edited one was deleted) and when the area closes. It is **kept** across adding, moving,
renaming, making active and deleting another profile, and across an action that fails: a caregiver
who notices a wrong removal a few steps later can still take it back, and the place is found from
the stored list, not remembered. A concept that is added back by hand leaves the stack; if it is
back on the board by other means, its restore writes nothing and it leaves the stack.

**Rewording a concept** (card NG-33). Every row of "Auf der Tafel" that the board shows has
"Text ändern" (not the rows of "Weitere Begriffe"). It opens fields that take over the body, as the
delete confirmation does: a heading that names the concept and the profile, "Wort auf der Taste",
"Gesprochener Satz" (a text area), for a catalogue concept the line "Text der App: „…“ – „…“",
for a concept with a picture "Das Bild bleibt gleich.", "Speichern" and "Abbrechen". The fields
start from the stored wording. What is typed lives in the open mode and survives a redraw.
"Abbrechen" and Escape leave without a change and drop what was typed (rule 18); Escape is left
alone while an input method composes a character. Enter in "Wort auf der Taste" moves on to the
sentence and sends nothing (`enterkeyhint="next"`): only "Speichern" saves. While an input
method composes, Enter sends nothing either and the focus stays. Spell checking and
correction are off as for a name; capitals are left to the keyboard.

- **Saving** is one queued write through `setWording`. Before that the text is cleaned: soft
  hyphens, zero-width spaces, word joiners and byte order marks are taken out, a zero-width
  (non-)joiner stays only between two visible characters, line breaks of every kind (also the
  Unicode line and paragraph separators, next line U+0085, vertical tab and form feed) and tabs become one space,
  the ends are trimmed, and the length is counted on that text in NFC, as the store counts it.
  Text that equals the app's wording of a catalogue concept is not stored as an own wording: it
  goes through `clearWording`, as a reset does, and the status line says so. Then it is checked, and board data has the last word. Afterwards the
  area is drawn from the store, the editor is back with focus on that row's "Text ändern", and
  the status line says "Gespeichert: neuer Text für „<label>“." Text that equals what is stored
  is not written, and nothing is said. A second press on "Speichern" while the first is under way
  is not a second write.
- **Leaving while a save or reset is queued.** "Abbrechen", Escape or another action before the
  write has begun drops it: nothing is written. A write that has begun cannot be taken back: it
  is carried out, the editor is shown, and the status line says what was saved or reset. The
  second step of a reset does not open while a save is under way.
- **Refusals** are errors in German, the fields stay open with the text as typed, and focus goes
  to the field concerned: no word, no sentence, too long (40 characters for the word, 200 for the
  sentence, counted as characters), characters that are not allowed; a full profile ("… Entferne
  Begriffe oder kürze Texte, dann ist wieder Platz."); a write that failed.
- **Reset.** When the stored wording of a catalogue concept differs from the catalogue's, the
  fields also offer "Text der App wiederherstellen". It leads to a second step that shows the
  wording that comes back, with "Abbrechen" first and focused and "Wiederherstellen"; "Abbrechen"
  and Escape go back to the fields. It is a tap, not a hold: the own text can be typed again.
  The reset goes through `clearWording`, which stores the catalogue wording as a copy. A custom
  and a retired concept have no reset.
- **An entry a newer app wrote** (`resolveBoard` reports damage `unsupported-version` for the id)
  gets no "Text ändern", and its row says "Diese Taste wurde mit einer neueren Version
  gespeichert. Bitte die App aktualisieren." If that only shows when saving (`setWording` refuses
  with `unsupported-entry`), the same sentence and "Der Text wurde nicht geändert." are shown and
  the fields stay open with the text, for as long as the id is on the board; that holds for a
  custom or retired concept as well, which the board then no longer shows.
- No id changes its place, no other entry is written, and the profile's name stays inside the
  caregiver region.

**Teaching a gesture** (card NG-19). Every row of "Auf der Tafel" that the board shows has
"Gebärde beibringen" next to "Text ändern" (also a custom or retired concept, and a concept whose
entry a newer app wrote: teaching does not write the entry). It opens a view that takes over the
body, like the rewording:

- the heading "Gebärde für „<label>“ beibringen – Tafel von „<name>“" (it gets the focus);
- **right under it, the controls, one block that stays in the same place for the whole session**
  (second build of the card: in the first, "Aufnahme starten" moved by up to 240 px between
  examples, and the live line fell below the window): the box of the camera's preview (card
  NG-42, below), the live line ("Eine Hand im Bild. Schultern zu sehen.", as in the camera test,
  [capture.md](capture.md)), the camera's line (preparing, asking, a problem, the countdown, or
  "Die Aufnahme läuft. Jetzt die Gebärde machen."), both with a fixed height, then one button
  and "Zurück". The button is "Kamera starten"; once the camera runs "Aufnahme starten"; during the
  countdown "Abbrechen"; while recording "Aufnahme beenden"; after a usable recording "Behalten"
  and "Verwerfen"; last, in a row of its own, the camera choice "Kamera: vorne / hinten" (card
  NG-43, below);
- below the controls, in this order, what changes in length: what the last action came to (a
  line of the view, not the status line, so that the block at the top does not grow and move the
  controls; refusals and failures in the colour of the warnings), the verdict on the recording,
  the size warning, the count, the notes on unusable examples, the instruction, and the list.
- **the size of the profile, before anything is recorded.** Opening the view calls `store.usage`
  once (it reads the whole profile; not on every redraw). Near the limit (90% of bytes or names):
  "Der Platz für dieses Profil ist fast voll. Es passen nur noch wenige Beispiele hinein. Lösche
  Beispiele, die nicht mehr gebraucht werden." At the limit (one more example does not fit):
  "Der Platz für dieses Profil ist voll. Neue Beispiele können erst gespeichert werden, wenn
  Beispiele gelöscht sind.", and there is no "Kamera starten". When `usage` fails, a line says
  that the room could not be checked;
- the count: "N Beispiele gespeichert." (or "Noch kein Beispiel gespeichert."), with ", davon M
  nicht verwendbar" when stored entries of the tile cannot be used, and "Empfohlen sind mindestens
  3." while fewer than 3 can be used. It counts every stored entry of the tile, as the row on the
  board does ("Gebärde: N Beispiele", from the data names alone). When the examples cannot be
  read, no count is shown, only "Die gespeicherten Beispiele können gerade nicht gelesen werden.";
  a line for examples a newer app wrote, and one for examples that cannot be used and have to be
  recorded again;
- the instruction: "Tippe auf „Kamera starten“. Tippe dann auf „Aufnahme starten“: Das Gerät
  zählt 3 Sekunden herunter, damit deine Hand aus dem Bild kommt. Dann die Gebärde einmal machen
  und auf „Aufnahme beenden“ tippen. Nach 8 Sekunden endet die Aufnahme von selbst. Am besten steht
  das Gerät fest, oder eine zweite Person hält es. Am besten mindestens 3 Beispiele aufnehmen, so
  wie das Kind später vor dem Gerät sitzt. Gespeichert werden nur Zahlen zu Bewegung und Handform,
  kein Bild und kein Video." (The stored features hold the shape of the hand's joints as well as
  where the hands are; the first build said "Bewegung der Hände" only.);
- "Gespeicherte Beispiele": one row per example, oldest first, "Beispiel 2: mit beiden Händen,
  23.11.2026, 10:30 Uhr", each with "Abspielen" and "Löschen", and "Alle Beispiele löschen" from
  two examples on (or when unusable ones are stored).

**How a recording fits** (card NG-4). Under the result line of a usable recording, one line says
how it relates to the examples the profile already has. `exampleFit` (`src/teach/fit.ts`) asks
the matcher what the child's board would take the recording for, with the profile's own examples
and the limits calibrated from them; no limit, weight or margin is changed, and nothing is
stored. "Behalten" and "Verwerfen" stay as they are: the line is advice.

- fits: "Die Aufnahme passt zu den bisherigen Beispielen für „<label>“."
- beyond the tile's limit: "Die Aufnahme ist deutlich anders als die bisherigen Beispiele für
  „<label>“. War es dieselbe Gebärde? Behalten geht trotzdem." (a warning)
- the tile's examples were made with other hands: "Die bisherigen Beispiele für „<label>“ wurden
  mit einer Hand (rechts) gemacht, diese Aufnahme mit beiden Händen. Sie werden getrennt erkannt;
  am besten die Gebärde immer gleich machen." (a warning)
- the shoulders were seen in the earlier examples and not now, or the other way round: a warning
  that such recordings are not compared with each other;
- another tile would take it, is about as close, or is closer than the tile's own examples while
  these accept it: "Achtung: Die Aufnahme ähnelt der Gebärde für
  „<other label>“. Wird sie behalten, können die beiden verwechselt werden." (a warning)
- the tile's first example, and nothing else takes it: no line.

The line is worked out once per recording from all of the profile's examples. When they cannot be
read, there is no line. One- and two-hand gestures are treated alike.

**Replaying an example** (card NG-4). "Abspielen" on a stored example shows it once as a moving
stick-figure hand on a canvas (240 × 180) under its row, in the colours and with the bones of the
camera preview, mirrored as the front camera shows it, with the shoulder line when the shoulders
were seen. Under it: "So vergleicht die App die Gebärde: nur Bewegung und Handform, aus den
gespeicherten Werten gezeichnet. Ein Video gibt es nicht." (Movement and hand shape, as in the
teaching intro.) It is drawn from the stored features
(`src/teach/replay.ts`): per step, the joints relative to the wrist and the wrist relative to the
shoulders. The size of the hand is not stored, so every hand is drawn at a third of a shoulder
width. One step is shown for the recorded length divided by its 32 steps (between 40 and 250 ms);
the last step stays and the button says "Abspielen" again. While it plays the button says
"Anhalten". It stops on "Anhalten", on
another "Abspielen", when the view closes, and when a recording starts; it is not offered while a
recording counts down, runs or waits for "Behalten". Where the canvas has no 2D context nothing is
drawn and nothing fails. Tested in Node with a recording fake canvas; not looked at in a browser,
on a device or with a screen reader (the canvas has `role="img"` and a German label).

**The camera only after the tap.** "Kamera starten" calls the capture module's `startCapture` (the
real tracker and camera, card NG-3) through its bridge (below); before that tap nothing is
requested. While it starts, a second tap does nothing. A problem (refused, no camera, tracker
download) is said with the capture module's own German sentence, and "Kamera starten" is the retry.

**The camera's picture** (card NG-42; owner: "Sure, it says hand detected, but without a camera
video it's really difficult to see whether you captured the picture you wanted"). The first thing
in the controls is a box of fixed aspect (4:3) whose size depends on the window only, never on the
state: empty and grey while the camera is off, the live picture while it runs. The picture is
mirrored like a mirror for the front camera (the back camera's is not, card NG-43), and the tracked hand points (the child's own left hand orange "L", right
hand cyan "R") and the shoulders (yellow) are drawn over it on every tracked frame, so the
caregiver sees whether the sign is in the picture ([capture.md](capture.md), "Live preview"). In
a window held upright the box is above the live line; in a wide one it is left of the lines and
the buttons. Its height is `clamp(6rem, 100dvh − 25rem, 22.5rem)` upright and
`clamp(6rem, 100dvh − 12rem, 22.5rem)` wide (at most half the width), so the block fits in the
window. Because the box is there in every state, "Kamera starten", "Aufnahme starten",
"Abbrechen", "Aufnahme beenden" and "Behalten" stay in one place. The bridge's `createPreview`
makes one preview per camera start; each redraw of the view moves it into the new box in the same
task as the swap (a video taken out of the page until a later task would be paused). Every way
that stops the camera (below) closes it: the video lets go of the stream, the box is emptied.
Measured in Chromium with the fake camera (DGS video), the main button's position in all five
states:

| Window | Box (CSS px) | Main button (x, y), every state | Off-screen |
| --- | --- | --- | --- |
| 360 × 640 | 298 × 224 above | 31, 504 | nothing |
| 640 × 360 | 224 × 168 left | 268, 243 | nothing |
| 320 × 480 | 128 × 96 above | 31, 376 | nothing |
| 820 × 1180 | 480 × 360 above | 31, 606 | nothing |

**Front or back camera** (card NG-43; owner: "We need to support the back camera also"; a parent
often holds the phone and films the child with the back camera). The last row of the controls is
"Kamera:" with two buttons, "vorne" and "hinten" (`caregiver-button`, at least 44 px high and
4.5rem wide; the pressed one has `aria-pressed="true"` and the primary colour). It is a row of its
own under "Kamera starten" … "Zurück", there in every state of the session (not when the profile
is full, where there is no camera), so nothing above it moves because of it. The choice is the
device's (`localStorage`, `amysecho-camera-facing`, the same key as the capture module's; see
[capture.md](capture.md), "Front or back camera"): what is chosen here is used by the camera test,
and what was chosen there is pressed here. The child's gesture view always uses the front camera,
whatever is chosen here ([recognise.md](recognise.md)). A tap:

- while the camera is off: remembers the choice; the next "Kamera starten" asks for that camera;
- while the camera starts or runs and nothing is recorded (the "Aufnahme starten" state, or after a
  refused recording): remembers it, stops the camera and starts the chosen one at once (the
  preview box stays, the new picture comes into it);
- during the countdown, the recording, while a usable recording waits for "Behalten", and while a
  keep or delete runs: nothing; both buttons have `aria-disabled="true"`.

The buttons are covered by the shield like every other (rule A); a tap redraws the view (a swap).
"Kamera starten" passes the choice to the bridge (`facing`). When the chosen camera is missing or
does not open, the other one is used and the camera's line says so until the countdown: "Hintere
Kamera nicht verfügbar. Es läuft die vordere." (or the other way round); the choice stays as it
was. The preview is mirrored for the front camera only. A storage that refuses to remember the
choice is caught; the area then holds it while the page is open. Measured in Chromium with the
fake camera (which has no back camera, so "hinten" falls back to it, with the line), every state
from "camera off" through "hinten", the fallback, countdown, recording and the result:

| Window | Main button (x, y), every state | Choice row (y) | Off-screen |
| --- | --- | --- | --- |
| 360 × 640 | 31, 504 | 557 | nothing |
| 640 × 360 | 268, 226 | 279 | nothing |
| 320 × 480 | 31, 376 | 429; 483 while "Aufnahme starten"/"Aufnahme beenden" and "Zurück" wrap to two rows | the choice row while those wrap (the region scrolls to it) |
| 820 × 1180 | 31, 606 | 660 | nothing |

(At 640 × 360 the main button is now at y 226 instead of 243: the preview spans four rows of the
right column instead of three. It is the same in every state.)

**Countdown, then recording.** The hand that taps "Aufnahme starten" is in the picture, and rest
is not trimmed from a gesture (recognition.md), so a phone held in one hand would often give
"hands unclear". So "Aufnahme starten" first counts `TEACH_COUNTDOWN_S` (3) seconds down, in the
camera's line: "Gleich geht’s los: 3", "… 3 … 2", "… 3 … 2 … 1", written in place (the line keeps
its height). Nothing is kept meanwhile. "Abbrechen" (in the button's place) ends it and records
nothing; so does every way out of the view (below), because the countdown's timer belongs to the
camera. Then the tracked frames are kept in memory (`startRecording`) until "Aufnahme beenden", or
`TEACH_MAX_RECORDING_MS` (8 s from the end of the countdown) by itself (`stopRecording`); the camera
keeps running. The frames go through `sequenceFromRecording` (tracker adapter, then the matcher's
`buildFeatureSequence`). Nothing is stored yet:

- usable: "Die Aufnahme kann verwendet werden: Gebärde mit einer Hand (rechts)." (or "(links)",
  or "mit beiden Händen"), when no shoulders were seen also "Die Schultern waren nicht zu sehen. Am
  besten so aufnehmen, dass die Schultern im Bild sind.", then "Behalten oder verwerfen?"; after the
  8 s it starts with "Die Aufnahme hat nach 8 Sekunden von selbst geendet.". A two-hand recording
  in which one hand stayed within the matcher's movement floor (`MIN_TRAVEL`, 0.1 shoulder widths,
  on palm centres averaged over 200 ms: `handTravel` in `examples.ts`) gets the line "Eine Hand
  lag still im Bild. Wenn die Gebärde mit einer Hand gemacht wird, lieber ohne die zweite Hand im
  Bild aufnehmen." It is a hint only: the example is stored as recorded, with both hands;
- not usable: "Diese Aufnahme kann nicht verwendet werden." with the reason and what to do, and
  "Es wurde nichts gespeichert.": no hand seen ("Es war keine Hand zu sehen. Bitte so sitzen, dass
  die Hände gut im Bild sind, …"), too short ("… Bitte erst „Aufnahme starten“ tippen, dann die
  Gebärde machen und danach „Aufnahme beenden“ tippen."), hands unclear ("Es war nicht klar, ob
  die Gebärde mit einer oder mit beiden Händen gemacht wird: Eine Hand war nur zeitweise im Bild.
  Bitte die Hände der Gebärde die ganze Zeit im Bild lassen, andere Hände aus dem Bild nehmen …"),
  a hand lost, no frames, a faulty recording. "Aufnahme starten" is then the next try.

"Behalten" is one queued write (`saveExample`, one data name per example) and says, under the
controls, "Das Beispiel wurde gespeichert. Für diese Taste sind jetzt 3 Beispiele gespeichert.";
the focus goes to "Aufnahme starten" for the next one. "Verwerfen" forgets the recording ("Die
Aufnahme wurde verworfen. Es wurde nichts gespeichert."). A refusal for size (`ProfileSizeError`)
says "Das Profil ist voll. Das Beispiel wurde nicht gespeichert. Bitte nicht mehr gebrauchte
Beispiele löschen." as an error; the recording is dropped, the camera stops, the view is treated
as full, and nothing is tried again. A write that failed otherwise keeps the recording and says
so; a second tap on "Behalten" is the caregiver's retry.

**Deleting examples** follows rules 12 and 17: "Löschen" (one example) or "Alle Beispiele löschen"
stops the camera and replaces the body by a confirmation ("Beispiel 2 von „Trinken“ auf der Tafel
von „Mia“ löschen?" or "Alle 3 Beispiele von „Trinken“ auf der Tafel von „Mia“ löschen?", "Das
kann nicht rückgängig gemacht werden. Die Gebärde kann danach neu aufgenommen werden.",
"Abbrechen" first and focused, "Endgültig löschen" held for 2 s and carried out on the release,
with the same bar and line as for a profile). "Abbrechen" and Escape go back to the view, to the
button that opened it. After a delete the size is read again, the view is back, and the line
under the controls says "Beispiel 2 wurde gelöscht." A delete that fails says what the store
holds afterwards, read again: "… Beispiel 2 ist noch gespeichert." for one; for all, which are
deleted one write each, "Das Löschen wurde unterbrochen: 1 Beispiel wurde gelöscht, 2 sind noch
gespeichert. Bitte noch einmal versuchen."; when that cannot be read either, that it cannot. Deleting
is not offered while a countdown or a recording runs or a recording waits for "Behalten". An
example a newer app wrote is never deleted.

**Leaving stops the camera**, at whatever step it is (tracker loading, permission asked, running,
recording), through the capture's cancel signal and `stop`: "Zurück" (focus back on that row's
"Gebärde beibringen"), Escape, "Fertig", the area closing by itself (hidden page, idle time),
"Rückgängig" in the block at the top, and any redraw that does not show this view's controls:
another view, its own delete confirmation, the tile taken off the board in another tab, and a
redraw that cannot read the store (the body is then the notice that the profiles cannot be read;
in the first build the camera ran on under that notice, with no way to stop it on screen). A
countdown or a recording that was not kept is dropped then.

**The bridge.** `src/caregiver.ts` is part of the board's module graph and does not import
`capture/capture.js`: `index.html` loads that module on its own, so that a failure in it can never
stop the board. When the page loads it, it leaves `{ start, text, nextShoulders, createPreview }` under the global
name `amysEchoCapture` (`start` takes the camera, `facing`, card NG-43, and fills in the device's
choice when it is not given; `text.cameraFallback` holds the fallback lines) (`CAPTURE_BRIDGE_KEY` in both modules; a test compares them), and the area
looks for it at the tap. Without it the view says "Die Kamera kann hier gerade nicht gestartet
werden. Bitte die App neu öffnen. Die Tafel funktioniert auch ohne Kamera." The hidden video
element goes into the caregiver region, which is emptied on closing; the preview's video is in
the view's box. A bridge without `createPreview` teaches without a picture.

**Press rules in the view.** Every button of the view is covered by the shield (rule A): a tap
that lands on "Abbrechen", "Aufnahme beenden" or "Behalten" as it appears does nothing. The live
line is written in place on every camera frame and does **not** count as a swap (it would keep
every button dead while the camera runs); it keeps its height (`min-height`, two lines), so the
buttons under it do not move. The countdown is written in place in a line of fixed height as
well. The camera's step line counts as a swap.

Rules for later slices: wording is written only through `setWording` and `clearWording`, as one
queued write, with text that went through `cleanWordingText` and `checkedWording`; no English
message of board data reaches the screen; an entry of a newer app is never overwritten or reset;
a view that takes over the body returns to the control that opened it.

**A large board.** When the board has more than `BOARD_COMFORT_MAX` (12) concepts that can be
shown, a line says "Mehr als 12 Begriffe: Auf einem Handy werden die Felder klein und die Tafel
muss gescrollt werden." (docs/board.md, tile sizes). Ids that cannot be shown do not count.
Nothing is refused.

**Locked rows.** Ids on the board that this screen does not move or take off are shown at their
real place in "Auf der Tafel":

- a custom concept under a catalogue id (shown with its label and sentence), and a retired
  concept (stored label and sentence, and "Dieser Begriff ist nicht mehr in der Auswahl."):
  "Dieser Begriff kann hier nicht verschoben oder entfernt werden.", and the buttons "Text
  ändern" and "Gebärde beibringen". An own concept under an id the catalogue does not use is not
  locked (see "Own concepts");
- an id `resolveBoard` leaves off the board (no entry, an unreadable entry, or an id board data
  cannot address, shown as "Begriff „<id>“"): no button, and "Dieser Begriff kann in dieser
  Version nicht bearbeitet werden."; for an entry written by a newer app version instead "Diese
  Taste wurde mit einer neueren Version gespeichert. Bitte die App aktualisieren."

Such an id is not dropped and not moved by this screen: add and move leave it at its index, and a
removal or an undo of another concept shifts it only as far as that one id takes or gives room.

**Own concepts** (card NG-34). A concept that only this profile has: a word and a sentence a
caregiver typed. On the board it is a full row like a catalogue concept: "nach oben", "nach
unten", "Text ändern", "Gebärde beibringen" and "Entfernen", with undo. It is shown without a
picture (pictures are card NG-8673323346005092805). An own concept under an id the catalogue also
uses stays locked: taken off, the catalogue would offer the id again, and adding it would bring
back the own concept.

- **"Eigenen Begriff anlegen"** is under "Auf der Tafel". It opens fields that take over the body,
  as a rewording does: the heading "Eigener Begriff für die Tafel von „<name>“", "Wort auf der
  Taste", "Gesprochener Satz", the line "Der Begriff kommt ans Ende der Tafel. Danach kann ihm eine
  Gebärde beigebracht werden.", "Speichern" and "Abbrechen". The fields start empty; the focus is
  on the word. Input is cleaned and checked exactly as in a rewording, with the same German
  refusals; a refusal keeps what was typed and focuses the field concerned. "Abbrechen" and
  Escape write nothing and return to the button.
- **Saving** generates the id: `eigen-` and eight random hexadecimal digits, never derived from the
  label, and not one the profile or the catalogue already uses. A board that already holds
  `MAX_CONCEPT_IDS` (500) ids, counting ids that cannot be shown, is refused before anything is
  written. Then two queued writes: `putCustomConcept`, then `setBoardConcepts` with the id at the
  end. Afterwards the status line says "Gespeichert: „<label>“ ist jetzt auf der Tafel." and the
  focus is on the new row.
- **When the second write fails**, the concept exists but is not on the board. The status line
  says so as an error: "„<label>“ wurde angelegt, aber nicht auf die Tafel gesetzt. Der Begriff
  steht unten unter „Eigene Begriffe, nicht auf der Tafel“ und kann von dort hinzugefügt
  werden.", and the focus is on its "Hinzufügen".
- **"Eigene Begriffe, nicht auf der Tafel"**, below "Weitere Begriffe" and only when there is one:
  every readable own concept of the profile that is not on the board, sorted by id, with the line
  "Eigene Begriffe gibt es nur in diesem Profil. Von der Tafel genommen, bleiben sie hier, bis sie
  endgültig gelöscht werden." Each row has "Hinzufügen" (to the end of the board) and "Endgültig
  löschen". An entry this version cannot read, and one a newer app wrote, is never listed here
  and so never offered for deletion (`listCustomConcepts` reports both with their damage kind;
  repairing them is card NG-35).
- **"Endgültig löschen"** opens a confirmation that takes over the body: "„<label>“ aus dem Profil
  „<name>“ endgültig löschen?", "Das Wort, der Satz und die beigebrachten Gebärden dieses Begriffs
  werden gelöscht. Das kann nicht rückgängig gemacht werden.", "Abbrechen" (focused) and
  "Endgültig löschen", which has to be held for `DELETE_HOLD_MS` and is carried out on the release,
  as for a profile (rules 12 and 20). The delete first removes the concept's gesture examples
  (`deleteExamples`, all but those a newer app wrote), then the concept (`removeCustomConcept`).
  If a write fails the concept is still listed and a second try finishes the job. The status line
  says "„<label>“ wurde endgültig gelöscht."; the focus goes to the heading of the list.
  Deleting is offered only for a concept that is off the board, so that a tap on the board list
  never starts it.

**Own pictures** (card NG-8673323346005092805). Every row of "Auf der Tafel" that the board shows
(catalogue, own and retired concepts) has "Bild wählen" after "Text ändern". It opens a view that
takes over the body:

- the heading "Bild für „<label>“ – Tafel von „<name>“"; "Jetzt auf der Taste:" with the picture
  the key has now, or "Jetzt auf der Taste: kein Bild, nur das Wort.";
- "Das Bild wird nur in diesem Browser auf diesem Gerät gespeichert, in diesem Profil. Die App
  sendet es nicht." and "Bitte nur Bilder verwenden, die ihr verwenden dürft, zum Beispiel
  METACOM-Symbole aus eurer eigenen Lizenz oder eigene Zeichnungen und Fotos. Fotos, auf denen ein
  Kind zu erkennen ist, besser nicht verwenden." ([assets.md](assets.md));
- "Bilddatei auswählen", a file field (PNG, JPEG, WebP, GIF, SVG; focused on opening) with the line
  "PNG, JPEG, WebP, GIF oder SVG. Das Bild wird auf höchstens 256 × 256 Pixel verkleinert.";
- after a file was chosen: "Neues Bild:" with the redrawn picture, "Speichern" and "Abbrechen";
- with an own picture stored: "Bild der App wiederherstellen" for a catalogue concept, "Bild
  entfernen" for an own or retired one. One tap: the picture can be chosen again.

Choosing a file stores nothing; it drops a picture chosen before, so while the file is read and
after a refusal there is nothing to save. `pictureFromFile` refuses a type that is not offered and
a file over 10 MB, reads the file as a data URL, loads it into an image, refuses a picture of more
than `MAX_PICTURE_PIXELS` (40 megapixels: "Das Bild ist zu groß (mehr als 40 Megapixel). …")
before drawing it, and draws it onto a canvas of at most 256 pixels a side; it keeps the canvas as PNG, or as JPEG on white when the PNG is longer
than 256 KiB. So what is stored is never the file: no SVG markup or script, no camera, place or
date. Refusals are German error lines and the view stays: "Diese Datei ist kein Bild, das die App
lesen kann. …", "Die Datei ist zu groß. …", "Das Bild konnte nicht gelesen werden. …", "Das Bild
ist auch verkleinert noch zu groß. …". "Speichern" is one queued write through `setSymbol`; the
status line says "Gespeichert: neues Bild für „<label>“." and the focus returns to the row's
"Bild wählen". A full profile ("Der Platz für dieses Profil ist voll. Das Bild wurde nicht
gespeichert. …") and a failed write keep the view with the chosen picture. A picture a newer app
wrote is not replaced: its row has no "Bild wählen" and says "Das Bild dieser Taste wurde mit einer
neueren Version gespeichert. Bitte die App aktualisieren." Deleting an own concept for good also
deletes its picture.

The page's Content Security Policy allows `data:` images (`img-src 'self' data:`) for these
pictures and nothing else new. Every place that shows a picture (the board's tiles, the rows here,
the previews) puts into `src` only what `isPictureSource` (`src/board.ts`) accepts: a stored
picture or a bundled `./icons/*.svg`; anything else is shown as text. `test/browser/pictures.test.mjs`
runs `pictureFromFile` in Chromium in CI, with synthetic images: an SVG with `onload` and a
`<script>` becomes a PNG without running either, a 1200 × 900 picture comes out at 256 × 192, a
42-megapixel SVG, a text file and a broken PNG are refused, and the result loads under the page's
policy. A backup round trip with pictures is tested in `test/profiles-backup.test.mjs`. Earlier, in
headless Chromium (script run by hand) an SVG with an
`onload` attribute and a `<script>` came out as a plain PNG without running either, a 1200 × 900
synthetic image came out at 256 × 192, a text file and a broken PNG were refused, and the full
flow (create an own concept, choose a picture, save, close) showed the picture on the child's
board at 390 px width with no console error. Not tried on a phone, with a real METACOM export,
or with a screen reader.

**Help.** At the bottom, behind "Hilfe bei Problemen" (a `<details>`): "Tafel neu laden" with one
sentence that says what it does, and a text for a device that does not speak: "Spricht das Gerät
nicht? Dann ist es vielleicht stumm geschaltet, oder es fehlt eine deutsche Stimme. Sie wird in
den Einstellungen des Geräts bei „Sprachausgabe“ oder „Text-in-Sprache“ installiert." The text is
static; the area does not look at the voices. A failing speech engine is a third cause it does
not name (docs/board.md).

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
a red outline; "Entfernen" and "Rückgängig" in their guard time are grey like a disabled button.
The block at the top has safe-area padding. Names, labels and sentences wrap.

**Accessibility as built.** `#caregiver-region` is a labelled region with an `h1`; sections have
`h2` and the two lists `h3`; controls are buttons and labelled text fields; messages go to a
`role="status"` live region; focus is placed after every action (above), and the title, which
gets the focus on opening, shows a focus outline. The header line is not a live region. A button
in its guard time says so through `aria-disabled`, and through the status line once a press was
ignored. The line under "Endgültig löschen" is its description and a live region for the
countdown. None of this was checked with assistive technology.

**Backup** (card NG-58, owner decisions of 2026-11-25: "Alles mit ins Backup, sodass man das Gerät
wechseln kann" and "Ja mit Passwort"). Every profile card has "Sicherung speichern" (`aria-label`
"Sicherung speichern: <name>"). It opens a view that takes over the body: "Sicherung von „<name>“",
what the file holds (name, concepts, own texts and pictures, taught gestures, the caregivers'
demo clips), the warning that the file is encrypted but should still be kept private and that a
forgotten password cannot be recovered, then "Passwort (mindestens 8 Zeichen)" and "Passwort
wiederholen" (password fields, `autocomplete="new-password"`, focus on the first), "Sicherung
speichern" and "Abbrechen". A short password or two different ones are said and nothing is made.
Saving exports the profile (`exportProfile`), encrypts it (`encryptBackup`, `src/profiles/backup-file.ts`:
AES-GCM under a PBKDF2-SHA-256 key of 600 000 rounds, random salt and IV) and hands the file over as
a download named `amys-echo-sicherung-<YYYY-MM-DD>.amysecho`: the day only, never the child's name.
The status line says "Die Sicherung ist gespeichert: <file>. Bitte die Datei und das Passwort gut
aufheben." The password lives only in the page's field: it is never stored.

Below the profile list, also on a device without any profile, is "Sicherung einspielen": a file
field ("Sicherungsdatei", `.amysecho`), "Passwort der Sicherung", "Einspielen" and "Abbrechen". The
file is read (at most `MAX_BACKUP_FILE_BYTES`, 128 MiB), decrypted and checked like any export
(`parseProfileExport`) before anything is written. Refusals, each a German error line with nothing
written: no file chosen, no password, "Das Passwort passt nicht zu dieser Datei, oder die Datei
wurde verändert. …" (AES-GCM refuses a wrong key and a changed byte alike), "Diese Datei ist keine
Sicherung dieser App, oder sie stammt aus einer neueren Version. …", too large for this device. A
profile with the same id already on the device asks first: "Die Tafel „<name>“ gibt es auf diesem
Gerät schon.", "Als Kopie einspielen" (both kept, the copy under a new id) or "Ersetzen" (the
device's state is overwritten with the backup's), or "Abbrechen". A restored profile becomes the
active board when none is active, which is the case on a new device: "Eingespielt: Tafel von
„<name>“. Sie ist jetzt die aktive Tafel."

Looked at in headless Chromium at 390 x 844 with a probe that is not part of the repository: save
(the download is the encrypted file), the site data cleared, restore, the board active again; no
console error. `test/browser/backup.test.mjs` encrypts at the full 600 000 rounds in Chromium (about
0.1 s on the CI machine), downloads and restores. Not tried: a phone (how long the rounds take, where
the download lands, how the file is shared to the new device), a caregiver.

**Vormachen: a caregiver's own clip** (card NG-56, owner decisions of 2026-11-25; product rule in
[s0a-product-contract-v0.1.md](s0a-product-contract-v0.1.md), section 6). Every row that offers
"Gebärde beibringen" also offers "Vormachen" (`aria-label` "Vormachen: <label>"). It opens a view
that takes over the body:

- the heading "Vormachen für „<label>“ – Tafel von „<name>“", what the clip is for (the child sees it
  in the gesture view under „Vormachen“ and can imitate it; at most `DEMO_MAX_MS`, 5 seconds), the
  warning line "Bitte nur Erwachsene aufnehmen, nie das Kind." and where the clip is kept: without
  sound, only in this browser on this device, in this profile, deleted with the profile, never sent.
  The clip is part of the profile's export (`src/profiles/backup.ts`), so a backup takes it along
  (owner decision); the caregiver area has no backup screen yet (card NG-58), so the view does not
  promise one;
- the stored clip ("Jetzt gespeichert:", a muted looping video with the browser's controls), or "Für
  diesen Begriff gibt es noch keinen Clip.", or a line for a clip a newer version stored or one that
  cannot be read;
- "Kamera starten" (focused on opening). No camera is asked for before that tap. It is always the
  front camera, the one facing the caregiver who holds the device (card NG-59), whatever the device's
  camera choice for teaching and the gesture view is ("hinten" would point at the child); its live
  picture is shown like a mirror, while the clip is recorded as the camera sees it;
- "Aufnahme starten", a countdown of `TEACH_COUNTDOWN_S` seconds written in place ("Abbrechen" ends
  it, nothing is recorded), then "Die Aufnahme läuft. Jetzt die Gebärde vormachen." and "Aufnahme
  beenden"; the recording ends by itself after `DEMO_MAX_MS`. The camera stops when the recording
  ends;
- "Neuer Clip:" with the new clip, "Speichern" and "Verwerfen". Nothing is stored before
  "Speichern"; it is one queued write through `setDemoClip`, the status line says "Gespeichert:
  Vormachen für „<label>“." and the focus returns to the row's "Vormachen";
- with a clip stored: "Clip löschen", one tap; the clip can be recorded again.
- a stored clip this browser cannot play (one recorded on another device, card NG-59) is replaced
  by the status line "Dieser Clip kann in diesem Browser nicht abgespielt werden. Er kann gelöscht
  oder neu aufgenommen werden." (a focus on the player moves to it); a new clip that cannot play is
  dropped, not offered for saving: "Dieser Clip kann in diesem Browser nicht abgespielt werden und
  wurde verworfen. Bitte noch einmal aufnehmen." (card NG-60);
- `facingMode: "user"` is only asked for: a camera that reports it faces away (a device without a
  front camera) is closed and refused with "Hier läuft nur eine Kamera, die vom Gerät weg zeigt.
  Vormachen wird mit der vorderen Kamera aufgenommen, damit nie das Kind im Bild ist."; one that
  reports no facing (a desktop webcam) is used (card NG-60);
- a recorder that does not hand over its recording within `DEMO_STOP_WAIT_MS` (5 s) after "Aufnahme
  beenden" is given up with "Die Aufnahme konnte nicht gelesen werden. …"; a failed save or delete
  leaves the buttons usable, so it can be tried again (card NG-60);
- while a recording is read after "Aufnahme beenden" the line says "Der Clip wird gelesen …" and
  nothing new can be recorded; a camera that ends by itself (permission taken back, device
  unplugged) stops the view's camera, drops a running recording and says "Die Kamera ist
  ausgegangen. Bitte noch einmal auf „Kamera starten“ tippen."; with a clip a newer version stored,
  the view says so and offers only "Clip löschen", no recording that could not be saved.

The recorder is `openDemoCamera` (`src/demo-clips.ts`): `getUserMedia` without audio and a
`MediaRecorder` (WebM VP9, VP8 or MP4, whichever the browser has first, at 600 kbit/s). `clipFromBlob`
reads the recording as a data URL and refuses one over `MAX_DEMO_DATA_URL_LENGTH` (2 MiB of text) or
one that is not a video data URL. Refusals are German error lines and the view stays: the camera's
("Die Kamera ist nicht erlaubt. …", "Es wurde keine Kamera gefunden.", "Die Kamera kann gerade nicht
starten. …", "Dieser Browser kann hier keine Clips aufnehmen. …"), "Der Clip ist zu groß geworden.
Bitte kürzer aufnehmen." and "Die Aufnahme konnte nicht gelesen werden. Bitte noch einmal
aufnehmen.". A full profile says "Der Platz für dieses Profil ist voll. Der Clip wurde nicht
gespeichert. …". Leaving the view, opening another one, closing the area (also by the idle time or a
hidden page) stops the camera like teaching's; a camera that answers after the view was left is
closed at once, and a recording read after that is dropped. Deleting an own concept for good
deletes its clip too ("Das Wort, der Satz, die beigebrachten Gebärden und der Vormachen-Clip dieses
Begriffs werden gelöscht. …").

Looked at once in headless Chromium (Playwright, Chromium's synthetic camera pattern, no person) at
390 x 844 with a probe that is not part of the repository: open, camera, countdown, a recording
that stopped by itself, "Speichern". The stored clip was WebM VP9 of about 250 000 characters for
five seconds (so a profile's 64 MB holds well over a hundred), no video element was left after
saving, no console error. Not tried: a real camera, a phone, Safari (MP4), a caregiver.

## Deliberately missing

- Cropping or rotating a picture, choosing from a symbol library inside the app, or taking a
  photo with the camera from this view; the device's file picker may offer the camera itself.
- Deleting an own concept straight from the board list: it is taken off first.
- Hearing a wording before it is saved ("listen"); the caregiver hears it on the child's board.
- Export, import and backup (NG-22). Deleting a profile is final.
- Recognising a gesture on the child's board (NG-20); choosing a profile-wide anchor (each example
  keeps the anchor it was recorded with, recognition.md); trying out a taught gesture in the view.
- Deleting or repairing damaged profiles and unreadable concept entries.
- Undo for anything but removals of concepts during the visit; an add or a move is taken back by
  hand, and a deleted profile cannot be brought back.
- Moving a concept by more than one place at a time, or by dragging.
- Moving or taking off retired concepts, and own concepts under a catalogue id.
- A warning before the profile's storage is full (`store.usage`), except when a teaching view opens.
- Any protection beyond the hold gesture and, for deleting a profile, typing its name.

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
- The block at the top takes room, most in a phone held sideways. The status line is held to
  three lines; the header line is not, and a name of 40 characters makes it three lines on a
  narrow phone. A long message is cut after three lines on screen.
- **A child who got into the area can delete a profile**: the way in is a hold, and deleting is
  a tap on "Löschen" and a second hold. There is no backup. A stronger safeguard, such as typing
  the profile's name, is an owner decision for card NG-13.
- The guard time, the hold time and the grace time of the press shield are guesses and were tried
  with emulated taps only. Whether a real touch screen sends a click after a long press, and what
  its pointer events look like when a finger slides, is untested.
- The press shield swallows a deliberate press that comes sooner than 0.3 s after a redraw, and
  says nothing: a fast second tap has to be repeated. A deliberate second removal, or a second
  undo, within the guard time is ignored and starts that time again: the caregiver has to wait
  until the buttons are no longer grey.
- A tap on the spot of "Löschen" lands on the confirmation's text or on "Abbrechen" next, so
  tapping there can open and close the confirmation.
- A caregiver who cannot hold a button for two seconds, or whose assistive technology only
  clicks, cannot delete a profile. Clearing the site data of the browser removes all of them.
- While removals are stacked, the undo row makes the block at the top one row taller.
- Scrolling by keyboard or by dragging a scroll bar does not clear the status line.
- Not tried on a touch screen with a finger, and not with a caregiver.
- A confirmed delete that still waits behind a slow write is dropped without a message when the
  area closes first ("Fertig", a hidden page, the idle close); the profile stays.
- How the shield tells a pointer click from a key click or one from assistive technology was
  checked in Chromium only.
- Enter and Space share one key-press slot in the shield.
- Enlarged text was looked at for the delete confirmation only, up to 130 %. With text at about
  200 % the block at the top can take the whole screen, and the line under the opening control
  can make its row grow while holding; both untested.
- After "Bitte kurz warten." ends, the line changes, and presses are ignored for the grace time
  of the shield without a word.
- At 320 to 390 px width the three buttons of a board row do not fit one line; "Entfernen" wraps
  under the two move buttons.
- The catalogue has a concept labelled "Fertig", and the button that closes is "Fertig" too. The
  two look different and sit in different places; whether that confuses is for a caregiver trial.
- Escape twice still closes the area with text in the create field, and the text is lost then;
  so it is when the area closes by itself.
- Two profiles of one name can still come into being through two tabs, and exist in older data;
  the area tells them apart by a suffix only.
- A rewording that is half typed is dropped when the area closes by itself or the page is hidden.
- A long sentence makes the sentence bar on the child's board tall and moves the tiles when it is
  tapped; the fields give no hint and no counter (a follow-up for the board).
- A save can write an own wording for a concept that another tab has taken off the board
  meanwhile.
- "Text der App wiederherstellen" is also offered for a copy of an earlier text of the app, when
  the catalogue has changed since.
- How the fields behave with a real on-screen keyboard is untested (card NG-14).
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

- Teaching (card NG-19) was tested in Node with the real `startCapture` on a fake camera and
  tracker. Not tried: a real camera in this view on a phone, a child, the front camera's left and
  right (capture.md), how a caregiver holds the device and taps at the same time, and whether 8 s
  and "at least 3 examples" are right.
- A recording that was not kept is lost when the area closes by itself (two minutes without a
  press: holding still for a recording does not count as activity, but each tap does).
- The tracker download (about 25 MB) happens on the first "Kamera starten", in the view; offline
  without it the camera cannot start (capture.md).
- Examples of a concept that is not on the board are kept and counted against the limits, but
  shown nowhere; putting the concept back shows them again.
- The examples of a tile are not compared with each other: a mislabelled or very different
  example is not pointed out (the matcher's limits, recognition.md, decide what it costs).
- The live line follows each frame; on a slow phone it may lag. The frame rate is not shown. With
  enlarged text it can wrap to a third line and then moves the buttons under it.
- The countdown is a fixed 3 seconds; whether a parent's hand is out of the picture by then, and
  whether a child waits for it, is untried.
- The still-hand hint uses the matcher's movement floor on made-up data; a real tracker's jitter
  may give it for a hand that moved a little, or not give it.
- **Open for this card:** `recognition/examples.js` (imported by the area) has to be in the board's
  pre-cache in `public/sw.js`, which was outside the card's scope. Without it `main.js`, which
  imports the area, cannot load offline, so the installed app shows no board offline; and
  `test/bootstrap.test.mjs` fails ("missing precache member"). The fix is that one entry.

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
   it writes. Every action goes through the one queue (`run` / `runWrite`), also rename, delete
   and undo. What is open (a rename field, a confirmation) and the guards change at the press;
   only reading, writing and drawing wait in the queue.
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
10. Do not re-sort a list by a state the caregiver has just changed under the finger. Where an
    action lets another row or button take the place of the pressed one, a second press on that
    spot must not take anything away: guard it (`tapGuard`) from the press on, count the time
    from the redraw, let an ignored press start it again and say "Bitte kurz warten."; or put
    something harmless there.
11. After an action that was saved, put the focus on a control that still exists, chosen so that
    a second press does the natural next thing, and not on a button that deletes for good. After
    one that was not saved, leave it on the control that was pressed.
12. Deleting stays two steps with "Abbrechen" first and focused, names what is lost, and makes no
    other profile active by itself. What cannot be taken back is not reachable by tapping: it
    takes over the body, needs a hold and a release on the button (`heldButton` with `onReady`),
    and is carried out only if its confirmation is still the open one, at the release and again
    when the queued task starts. A time guard is for what can be put right.
13. An undo is built from the stored list at the moment it is pressed, not from a remembered
    list, and goes through `setBoardConcepts`. Whatever is taken off a board through this area
    goes onto the undo stack, and the status line names it.
14. The header line and the lines about the active board must come from the store in the same
    reading as the rest of the body; a new reason for examples needs its own wording there.
15. The opening control, "Fertig" and the block at the top keep their place: nothing new goes
    above the header, and the way out is not moved back below the content.
16. Whatever gets the focus is brought out from under the block at the top (`reveal`), and a new
    message for the status line has to make sense in three lines.
17. A board is named by its profile's name, in the header, the editor and the confirmation: keep
    names unique in the area, and use the label with the suffix wherever a name is shown.
18. Escape leaves the innermost thing and does not throw away typed text at the first press, with
    one exception: in a rename field and in the fields of a rewording it cancels, and what was
    typed there is dropped (what is stored is unchanged, and "Abbrechen" does the same).
19. A message for the status line has a kind. A refusal or failure is an error and stays through
    scrolling; do not report one as plain information.
20. A press must be aimed at what is on screen ("A press must be aimed…", rules A to D). A new
    button inside the region is covered by the shield as it is; a new form checks `aimed` in its
    submit handler; a new held button is made with `heldButton` and registered with the body it
    is drawn in. Whatever puts content on screen or moves it calls `markSwap`. Do not act on a
    pointer-down, a key-down or a timer alone outside these helpers.
21. A press does not change the layout by itself. What it retires (the status message) keeps its
    place until the redraw.
22. The camera starts only on a tap in the caregiver region and only through the capture module's
    bridge; this module never imports `capture/capture.js`. Every way out of a view that started
    the camera stops it (`stopTeachCamera`), and so does any redraw that shows another view.
23. Gesture examples are written and deleted only through `src/recognition/examples.ts`, one data
    name per example, one queued write per action. `store.usage` is read when a teaching view
    opens (and after a delete), not on a redraw; a refused write is reported, never retried by
    the app. Nothing of a picture is stored.
24. Something written in place many times a second (the live line) or once a second (the
    countdown) does not call `markSwap` and keeps its height, so nothing that can be pressed moves.
    The controls of a view used again and again (teaching) stay in one block under its heading;
    what changes in length goes below them, and its messages go into the view, not the status line.
25. The camera choice is the device's, not the profile's: read and written only under
    `CAMERA_FACING_KEY`, each access in `try`/`catch`, never put into a profile, a backup or a
    request. It does not change while a countdown or recording runs or a recording waits.
