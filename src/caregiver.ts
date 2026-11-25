/**
 * The caregiver area (cards NG-29 and NG-31): a deliberate way in from the
 * child's screen, and inside it a header that says which board the child
 * sees after closing, the profiles as cards (make active, edit, rename,
 * delete), creating a profile, and a board editor of two lists, with own
 * concepts of a profile (card NG-34), own pictures for concepts (card
 * NG-8673323346005092805) and a caregiver's own clip of a gesture for the
 * child to imitate ("Vormachen", card NG-56).
 *
 * This module writes into the caregiver region and into the entry element
 * that holds the opening control. Of the board region it only reads
 * `data-startup` and sets `hidden`; the board itself is re-mounted through
 * `app.refreshBoard()`. The child's display name is rendered inside the
 * caregiver region only, and the region is emptied when the area closes.
 *
 * Nothing here is security. The hold gesture is a hurdle for a small child.
 * See docs/caregiver.md.
 */
import type { App } from "./app.js";
import { isPictureSource } from "./board.js";
import {
  BoardDataError, MAX_LABEL_LENGTH, MAX_SPEECH_LENGTH, MAX_SYMBOL_DATA_URL_LENGTH, clearSymbol, clearWording, isSymbolDataUrl, listCustomConcepts, normalizeWording,
  putCustomConcept, removeCustomConcept, resolveBoard, setBoardConcepts, setSymbol, setWording,
} from "./board-data.js";
import type { BoardEntry, CatalogueConcept, CustomConcept, ResolvedBoard } from "./board-data.js";
import { MAX_CONCEPT_IDS, MAX_DISPLAY_NAME_LENGTH, ProfileFormatError } from "./profiles/profile.js";
import type { ProfileV1 } from "./profiles/profile.js";
import { ProfileConflictError, ProfileSizeError, UnknownProfileError } from "./profiles/store.js";
import type { ProfileStore } from "./profiles/store.js";
import { STARTUP_WAIT_MS } from "./startup.js";
import type { CameraFacing, CaptureBridge, CapturePreview, CaptureSession, FacingStorage } from "./capture/capture.js";
import { frameSummary } from "./recognition/tracker-adapter.js";
import {
  ExampleFormatError, RECOMMENDED_EXAMPLES, countExamples, deleteExample, deleteExamples, isExampleConceptId, listExamples, saveExample,
  sequenceFromRecording, usageLevel,
} from "./recognition/examples.js";
import type { ExampleListing, UsageLevel } from "./recognition/examples.js";
import type { FeatureFailure, FeatureSequence, HandKind } from "./recognition/features.js";
import { exampleFit } from "./teach/fit.js";
import type { ExampleFit } from "./teach/fit.js";
import { REPLAY_COLOURS, REPLAY_CONNECTIONS, replayBox, replayStepMs, replaySteps } from "./teach/replay.js";
import type { ReplayStep } from "./teach/replay.js";
import { DEMO_MAX_MS, DemoClipError, DemoRecordingRefusal, clipFromBlob, isDemoDataUrl, openDemoCamera, readDemoClip, removeDemoClip, setDemoClip } from "./demo-clips.js";
import type { DemoCamera, StoredDemoClip } from "./demo-clips.js";
import { ExportSizeError, exportProfile, importProfile } from "./profiles/backup.js";
import type { ProfileExportV1 } from "./profiles/backup.js";
import { BackupFileError, MIN_BACKUP_PASSWORD_LENGTH, backupFileName, decryptBackup, encryptBackup, isBackupPassword } from "./profiles/backup-file.js";

/** A recording of a gesture example stops by itself after this long (card NG-19). */
export const TEACH_MAX_RECORDING_MS = 8000;
/** Seconds counted down after "Aufnahme starten" before frames are kept, so that the hand that tapped can leave the picture. */
export const TEACH_COUNTDOWN_S = 3;
/**
 * The global name under which `capture/capture.js` leaves its bridge
 * (`CAPTURE_BRIDGE_KEY` there; a test compares the two). This module does not
 * import the capture module: a failure in it must never stop the board.
 */
export const CAPTURE_BRIDGE_KEY = "amysEchoCapture";
/**
 * Where the camera choice "Kamera: vorne / hinten" is remembered on this
 * device (card NG-43; `CAMERA_FACING_KEY` in the capture module, which reads
 * it for the camera test and the child's gesture view; a test compares them).
 */
export const CAMERA_FACING_KEY = "amysecho-camera-facing";

/** How long the opening control has to be held. A guess; not tried with a child (card NG-14). */
export const HOLD_DURATION_MS = 3000;
/** How often the countdown is redrawn while holding. */
export const HOLD_TICK_MS = 100;

/**
 * How long closing, and "Tafel neu laden", wait for the board to be refreshed
 * before they stop waiting: the bound of a refresh plus a margin. A refresh
 * waits behind start-up, which may never answer, so they need a bound of
 * their own.
 */
export const CLOSE_WAIT_MS = STARTUP_WAIT_MS + 1000;
/** How long the area waits for `app.store()` before it treats storage as unreachable. */
export const STORE_WAIT_MS = STARTUP_WAIT_MS + 1000;
/** The area closes by itself after this long without a pointer or key event inside it. A guess. */
export const IDLE_CLOSE_MS = 2 * 60 * 1000;

/** A board with more showable tiles than this gets a line that says the tiles become small on a phone. */
export const BOARD_COMFORT_MAX = 12;

/**
 * How long "Entfernen" and "Rückgängig" ignore presses after the list was
 * redrawn by one of them: another row, or the next undo, is then where the
 * finger was, and the second tap of a double tap lands there. A press that
 * is ignored starts the time again. A guess.
 */
export const GUARD_MS = 800;
/**
 * How long "Endgültig löschen" has to be held. Deleting cannot be taken back,
 * so no number of taps may do it: a tap cannot be told from a child's.
 */
export const DELETE_HOLD_MS = 2000;
/**
 * How long content has to be on screen before a press on it counts. A press
 * that began before the content appeared, or sooner than this after it, was
 * aimed at what was there before.
 */
export const SHIELD_GRACE_MS = 300;
/** How far a pointer may stray from a button that is being held before the hold ends. */
export const HOLD_SLOP_PX = 8;
/** A click by key comes with the key-down (Enter) or right after the key-up (Space). */
const KEY_CLICK_WINDOW_MS = 50;
/** A key that sent neither a repeat nor a key-up for this long is not taken as still held. */
const KEY_STALE_MS = 1000;
/** Room between the block at the top and an element that is brought out from under it. */
const REVEAL_GAP_PX = 8;

/** Calls `callback` once after `milliseconds`; the returned function cancels that. */
export type SetTimer = (callback: () => void, milliseconds: number) => () => void;

/** "completed": held for the full duration. "released": let go early. "cancelled": left, interrupted or hidden. */
export type HoldEnd = "completed" | "released" | "cancelled";

export interface HoldOptions {
  readonly setTimer: SetTimer;
  /** Default `HOLD_DURATION_MS`. */
  readonly durationMs?: number;
  /** Default `HOLD_TICK_MS`. */
  readonly tickMs?: number;
  /** Called when a hold starts (0 ms) and after every tick before the end. `remainingSeconds` is rounded up. */
  readonly onProgress: (elapsedMs: number, remainingSeconds: number) => void;
  /** Called once per hold, when it ends. */
  readonly onEnd: (reason: HoldEnd) => void;
}

export interface Hold {
  /** Starts a hold. Ignored while one is running, whatever the source, so a repeated key cannot restart it. */
  press(source: string): void;
  /** Ends the running hold early ("released"), but only when `source` is the one that started it. */
  release(source: string): void;
  /** Ends the running hold without a word ("cancelled"). */
  cancel(): void;
  isHolding(): boolean;
}

/**
 * The timing of press-and-hold, without any DOM. Time is counted in ticks of
 * the injected timer, so a hold is never shorter than `durationMs`.
 */
export function createHold(options: HoldOptions): Hold {
  const durationMs = options.durationMs ?? HOLD_DURATION_MS;
  const tickMs = options.tickMs ?? HOLD_TICK_MS;
  let source: string | null = null;
  let run = 0;
  let elapsed = 0;
  let cancelTimer = (): void => undefined;

  const end = (reason: HoldEnd): void => {
    source = null;
    run += 1;
    cancelTimer();
    cancelTimer = () => undefined;
    options.onEnd(reason);
  };
  const schedule = (): void => {
    const mine = run;
    const step = Math.max(1, Math.min(tickMs, durationMs - elapsed));
    cancelTimer = options.setTimer(() => {
      // A timer whose cancellation came too late belongs to an earlier hold.
      if (mine !== run || source === null) return;
      elapsed += step;
      if (elapsed >= durationMs) {
        end("completed");
        return;
      }
      options.onProgress(elapsed, Math.ceil((durationMs - elapsed) / 1000));
      schedule();
    }, step);
  };

  return {
    press(next) {
      if (source !== null) return;
      source = next;
      run += 1;
      elapsed = 0;
      options.onProgress(0, Math.ceil(durationMs / 1000));
      schedule();
    },
    release(from) {
      if (source !== null && source === from) end("released");
    },
    cancel() {
      if (source !== null) end("cancelled");
    },
    isHolding: () => source !== null,
  };
}

export interface CaregiverOptions {
  readonly app: Pick<App, "store" | "refreshBoard">;
  /** Read for `data-startup`, and hidden while the area is open. Never written into. */
  readonly boardRegion: HTMLElement;
  /** Hidden until the area opens; emptied again when it closes. */
  readonly caregiverRegion: HTMLElement;
  /** Outside both regions; gets the opening control, its progress bar and its one line of text. */
  readonly entry: HTMLElement;
  readonly catalogue: readonly CatalogueConcept[];
  /** Replaces the timer of the hold and of every wait of the area; for tests. */
  readonly setTimer?: SetTimer;
  /**
   * Registers a callback for "the page was hidden", which resets a hold and
   * closes an open area; for tests. Default: the document's `visibilitychange`.
   */
  readonly onPageHidden?: (callback: () => void) => void;
  /** The time in milliseconds, for "when did this press begin" and "when was this put on screen"; for tests. Default: `Date.now`. */
  readonly now?: () => number;
  /**
   * The camera for teaching gestures; for tests. Default: the bridge that
   * `capture/capture.js` leaves under `CAPTURE_BRIDGE_KEY`, looked up when
   * "Kamera starten" is tapped. Null or missing: the camera cannot start.
   */
  readonly capture?: CaptureBridge | null;
  /** The wall clock for the capture time of a gesture example; for tests. Default: `new Date()`. */
  readonly date?: () => Date;
  /** Where the camera choice is remembered; for tests. Default: the browser's `localStorage`, when it can be used. */
  readonly cameraStorage?: () => FacingStorage | null;
  /**
   * Turns a chosen image file into the picture that is stored: a PNG or JPEG
   * data URL of at most `PICTURE_SIZE_PX` pixels a side that `isSymbolDataUrl`
   * accepts, or a `PictureRefusal`; for tests. Default: `pictureFromFile`.
   */
  readonly pictureFromFile?: (file: Blob) => Promise<string>;
  /** Opens the camera for a demo clip (card NG-56); for tests. Default: `openDemoCamera`. */
  readonly openDemoCamera?: (facing: CameraFacing) => Promise<DemoCamera>;
  /** Turns a recorded clip into the data URL that is stored, or a `DemoRecordingRefusal`; for tests. Default: `clipFromBlob`. */
  readonly clipFromBlob?: (blob: Blob) => Promise<string>;
  /** Hands a backup file to the person (card NG-58); for tests. Default: a download through a link. */
  readonly saveFile?: (file: Blob, name: string) => void;
  /** Reads a chosen backup file as text; for tests. Default: `Blob.text()`. */
  readonly readFile?: (file: Blob) => Promise<string>;
  /** PBKDF2 rounds for a new backup file; for tests. Default: `BACKUP_ITERATIONS`. */
  readonly backupIterations?: number;
}

/** The largest backup file that is read at all: the export limit, encrypted and as base64, with room to spare. */
export const MAX_BACKUP_FILE_BYTES = 128 * 1024 * 1024;

/** A download of `file` under `name` through a link, as the browser offers it. */
export function downloadFile(file: Blob, name: string): void {
  const url = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.rel = "noopener";
  link.hidden = true;
  document.body.append(link);
  link.click();
  link.remove();
  // Revoked later: some browsers start reading the file only after the click has returned.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/**
 * A preview image of the picture view, or null for a value that is neither a
 * picture board data stores (`isSymbolDataUrl`) nor a bundled icon. It is an
 * image element made as one (card NG-8673319866027849128), so nothing chosen
 * by a caregiver can become the source of any other kind of element.
 */
function previewImage(source: string): HTMLImageElement | null {
  if (!isPictureSource(source)) return null;
  const image = new Image(96, 96);
  image.className = "caregiver-picture-preview";
  image.alt = "";
  image.src = source;
  return image;
}

/** The longer side of a stored picture, in pixels (card NG-8673323346005092805). */
export const PICTURE_SIZE_PX = 256;
/** Largest picture, in pixels, that is drawn at all (card NG-8673317704447615766). */
export const MAX_PICTURE_PIXELS = 40_000_000;
/** Largest image file that is read at all. */
export const MAX_PICTURE_FILE_BYTES = 10 * 1024 * 1024;
/** The file types the picker offers; SVG is drawn onto a canvas like the others, so none of its markup is stored. */
export const PICTURE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif", "image/svg+xml"] as const;

/** Why a chosen file did not become a picture: "type" (not an image the app reads), "size" (file too large), "pixels" (more than `MAX_PICTURE_PIXELS`), "unreadable" (could not be decoded), "too-large" (still too large after redrawing). */
export class PictureRefusal extends Error {
  readonly reason: "type" | "size" | "pixels" | "unreadable" | "too-large";

  constructor(reason: "type" | "size" | "pixels" | "unreadable" | "too-large") {
    super(`picture refused: ${reason}`);
    this.reason = reason;
  }
}

/**
 * The browser's way from a chosen file to a stored picture: the file is read
 * as a data URL (the page's CSP allows `data:` images and no `blob:`), loaded
 * into an image, and drawn onto a canvas of at most `PICTURE_SIZE_PX` a side.
 * What is stored is the canvas as PNG, or as JPEG on white when the PNG is
 * too long: never the file itself, so no SVG markup, script or metadata of
 * the original (camera, place, date) is kept. Nothing leaves the device.
 */
export async function pictureFromFile(file: Blob): Promise<string> {
  if (!(PICTURE_TYPES as readonly string[]).includes(file.type)) throw new PictureRefusal("type");
  if (file.size > MAX_PICTURE_FILE_BYTES) throw new PictureRefusal("size");
  const source = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => (typeof reader.result === "string" ? resolve(reader.result) : reject(new PictureRefusal("unreadable")));
    reader.onerror = () => reject(new PictureRefusal("unreadable"));
    reader.readAsDataURL(file);
  });
  const image = new Image();
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new PictureRefusal("unreadable"));
    image.src = source;
  });
  // Refused before it is drawn: a small file can hold a huge picture, and drawing decodes all of it.
  if (image.naturalWidth * image.naturalHeight > MAX_PICTURE_PIXELS) throw new PictureRefusal("pixels");
  // An SVG without its own size reports 0; it is drawn into the full square then.
  const width = image.naturalWidth > 0 ? image.naturalWidth : PICTURE_SIZE_PX;
  const height = image.naturalHeight > 0 ? image.naturalHeight : PICTURE_SIZE_PX;
  const scale = Math.min(1, PICTURE_SIZE_PX / Math.max(width, height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const context = canvas.getContext("2d");
  if (context === null) throw new PictureRefusal("unreadable");
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  let picture = canvas.toDataURL("image/png");
  if (picture.length > MAX_SYMBOL_DATA_URL_LENGTH) {
    // A photo: JPEG is much shorter. It has no transparency, so it is laid on white.
    context.globalCompositeOperation = "destination-over";
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    picture = canvas.toDataURL("image/jpeg", 0.85);
  }
  const length = picture.length;
  if (!isSymbolDataUrl(picture)) throw new PictureRefusal(length > MAX_SYMBOL_DATA_URL_LENGTH ? "too-large" : "unreadable");
  return picture;
}

export interface CaregiverHandle {
  /** Opens the area. Returns false, and opens nothing, while the board is still starting or a closing still waits for the board. */
  open(): boolean;
  /**
   * Closes the area and refreshes the board, after what the area was still
   * asked to do. The board region stays hidden under a waiting line until
   * that refresh has settled; then it is shown and focus returns to the
   * opening control. If the refresh has not settled after `CLOSE_WAIT_MS`,
   * what happens depends on whether the mounted board may be out of date
   * (a profile's own board with a write that no settled refresh has seen,
   * or a write still running): if it may be, the board region stays hidden
   * and a line, a "Tafel neu laden" button and the opening control are
   * shown instead, until a refresh settles; otherwise the mounted board is
   * shown as it is. A board shown at the bound is replaced when the queued
   * refresh answers later, also if the child has used it meanwhile.
   * Resolves when the board is shown or the bound has passed, whichever
   * comes first; while the area is closed, the promise is that of the last
   * closing. Never rejects.
   */
  close(): Promise<void>;
  isOpen(): boolean;
  /** Resolves when everything the area was asked to do so far has been carried out. Never rejects. */
  settled(): Promise<void>;
}

const OPEN_LABEL = "Für Bezugspersonen";
const HOLD_HINT = `Zum Öffnen bitte ${HOLD_DURATION_MS / 1000} Sekunden gedrückt halten.`;
const STILL_STARTING = "Die Tafel wird noch geladen. Bitte gleich noch einmal versuchen.";
const holdLine = (seconds: number): string => `Weiter halten … ${seconds}`;

const STORAGE_UNREACHABLE = "Der Speicher dieses Geräts ist gerade nicht erreichbar. Deshalb kann hier im Moment nichts geändert werden.";
const READ_FAILED = "Die gespeicherten Profile können gerade nicht gelesen werden. Deshalb kann hier im Moment nichts geändert werden.";
const READING = "Der Speicher wird gelesen.";
const BOARD_LOADING = "Die Tafel wird geladen.";
const NO_BOARD_YET = "Die Tafel konnte noch nicht neu geladen werden. Deshalb wird gerade keine Tafel gezeigt. "
  + "Bitte drücke „Tafel neu laden“ oder gib einer Bezugsperson Bescheid.";
const NAME_SHORT = "Wird nur in diesem Browser auf diesem Gerät gespeichert. Ein Vorname oder Spitzname genügt.";
const NAME_DETAILS = "Was wird gespeichert?";
const NAME_NOTICE = "Dies ist eine Testversion. Ein Vorname oder Spitzname genügt; bitte keinen Nachnamen. "
  + "Der Name, die ausgewählten Begriffe, eigene Texte dazu und beigebrachte Gebärden werden nur in diesem Browser auf diesem Gerät gespeichert. "
  + "Von einer Gebärde werden nur Zahlen zu Bewegung und Handform gespeichert, kein Bild und kein Video. "
  + "Ein Video wird nur als Vormachen-Clip gespeichert, den eine Bezugsperson von sich selbst aufnimmt. "
  + "Die App sendet nichts; die Tastatur des Geräts kann Eingaben aber selbst verarbeiten. "
  + "Ein Profil kann hier umbenannt und gelöscht werden; mit „Sicherung speichern“ kommt es mit Passwort in eine Datei, die auf einem anderen Gerät eingespielt werden kann. "
  + "Wer die Website-Daten im Browser löscht, entfernt alle Profile in diesem Browser und die Offline-Kopie der App. "
  + "Der Browser kann diese Daten auch von sich aus löschen.";
const NONE_ACTIVE = "Gerade ist keine Tafel aktiv. Das Kind sieht Beispiele, bis eine Tafel als aktive Tafel verwendet wird.";
const EDITED_NOT_ACTIVE = "Diese Tafel ist gerade nicht aktiv. Das Kind sieht eine andere Tafel.";
const EDITED_NONE_ACTIVE = "Diese Tafel ist gerade nicht aktiv. Das Kind sieht Beispiele.";
const EDITED_NOT_ACTIVE_UNKNOWN = "Diese Tafel ist gerade nicht aktiv.";
const ONLY_DAMAGED = "Kein gespeichertes Profil kann in dieser Version gelesen werden. Das Kind sieht Beispiele.";
const ACTIVE_WITHOUT_CONCEPTS = "Auf dieser Tafel ist noch kein Begriff, der gezeigt werden kann. Das Kind sieht Beispiele, bis mindestens ein Begriff hinzugefügt ist.";
const CONCEPT_HELP = "Jede Änderung wird sofort gespeichert. „Hinzufügen“ setzt einen Begriff ans Ende der Tafel. "
  + "Mit „nach oben“ und „nach unten“ änderst du die Reihenfolge.";
const MANY_CONCEPTS = `Mehr als ${BOARD_COMFORT_MAX} Begriffe: Auf einem Handy werden die Felder klein und die Tafel muss gescrollt werden.`;
const ON_BOARD = "Auf der Tafel";
const MORE_CONCEPTS = "Weitere Begriffe";
const BOARD_EMPTY = "Auf dieser Tafel ist noch kein Begriff.";
const NO_MORE_CONCEPTS = "Alle Begriffe aus der Auswahl sind auf der Tafel.";
const MOVE_UP = "nach oben";
const MOVE_DOWN = "nach unten";
const REMOVE = "Entfernen";
const ADD = "Hinzufügen";
const UNDO = "Rückgängig";
const DONE = "Fertig";
const RENAME = "Umbenennen";
const DELETE = "Löschen";
const DELETE_FOR_GOOD = "Endgültig löschen";
const CANCEL = "Abbrechen";
const SAVE = "Speichern";
const DELETE_LOSS = "Alle ausgewählten Begriffe und beigebrachten Gebärden dieses Profils gehen verloren, außer sie stehen in einer Sicherung.";
const DELETE_ACTIVE = "Das Kind sieht danach Beispiele, bis eine andere Tafel aktiv ist.";
const AFTER_CLOSE = "Nach dem Schließen:";
const afterDamagedLine = (count: number): string => (count === 1
  ? `${AFTER_CLOSE} Beispiele – ein gespeichertes Profil kann in dieser Version nicht gelesen werden.`
  : `${AFTER_CLOSE} Beispiele – ${count} gespeicherte Profile können in dieser Version nicht gelesen werden.`);
const NAME_TAKEN = "Diesen Namen gibt es schon. Bitte wähle einen anderen";
const PLEASE_WAIT = "Bitte kurz warten.";
const DELETE_HOLD_HINT = `Zum Löschen ${DELETE_HOLD_MS / 1000} Sekunden gedrückt halten.`;
const RELEASE_TO_DELETE = "Loslassen zum Löschen. Zum Abbrechen den Finger wegziehen.";
const DELETING = "Wird gelöscht …";
const AFTER_NONE_ACTIVE = `${AFTER_CLOSE} Beispiele – es ist keine Tafel aktiv.`;
const AFTER_ACTIVE_EMPTY = `${AFTER_CLOSE} Beispiele – die aktive Tafel hat noch keinen Begriff.`;
const AFTER_ACTIVE_UNREADABLE = `${AFTER_CLOSE} Beispiele – die aktive Tafel kann gerade nicht gelesen werden.`;
const AFTER_READ_FAILED = `${AFTER_CLOSE} Beispiele – die Profile können gerade nicht gelesen werden.`;
const AFTER_NO_STORAGE = `${AFTER_CLOSE} Beispiele – der Speicher ist nicht erreichbar.`;
const HELP_SUMMARY = "Hilfe bei Problemen";
const RELOAD_BOARD = "Tafel neu laden";
const RELOAD_HELP = "Zeigt die Tafel des Kindes nicht, was hier eingestellt ist? „Tafel neu laden“ liest sie noch einmal aus dem Speicher dieses Geräts.";
const VOICE_HELP = "Spricht das Gerät nicht? Dann ist es vielleicht stumm geschaltet, oder es fehlt eine deutsche Stimme. "
  + "Sie wird in den Einstellungen des Geräts bei „Sprachausgabe“ oder „Text-in-Sprache“ installiert.";
const RELOAD_NO_STORAGE = "Der Speicher dieses Geräts ist gerade nicht erreichbar. Die Tafel zeigt deshalb Beispiele.";
const RELOAD_NOT_DRAWN = "Die Tafel kann gerade nicht angezeigt werden. Bitte versuche es noch einmal.";
const NO_PROFILES = "Auf diesem Gerät gibt es noch kein Profil.";
const ACTIVE_MARK = "Aktive Tafel";
const ACTIVATE = "Als aktive Tafel verwenden";
const EDIT_BOARD = "Tafel bearbeiten";
const NOT_EDITABLE = "Dieser Begriff kann in dieser Version nicht bearbeitet werden.";
const RETIRED = "Dieser Begriff ist nicht mehr in der Auswahl.";
const LOCKED_PLACE = "Dieser Begriff kann hier nicht verschoben oder entfernt werden.";
const REWORD = "Text ändern";
const CREATE_CONCEPT = "Eigenen Begriff anlegen";
const OWN_CONCEPTS = "Eigene Begriffe, nicht auf der Tafel";
const OWN_HELP = "Eigene Begriffe gibt es nur in diesem Profil. Von der Tafel genommen, bleiben sie hier, bis sie endgültig gelöscht werden.";
const OWN_CREATE_NOTE = "Der Begriff kommt ans Ende der Tafel. Danach kann ihm eine Gebärde beigebracht werden.";
const OWN_DELETE_LOSS = "Das Wort, der Satz, die beigebrachten Gebärden und der Vormachen-Clip dieses Begriffs werden gelöscht. Das kann nicht rückgängig gemacht werden.";
const PICTURE = "Bild wählen";
const PICTURE_FILE = "Bilddatei auswählen";
const PICTURE_FILE_HINT = "PNG, JPEG, WebP, GIF oder SVG. Das Bild wird auf höchstens 256 × 256 Pixel verkleinert.";
const PICTURE_NOW = "Jetzt auf der Taste:";
const PICTURE_NONE = "Jetzt auf der Taste: kein Bild, nur das Wort.";
const PICTURE_NEW = "Neues Bild:";
const PICTURE_LOCAL = "Das Bild wird nur in diesem Browser auf diesem Gerät gespeichert, in diesem Profil. Die App sendet es nicht.";
const PICTURE_RIGHTS = "Bitte nur Bilder verwenden, die ihr verwenden dürft, zum Beispiel METACOM-Symbole aus eurer eigenen Lizenz oder eigene Zeichnungen und Fotos. "
  + "Fotos, auf denen ein Kind zu erkennen ist, besser nicht verwenden.";
const PICTURE_RESET = "Bild der App wiederherstellen";
const PICTURE_REMOVE = "Bild entfernen";
const PICTURE_READING = "Das Bild wird gelesen …";
const NEWER_PICTURE = "Das Bild dieser Taste wurde mit einer neueren Version gespeichert. Bitte die App aktualisieren.";
const PICTURE_REFUSED: Readonly<Record<PictureRefusal["reason"], string>> = {
  type: "Diese Datei ist kein Bild, das die App lesen kann. Bitte ein PNG-, JPEG-, WebP-, GIF- oder SVG-Bild wählen.",
  size: `Die Datei ist zu groß. Bitte ein Bild mit höchstens ${MAX_PICTURE_FILE_BYTES / (1024 * 1024)} MB wählen.`,
  pixels: "Das Bild ist zu groß (mehr als 40 Megapixel). Bitte ein kleineres Bild wählen, zum Beispiel einen Ausschnitt.",
  unreadable: "Das Bild konnte nicht gelesen werden. Bitte ein anderes Bild wählen.",
  "too-large": "Das Bild ist auch verkleinert noch zu groß. Bitte ein einfacheres Bild wählen.",
};
const PICTURE_FULL = "Der Platz für dieses Profil ist voll. Das Bild wurde nicht gespeichert. Entferne Begriffe, Bilder oder Gebärden, dann ist wieder Platz.";
/** Prefix of the ids of own concepts; the rest is random, never taken from the label (card NG-34). */
const OWN_ID_PREFIX = "eigen-";
const NEWER_ENTRY = "Diese Taste wurde mit einer neueren Version gespeichert. Bitte die App aktualisieren.";
const REWORD_LABEL = "Wort auf der Taste";
const REWORD_SPEECH = "Gesprochener Satz";
const RESET_WORDING = "Text der App wiederherstellen";
const RESET_CONFIRM = "Wiederherstellen";
const REWORD_FULL = "Der Platz für dieses Profil ist voll. Der Text wurde nicht gespeichert. Entferne Begriffe oder kürze Texte, dann ist wieder Platz.";

// Teaching a gesture (card NG-19).
const TEACH = "Gebärde beibringen";
const TEACH_INTRO = `Tippe auf „Kamera starten“. Tippe dann auf „Aufnahme starten“: Das Gerät zählt ${TEACH_COUNTDOWN_S} Sekunden herunter, damit deine Hand aus dem Bild kommt. `
  + "Dann die Gebärde einmal machen und auf „Aufnahme beenden“ tippen. "
  + `Nach ${TEACH_MAX_RECORDING_MS / 1000} Sekunden endet die Aufnahme von selbst. `
  + "Am besten steht das Gerät fest, oder eine zweite Person hält es. "
  + `Am besten mindestens ${RECOMMENDED_EXAMPLES} Beispiele aufnehmen, so wie das Kind später vor dem Gerät sitzt. `
  + "Gespeichert werden nur Zahlen zu Bewegung und Handform, kein Bild und kein Video.";
/** Seconds counted down after "Aufnahme starten" before frames are kept. */
const COUNTDOWN_LINE = (left: number): string => `Gleich geht’s los: ${Array.from({ length: TEACH_COUNTDOWN_S }, (_, at) => TEACH_COUNTDOWN_S - at).filter((step) => step >= left).join(" … ")}`;
const CANCEL_COUNTDOWN = "Abbrechen";
const STILL_HAND = "Eine Hand lag still im Bild. Wenn die Gebärde mit einer Hand gemacht wird, lieber ohne die zweite Hand im Bild aufnehmen.";
const CAMERA_START = "Kamera starten";
/** The camera choice (card NG-43): which camera teaching asks for. The same words as in the camera test. */
const CAMERA_CHOICE = "Kamera";
const CAMERA_CHOICE_LABEL = "Kamera:";
const CAMERA_NAMES: Readonly<Record<CameraFacing, string>> = { user: "vorne", environment: "hinten" };
const RECORD_START = "Aufnahme starten";
const RECORD_STOP = "Aufnahme beenden";
const RECORDING = "Die Aufnahme läuft. Jetzt die Gebärde machen.";
const KEEP = "Behalten";
const DISCARD = "Verwerfen";
const BACK = "Zurück";
const DELETE_ALL_EXAMPLES = "Alle Beispiele löschen";
const STORED_EXAMPLES = "Gespeicherte Beispiele";
const REPLAY_NOTE = "So vergleicht die App die Gebärde: nur Bewegung und Handform, aus den gespeicherten Werten gezeichnet. Ein Video gibt es nicht.";
const DEMO = "Vormachen";
const DEMO_INTRO = "Nimm dich selbst auf, wie du die Gebärde machst. Das Kind sieht den Clip in der Gebärden-Ansicht unter „Vormachen“ und kann ihn nachmachen. "
  + `Die Aufnahme dauert höchstens ${DEMO_MAX_MS / 1000} Sekunden.`;
const DEMO_ADULTS = "Bitte nur Erwachsene aufnehmen, nie das Kind.";
const DEMO_LOCAL = "Der Clip wird ohne Ton nur in diesem Browser auf diesem Gerät gespeichert, in diesem Profil, und mit dem Profil gelöscht. "
  + "Die App sendet ihn nicht.";
const DEMO_NOW = "Jetzt gespeichert:";
const DEMO_NONE = "Für diesen Begriff gibt es noch keinen Clip.";
const DEMO_NEW = "Neuer Clip:";
const DEMO_STARTING = "Die Kamera startet …";
const DEMO_READY = "Die Kamera läuft. Tippe auf „Aufnahme starten“.";
const DEMO_RECORDING = "Die Aufnahme läuft. Jetzt die Gebärde vormachen.";
const DEMO_READING = "Der Clip wird gelesen …";
const DEMO_DELETE = "Clip löschen";
/** How long a stopped recorder may take to hand over its recording before it is given up (card NG-60). */
export const DEMO_STOP_WAIT_MS = 5000;
const DEMO_BACK_CAMERA = "Hier läuft nur eine Kamera, die vom Gerät weg zeigt. Vormachen wird mit der vorderen Kamera aufgenommen, damit nie das Kind im Bild ist.";
const DEMO_DRAFT_UNPLAYABLE = "Dieser Clip kann in diesem Browser nicht abgespielt werden und wurde verworfen. Bitte noch einmal aufnehmen.";
const DEMO_UNPLAYABLE = "Dieser Clip kann in diesem Browser nicht abgespielt werden. Er kann gelöscht oder neu aufgenommen werden.";
const DEMO_CAMERA_ENDED = "Die Kamera ist ausgegangen. Bitte noch einmal auf „Kamera starten“ tippen.";
const DEMO_FULL = "Der Platz für dieses Profil ist voll. Der Clip wurde nicht gespeichert. Entferne Clips, Bilder oder Gebärden, dann ist wieder Platz.";
const NEWER_DEMO = "Der Clip dieses Begriffs wurde mit einer neueren Version gespeichert. Bitte die App aktualisieren.";
const DEMO_DAMAGED = "Der gespeicherte Clip kann nicht gelesen werden. Er kann gelöscht oder durch einen neuen ersetzt werden.";
const DEMO_REFUSED: Readonly<Record<DemoRecordingRefusal["reason"], string>> = {
  unsupported: "Dieser Browser kann hier keine Clips aufnehmen. Die Tafel funktioniert auch ohne.",
  "too-large": "Der Clip ist zu groß geworden. Bitte kürzer aufnehmen.",
  unreadable: "Die Aufnahme konnte nicht gelesen werden. Bitte noch einmal aufnehmen.",
};
/** Why the camera of the demo view did not open, from the name of the browser's error. */
function demoCameraLine(error: unknown): string {
  if (error instanceof DemoRecordingRefusal) return DEMO_REFUSED[error.reason];
  switch ((error as { name?: unknown } | null)?.name) {
    case "NotAllowedError":
    case "SecurityError":
      return "Die Kamera ist nicht erlaubt. Du kannst sie in den Einstellungen des Browsers erlauben.";
    case "NotFoundError":
    case "OverconstrainedError":
      return "Es wurde keine Kamera gefunden.";
    case "NotReadableError":
    case "AbortError":
      return "Die Kamera kann gerade nicht starten. Vielleicht benutzt eine andere App sie. Bitte die andere App schließen und noch einmal versuchen.";
    default:
      return DEMO_REFUSED.unsupported;
  }
}
const BACKUP_SAVE = "Sicherung speichern";
const BACKUP_RESTORE = "Sicherung einspielen";
const BACKUP_WHAT = "Die Sicherung ist eine Datei mit allem, was zu dieser Tafel gehört: Name, Begriffe, eigene Texte und Bilder, "
  + "beigebrachte Gebärden und die Vormachen-Clips der Bezugspersonen. Mit ihr kann die Tafel auf einem anderen Gerät eingespielt werden.";
const BACKUP_PRIVATE = "Die Datei wird mit dem Passwort verschlüsselt. Bitte trotzdem sicher aufbewahren und nicht teilen. "
  + "Ohne das Passwort kann niemand die Datei öffnen. Ein vergessenes Passwort kann nicht wiederhergestellt werden.";
const BACKUP_PASSWORD = `Passwort (mindestens ${MIN_BACKUP_PASSWORD_LENGTH} Zeichen)`;
const BACKUP_REPEAT = "Passwort wiederholen";
const BACKUP_SHORT = `Das Passwort braucht mindestens ${MIN_BACKUP_PASSWORD_LENGTH} Zeichen.`;
const BACKUP_MISMATCH = "Die beiden Passwörter sind nicht gleich.";
const BACKUP_WORKING = "Die Sicherung wird erstellt …";
const BACKUP_TOO_LARGE = "Diese Tafel ist zu groß für eine Sicherung.";
const BACKUP_FAILED = "Die Sicherung konnte nicht erstellt werden. Bitte versuche es noch einmal.";
const RESTORE_INTRO = "Wähle eine Sicherungsdatei (.amysecho) und gib ihr Passwort ein. Die Tafel darin kommt auf dieses Gerät, "
  + "mit allem, was in ihr gespeichert ist.";
const RESTORE_FILE = "Sicherungsdatei";
const RESTORE_PASSWORD = "Passwort der Sicherung";
const RESTORE_GO = "Einspielen";
const RESTORE_WORKING = "Die Sicherung wird gelesen …";
const RESTORE_NO_FILE = "Bitte zuerst eine Sicherungsdatei wählen.";
const RESTORE_NO_PASSWORD = "Bitte das Passwort der Sicherung eingeben.";
const RESTORE_WRONG_PASSWORD = "Das Passwort passt nicht zu dieser Datei, oder die Datei wurde verändert. Es wurde nichts eingespielt.";
const RESTORE_NOT_BACKUP = "Diese Datei ist keine Sicherung dieser App, oder sie stammt aus einer neueren Version. Es wurde nichts eingespielt.";
const RESTORE_TOO_LARGE = "Diese Sicherung ist zu groß für dieses Gerät. Es wurde nichts eingespielt.";
const RESTORE_FAILED = "Die Sicherung konnte nicht eingespielt werden. Bitte versuche es noch einmal.";
const RESTORE_REPLACE = "Ersetzen";
const RESTORE_COPY = "Als Kopie einspielen";
const restoreConflictLine = (name: string): string => `Die Tafel ${quoted(name)} gibt es auf diesem Gerät schon.`;
const RESTORE_CONFLICT_HELP = "„Ersetzen“ überschreibt sie mit dem Stand der Sicherung. „Als Kopie einspielen“ behält beide.";
const NO_CAMERA_BRIDGE = "Die Kamera kann hier gerade nicht gestartet werden. Bitte die App neu öffnen. Die Tafel funktioniert auch ohne Kamera.";
const USAGE_LINES: Readonly<Record<Exclude<UsageLevel, "ok">, string>> = {
  near: "Der Platz für dieses Profil ist fast voll. Es passen nur noch wenige Beispiele hinein. Lösche Beispiele, die nicht mehr gebraucht werden.",
  full: "Der Platz für dieses Profil ist voll. Neue Beispiele können erst gespeichert werden, wenn Beispiele gelöscht sind.",
};
const USAGE_UNKNOWN = "Wie viel Platz dieses Profil noch hat, konnte nicht geprüft werden. Ein Beispiel wird nur gespeichert, wenn es noch passt.";
const EXAMPLE_FULL = "Das Profil ist voll. Das Beispiel wurde nicht gespeichert. Bitte nicht mehr gebrauchte Beispiele löschen.";
const EXAMPLE_NOT_SAVED = `Das konnte gerade nicht gespeichert werden. Tippe noch einmal auf „${KEEP}“ oder verwirf die Aufnahme.`;
const NEWER_EXAMPLE = "Dieses Beispiel wurde mit einer neueren Version gespeichert. Bitte die App aktualisieren.";
const EXAMPLE_DELETE_LOSS = "Das kann nicht rückgängig gemacht werden. Die Gebärde kann danach neu aufgenommen werden.";
/** Why a recording cannot be used, and what to do: one sentence each, from the feature builder's reason. */
const UNUSABLE: Readonly<Record<FeatureFailure, string>> = {
  no_frames: "Von der Kamera kam kein Bild an. Bitte noch einmal aufnehmen.",
  bad_timestamps: "Die Aufnahme ist fehlerhaft. Bitte noch einmal aufnehmen.",
  bad_landmarks: "Die Aufnahme ist fehlerhaft. Bitte noch einmal aufnehmen.",
  no_hands: "Es war keine Hand zu sehen. Bitte so sitzen, dass die Hände gut im Bild sind, und noch einmal aufnehmen.",
  too_short: "Die Aufnahme war zu kurz. Bitte erst „Aufnahme starten“ tippen, dann die Gebärde machen und danach „Aufnahme beenden“ tippen.",
  hands_unclear: "Es war nicht klar, ob die Gebärde mit einer oder mit beiden Händen gemacht wird: Eine Hand war nur zeitweise im Bild. "
    + "Bitte die Hände der Gebärde die ganze Zeit im Bild lassen, andere Hände aus dem Bild nehmen und noch einmal aufnehmen.",
  hand_lost: "Eine Hand war zwischendurch zu lange nicht zu sehen. Bitte die Hände im Bild lassen und noch einmal aufnehmen.",
};
const handsText = (hands: HandKind): string => (hands === "both" ? "mit beiden Händen" : `mit einer Hand (${hands === "left" ? "links" : "rechts"})`);
const examplesText = (count: number): string => (count === 1 ? "1 Beispiel" : `${count} Beispiele`);
const two = (value: number): string => String(value).padStart(2, "0");
/** A capture time for the list of examples, in the device's time zone. */
function shownTime(iso: string): string {
  const date = new Date(iso);
  return `${two(date.getDate())}.${two(date.getMonth() + 1)}.${date.getFullYear()}, ${two(date.getHours())}:${two(date.getMinutes())} Uhr`;
}

/** A refusal of a wording, with the field the focus goes back to. */
class WordingRefusal extends Error {
  readonly field: "label" | "speech";

  constructor(field: "label" | "speech", message: string) {
    super(message);
    this.field = field;
  }
}

/**
 * What a caregiver typed or pasted, without what cannot be seen: soft
 * hyphens, zero-width spaces, word joiners and byte order marks go; a
 * zero-width joiner or non-joiner stays only between two visible characters
 * (where an emoji sequence needs it); line breaks and tabs become one space.
 */
function cleanWordingText(input: string): string {
  const spaced = input.normalize("NFC").replace(/[\u00ad\u200b\u2060\ufeff]/gu, "").replace(/[ ]*[\r\n\t\v\f\u0085\u2028\u2029]+[ ]*/gu, " ");
  const characters = [...spaced];
  const visible = (character: string | undefined): boolean => character !== undefined && !/[\s\u200c\u200d]/u.test(character);
  return characters.filter((character, at) => (character !== "\u200c" && character !== "\u200d") || (visible(characters[at - 1]) && visible(characters[at + 1]))).join("").trim().normalize("NFC");
}

/** The wording in its stored form, or a German refusal that names the field. Board data has the last word on which characters are allowed. */
function checkedWording(label: string, speech: string): { labelDe: string; speechDe: string } {
  const fields = [
    ["label", cleanWordingText(label), MAX_LABEL_LENGTH, "Bitte gib ein Wort für die Taste ein.", "Das Wort ist zu lang. Es darf", "Das Wort enthält"],
    ["speech", cleanWordingText(speech), MAX_SPEECH_LENGTH, "Bitte gib einen Satz ein, den das Gerät sprechen soll.", "Der Satz ist zu lang. Er darf", "Der Satz enthält"],
  ] as const;
  for (const [field, text, max, empty, tooLong, forbidden] of fields) {
    if (text === "") throw new WordingRefusal(field, empty);
    if ([...text].length > max) throw new WordingRefusal(field, `${tooLong} höchstens ${max} Zeichen haben.`);
    try {
      normalizeWording({ labelDe: field === "label" ? text : "x", speechDe: field === "speech" ? text : "x" });
    } catch {
      throw new WordingRefusal(field, `${forbidden} unsichtbare Zeichen oder Steuerzeichen. Bitte tippe den Text neu ein.`);
    }
  }
  return normalizeWording({ labelDe: fields[0][1], speechDe: fields[1][1] });
}
const BOARD_UNREADABLE = "Die Begriffe dieses Profils können gerade nicht gelesen werden.";
const SELECT_PROFILE = "Wähle oben bei einem Profil „Tafel bearbeiten“.";
const WRITE_FAILED = "Das konnte gerade nicht gespeichert werden. Bitte versuche es noch einmal.";
const PROFILE_GONE = "Dieses Profil kann nicht gelesen werden oder ist nicht mehr gespeichert.";
const RELOADING = "Die Tafel wird neu geladen.";
const RELOADED = "Die Tafel wurde neu geladen.";
const RELOAD_FAILED = "Die Tafel konnte gerade nicht neu geladen werden. Bitte versuche es noch einmal.";

const BOARD_FULL = `Auf eine Tafel passen höchstens ${MAX_CONCEPT_IDS} Begriffe. Es wurde nichts geändert.`;

const quoted = (text: string): string => `„${text}“`;

type Focusable = HTMLElement & { disabled?: boolean };
/** The one thing that can be open in the profile list: a rename field (with what was typed) or a delete confirmation. */
type Mode =
  | { readonly kind: "rename"; readonly id: string; readonly draft: string }
  | { readonly kind: "delete"; readonly id: string; readonly draft: { typed: string } }
  | RewordMode
  | TeachMode
  | CreateConceptMode
  | { readonly kind: "delete-concept"; readonly id: string; readonly conceptId: string; readonly title: string }
  | PictureMode
  | DemoMode
  | BackupSaveMode
  | BackupRestoreMode
  | null;
/** Saving a backup file of the profile `id` (card NG-58). The password fields live in the page only, never in this object. */
interface BackupSaveMode {
  readonly kind: "backup-save";
  readonly id: string;
  readonly draft: { busy: boolean };
}
/**
 * Restoring a backup file (card NG-58). Belongs to no profile (`id` is empty): it is offered also on a device
 * without one. `conflict` holds a checked export whose profile is already on the device, until the caregiver
 * chooses "Ersetzen" or "Als Kopie einspielen".
 */
interface BackupRestoreMode {
  readonly kind: "backup-restore";
  readonly id: "";
  readonly draft: { busy: boolean; conflict: ProfileExportV1 | null };
}
/**
 * Recording a caregiver's own clip of the gesture of one concept (card NG-56).
 * Takes over the body like the teaching view. `state.draft` is the new clip,
 * kept in memory until "Speichern".
 */
interface DemoMode {
  readonly kind: "demo";
  readonly id: string;
  readonly conceptId: string;
  readonly title: string;
  readonly state: DemoState;
}
interface DemoState {
  camera: "off" | "starting" | "on";
  /** Seconds left before the recording begins, or null when no countdown runs. */
  countdown: number | null;
  recording: boolean;
  /** The recording ended and is being read into a clip. */
  reading: boolean;
  draft: string | null;
  /** A save or delete is asked for and has not ended. */
  busy: boolean;
}
/** The camera of the open demo view, from "Kamera starten" until it stops. */
interface DemoCameraRun {
  readonly mode: DemoMode;
  camera: DemoCamera | null;
  /** The live picture of the camera; moved into each redraw's box. */
  video: HTMLVideoElement | null;
  stopTimer: () => void;
}
/**
 * Choosing a picture for one concept of the profile `id` (card
 * NG-8673323346005092805). Takes over the body like a rewording. `draft.picture`
 * is the redrawn picture of the chosen file, kept in memory until "Speichern".
 */
interface PictureMode {
  readonly kind: "picture";
  readonly id: string;
  readonly conceptId: string;
  readonly title: string;
  /** What the concept was when the view opened: only a catalogue concept has a picture of the app to go back to. */
  readonly source: BoardEntry["source"];
  /** `choice` counts the files chosen; only the latest one's picture is kept. */
  readonly draft: { picture: string | null; reading: boolean; busy: boolean; choice: number };
}
/** Creating an own concept for the profile `id`: like a rewording, but nothing is stored before "Speichern". */
interface CreateConceptMode {
  readonly kind: "create-concept";
  readonly id: string;
  readonly draft: { label: string; speech: string; busy: boolean };
}
/**
 * Teaching a gesture for one concept of the profile `id`. It takes over the
 * body like the rewording. The object is the same while the view is open;
 * `state` holds what changes: the camera, the recording and its result (kept
 * in memory until "Behalten" or "Verwerfen"), and an open delete confirmation.
 */
interface TeachMode {
  readonly kind: "teach";
  readonly id: string;
  readonly conceptId: string;
  readonly state: TeachState;
}
/** The camera of a teaching view, from "Kamera starten" until it stops. */
interface TeachCamera {
  readonly mode: TeachMode;
  readonly controller: AbortController;
  session: CaptureSession | null;
  stopTimer: () => void;
  /** The mirrored picture with the tracked points (card NG-42); null when the bridge has none. */
  readonly preview: CapturePreview | null;
}
type TeachResult =
  | {
    readonly usable: true; readonly sequence: FeatureSequence; readonly frames: number; readonly durationMs: number; readonly capturedAt: Date; readonly auto: boolean;
    readonly stillHand: boolean;
  }
  | { readonly usable: false; readonly reason: FeatureFailure; readonly auto: boolean };
type TeachConfirm = { readonly kind: "one"; readonly name: string; readonly number: number } | { readonly kind: "all"; readonly count: number };
interface TeachState {
  /** What `store.usage` said when the view opened (or after a delete); null while it is being read. */
  usage: UsageLevel | "unknown" | null;
  camera: "off" | "starting" | "on";
  /** The camera's step or problem, in German; empty when there is nothing to say. */
  cameraLine: string;
  cameraProblem: boolean;
  /** The live line: hands and shoulders in the picture now. */
  live: string;
  recording: boolean;
  /** Seconds left before a recording begins, or null when no countdown runs. */
  countdown: number | null;
  result: TeachResult | null;
  /** What the last action of the view came to; shown under the controls, not in the status line, so that nothing above them moves. */
  note: { readonly text: string; readonly error: boolean } | null;
  confirm: TeachConfirm | null;
  /** A keep or delete is asked for and has not ended. */
  busy: boolean;
  /** How the result fits the profile's examples (card NG-4), worked out once per result; null until then or when it cannot be read. */
  fit: { readonly result: TeachResult; readonly fit: ExampleFit | null } | null;
  /** The example that is being replayed and the step shown; a new object for every start, so a timer of an earlier one stops. */
  replay: { readonly name: string; step: number; done: boolean } | null;
}
/**
 * Rewording one concept of the profile `id`. It takes over the body like the
 * delete confirmation. The object is the same for as long as the rewording
 * is open, so that a queued write can tell whether it is still wanted.
 * `draft` holds what changes meanwhile: what the fields hold (so that it
 * survives a redraw), which step is shown, and `busy` while a save or reset
 * is asked for and has not ended. `title` and `source` are the concept as it
 * was when the rewording was opened, for the case that its entry cannot be
 * read any more.
 */
interface RewordMode {
  readonly kind: "reword";
  readonly id: string;
  readonly conceptId: string;
  readonly title: string;
  readonly source: BoardEntry["source"];
  readonly draft: { label: string; speech: string; step: "edit" | "reset"; busy: boolean };
}
/** A removal that can be taken back: `before` is the id that followed the removed one in the stored list then. */
interface UndoOffer {
  readonly profileId: string;
  readonly id: string;
  readonly label: string;
  readonly before: string | null;
}
/** What one reading of the store gives: the body, and the header's line about the board after closing. */
interface Built {
  readonly content: HTMLElement[];
  readonly afterClose: string;
  /** True when the content is a delete confirmation, which is then all there is to press below the block. */
  readonly confirming?: boolean;
  /** The teaching view whose controls are in the content (not its delete confirmation): its camera may run on. */
  readonly teaching?: TeachMode;
  /** The demo view whose controls are in the content: its camera may run on. */
  readonly demo?: DemoMode;
}

function damagedLine(count: number): string {
  const subject = count === 1
    ? "Ein gespeichertes Profil kann in dieser Version nicht gelesen werden. Es bleibt unverändert gespeichert."
    : `${count} gespeicherte Profile können in dieser Version nicht gelesen werden. Sie bleiben unverändert gespeichert.`;
  return `${subject} Eine spätere Version hilft dabei.`;
}

/** A refusal this screen decides itself, already as a German sentence. */
class Refusal extends Error {}

/** What two profile names are compared by: NFC, trimmed, without regard to case. */
function nameKey(name: string): string {
  return name.normalize("NFC").trim().toLocaleLowerCase("de");
}

/** True when a readable profile other than `exceptId` already has this name. The store allows it; the area does not, because a board is named by it. */
function nameTaken(profiles: readonly ProfileV1[], name: string, exceptId: string | null): boolean {
  const key = nameKey(name);
  return key !== "" && profiles.some((profile) => profile.id !== exceptId && nameKey(profile.displayName) === key);
}

/** The refusal of a taken name, with a way out that does not ask for a surname: the typed name and the first free number. */
function nameTakenLine(profiles: readonly ProfileV1[], name: string): string {
  const typed = name.normalize("NFC").trim();
  for (let number = 2; number < 100; number += 1) {
    const example = `${typed} ${number}`;
    if ([...example].length > MAX_DISPLAY_NAME_LENGTH) break;
    if (!nameTaken(profiles, example, null)) return `${NAME_TAKEN}, zum Beispiel ${quoted(example)}.`;
  }
  return `${NAME_TAKEN}.`;
}

const isHoldKey = (key: string): boolean => key === "Enter" || key === " " || key === "Spacebar";

/** A button that has to be held. `cancel` ends a hold that is running, or one that is complete and waits for the release. */
interface HeldButton {
  readonly control: HTMLElement;
  cancel(): void;
}

/** What "Entfernen" and "Rückgängig" each have: see `GUARD_MS`. */
interface TapGuard {
  /** True when a press counts. */
  armed(): boolean;
  /** A press was taken: from now on presses are ignored. */
  take(): void;
  /** The list was redrawn for that press. `changed`: the guard time starts now; otherwise presses count again at once. */
  settle(changed: boolean): void;
  /** A press was ignored. While the guard time runs, it starts again. */
  swallow(): void;
  reset(): void;
}

/**
 * A typed profile name as it is compared before a delete (card
 * NG-8673319027843774136): NFC, the emoji presentation mark U+FE0F left out,
 * every run of white space (also a no-break space) as one space, the ends
 * trimmed. Capitals and every other character count.
 */
function deleteNameForm(text: string): string {
  return text.normalize("NFC").replace(/\uFE0F/gu, "").replace(/\s+/gu, " ").trim();
}

/**
 * One German sentence for a refused or failed profile name. The store only
 * says "not a valid profile" (`ProfileFormatError`), so the reason is read
 * off the input, by the store's own rules: NFC, trimmed, counted in characters.
 */
function nameErrorLine(error: unknown, input: string): string {
  if (!(error instanceof ProfileFormatError)) return WRITE_FAILED;
  const name = input.normalize("NFC").trim();
  if (name === "") return "Bitte gib einen Namen ein.";
  if ([...name].length > MAX_DISPLAY_NAME_LENGTH) return `Der Name ist zu lang. Er darf höchstens ${MAX_DISPLAY_NAME_LENGTH} Zeichen haben.`;
  return "Der Name enthält unsichtbare Zeichen oder Steuerzeichen. Bitte tippe ihn neu ein.";
}

/** One German sentence for a refused or failed change of a board. */
function boardErrorLine(error: unknown): string {
  if (error instanceof Refusal) return error.message;
  if (error instanceof ProfileSizeError) return "Der Platz für dieses Profil ist voll. Die Änderung wurde nicht gespeichert.";
  if (error instanceof UnknownProfileError || error instanceof ProfileFormatError) return PROFILE_GONE;
  if (error instanceof BoardDataError) {
    if (error.kind === "duplicate-concept") return "Ein Begriff kann nur einmal auf der Tafel sein. Es wurde nichts geändert.";
    if (error.kind === "unknown-concept" || error.kind === "invalid-concept-id") return "Dieser Begriff kann nicht auf die Tafel gesetzt werden. Es wurde nichts geändert.";
    return "Diese Änderung ist nicht möglich. Es wurde nichts geändert.";
  }
  return `${WRITE_FAILED} Die Tafel ist unverändert.`;
}

function element<K extends keyof HTMLElementTagNameMap>(tagName: K, className: string, text = ""): HTMLElementTagNameMap[K] {
  const created = document.createElement(tagName);
  if (className !== "") created.className = className;
  if (text !== "") created.textContent = text;
  return created;
}

function button(text: string, className = "caregiver-button"): HTMLButtonElement {
  const created = element("button", className, text);
  created.type = "button";
  return created;
}

function browserFacingStorage(): FacingStorage | null {
  try {
    return (globalThis as { localStorage?: FacingStorage }).localStorage ?? null;
  } catch {
    return null;
  }
}

function cancelRunningSpeech(): void {
  try {
    if (typeof window !== "undefined") window.speechSynthesis?.cancel();
  } catch {
    // Speech is optional.
  }
}

const defaultTimer: SetTimer = (callback, milliseconds) => {
  const timer = setTimeout(callback, milliseconds);
  return () => clearTimeout(timer);
};

function defaultPageHidden(callback: () => void): void {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") callback();
  });
}

/**
 * The ids of a board this screen may take off and move: catalogue concepts
 * and own concepts (card NG-34) that the board shows as such. An own concept
 * under an id the catalogue uses too stays locked: taken off, the catalogue
 * would offer that id again and adding it would bring back the own concept.
 */
function editableIds(board: ResolvedBoard): Set<string> {
  const shadowed = new Set(board.problems.filter((problem) => problem.kind === "custom-shadows-catalogue").map((problem) => problem.conceptId));
  return new Set(board.entries.filter((entry) => entry.source === "catalogue" || (entry.source === "custom" && !shadowed.has(entry.id))).map((entry) => entry.id));
}

/** A new id for an own concept: random, so that a label never becomes part of a storage key. */
function newOwnConceptId(): string {
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  return OWN_ID_PREFIX + [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * Moves `id` one place among the editable ids. Every other id keeps its
 * index, so a concept this version cannot edit stays exactly where it is.
 * Null when there is nowhere to move to.
 */
function moved(ids: readonly string[], editable: ReadonlySet<string>, id: string, delta: -1 | 1): string[] | null {
  const slots = ids.map((other, index) => (editable.has(other) ? index : -1)).filter((index) => index >= 0);
  const from = slots.findIndex((index) => ids[index] === id);
  const target = from + delta;
  if (from < 0 || target < 0 || target >= slots.length) return null;
  const next = [...ids];
  const a = slots[from] as number;
  const b = slots[target] as number;
  next[a] = ids[b] as string;
  next[b] = id;
  return next;
}

/**
 * Puts the opening control into `entry` and returns the handle of the area.
 * Nothing is rendered into the caregiver region before the area is opened.
 */
export function mountCaregiver(options: CaregiverOptions): CaregiverHandle {
  const { app, boardRegion, caregiverRegion, entry, catalogue } = options;
  let isOpen = false;
  // Counts openings and closings. A task that was asked for in an earlier one
  // is still carried out (a tick just before closing is not lost), but it
  // says and draws nothing.
  let session = 0;
  /** The session in which the running task was asked for. */
  let acting = 0;
  /** The last closing; what `close()` returns while the area is closed. */
  let closing: Promise<void> = Promise.resolve();
  /** Counts closings. Only the latest one may show the board; an answer for an earlier one is out of date. */
  let closingNo = 0;
  /**
   * Where the page is after a closing. "waiting": the board is hidden under
   * the waiting line and nothing can be opened. "stalled": the bound has
   * passed; the board is still hidden, and the retry button and the opening
   * control are there. "no": the board is shown, or the area is open.
   */
  let away: "no" | "waiting" | "stalled" = "no";
  const setTimer = options.setTimer ?? defaultTimer;
  let cancelIdle = (): void => undefined;
  const TIMED_OUT = Symbol("timed out");
  /** `promise`, or `TIMED_OUT` when it has not settled after `milliseconds` or rejects. Never rejects. */
  const within = <T>(promise: Promise<T>, milliseconds: number): Promise<T | typeof TIMED_OUT> => new Promise((resolve) => {
    let cancel = (): void => undefined;
    try {
      cancel = setTimer(() => resolve(TIMED_OUT), milliseconds);
    } catch {
      // Without a timer this waits for the promise.
    }
    promise.then((value) => { cancel(); resolve(value); }, () => { cancel(); resolve(TIMED_OUT); });
  });
  // Whether the mounted board may be out of date. `writes` counts store
  // writes that succeeded; `refreshedUpTo` is the count a settled refresh
  // had seen when it was asked for; `intents` counts writing actions that
  // were asked for and have not ended, which may still succeed.
  let writes = 0;
  let refreshedUpTo = 0;
  let intents = 0;
  /** `app.refreshBoard()`, never rejecting. A refresh that settles has mounted every write that had succeeded when it was asked for. */
  const refreshBoard = (): Promise<void> => {
    const seen = writes;
    return Promise.resolve().then(() => app.refreshBoard()).then(() => {
      refreshedUpTo = Math.max(refreshedUpTo, seen);
    }, () => undefined);
  };
  /**
   * True when what the board region holds may be the board of a profile
   * that is no longer the one to show: a profile's own board is mounted,
   * and something was written (or may still be) that no settled refresh has
   * seen. Examples are never out of date in that sense, and without a write
   * nothing can have changed.
   */
  const boardMayBeStale = (): boolean => {
    const startup = boardRegion.dataset["startup"] ?? "";
    const examples = boardRegion.dataset["boardFallback"] !== undefined || startup.startsWith("demo-") || startup === "unrenderable";
    return !examples && (writes > refreshedUpTo || intents > 0);
  };
  let work: Promise<void> = Promise.resolve();
  let store: ProfileStore | null = null;
  let selectedId: string | null = null;
  /**
   * The one rename field or delete confirmation that is open, if any. Set
   * when a button is pressed, not when the queue gets to it, so that Escape
   * right after "Löschen" cancels the confirmation also while an earlier
   * write is still under way.
   */
  let mode: Mode = null;
  /** The held buttons of the body that is on screen. Only these can act; they are cancelled when the body is swapped. */
  let bodyHolds: HeldButton[] = [];
  /** The camera of the open teaching view, if it runs or starts: ended whenever that view is left, the area closes or another view opens. */
  let teachCamera: TeachCamera | null = null;
  /** The live line of the teaching view on screen; written on every camera frame without a redraw. */
  let teachLive: HTMLElement | null = null;
  let teachCameraLine: HTMLElement | null = null;
  /** The fixed-size box of the teaching view on screen that holds the camera's preview while the camera runs (card NG-42). */
  let teachPreviewSlot: HTMLElement | null = null;
  /** The camera of the open demo view (card NG-56), if it runs or starts: ended like the teaching camera. */
  let demoCamera: DemoCameraRun | null = null;
  /** The box of the demo view on screen that holds the live picture while the camera runs. */
  let demoPreviewSlot: HTMLElement | null = null;
  /** The line of the demo view on screen that counts down; written in place. */
  let demoLine: HTMLElement | null = null;
  const makeDemoCamera = options.openDemoCamera ?? openDemoCamera;
  const makeClip = options.clipFromBlob ?? clipFromBlob;
  /** Names a concept of the profile in a teaching view's fit line: its label on the board, or the catalogue's. */
  let teachLabels: (conceptId: string) => string = () => "einen anderen Begriff dieses Profils";
  /** The canvas of the example being replayed, while it is on screen (card NG-4). */
  let replayCanvas: HTMLCanvasElement | null = null;
  /** Its "Anhalten" button, which says "Abspielen" again once the replay has played through. */
  let replayButton: { readonly control: HTMLButtonElement; readonly label: string } | null = null;
  const date = options.date ?? (() => new Date());
  const makePicture = options.pictureFromFile ?? pictureFromFile;
  const cameraStorage = options.cameraStorage ?? browserFacingStorage;
  /**
   * The camera teaching asks for (card NG-43). What the device remembers wins
   * (the camera test may have changed it meanwhile); this copy holds a choice
   * that a refusing storage could not remember, while the page is open.
   */
  let facing: CameraFacing = "user";
  const currentFacing = (): CameraFacing => {
    try {
      const stored = cameraStorage()?.getItem(CAMERA_FACING_KEY);
      if (stored === "user" || stored === "environment") facing = stored;
    } catch {
      // The copy holds.
    }
    return facing;
  };
  /** What was typed into the create field, kept while a view without that field is shown. */
  let createDraft = "";
  /** True from a press that retires the message until the redraw for that press: the text keeps its place meanwhile. */
  let statusStale = false;
  // Monotonic where the platform has it: a wall clock that is set back would leave every button dead until it caught up.
  const now = options.now ?? (typeof performance !== "undefined" && typeof performance.now === "function" ? () => performance.now() : () => Date.now());
  /** When what is on screen was last put there or moved: a swap of the body, of the undo button, or a change of the status line. */
  let swappedAt = Number.NEGATIVE_INFINITY;
  const markSwap = (): void => {
    swappedAt = now();
  };
  /** True for a press that began after what it lands on was on screen for the grace time. */
  const aimed = (pressAt: number): boolean => pressAt >= swappedAt + SHIELD_GRACE_MS;
  /** Whether the message in the status line is an error: an error stays when the caregiver scrolls. */
  let statusIsError = false;
  let undoButton: HTMLElement | null = null;
  /** The removals of this visit for the edited profile that can still be taken back, latest last. */
  let undoStack: UndoOffer[] = [];
  let heading: HTMLElement | null = null;
  let topBlock: HTMLElement | null = null;
  let afterClose: HTMLElement | null = null;
  let status: HTMLElement | null = null;
  let undoBar: HTMLElement | null = null;
  let body: HTMLElement | null = null;
  let help: HTMLDetailsElement | null = null;
  let focusables = new Map<string, Focusable>();

  const opener = button(OPEN_LABEL, "caregiver-open");
  const progress = element("progress", "caregiver-hold-progress");
  progress.max = HOLD_DURATION_MS;
  progress.value = 0;
  progress.hidden = true;
  // The line below says the same in words.
  progress.setAttribute("aria-hidden", "true");
  const hint = element("p", "caregiver-hint");
  hint.setAttribute("role", "status");
  hint.setAttribute("aria-live", "polite");

  const show = (text: string, error: boolean): void => {
    if (status === null) return;
    // A message of another length moves what is below the block.
    if (status.textContent !== text) markSwap();
    status.textContent = text;
    status.className = error ? "caregiver-status caregiver-status-error" : "caregiver-status";
    statusIsError = error;
    statusStale = false;
  };

  /** A message of the running task. `error`: something was refused or failed. */
  const say = (text: string, error = false): void => {
    if (acting === session) show(text, error);
  };

  /**
   * Retires an earlier message when a button is pressed, whatever it said.
   * The text stays where it is until the redraw for that press: taking it
   * away at once would move the content under the finger.
   */
  const clearStatus = (): void => {
    if (isOpen && status !== null && status.textContent !== "") statusStale = true;
  };

  /** Scrolling takes away what was only good to know. An error stays until the next press: it must not vanish unread. */
  const clearOnScroll = (): void => {
    if (!statusIsError && isOpen && status !== null && status.textContent !== "") show("", false);
  };

  /** Ends every hold of the body that may be running or waiting for its release. */
  const dropHold = (): void => {
    for (const held of bodyHolds) held.cancel();
  };

  /**
   * Makes `control` a button that has to be held (`createHold`), with a
   * pointer or with Enter or Space. The finger has to stay on it: the
   * implicit pointer capture of a touch is released so that leaving is
   * reported, and a move or a lift outside the button (beyond
   * `HOLD_SLOP_PX`) ends the hold. With `onReady`, a completed hold only
   * waits; `act` is called when the pointer or key is let go on the button.
   */
  const heldButton = (control: HTMLElement, held: {
    readonly durationMs: number;
    /** Asked when a press begins: false, and no hold starts. */
    allowed(): boolean;
    onProgress(elapsedMs: number, remainingSeconds: number): void;
    /** A hold ended without acting. */
    onIdle(reason: "released" | "cancelled"): void;
    onReady?(): void;
    act(): void;
  }): HeldButton => {
    let source: string | null = null;
    let ready = false;
    const hold = createHold({
      setTimer,
      durationMs: held.durationMs,
      onProgress: held.onProgress,
      onEnd: (reason) => {
        if (reason !== "completed") {
          source = null;
          held.onIdle(reason);
        } else if (held.onReady === undefined) {
          source = null;
          held.act();
        } else {
          ready = true;
          held.onReady();
        }
      },
    });
    const start = (from: string): void => {
      if (ready || hold.isHolding() || !held.allowed()) return;
      source = from;
      hold.press(from);
    };
    const abort = (): void => {
      if (ready) {
        ready = false;
        source = null;
        held.onIdle("cancelled");
        return;
      }
      hold.cancel();
    };
    const finish = (from: string): void => {
      if (!ready) {
        hold.release(from);
        return;
      }
      if (from !== source) return;
      ready = false;
      source = null;
      held.act();
    };
    /** True when the pointer is not on the button any more. Unknown without geometry: then leaving has to be reported by the browser. */
    const outside = (event: PointerEvent): boolean => {
      try {
        if (typeof control.getBoundingClientRect !== "function" || typeof event.clientX !== "number" || typeof event.clientY !== "number") return false;
        const box = control.getBoundingClientRect();
        return event.clientX < box.left - HOLD_SLOP_PX || event.clientX > box.right + HOLD_SLOP_PX
          || event.clientY < box.top - HOLD_SLOP_PX || event.clientY > box.bottom + HOLD_SLOP_PX;
      } catch {
        return false;
      }
    };
    control.addEventListener("pointerdown", (event) => {
      // Only the main button of a mouse; touch and pen report 0 as well.
      if (event.button > 0) return;
      try {
        // A touch is captured by the element it began on: without this, a finger that slides off is not reported as leaving.
        control.releasePointerCapture?.(event.pointerId);
      } catch {
        // Not captured, or no such pointer: nothing to release.
      }
      start("pointer");
    });
    control.addEventListener("pointermove", (event) => {
      if (source === "pointer" && outside(event)) abort();
    });
    control.addEventListener("pointerup", (event) => {
      if (source === "pointer" && outside(event)) abort();
      else finish("pointer");
    });
    control.addEventListener("pointerleave", abort);
    control.addEventListener("pointercancel", abort);
    control.addEventListener("blur", abort);
    // A long press must not bring up the context menu instead of counting.
    control.addEventListener("contextmenu", (event) => event.preventDefault());
    control.addEventListener("keydown", (event) => {
      if (!isHoldKey(event.key)) return;
      event.preventDefault();
      if (event.repeat) return;
      start(`key:${event.key}`);
    });
    control.addEventListener("keyup", (event) => {
      if (isHoldKey(event.key)) finish(`key:${event.key}`);
    });
    return { control, cancel: abort };
  };

  /**
   * Ends the camera of the teaching view, at whatever step it is (the tracker
   * loading, the permission asked, running, recording), through the capture's
   * own cancel signal and `stop`. A recording that was not stopped is dropped.
   */
  /** Stops the camera of the demo view, if one runs or starts; a recording that was not read yet is dropped. */
  const stopDemoCamera = (): void => {
    const demo = demoCamera;
    if (demo === null) return;
    demoCamera = null;
    demo.stopTimer();
    try {
      demo.camera?.close();
    } catch {
      // Nothing more to undo.
    }
    if (demo.video !== null) {
      demo.video.srcObject = null;
      demo.video.remove?.();
    }
    const { state } = demo.mode;
    state.camera = "off";
    state.countdown = null;
    state.recording = false;
  };

  const stopTeachCamera = (): void => {
    // Every way out of a view stops its camera: the demo view's too (card NG-56).
    stopDemoCamera();
    const camera = teachCamera;
    if (camera === null) return;
    teachCamera = null;
    camera.stopTimer();
    camera.controller.abort();
    camera.session?.stop();
    // The session's end empties the preview; a camera stopped before it ran has none to end.
    camera.preview?.close();
    const { state } = camera.mode;
    state.camera = "off";
    state.recording = false;
    state.countdown = null;
    state.live = "";
    if (!state.cameraProblem) state.cameraLine = "";
  };

  /** What every press of a button starts with: the earlier message goes, and so does an open rename field or confirmation unless the press belongs to it. */
  const begin = (keepMode = false): void => {
    clearStatus();
    if (keepMode) return;
    mode = null;
    stopTeachCamera();
    dropHold();
  };

  /** `mark` shows on the guarded buttons that are drawn whether a press counts. */
  const tapGuard = (mark: (armed: boolean) => void): TapGuard => {
    let armed = true;
    let waiting = false;
    let turn = 0;
    let cancel = (): void => undefined;
    /** The message that "Bitte kurz warten." took the place of. */
    let replaced: { readonly text: string; readonly error: boolean } | null = null;
    const stop = (): void => {
      turn += 1;
      cancel();
      cancel = () => undefined;
    };
    const wait = (): void => {
      stop();
      const mine = turn;
      waiting = true;
      const arm = (): void => {
        // A timer whose cancellation came too late belongs to an earlier guard.
        if (mine !== turn) return;
        armed = true;
        waiting = false;
        mark(true);
        // The wait is over: the line must not go on asking for it.
        if (isOpen && status !== null && status.textContent === PLEASE_WAIT) show(replaced?.text ?? "", replaced?.error ?? false);
        replaced = null;
      };
      try {
        cancel = setTimer(arm, GUARD_MS);
      } catch {
        arm();
      }
    };
    return {
      armed: () => armed,
      take() {
        stop();
        armed = false;
        waiting = false;
        mark(false);
      },
      settle(changed) {
        if (changed) {
          mark(false);
          wait();
          return;
        }
        stop();
        armed = true;
        waiting = false;
        mark(true);
      },
      swallow() {
        // Steady tapping keeps being ignored; before the redraw there is no time running yet.
        if (waiting) wait();
        // Said where the eyes are, so that the grey buttons are explained.
        if (!isOpen || status === null) return;
        if (status.textContent !== PLEASE_WAIT) replaced = statusStale ? null : { text: status.textContent ?? "", error: statusIsError };
        show(PLEASE_WAIT, false);
      },
      reset() {
        stop();
        armed = true;
        waiting = false;
        replaced = null;
        mark(true);
      },
    };
  };
  const markButton = (control: HTMLElement | null | undefined, armed: boolean): void => control?.setAttribute("aria-disabled", armed ? "false" : "true");
  const removeGuard = tapGuard((armed) => {
    for (const [key, control] of focusables) if (key.startsWith("remove:")) markButton(control, armed);
  });
  const undoGuard = tapGuard((armed) => markButton(undoButton, armed));

  /** Carries tasks out one after another, in the order they were asked for, across closing and reopening. */
  const run = (task: () => Promise<void>): void => {
    const mine = session;
    work = work.then(() => {
      acting = mine;
      return task();
    }).catch(() => {
      // A task that failed outside its own handling: the area keeps what it shows.
      say(WRITE_FAILED, true);
    });
  };

  /** `run` for an action that writes: it counts as "may still write" from the moment it is asked for until it has ended. */
  const runWrite = (task: () => Promise<void>): void => {
    intents += 1;
    run(async () => {
      try {
        await task();
      } finally {
        intents -= 1;
      }
    });
  };

  /**
   * Makes sure `target` is not under the block that stays at the top: the
   * top edge of `anchor` (the card around it, or `target` itself) comes to
   * rest just below the block. With `toTop` it is brought there also from
   * further down, so that what was asked for is the first thing under the
   * block. If `target` then ends below the region, the region scrolls on as
   * far as `target` stays clear of the block. Does nothing where the DOM has
   * no geometry.
   */
  const reveal = (target: HTMLElement, anchor: HTMLElement, toTop: boolean): void => {
    try {
      if (topBlock === null || typeof target.getBoundingClientRect !== "function" || typeof topBlock.getBoundingClientRect !== "function") return;
      const edge = topBlock.getBoundingClientRect().bottom + REVEAL_GAP_PX;
      const at = anchor.getBoundingClientRect().top;
      if (toTop || at < edge) caregiverRegion.scrollTop = Math.max(0, caregiverRegion.scrollTop + at - edge);
      const now = target.getBoundingClientRect();
      const below = now.bottom - caregiverRegion.getBoundingClientRect().bottom;
      if (below > 0) caregiverRegion.scrollTop += Math.max(0, Math.min(below, now.top - edge));
    } catch {
      // Without geometry the browser's own scrolling on focus has to do.
    }
  };

  /** Draws the undo button for the latest removal that can be taken back, or takes the button away. */
  const renderUndo = (): void => {
    if (undoBar === null) return;
    const next = undoStack[undoStack.length - 1];
    if (next === undefined) {
      undoButton = null;
      if (!undoBar.hidden) markSwap();
      undoBar.replaceChildren();
      undoBar.hidden = true;
      return;
    }
    // More than one: said on the button, because the next one appears in the same place.
    const more = undoStack.length - 1;
    const rest = more === 0 ? "" : ` (noch ${more} ${more === 1 ? "weiterer" : "weitere"})`;
    const back = button(`${UNDO}: ${quoted(next.label)}${rest}`);
    back.setAttribute("aria-label", `${UNDO}: ${next.label} wieder auf die Tafel setzen${rest}`);
    markButton(back, undoGuard.armed());
    back.addEventListener("click", () => {
      // The next removal to take back appears under the finger: a second tap must not take that one back too.
      if (!undoGuard.armed()) {
        undoGuard.swallow();
        return;
      }
      undoGuard.take();
      begin();
      // Back to where it was: before the id that followed it then, if that one is still on the board.
      changeBoard(next.profileId, [`remove:${next.id}`], null, `${quoted(next.label)} ist wieder auf der Tafel.`, (ids) => {
        if (ids.includes(next.id)) {
          dropUndo((offer) => offer === next);
          return null;
        }
        if (ids.length >= MAX_CONCEPT_IDS) throw new Refusal(BOARD_FULL);
        const at = next.before === null ? -1 : ids.indexOf(next.before);
        return at < 0 ? [...ids, next.id] : [...ids.slice(0, at), next.id, ...ids.slice(at)];
      }, (succeeded) => {
        if (succeeded) dropUndo((offer) => offer === next);
        undoGuard.settle(succeeded);
      });
    });
    undoButton = back;
    undoBar.replaceChildren(back);
    undoBar.hidden = false;
    markSwap();
  };

  /** Takes offers off the undo stack. Only for the opening that asked: a task of an earlier opening leaves this one's stack alone. */
  const dropUndo = (gone: (offer: UndoOffer) => boolean): void => {
    if (acting !== session || !undoStack.some(gone)) return;
    undoStack = undoStack.filter((offer) => !gone(offer));
    renderUndo();
  };

  /** Reads the store again and replaces the body. `focus` names the controls to try, in order, for the focus. */
  const draw = async (focus: readonly string[] | null, options: { readonly draftName?: string; readonly toTop?: boolean } = {}): Promise<void> => {
    const mine = acting;
    if (!isOpen || mine !== session) return;
    // A name that is typed but not sent yet survives the redraw after another action.
    const typed = options.draftName ?? (focusables.get("create-name") as HTMLInputElement | undefined)?.value ?? createDraft;
    createDraft = typed;
    const nextFocusables = new Map<string, Focusable>();
    const nextHolds: HeldButton[] = [];
    let built: Built;
    let failed = false;
    if (store === null) {
      failed = true;
      built = { content: [element("p", "caregiver-notice", STORAGE_UNREACHABLE)], afterClose: AFTER_NO_STORAGE };
    } else {
      try {
        built = await build(store, nextFocusables, nextHolds, typed);
      } catch {
        failed = true;
        nextFocusables.clear();
        nextHolds.length = 0;
        built = { content: [element("p", "caregiver-notice", READ_FAILED)], afterClose: AFTER_READ_FAILED };
      }
    }
    if (!isOpen || mine !== session || body === null) return;
    // A hold dies with its button: whatever was held on the content that goes now ends here, not when its successor was built.
    dropHold();
    // The camera belongs to the teaching view that started it: whatever is drawn instead of that view's controls
    // (another view, a confirmation, or a notice that the store could not be read), the camera stops.
    if (teachCamera !== null && built.teaching !== teachCamera.mode) stopTeachCamera();
    if (built.teaching === undefined) {
      teachLive = null;
      teachCameraLine = null;
      teachPreviewSlot = null;
    }
    if (demoCamera !== null && built.demo !== demoCamera.mode) stopDemoCamera();
    if (built.demo === undefined) {
      demoPreviewSlot = null;
      demoLine = null;
    }
    // As for teaching: the live picture moves into the new box in the same task as the swap, so it is not paused.
    const live = demoCamera?.video ?? null;
    if (live !== null && demoPreviewSlot !== null && built.demo === demoCamera?.mode) demoPreviewSlot.append(live);
    // The running preview moves into the new view's box in the same task as the swap: a video taken
    // out of the page and not put back before the task ends is paused by the browser.
    const shown = teachCamera?.preview ?? null;
    if (shown !== null && teachPreviewSlot !== null && built.teaching === teachCamera?.mode) teachPreviewSlot.append(shown.element);
    body.replaceChildren(...built.content);
    bodyHolds = nextHolds;
    markSwap();
    // The message that the press for this redraw retired, if the action put nothing in its place.
    if (statusStale) show("", false);
    if (afterClose !== null) afterClose.textContent = built.afterClose;
    // "Tafel neu laden" is the retry then, so it must not sit behind a closed summary.
    if (failed && help !== null) help.open = true;
    if (help !== null) help.hidden = built.confirming === true;
    focusables = nextFocusables;
    // The rows were built while storage was read; what they show of the guard is set from its state now.
    for (const [key, control] of focusables) if (key.startsWith("remove:")) markButton(control, removeGuard.armed());
    // Removals are taken back on the board they were made on; with another profile in the editor the offers go.
    dropUndo((offer) => offer.profileId !== selectedId);
    if (focus === null) return;
    const target = focus.map((key) => focusables.get(key)).find((candidate) => candidate !== undefined && candidate.disabled !== true);
    (target ?? heading)?.focus();
    if (target === undefined) return;
    const key = focus.find((candidate) => focusables.get(candidate) === target);
    reveal(target, focusables.get(`anchor:${key}`) ?? target, options.toTop === true);
  };

  /**
   * One change of a board: reads the profile's full `conceptIds` from the
   * store, lets `change` build the new list from them, and saves it through
   * `setBoardConcepts`. `change` returns null when there is nothing to do.
   * Focus goes to `focus` after a change that was saved and to `focusElse`
   * otherwise (null: it stays where it is), so that a second press after a
   * failure acts on the same concept. `after` hears whether it was saved,
   * once the area has been drawn again: a guard counts from what is on
   * screen, not from the end of the write.
   */
  const changeBoard = (
    profileId: string, focus: readonly string[], focusElse: readonly string[] | null, done: string,
    change: (ids: readonly string[], editable: ReadonlySet<string>) => string[] | null,
    after: (succeeded: boolean) => void = () => undefined,
  ): void => runWrite(async () => {
    if (store === null) return;
    let succeeded = false;
    try {
      const board = await resolveBoard(store, profileId, catalogue);
      const next = change(board.profile.conceptIds, editableIds(board));
      if (next !== null) {
        await setBoardConcepts(store, profileId, next, catalogue);
        writes += 1;
        succeeded = true;
        say(done);
      }
    } catch (error) {
      say(boardErrorLine(error), true);
    }
    try {
      await draw(succeeded ? focus : focusElse);
    } finally {
      after(succeeded);
    }
  });

  /** `raw` is the name as it was when the form was sent, not what the field holds when the queue gets here. */
  const createProfile = (raw: string): void => {
    begin();
    runWrite(async () => {
      if (store === null) return;
      try {
        const before = await store.list();
        if (nameTaken(before.profiles, raw, null)) throw new Refusal(nameTakenLine(before.profiles, raw));
        const first = before.profiles.length === 0 && before.damaged.length === 0;
        const profile = await store.create(raw, []);
        writes += 1;
        selectedId = profile.id;
        let line = `Das Profil ${quoted(profile.displayName)} wurde angelegt. Es ist noch nicht die aktive Tafel.`;
        let partly = false;
        if (first) {
          try {
            await store.setActive(profile.id);
            line = `Das Profil ${quoted(profile.displayName)} ist angelegt und jetzt die aktive Tafel. Füge unten Begriffe hinzu.`;
          } catch {
            line = `Das Profil ${quoted(profile.displayName)} wurde angelegt. Es konnte aber nicht als aktive Tafel gespeichert werden.`;
            partly = true;
          }
        }
        say(line, partly);
        // The first profile: straight on to its board. A further one: its card, where "Als aktive Tafel verwenden" is.
        if (first) await draw(["editor-heading"], { draftName: "", toTop: true });
        else await draw([`activate:${profile.id}`, `edit:${profile.id}`], { draftName: "" });
      } catch (error) {
        say(error instanceof Refusal ? error.message : nameErrorLine(error, raw), true);
        await draw(["create-name"], { draftName: raw });
      }
    });
  };

  const activate = (profile: ProfileV1, label: string): void => {
    begin();
    runWrite(async () => {
      if (store === null) return;
      try {
        await store.setActive(profile.id);
        writes += 1;
        say(`${quoted(label)} ist jetzt die aktive Tafel.`);
      } catch (error) {
        say(error instanceof UnknownProfileError || error instanceof ProfileFormatError ? PROFILE_GONE : WRITE_FAILED, true);
      }
      await draw([`edit:${profile.id}`]);
    });
  };

  /** Puts another profile into the editor and goes there: the editor is below the fold on a phone. */
  const select = (profile: ProfileV1, label: string): void => {
    begin();
    run(async () => {
      selectedId = profile.id;
      say(`Tafel von ${quoted(label)} wird bearbeitet.`);
      await draw(["editor-heading"], { toTop: true });
    });
  };

  /** Opens the rename field or the delete confirmation of one profile; whatever was open before is closed. */
  const openMode = (next: Exclude<Mode, null>, focus: string): void => {
    clearStatus();
    dropHold();
    stopTeachCamera();
    mode = next;
    // A confirmation is the whole body: it starts right under the block.
    run(() => draw([focus], { toTop: next.kind !== "rename" }));
  };

  /** Closes the open rename field or confirmation without a change; focus returns to the button that opened it. */
  const leaveMode = (): void => {
    const was = mode;
    if (was === null) return;
    clearStatus();
    dropHold();
    // The second step of a reset goes back to the fields, with what they held.
    if (was.kind === "reword" && was.draft.step === "reset") {
      was.draft.step = "edit";
      run(() => draw(["reword-reset"], { toTop: true }));
      return;
    }
    // The delete confirmation of an example goes back to the teaching view, to the button that opened it.
    if (was.kind === "teach" && was.state.confirm !== null) {
      const confirm = was.state.confirm;
      was.state.confirm = null;
      run(() => draw([confirm.kind === "one" ? `teach-delete:${confirm.name}` : "teach-delete-all", "teach-heading"]));
      return;
    }
    stopTeachCamera();
    mode = null;
    const back = was.kind === "reword" || was.kind === "teach" || was.kind === "delete-concept" || was.kind === "picture" || was.kind === "demo"
      ? `${was.kind}:${was.conceptId}`
      : was.kind === "create-concept" ? "create-concept" : was.kind === "backup-restore" ? "restore" : `${was.kind}:${was.id}`;
    run(() => draw([back]));
  };

  /** One German sentence for a wording that could not be saved or reset. */
  const wordingErrorLine = (error: unknown): string => {
    if (error instanceof WordingRefusal) return error.message;
    if (error instanceof ProfileSizeError) return REWORD_FULL;
    if (error instanceof BoardDataError && error.kind === "unsupported-entry") return `${NEWER_ENTRY} Der Text wurde nicht geändert.`;
    if (error instanceof BoardDataError && error.kind === "invalid-text") return "Der Text enthält Zeichen, die nicht erlaubt sind. Bitte tippe ihn neu ein.";
    return `${WRITE_FAILED} Der Text ist unverändert.`;
  };

  /**
   * Saves or resets the wording of the open rewording, as one queued write.
   * `write` returns the message for the status line, or null when nothing
   * had to be written. A second press while the first is under way is not a
   * second write. After a refusal the fields stay open with what was typed.
   */
  const settleWording = (write: (current: ProfileStore, open: RewordMode) => Promise<string | null>): void => {
    const mine = mode;
    if (mine === null || mine.kind !== "reword" || mine.draft.busy) return;
    const step = mine.draft.step;
    mine.draft.busy = true;
    clearStatus();
    runWrite(async () => {
      try {
        // Left before the write began ("Abbrechen", Escape, another action): it is dropped. One that has begun
        // cannot be taken back; it is carried out, and the status line says so.
        if (store === null || mode !== mine || mine.draft.step !== step) return;
        try {
          const done = await write(store, mine);
          if (done !== null) {
            writes += 1;
            say(done);
          }
          if (acting === session && mode === mine) mode = null;
          await draw([`reword:${mine.conceptId}`]);
        } catch (error) {
          if (error instanceof UnknownProfileError || error instanceof ProfileFormatError) {
            if (acting === session && mode === mine) mode = null;
            say(PROFILE_GONE, true);
            await draw(["profiles-heading"]);
            return;
          }
          say(wordingErrorLine(error), true);
          // Back to the fields, also from the second step of a reset: that is where something can be done about it.
          mine.draft.step = "edit";
          await draw([error instanceof WordingRefusal && error.field === "speech" ? "reword-speech" : "reword-label"], { toTop: true });
        }
      } finally {
        mine.draft.busy = false;
      }
    });
  };

  const saveWording = (): void => settleWording(async (current, open) => {
    const wording = checkedWording(open.draft.label, open.draft.speech);
    const shown = (await resolveBoard(current, open.id, catalogue)).entries.find((entry) => entry.id === open.conceptId);
    // Nothing changed: nothing is written, and nothing is claimed.
    if (shown !== undefined && shown.labelDe === wording.labelDe && shown.speechDe === wording.speechDe) return null;
    // The app's own text, typed back by hand, is the app's text again: a copy, not an own wording.
    const known = shown?.source === "catalogue" ? catalogue.find((concept) => concept.id === open.conceptId) : undefined;
    if (known !== undefined && known.labelDe === wording.labelDe && known.speechDe === wording.speechDe) {
      await clearWording(current, open.id, open.conceptId, catalogue);
      return `${quoted(known.labelDe)} hat wieder den Text der App.`;
    }
    const saved = await setWording(current, open.id, open.conceptId, wording, catalogue);
    return `Gespeichert: neuer Text für ${quoted(saved.labelDe)}.`;
  });

  /**
   * Saves the open "Eigenen Begriff anlegen" (card NG-34): the entry with a
   * new random id (`putCustomConcept`), then the board with that id at its
   * end (`setBoardConcepts`). Two writes: when the second fails, the concept
   * exists and is listed under OWN_CONCEPTS, from where it can be added.
   * After a refusal the fields stay open with what was typed.
   */
  const saveNewConcept = (): void => {
    const mine = mode;
    if (mine === null || mine.kind !== "create-concept" || mine.draft.busy) return;
    mine.draft.busy = true;
    clearStatus();
    const leave = (): void => {
      if (acting === session && mode === mine) mode = null;
    };
    runWrite(async () => {
      try {
        if (store === null || mode !== mine) return;
        let created: CustomConcept;
        try {
          const wording = checkedWording(mine.draft.label, mine.draft.speech);
          const before = await store.get(mine.id);
          // Ids that cannot be shown count too: the cap is on the stored list.
          if (before.conceptIds.length >= MAX_CONCEPT_IDS) throw new Refusal(BOARD_FULL);
          const taken = new Set([...(await store.data(mine.id).names()), ...before.conceptIds.map((id) => `concept.${id}`)]);
          let id = newOwnConceptId();
          while (taken.has(`concept.${id}`) || catalogue.some((concept) => concept.id === id)) id = newOwnConceptId();
          created = await putCustomConcept(store, mine.id, id, wording, catalogue);
          writes += 1;
        } catch (error) {
          if (error instanceof UnknownProfileError || error instanceof ProfileFormatError) {
            leave();
            say(PROFILE_GONE, true);
            await draw(["profiles-heading"]);
            return;
          }
          say(error instanceof Refusal ? error.message : wordingErrorLine(error).replace("Der Text ist unverändert.", "Es wurde nichts gespeichert."), true);
          await draw([error instanceof WordingRefusal && error.field === "speech" ? "new-concept-speech" : "new-concept-label"], { toTop: true });
          return;
        }
        leave();
        try {
          const ids = (await store.get(mine.id)).conceptIds;
          if (ids.length >= MAX_CONCEPT_IDS) throw new Refusal(BOARD_FULL);
          await setBoardConcepts(store, mine.id, [...ids, created.id], catalogue);
          writes += 1;
          say(`Gespeichert: ${quoted(created.labelDe)} ist jetzt auf der Tafel.`);
          await draw([`row:${created.id}`, "editor-heading"]);
        } catch {
          say(`${quoted(created.labelDe)} wurde angelegt, aber nicht auf die Tafel gesetzt. Der Begriff steht unten unter ${quoted(OWN_CONCEPTS)} und kann von dort hinzugefügt werden.`, true);
          await draw([`add:${created.id}`, "editor-heading"]);
        }
      } finally {
        mine.draft.busy = false;
      }
    });
  };

  /**
   * Deletes the own concept whose confirmation is open: first its gesture
   * examples, then the concept (`removeCustomConcept`: off the board, then the
   * entry). A failure leaves the concept listed, so that a second try finishes
   * the job. False when nothing was asked for.
   */
  const deleteOwnConcept = (): boolean => {
    const mine = mode;
    if (mine === null || mine.kind !== "delete-concept") return false;
    begin(true);
    runWrite(async () => {
      if (store === null || mode !== mine) return;
      const leave = (): void => {
        if (acting === session && mode === mine) mode = null;
      };
      try {
        // Only a readable own concept: an entry a newer app wrote is never deleted here.
        const own = (await listCustomConcepts(store, mine.id)).concepts.some((concept) => concept.id === mine.conceptId);
        if (!own) throw new Refusal("Dieser Begriff kann in dieser Version nicht gelöscht werden.");
        await deleteExamples(store, mine.id, mine.conceptId);
        // Its demo clip goes with it (card NG-56).
        await removeDemoClip(store, mine.id, mine.conceptId);
        await removeCustomConcept(store, mine.id, mine.conceptId, catalogue);
        writes += 1;
        leave();
        dropUndo((offer) => offer.profileId === mine.id && offer.id === mine.conceptId);
        say(`${quoted(mine.title)} wurde endgültig gelöscht.`);
        await draw(["own-heading", "more-heading"]);
      } catch (error) {
        leave();
        say(error instanceof Refusal ? error.message : error instanceof UnknownProfileError ? PROFILE_GONE : `${WRITE_FAILED} ${quoted(mine.title)} ist noch da.`, true);
        await draw([`delete-concept:${mine.conceptId}`, "own-heading", "more-heading"]);
      }
    });
    return true;
  };

  /**
   * A file was chosen in the open picture view: it is redrawn (`makePicture`)
   * and shown as "Neues Bild" until "Speichern". Nothing is stored yet. A
   * refusal is said in German and the view stays.
   */
  const choosePicture = (open: PictureMode, file: Blob | undefined): void => {
    if (mode !== open || file === undefined || open.draft.busy) return;
    clearStatus();
    open.draft.reading = true;
    // The earlier picture goes: nothing can be saved that this file is about to replace, nor stay next to its refusal.
    open.draft.picture = null;
    open.draft.choice += 1;
    const choice = open.draft.choice;
    run(async () => {
      if (mode === open) await draw(["picture-file"], { toTop: true });
    });
    void makePicture(file).then((picture) => {
      if (!isSymbolDataUrl(picture)) throw new PictureRefusal("unreadable");
      return { picture, line: null as string | null };
    }, (error: unknown) => ({ picture: null, line: PICTURE_REFUSED[error instanceof PictureRefusal ? error.reason : "unreadable"] }))
      .catch(() => ({ picture: null, line: PICTURE_REFUSED.unreadable }))
      .then(({ picture, line }) => {
        // A file chosen after this one decides: this answer is dropped.
        if (choice !== open.draft.choice) return;
        open.draft.reading = false;
        // Left meanwhile: the picture is dropped.
        if (mode !== open || !isOpen) return;
        if (picture !== null) open.draft.picture = picture;
        if (line !== null) say(line, true);
        run(async () => {
          if (mode === open) await draw(picture === null ? ["picture-file"] : ["picture-save"], { toTop: true });
        });
      });
  };

  /** Saves or takes away the profile's own picture of the open view, as one queued write. */
  const settlePicture = (write: (current: ProfileStore, open: PictureMode) => Promise<string>): void => {
    const mine = mode;
    if (mine === null || mine.kind !== "picture" || mine.draft.busy || mine.draft.reading) return;
    mine.draft.busy = true;
    clearStatus();
    runWrite(async () => {
      try {
        if (store === null || mode !== mine) return;
        try {
          say(await write(store, mine));
          writes += 1;
          if (acting === session && mode === mine) mode = null;
          await draw([`picture:${mine.conceptId}`]);
        } catch (error) {
          if (error instanceof UnknownProfileError || error instanceof ProfileFormatError) {
            if (acting === session && mode === mine) mode = null;
            say(PROFILE_GONE, true);
            await draw(["profiles-heading"]);
            return;
          }
          if (error instanceof ProfileSizeError) say(PICTURE_FULL, true);
          else if (error instanceof BoardDataError && error.kind === "unsupported-entry") say(`${NEWER_PICTURE} Das Bild wurde nicht geändert.`, true);
          else say(`${WRITE_FAILED} Das Bild ist unverändert.`, true);
          await draw(["picture-save", "picture-file"], { toTop: true });
        }
      } finally {
        mine.draft.busy = false;
      }
    });
  };

  const savePicture = (): void => settlePicture(async (current, open) => {
    if (open.draft.picture === null) throw new Refusal("no picture");
    await setSymbol(current, open.id, open.conceptId, open.draft.picture, catalogue);
    return `Gespeichert: neues Bild für ${quoted(open.title)}.`;
  });

  const removePicture = (): void => settlePicture(async (current, open) => {
    await clearSymbol(current, open.id, open.conceptId);
    const known = open.source === "catalogue" ? catalogue.find((concept) => concept.id === open.conceptId) : undefined;
    return known !== undefined ? `${quoted(open.title)} zeigt wieder das Bild der App.` : `${quoted(open.title)} hat jetzt kein Bild.`;
  });

  /** The demo view of `mode`, while it is the open one. */
  const demoOpen = (open: DemoMode): boolean => mode === open && isOpen;

  /** Redraws the demo view (queued), with the focus on the first of `focus` that is there. */
  const drawDemo = (open: DemoMode, focus: readonly string[]): void => {
    run(async () => {
      if (mode === open) await draw([...focus, "demo-cancel"], { toTop: true });
    });
  };

  /** "Vormachen" of one concept: opens its demo view; the camera starts only on "Kamera starten". */
  const openDemo = (profileId: string, entry: BoardEntry): void => {
    openMode({
      kind: "demo", id: profileId, conceptId: entry.id, title: entry.labelDe,
      state: { camera: "off", countdown: null, recording: false, reading: false, draft: null, busy: false },
    }, "demo-camera");
  };

  /** "Kamera starten" in the demo view: the camera's live picture is shown; a new clip replaces an unsaved one. */
  const startDemoCamera = (open: DemoMode): void => {
    const { state } = open;
    if (!demoOpen(open) || state.camera !== "off" || state.busy || state.reading) return;
    clearStatus();
    state.draft = null;
    state.camera = "starting";
    const demo: DemoCameraRun = { mode: open, camera: null, video: null, stopTimer: () => undefined };
    demoCamera = demo;
    drawDemo(open, ["demo-cancel"]);
    let opening: Promise<DemoCamera>;
    try {
      // Always the front camera, the one facing the caregiver who holds the device (card NG-59): the device's camera
      // choice for teaching and the gesture view may be "hinten", which would point at the child.
      opening = makeDemoCamera("user");
    } catch (error) {
      opening = Promise.reject(error);
    }
    void opening.then((camera) => {
      // Left or stopped meanwhile: this camera is not wanted any more.
      if (demoCamera !== demo || !demoOpen(open)) {
        camera.close();
        return;
      }
      // Card NG-60: "user" is only asked for. A camera that says it faces away (a device without a front camera)
      // is refused; one that says nothing about its facing (a desktop webcam) is allowed.
      let facingAway = false;
      try {
        facingAway = camera.stream.getTracks().some((track) => (track as { getSettings?: () => { facingMode?: string } }).getSettings?.().facingMode === "environment");
      } catch {
        // Nothing reported: allowed.
      }
      if (facingAway) {
        camera.close();
        demoCamera = null;
        state.camera = "off";
        say(DEMO_BACK_CAMERA, true);
        drawDemo(open, ["demo-camera"]);
        return;
      }
      demo.camera = camera;
      const video = document.createElement("video");
      video.className = "caregiver-demo-live";
      video.muted = true;
      video.autoplay = true;
      video.playsInline = true;
      video.setAttribute("aria-label", "Bild der Kamera");
      video.srcObject = camera.stream;
      // The front camera is shown like a mirror, as in the teaching view; the clip itself is recorded as the camera sees.
      video.dataset["mirrored"] = "true";
      demo.video = video;
      state.camera = "on";
      // A camera that goes away by itself (permission taken back, device unplugged) ends the view's camera; a recording is dropped.
      try {
        for (const track of camera.stream.getTracks()) {
          track.addEventListener("ended", () => {
            if (demoCamera !== demo || state.reading) return;
            stopDemoCamera();
            if (!demoOpen(open)) return;
            say(DEMO_CAMERA_ENDED, true);
            drawDemo(open, ["demo-camera"]);
          });
        }
      } catch {
        // Without track events the camera is stopped by the view's own ways out.
      }
      drawDemo(open, ["demo-record"]);
    }, (error: unknown) => {
      if (demoCamera !== demo) return;
      demoCamera = null;
      state.camera = "off";
      if (!demoOpen(open)) return;
      say(demoCameraLine(error), true);
      drawDemo(open, ["demo-camera"]);
    });
  };

  /** "Aufnahme starten": a countdown, then the recorder runs until "Aufnahme beenden" or `DEMO_MAX_MS`. */
  const startDemoRecording = (open: DemoMode): void => {
    const { state } = open;
    const demo = demoCamera;
    if (!demoOpen(open) || demo === null || demo.mode !== open || demo.camera === null) return;
    // Not while the last recording is still being read: its recorder has stopped and the camera goes with it.
    if (state.recording || state.countdown !== null || state.reading) return;
    clearStatus();
    state.countdown = TEACH_COUNTDOWN_S;
    const ours = (): boolean => demoCamera === demo && mode === open;
    const schedule = (callback: () => void, milliseconds: number): void => {
      demo.stopTimer();
      try {
        demo.stopTimer = setTimer(callback, milliseconds);
      } catch {
        // Without a timer nothing is counted: the recording starts at once and ends by the tap only.
        demo.stopTimer = () => undefined;
        if (state.countdown !== null) {
          state.countdown = 1;
          tick();
        }
      }
    };
    const tick = (): void => {
      if (!ours() || state.countdown === null) return;
      const left = state.countdown - 1;
      if (left > 0) {
        state.countdown = left;
        if (demoLine !== null) demoLine.textContent = COUNTDOWN_LINE(left);
        schedule(tick, 1000);
        return;
      }
      state.countdown = null;
      try {
        demo.camera?.start();
      } catch {
        say(DEMO_REFUSED.unsupported, true);
        stopDemoCamera();
        drawDemo(open, ["demo-camera"]);
        return;
      }
      state.recording = true;
      schedule(() => stopDemoRecording(open), DEMO_MAX_MS);
      drawDemo(open, ["demo-stop"]);
    };
    schedule(tick, 1000);
    drawDemo(open, ["demo-countdown-cancel"]);
  };

  /** "Abbrechen" during the countdown: nothing is recorded, the camera keeps running. */
  const cancelDemoCountdown = (open: DemoMode): void => {
    const demo = demoCamera;
    if (!demoOpen(open) || open.state.countdown === null) return;
    clearStatus();
    demo?.stopTimer();
    if (demo !== null) demo.stopTimer = () => undefined;
    open.state.countdown = null;
    drawDemo(open, ["demo-record"]);
  };

  /** "Aufnahme beenden", or the time is up: the camera stops and the recording becomes the new clip, shown until "Speichern". */
  const stopDemoRecording = (open: DemoMode): void => {
    const { state } = open;
    const demo = demoCamera;
    if (!demoOpen(open) || demo === null || demo.mode !== open || demo.camera === null || !state.recording) return;
    clearStatus();
    demo.stopTimer();
    demo.stopTimer = () => undefined;
    state.recording = false;
    state.reading = true;
    const camera = demo.camera;
    let stopping: Promise<Blob>;
    try {
      stopping = camera.stop();
    } catch (error) {
      stopping = Promise.reject(error);
    }
    // A recorder that never reports its end (card NG-60) does not leave the view reading: after DEMO_STOP_WAIT_MS it is given up.
    let cancelWait = (): void => undefined;
    const waited = new Promise<never>((_, reject) => {
      try {
        cancelWait = setTimer(() => reject(new DemoRecordingRefusal("unreadable")), DEMO_STOP_WAIT_MS);
      } catch {
        // Without a timer the view waits for the recorder.
      }
    });
    void Promise.race([stopping.finally(() => cancelWait()), waited])
      .then((blob) => makeClip(blob))
      .then((clip) => {
        if (!isDemoDataUrl(clip)) throw new DemoRecordingRefusal("unreadable");
        return { clip, line: null as string | null };
      }, (error: unknown) => ({ clip: null, line: DEMO_REFUSED[error instanceof DemoRecordingRefusal ? error.reason : "unreadable"] }))
      .catch(() => ({ clip: null, line: DEMO_REFUSED.unreadable }))
      .then(({ clip, line }) => {
        state.reading = false;
        if (demoCamera === demo) stopDemoCamera();
        else camera.close();
        // Left meanwhile: the clip is dropped.
        if (!demoOpen(open)) return;
        state.draft = clip;
        if (line !== null) say(line, true);
        drawDemo(open, clip === null ? ["demo-camera"] : ["demo-save"]);
      });
    drawDemo(open, ["demo-cancel"]);
  };

  /** Saves or deletes the clip of the open demo view, as one queued write. */
  const settleDemo = (write: (current: ProfileStore, open: DemoMode) => Promise<string>): void => {
    const mine = mode;
    if (mine === null || mine.kind !== "demo" || mine.state.busy || mine.state.reading || mine.state.recording || mine.state.countdown !== null) return;
    mine.state.busy = true;
    clearStatus();
    runWrite(async () => {
      try {
        if (store === null || mode !== mine) return;
        try {
          say(await write(store, mine));
          writes += 1;
          if (acting === session && mode === mine) mode = null;
          await draw([`demo:${mine.conceptId}`]);
        } catch (error) {
          if (error instanceof UnknownProfileError || error instanceof ProfileFormatError) {
            if (acting === session && mode === mine) mode = null;
            say(PROFILE_GONE, true);
            await draw(["profiles-heading"]);
            return;
          }
          if (error instanceof ProfileSizeError) say(DEMO_FULL, true);
          else if (error instanceof DemoClipError && error.kind === "unsupported-entry") say(`${NEWER_DEMO} Der Clip wurde nicht geändert.`, true);
          else say(`${WRITE_FAILED} Der Clip ist unverändert.`, true);
          // The write has ended: the redraw offers "Speichern" and the camera again, so the caregiver can retry (card NG-60).
          mine.state.busy = false;
          await draw(["demo-save", "demo-camera"], { toTop: true });
        }
      } finally {
        mine.state.busy = false;
      }
    });
  };

  const saveDemo = (): void => settleDemo(async (current, open) => {
    if (open.state.draft === null) throw new Refusal("no clip");
    stopDemoCamera();
    await setDemoClip(current, open.id, open.conceptId, open.state.draft);
    return `Gespeichert: Vormachen für ${quoted(open.title)}.`;
  });

  const deleteDemo = (): void => settleDemo(async (current, open) => {
    stopDemoCamera();
    await removeDemoClip(current, open.id, open.conceptId);
    return `Der Clip für ${quoted(open.title)} wurde gelöscht.`;
  });

  // --- Backup (card NG-58): a profile into a password-protected file, and back on any device ---
  const saveFileTo = options.saveFile ?? downloadFile;
  const readFileText = options.readFile ?? ((file: Blob): Promise<string> => file.text());
  const backupOptions = options.backupIterations === undefined ? {} : { iterations: options.backupIterations };
  /** The password fields and the file field of the open backup view, read when its button is pressed. */
  let backupFields: { password: HTMLInputElement; repeat: HTMLInputElement | null; file: HTMLInputElement | null } | null = null;

  /** "Sicherung speichern": the profile's export, encrypted with the typed password, handed over as a file. */
  const saveBackup = (open: BackupSaveMode): void => {
    const fields = backupFields;
    if (mode !== open || open.draft.busy || fields === null) return;
    clearStatus();
    const password = fields.password.value;
    if (!isBackupPassword(password)) {
      say(BACKUP_SHORT, true);
      run(() => draw(["backup-password"], { toTop: true }));
      return;
    }
    if (fields.repeat === null || fields.repeat.value !== password) {
      say(BACKUP_MISMATCH, true);
      run(() => draw(["backup-password"], { toTop: true }));
      return;
    }
    open.draft.busy = true;
    say(BACKUP_WORKING);
    run(async () => {
      try {
        if (store === null || mode !== open) return;
        const document = await exportProfile(store, open.id, { now: date });
        const text = await encryptBackup(document, password, backupOptions);
        const name = backupFileName(date());
        saveFileTo(new Blob([text], { type: "application/octet-stream" }), name);
        if (mode === open) mode = null;
        say(`Die Sicherung ist gespeichert: ${name}. Bitte die Datei und das Passwort gut aufheben.`);
        await draw([`backup-save:${open.id}`]);
      } catch (error) {
        open.draft.busy = false;
        if (error instanceof UnknownProfileError || error instanceof ProfileFormatError) {
          if (mode === open) mode = null;
          say(PROFILE_GONE, true);
          await draw(["profiles-heading"]);
          return;
        }
        say(error instanceof ExportSizeError ? BACKUP_TOO_LARGE : BACKUP_FAILED, true);
        await draw(["backup-password"], { toTop: true });
      }
    });
  };

  /** Puts a checked export onto the device; a profile that is there already asks first (`conflict`). */
  const restoreExport = async (current: ProfileStore, open: BackupRestoreMode, document: ProfileExportV1, onConflict: "reject" | "replace" | "copy"): Promise<void> => {
    let profile: ProfileV1;
    try {
      profile = await importProfile(current, document, { onConflict });
    } catch (error) {
      if (error instanceof ProfileConflictError && onConflict === "reject") {
        open.draft.conflict = document;
        open.draft.busy = false;
        await draw(["restore-replace"], { toTop: true });
        return;
      }
      throw error;
    }
    writes += 1;
    let activated = false;
    // A device without an active board shows the restored one to the child: that is what moving to a new device is for.
    if ((await current.getActive()) === null) {
      await current.setActive(profile.id);
      activated = true;
    }
    if (mode === open) mode = null;
    selectedId = profile.id;
    say(`Eingespielt: Tafel von ${quoted(profile.displayName)}.${activated ? " Sie ist jetzt die aktive Tafel." : ""}`);
    await draw([`edit:${profile.id}`, "profiles-heading"]);
  };

  /** A German line for a restore that did not work; nothing was written. */
  const restoreErrorLine = (error: unknown): string => {
    if (error instanceof BackupFileError) return error.reason === "password" ? RESTORE_WRONG_PASSWORD : RESTORE_NOT_BACKUP;
    if (error instanceof ExportSizeError || error instanceof ProfileSizeError) return RESTORE_TOO_LARGE;
    return RESTORE_FAILED;
  };

  /** "Einspielen": the chosen file, read with its password, then put onto the device. */
  const restoreBackup = (open: BackupRestoreMode): void => {
    const fields = backupFields;
    if (mode !== open || open.draft.busy || fields === null) return;
    clearStatus();
    const file = fields.file?.files?.[0];
    if (file === undefined) {
      say(RESTORE_NO_FILE, true);
      run(() => draw(["restore-file"], { toTop: true }));
      return;
    }
    const password = fields.password.value;
    if (password === "") {
      say(RESTORE_NO_PASSWORD, true);
      run(() => draw(["restore-file"], { toTop: true }));
      return;
    }
    if (file.size > MAX_BACKUP_FILE_BYTES) {
      say(RESTORE_TOO_LARGE, true);
      run(() => draw(["restore-file"], { toTop: true }));
      return;
    }
    open.draft.busy = true;
    say(RESTORE_WORKING);
    runWrite(async () => {
      try {
        if (store === null || mode !== open) return;
        const document = await decryptBackup(await readFileText(file), password);
        await restoreExport(store, open, document, "reject");
      } catch (error) {
        open.draft.busy = false;
        say(restoreErrorLine(error), true);
        await draw(["restore-file"], { toTop: true });
      }
    });
  };

  /** "Ersetzen" or "Als Kopie einspielen" after the conflict question. */
  const settleRestoreConflict = (open: BackupRestoreMode, onConflict: "replace" | "copy"): void => {
    const document = open.draft.conflict;
    if (mode !== open || open.draft.busy || document === null) return;
    clearStatus();
    open.draft.busy = true;
    runWrite(async () => {
      try {
        if (store === null || mode !== open) return;
        await restoreExport(store, open, document, onConflict);
      } catch (error) {
        open.draft.busy = false;
        open.draft.conflict = null;
        say(restoreErrorLine(error), true);
        await draw(["restore-file"], { toTop: true });
      }
    });
  };

  const resetWording = (): void => settleWording(async (current, open) => {
    await clearWording(current, open.id, open.conceptId, catalogue);
    const known = catalogue.find((concept) => concept.id === open.conceptId);
    return `${quoted(known?.labelDe ?? open.conceptId)} hat wieder den Text der App.`;
  });

  /** The teaching view of `mode`, while it is the open one. */
  const teaching = (open: TeachMode): boolean => mode === open && isOpen;

  /** Redraws the teaching view (queued), with the focus on the first of `focus` that is there. */
  const drawTeach = (open: TeachMode, focus: readonly string[]): void => {
    run(async () => {
      if (mode === open) await draw([...focus, "teach-back"]);
    });
  };

  /**
   * Opens the teaching view of one concept. Before anything is recorded, the
   * profile's size is read (`store.usage`, which counts the whole profile:
   * once per opening, not on every redraw), so that a profile near or at its
   * limit is said before recording.
   */
  const openTeach = (profileId: string, conceptId: string): void => {
    clearStatus();
    dropHold();
    stopTeachCamera();
    const open: TeachMode = {
      kind: "teach", id: profileId, conceptId,
      state: {
        usage: null, camera: "off", cameraLine: "", cameraProblem: false, live: "", recording: false, countdown: null, result: null, note: null, confirm: null, busy: false, fit: null, replay: null,
      },
    };
    mode = open;
    run(async () => {
      if (store !== null && mode === open) {
        try {
          open.state.usage = usageLevel(await store.usage(profileId));
        } catch {
          open.state.usage = "unknown";
        }
      }
      await draw(["teach-heading"], { toTop: true });
    });
  };

  /** "Kamera starten": the camera only after this tap, through the capture module's bridge. */
  const startTeachCamera = (open: TeachMode): void => {
    const { state } = open;
    if (!teaching(open) || teachCamera !== null || state.usage === "full" || state.confirm !== null) return;
    clearStatus();
    const bridge = options.capture === undefined
      ? ((globalThis as Record<string, unknown>)[CAPTURE_BRIDGE_KEY] as CaptureBridge | undefined) ?? null
      : options.capture;
    if (bridge === null) {
      state.cameraLine = NO_CAMERA_BRIDGE;
      state.cameraProblem = true;
      drawTeach(open, ["teach-camera"]);
      return;
    }
    const controller = new AbortController();
    const asked = currentFacing();
    let preview: CapturePreview | null = null;
    try {
      preview = bridge.createPreview?.(document) ?? null;
    } catch {
      // Without a preview the live line is still there.
    }
    const camera: TeachCamera = { mode: open, controller, session: null, stopTimer: () => undefined, preview };
    teachCamera = camera;
    const ours = (): boolean => teachCamera === camera && !controller.signal.aborted;
    let shoulders = { seen: false, posesWithout: 0 };
    state.camera = "starting";
    state.note = null;
    state.cameraLine = bridge.text.preparing;
    state.cameraProblem = false;
    state.live = "";
    drawTeach(open, ["teach-camera"]);
    const ended = (line: string, problem: boolean): void => {
      if (teachCamera === camera) {
        teachCamera = null;
        camera.stopTimer();
      }
      preview?.close();
      state.camera = "off";
      state.recording = false;
      state.countdown = null;
      state.live = "";
      state.cameraLine = line;
      state.cameraProblem = problem;
      if (teaching(open) && state.confirm === null) drawTeach(open, ["teach-camera"]);
    };
    let started: Promise<Awaited<ReturnType<CaptureBridge["start"]>>>;
    try {
      started = bridge.start(caregiverRegion, {
        signal: controller.signal,
        facing: asked,
        ...(preview === null ? {} : { preview }),
        onStep: (step) => {
          if (!ours() || step === "stopped" || step === "running") return;
          state.cameraLine = bridge.text[step];
          if (teachCameraLine !== null && teachCameraLine.textContent !== state.cameraLine) {
            teachCameraLine.textContent = state.cameraLine;
            // The line may change its height: what is below it moves.
            markSwap();
          }
        },
        onFrame: (frame) => {
          if (!ours()) return;
          const summary = frameSummary(frame);
          shoulders = bridge.nextShoulders(shoulders, summary.shoulders, frame.poseRan);
          state.live = `${bridge.text.hands[summary.hands]} ${bridge.text.shoulders[shoulders.seen ? 1 : 0]}`;
          // Written in place, without a redraw and without counting as a swap: the line is below the buttons and keeps its height.
          if (teachLive !== null && teachLive.textContent !== state.live) teachLive.textContent = state.live;
        },
      });
    } catch {
      ended(bridge.text.problems.tracker_unavailable, true);
      return;
    }
    void started.then((answer) => {
      if (!answer.ok) {
        if (teachCamera === camera) ended("problem" in answer ? bridge.text.problems[answer.problem] : "", "problem" in answer);
        return;
      }
      if (!ours()) {
        answer.session.stop();
        return;
      }
      camera.session = answer.session;
      state.camera = "on";
      // The chosen camera could not be used and the other one runs (card NG-43): said in the camera's line until the countdown.
      state.cameraLine = answer.camera?.fellBack === true ? bridge.text.cameraFallback?.[asked] ?? "" : "";
      drawTeach(open, ["teach-record"]);
      void answer.session.ended.then((end) => {
        if (teachCamera !== camera) return;
        ended(end.kind === "problem" ? bridge.text.problems[end.problem] : bridge.text.stopped, end.kind === "problem");
      });
    }, () => {
      if (teachCamera === camera) ended(bridge.text.problems.tracker_unavailable, true);
    });
  };

  /** Whether the camera choice can be changed now: not while a countdown or recording runs, a recording waits, or a keep or delete runs. */
  const facingChangeable = (state: TeachState): boolean => state.countdown === null && !state.recording && state.result?.usable !== true && !state.busy && state.confirm === null;

  /**
   * "vorne" / "hinten" (card NG-43): remembers the choice on this device. A
   * camera that is starting or running (and records nothing) is stopped and
   * started again with the chosen one; otherwise the next "Kamera starten"
   * uses it.
   */
  const chooseTeachFacing = (open: TeachMode, chosen: CameraFacing): void => {
    const { state } = open;
    if (!teaching(open) || !facingChangeable(state) || state.usage === "full") return;
    const before = currentFacing();
    facing = chosen;
    try {
      cameraStorage()?.setItem(CAMERA_FACING_KEY, chosen);
    } catch {
      // Not remembered on the device; held while the page is open.
    }
    if (before === chosen) return;
    const restart = teachCamera !== null && teachCamera.mode === open;
    if (restart) {
      stopTeachCamera();
      state.cameraProblem = false;
      startTeachCamera(open);
      return;
    }
    // A problem said about the other camera no longer applies.
    if (state.cameraProblem) {
      state.cameraProblem = false;
      state.cameraLine = "";
    }
    drawTeach(open, [`teach-facing:${chosen}`]);
  };

  /** Says what an action of the teaching view came to, under its controls; only while that view is the open one. */
  const teachSay = (open: TeachMode, text: string, error = false): void => {
    if (acting === session && mode === open) open.state.note = text === "" ? null : { text, error };
  };

  /**
   * "Aufnahme starten": first `TEACH_COUNTDOWN_S` seconds are counted down
   * (the hand that tapped can leave the picture; "Abbrechen" and every way out
   * of the view end it), then frames are kept, in memory, until "Aufnahme
   * beenden" or `TEACH_MAX_RECORDING_MS`.
   */
  const startTeachRecording = (open: TeachMode): void => {
    const { state } = open;
    const camera = teachCamera;
    if (!teaching(open) || camera === null || camera.mode !== open || camera.session === null) return;
    if (state.recording || state.countdown !== null || state.result?.usable === true) return;
    clearStatus();
    state.result = null;
    state.note = null;
    state.countdown = TEACH_COUNTDOWN_S;
    const ours = (): boolean => teachCamera === camera && state.countdown !== null && mode === open;
    const tick = (): void => {
      if (!ours()) return;
      const left = (state.countdown ?? 1) - 1;
      if (left > 0) {
        state.countdown = left;
        // The line keeps its height (style sheet): written in place, nothing moves.
        if (teachCameraLine !== null) teachCameraLine.textContent = COUNTDOWN_LINE(left);
        schedule(tick, 1000);
        return;
      }
      state.countdown = null;
      camera.session?.startRecording();
      state.recording = true;
      const capturedAt = date();
      recordingStartedAt = capturedAt;
      schedule(() => stopTeachRecording(open, true, capturedAt), TEACH_MAX_RECORDING_MS);
      drawTeach(open, ["teach-stop"]);
    };
    /** One timer at a time, on the camera: stopping the camera cancels it. */
    const schedule = (callback: () => void, milliseconds: number): void => {
      camera.stopTimer();
      try {
        camera.stopTimer = setTimer(callback, milliseconds);
      } catch {
        // Without a timer nothing is counted: the recording starts at once and ends by the tap only.
        camera.stopTimer = () => undefined;
        if (state.countdown !== null) {
          state.countdown = 1;
          tick();
        }
      }
    };
    schedule(tick, 1000);
    drawTeach(open, ["teach-cancel"]);
  };
  /** When the running recording began: the capture time of the example. */
  let recordingStartedAt = new Date(0);

  /** "Abbrechen" during the countdown: nothing is recorded, the camera keeps running. */
  const cancelTeachCountdown = (open: TeachMode): void => {
    const camera = teachCamera;
    if (!teaching(open) || open.state.countdown === null) return;
    clearStatus();
    camera?.stopTimer();
    if (camera !== null) camera.stopTimer = () => undefined;
    open.state.countdown = null;
    drawTeach(open, ["teach-record"]);
  };

  /** "Aufnahme beenden", or the time is up: the recording goes through the matcher's feature building, nothing is stored yet. */
  const stopTeachRecording = (open: TeachMode, auto: boolean, capturedAt: Date = recordingStartedAt): void => {
    const { state } = open;
    const camera = teachCamera;
    if (camera === null || camera.mode !== open || camera.session === null || !state.recording) return;
    if (!auto) clearStatus();
    camera.stopTimer();
    camera.stopTimer = () => undefined;
    const frames = camera.session.stopRecording();
    state.recording = false;
    const result = sequenceFromRecording(frames);
    state.result = result.ok
      ? { usable: true, sequence: result.sequence, frames: result.frames, durationMs: result.durationMs, capturedAt, auto, stillHand: result.stillHand }
      : { usable: false, reason: result.reason, auto };
    drawTeach(open, result.ok ? ["teach-keep"] : ["teach-record"]);
  };

  /** "Behalten": one write through the store. A refusal is said and not retried by itself. */
  const keepTeachResult = (open: TeachMode): void => {
    const { state } = open;
    const result = state.result;
    if (!teaching(open) || result === null || !result.usable || state.busy) return;
    clearStatus();
    state.busy = true;
    runWrite(async () => {
      try {
        if (store === null || mode !== open || state.result !== result) return;
        try {
          await saveExample(store, open.id, open.conceptId, result.sequence, { capturedAt: result.capturedAt, frames: result.frames, durationMs: result.durationMs });
          writes += 1;
          state.result = null;
          const count = (await listExamples(store, open.id, open.conceptId)).examples.length;
          teachSay(open, `Das Beispiel wurde gespeichert. Für diese Taste ${count === 1 ? "ist" : "sind"} jetzt ${examplesText(count)} gespeichert.`);
        } catch (error) {
          if (error instanceof UnknownProfileError || error instanceof ProfileFormatError) {
            stopTeachCamera();
            if (acting === session && mode === open) mode = null;
            say(PROFILE_GONE, true);
            await draw(["profiles-heading"]);
            return;
          }
          if (error instanceof ProfileSizeError) {
            // Not tried again: the store counted the whole profile to refuse it. The recording goes, and so does the camera's offer.
            state.result = null;
            state.usage = "full";
            stopTeachCamera();
            teachSay(open, EXAMPLE_FULL, true);
          } else {
            teachSay(open, EXAMPLE_NOT_SAVED, true);
          }
        }
        await draw(["teach-record", "teach-keep", "teach-camera"]);
      } finally {
        state.busy = false;
      }
    });
  };

  /** "Verwerfen": the recording is forgotten; nothing was stored. */
  const discardTeachResult = (open: TeachMode): void => {
    if (!teaching(open) || open.state.result === null || open.state.busy) return;
    clearStatus();
    open.state.result = null;
    run(async () => {
      teachSay(open, "Die Aufnahme wurde verworfen. Es wurde nichts gespeichert.");
      if (mode === open) await draw(["teach-record", "teach-camera"]);
    });
  };

  /** Opens the delete confirmation of one example or of all of them. The camera stops: the confirmation takes over the body. */
  const confirmTeachDelete = (open: TeachMode, confirm: TeachConfirm): void => {
    const { state } = open;
    if (!teaching(open) || state.recording || state.countdown !== null || state.result !== null || state.busy) return;
    clearStatus();
    dropHold();
    stopTeachCamera();
    state.note = null;
    state.cameraLine = "";
    state.cameraProblem = false;
    state.confirm = confirm;
    run(() => draw(["confirm-cancel"], { toTop: true }));
  };

  /**
   * What a delete that failed partway came to, read from the store again: it
   * may have deleted some examples before it stopped. Never claims more than
   * the store says.
   */
  const deleteFailedLine = async (current: ProfileStore, open: TeachMode, confirm: TeachConfirm): Promise<{ text: string; error: boolean }> => {
    let listing: ExampleListing;
    try {
      listing = await listExamples(current, open.id, open.conceptId);
    } catch {
      return { text: `${WRITE_FAILED} Wie viele Beispiele noch gespeichert sind, kann gerade nicht gelesen werden.`, error: true };
    }
    if (confirm.kind === "one") {
      const left = listing.examples.some((example) => example.name === confirm.name) || listing.damaged.some((entry) => entry.name === confirm.name);
      return left ? { text: `${WRITE_FAILED} Beispiel ${confirm.number} ist noch gespeichert.`, error: true } : { text: `Beispiel ${confirm.number} wurde gelöscht.`, error: false };
    }
    const remaining = listing.examples.length + listing.damaged.filter((entry) => entry.kind !== "unsupported-version").length;
    const deleted = Math.max(0, confirm.count - remaining);
    return {
      text: `Das Löschen wurde unterbrochen: ${deleted === 1 ? "1 Beispiel wurde" : `${deleted} Beispiele wurden`} gelöscht, `
        + `${remaining === 1 ? "1 ist" : `${remaining} sind`} noch gespeichert. Bitte noch einmal versuchen.`,
      error: true,
    };
  };

  /** Carries out the open delete confirmation, if it is still the open one at the release and when the queue gets to it. */
  const deleteTeachExamples = (open: TeachMode, confirm: TeachConfirm): boolean => {
    if (mode !== open || open.state.confirm !== confirm) return false;
    begin(true);
    runWrite(async () => {
      if (store === null || mode !== open || open.state.confirm !== confirm) return;
      try {
        if (confirm.kind === "one") {
          await deleteExample(store, open.id, confirm.name);
          writes += 1;
          teachSay(open, `Beispiel ${confirm.number} wurde gelöscht.`);
        } else {
          const count = await deleteExamples(store, open.id, open.conceptId);
          writes += 1;
          teachSay(open, count === 1 ? "1 Beispiel wurde gelöscht." : `${count} Beispiele wurden gelöscht.`);
        }
      } catch (error) {
        if (error instanceof UnknownProfileError || error instanceof ProfileFormatError) {
          if (acting === session && mode === open) mode = null;
          say(PROFILE_GONE, true);
          await draw(["profiles-heading"]);
          return;
        }
        if (error instanceof ExampleFormatError && error.kind === "unsupported-version") teachSay(open, NEWER_EXAMPLE, true);
        else {
          const line = await deleteFailedLine(store, open, confirm);
          teachSay(open, line.text, line.error);
        }
      }
      if (acting === session && mode === open) open.state.confirm = null;
      // There may be room again: the size is read once more (a deliberate action, not a loop).
      try {
        open.state.usage = usageLevel(await store.usage(open.id));
      } catch {
        open.state.usage = "unknown";
      }
      await draw(["teach-heading"]);
    });
    return true;
  };

  /** `raw` is the name as it was when the form was sent. */
  const renameProfile = (id: string, raw: string): void => {
    clearStatus();
    // The field stays open while the name is saved; it closes, or keeps what was typed, only if it is still this one then.
    // A form that is no longer on screen has no field to close: whatever is open instead stays as it is.
    const mine = mode !== null && mode.kind === "rename" && mode.id === id ? mode : null;
    const settle = (next: Mode): void => {
      if (acting === session && mine !== null && mode === mine) mode = next;
    };
    runWrite(async () => {
      if (store === null) return;
      try {
        const others = (await store.list()).profiles;
        if (nameTaken(others, raw, id)) throw new Refusal(nameTakenLine(others, raw));
        const profile = await store.rename(id, raw);
        writes += 1;
        settle(null);
        say(`Das Profil heißt jetzt ${quoted(profile.displayName)}.`);
        await draw([`rename:${id}`]);
      } catch (error) {
        // `ProfileFormatError` is also what a damaged record gives; only a readable profile has a name to refuse.
        const gone = error instanceof UnknownProfileError
          || (error instanceof ProfileFormatError && await store.get(id).then(() => false, () => true));
        if (gone) {
          settle(null);
          say(PROFILE_GONE, true);
          await draw(["profiles-heading"]);
          return;
        }
        // Refused or not written: the field stays open with what was typed.
        settle({ kind: "rename", id, draft: raw });
        say(error instanceof Refusal ? error.message : nameErrorLine(error, raw), true);
        await draw(["rename-name"]);
      }
    });
  };

  /** Asks for the delete of the profile whose confirmation is open. False when nothing was asked for. */
  const deleteProfile = (profile: ProfileV1, label: string): boolean => {
    // Only while the confirmation for this profile is the one that is open.
    const mine = mode;
    if (mine === null || mine.kind !== "delete" || mine.id !== profile.id) return false;
    begin(true);
    runWrite(async () => {
      if (store === null) return;
      const leave = (): void => {
        if (acting === session && mode === mine) mode = null;
      };
      // The delete may have waited behind a slow write. "Abbrechen" or Escape in that time takes it back, and a
      // second hold on the confirmation that was still drawn finds it closed by the first: one delete, one message.
      if (mode !== mine) return;
      try {
        const wasActive = (await store.getActive()) === profile.id;
        await store.remove(profile.id);
        writes += 1;
        leave();
        if (selectedId === profile.id) selectedId = null;
        // Nothing is made active in its place: which board the child gets is a caregiver's choice.
        say(wasActive ? `Das Profil ${quoted(label)} wurde gelöscht. Gerade ist keine Tafel aktiv.` : `Das Profil ${quoted(label)} wurde gelöscht.`);
        await draw(["profiles-heading"]);
      } catch (error) {
        leave();
        say(error instanceof UnknownProfileError ? PROFILE_GONE : WRITE_FAILED, true);
        await draw([`delete:${profile.id}`, "profiles-heading"]);
      }
    });
    return true;
  };

  /** Picture (if any), label and sentence of one row. */
  const conceptText = (shown: { labelDe: string; speechDe: string; symbolPath: string | null } | null, fallback: string, examples?: number): HTMLElement => {
    const text = element("div", "caregiver-concept-text");
    if (shown === null) {
      text.append(element("span", "caregiver-concept-name", fallback));
      return text;
    }
    if (isPictureSource(shown.symbolPath)) {
      text.className = "caregiver-concept-text caregiver-concept-pictured";
      const picture = element("img", "");
      picture.src = shown.symbolPath;
      picture.alt = "";
      picture.width = 48;
      picture.height = 48;
      text.append(picture);
    }
    text.append(element("span", "caregiver-concept-name", shown.labelDe), element("span", "caregiver-concept-sentence", shown.speechDe));
    const gesture = gestureLine(examples);
    if (gesture !== null) text.append(gesture);
    return text;
  };

  /** "Bild wählen" for one concept of a board (card NG-8673323346005092805). */
  const pictureButton = (profileId: string, entry: BoardEntry, register: Map<string, Focusable>): HTMLButtonElement => {
    const control = button(PICTURE);
    control.setAttribute("aria-label", `${PICTURE}: ${entry.labelDe}`);
    control.addEventListener("click", () => openMode({
      kind: "picture", id: profileId, conceptId: entry.id, title: entry.labelDe, source: entry.source,
      draft: { picture: null, reading: false, busy: false, choice: 0 },
    }, "picture-file"));
    register.set(`picture:${entry.id}`, control);
    return control;
  };

  /**
   * The picture of one concept. Like the rewording it is the whole body while
   * it is open: what is on the key now, the file picker, the chosen picture,
   * and the notice that the picture stays on the device and needs the right
   * to use it.
   */
  const pictureView = (open: PictureMode, entry: BoardEntry, profileLabel: string, register: Map<string, Focusable>): HTMLElement => {
    const view = element("section", "caregiver-section caregiver-takeover caregiver-picture");
    view.append(element("h2", "", `Bild für ${quoted(entry.labelDe)} – Tafel von ${quoted(profileLabel)}`));
    const onKey = element("div", "caregiver-picture-now");
    const current = entry.symbolPath === null ? null : previewImage(entry.symbolPath);
    if (current === null) onKey.append(element("p", "caregiver-notice", PICTURE_NONE));
    else onKey.append(element("p", "caregiver-notice", PICTURE_NOW), current);
    view.append(onKey, element("p", "caregiver-notice", PICTURE_LOCAL), element("p", "caregiver-notice", PICTURE_RIGHTS));
    const label = element("label", "caregiver-picture-label", PICTURE_FILE);
    label.htmlFor = "caregiver-picture-file";
    const input = element("input", "caregiver-picture-file");
    input.type = "file";
    input.id = "caregiver-picture-file";
    input.accept = PICTURE_TYPES.join(",");
    const hint = element("p", "caregiver-notice caregiver-name-notice", PICTURE_FILE_HINT);
    hint.id = "caregiver-picture-hint";
    input.setAttribute("aria-describedby", hint.id);
    input.disabled = open.draft.busy;
    input.addEventListener("change", () => choosePicture(open, input.files?.[0]));
    register.set("picture-file", input);
    register.set("anchor:picture-file", view);
    view.append(label, input, hint);
    if (open.draft.reading) view.append(element("p", "caregiver-notice", PICTURE_READING));
    const preview = open.draft.picture === null ? null : previewImage(open.draft.picture);
    if (preview !== null) {
      const chosen = element("div", "caregiver-picture-new");
      chosen.append(element("p", "caregiver-notice", PICTURE_NEW), preview);
      view.append(chosen);
    }
    const actions = element("div", "caregiver-profile-actions");
    if (open.draft.picture !== null) {
      const save = button(SAVE, "caregiver-button caregiver-primary");
      save.addEventListener("click", () => {
        if (aimed(now())) savePicture();
      });
      register.set("picture-save", save);
      actions.append(save);
    }
    const cancel = button(CANCEL);
    cancel.addEventListener("click", leaveMode);
    register.set("picture-cancel", cancel);
    actions.append(cancel);
    view.append(actions);
    // Only where there is an own picture to take away.
    if (entry.ownSymbol === true) {
      const known = catalogue.find((concept) => concept.id === entry.id && entry.source === "catalogue");
      const reset = button(known !== undefined ? PICTURE_RESET : PICTURE_REMOVE);
      reset.addEventListener("click", () => {
        if (aimed(now())) removePicture();
      });
      register.set("picture-reset", reset);
      view.append(reset);
    }
    return view;
  };

  /** "Vormachen" for one concept of a board (card NG-56); null where "Gebärde beibringen" is not offered either. */
  const demoButton = (profileId: string, entry: BoardEntry, register: Map<string, Focusable>): HTMLButtonElement | null => {
    if (!isExampleConceptId(entry.id)) return null;
    const control = button(DEMO);
    control.setAttribute("aria-label", `${DEMO}: ${entry.labelDe}`);
    control.addEventListener("click", () => openDemo(profileId, entry));
    register.set(`demo:${entry.id}`, control);
    return control;
  };

  /**
   * A clip to watch in the demo view, put into `holder`: muted, inline, with the browser's controls. A clip
   * this browser cannot play (card NG-59: one recorded on another device) is replaced by a line saying so.
   */
  const clipVideo = (dataUrl: string, className: string, holder: HTMLElement, unplayable?: () => void): HTMLVideoElement | null => {
    if (!isDemoDataUrl(dataUrl)) {
      holder.append(element("p", "caregiver-notice caregiver-warning", DEMO_UNPLAYABLE));
      return null;
    }
    const video = element("video", className);
    video.muted = true;
    video.playsInline = true;
    video.loop = true;
    video.controls = true;
    video.preload = "metadata";
    video.addEventListener("error", () => {
      if (video.hidden) return;
      if (unplayable !== undefined) {
        unplayable();
        return;
      }
      // A status line, so a screen reader says it; a focus on the player's controls moves to it (card NG-60).
      const hadFocus = typeof document !== "undefined" && document.activeElement === video;
      video.hidden = true;
      const line = element("p", "caregiver-notice caregiver-warning", DEMO_UNPLAYABLE);
      line.setAttribute("role", "status");
      line.tabIndex = -1;
      holder.append(line);
      if (hadFocus) line.focus();
    });
    video.src = dataUrl;
    holder.append(video);
    return video;
  };

  /**
   * The demo clip of one concept (card NG-56). Like the teaching view it is the
   * whole body while it is open: what it is for, that only adults are recorded
   * and where the clip is kept, the stored clip, the camera and the new clip.
   */
  const demoView = (open: DemoMode, stored: StoredDemoClip, profileLabel: string, register: Map<string, Focusable>): HTMLElement => {
    const { state } = open;
    const view = element("section", "caregiver-section caregiver-takeover caregiver-demo");
    const heading = element("h2", "", `${DEMO} für ${quoted(open.title)} – Tafel von ${quoted(profileLabel)}`);
    heading.tabIndex = -1;
    register.set("demo-heading", heading);
    view.append(heading, element("p", "caregiver-notice", DEMO_INTRO), element("p", "caregiver-notice caregiver-warning", DEMO_ADULTS),
      element("p", "caregiver-notice", DEMO_LOCAL));
    register.set("anchor:demo-camera", view);
    const cameraRuns = state.camera !== "off";
    if (!cameraRuns && state.draft === null && !state.reading) {
      if (stored.state === "ok") {
        const shown = element("div", "caregiver-demo-now");
        shown.append(element("p", "caregiver-notice", DEMO_NOW));
        clipVideo(stored.dataUrl, "caregiver-demo-clip", shown);
        view.append(shown);
      } else if (stored.state === "missing") {
        view.append(element("p", "caregiver-notice", DEMO_NONE));
      } else {
        view.append(element("p", "caregiver-notice caregiver-warning", stored.damage === "unsupported-version" ? NEWER_DEMO : DEMO_DAMAGED));
      }
    }
    if (cameraRuns) {
      demoPreviewSlot = element("div", "caregiver-demo-preview");
      const text = state.camera === "starting" ? DEMO_STARTING
        : state.countdown !== null ? COUNTDOWN_LINE(state.countdown)
          : state.recording ? DEMO_RECORDING : state.reading ? DEMO_READING : DEMO_READY;
      demoLine = element("p", "caregiver-teach-camera", text);
      demoLine.setAttribute("role", "status");
      view.append(demoPreviewSlot, demoLine);
    } else {
      demoPreviewSlot = null;
      demoLine = null;
    }
    if (state.reading && !cameraRuns) view.append(element("p", "caregiver-notice", DEMO_READING));
    if (state.draft !== null) {
      const chosen = element("div", "caregiver-demo-new");
      chosen.append(element("p", "caregiver-notice", DEMO_NEW));
      // A new clip this browser cannot play is not offered for saving (card NG-60): it is dropped, and the line asks to record again.
      const draft = state.draft;
      const video = clipVideo(draft, "caregiver-demo-clip", chosen, () => {
        if (!demoOpen(open) || state.draft !== draft) return;
        state.draft = null;
        say(DEMO_DRAFT_UNPLAYABLE, true);
        drawDemo(open, ["demo-camera"]);
      });
      if (video !== null) video.autoplay = true;
      view.append(chosen);
    }
    const actions = element("div", "caregiver-profile-actions");
    const add = (text: string, key: string, act: () => void, primary = false): void => {
      const control = button(text, primary ? "caregiver-button caregiver-primary" : "caregiver-button");
      control.disabled = state.busy;
      control.addEventListener("click", () => {
        if (aimed(now())) act();
      });
      register.set(key, control);
      actions.append(control);
    };
    if (state.draft !== null && !cameraRuns) add(SAVE, "demo-save", saveDemo, true);
    // A clip a newer version stored cannot be replaced by this one: nothing to record for.
    const newerStored = stored.state === "damaged" && stored.damage === "unsupported-version";
    if (state.camera === "off" && !state.reading && !newerStored) add(CAMERA_START, "demo-camera", () => startDemoCamera(open), state.draft === null);
    if (state.camera === "on" && state.countdown === null && !state.recording && !state.reading) add(RECORD_START, "demo-record", () => startDemoRecording(open), true);
    if (state.countdown !== null) add(CANCEL_COUNTDOWN, "demo-countdown-cancel", () => cancelDemoCountdown(open));
    if (state.recording) add(RECORD_STOP, "demo-stop", () => stopDemoRecording(open), true);
    const back = button(state.draft !== null ? DISCARD : BACK);
    back.addEventListener("click", leaveMode);
    register.set("demo-cancel", back);
    actions.append(back);
    view.append(actions);
    // Only where there is a clip to take away, and not while a new one is made.
    if (stored.state !== "missing" && !cameraRuns && state.draft === null && !state.reading) {
      const remove = button(DEMO_DELETE);
      remove.disabled = state.busy;
      remove.addEventListener("click", () => {
        if (aimed(now())) deleteDemo();
      });
      register.set("demo-delete", remove);
      view.append(remove);
    }
    return view;
  };

  /** A password field of a backup view. */
  const passwordField = (id: string, text: string, autocomplete: string, register: Map<string, Focusable>, key: string): { label: HTMLLabelElement; input: HTMLInputElement } => {
    const label = element("label", "caregiver-backup-label", text);
    label.htmlFor = id;
    const input = element("input", "caregiver-input caregiver-backup-password");
    input.type = "password";
    input.id = id;
    input.setAttribute("autocomplete", autocomplete);
    input.setAttribute("autocapitalize", "off");
    input.spellcheck = false;
    register.set(key, input);
    return { label, input };
  };

  /** "Sicherung speichern" of one profile (card NG-58): what the file holds, that it is private, and the password twice. */
  const backupSaveView = (open: BackupSaveMode, profileLabel: string, register: Map<string, Focusable>): HTMLElement => {
    const view = element("section", "caregiver-section caregiver-takeover caregiver-backup");
    view.append(element("h2", "", `Sicherung von ${quoted(profileLabel)}`), element("p", "caregiver-notice", BACKUP_WHAT),
      element("p", "caregiver-notice caregiver-warning", BACKUP_PRIVATE));
    const form = element("form", "caregiver-backup-form");
    const first = passwordField("caregiver-backup-password", BACKUP_PASSWORD, "new-password", register, "backup-password");
    const second = passwordField("caregiver-backup-repeat", BACKUP_REPEAT, "new-password", register, "backup-repeat");
    backupFields = { password: first.input, repeat: second.input, file: null };
    const save = element("button", "caregiver-button caregiver-primary", BACKUP_SAVE);
    save.type = "submit";
    save.disabled = open.draft.busy;
    register.set("backup-go", save);
    const cancel = button(CANCEL);
    cancel.addEventListener("click", leaveMode);
    register.set("backup-cancel", cancel);
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      if (aimed(now())) saveBackup(open);
    });
    const actions = element("div", "caregiver-profile-actions");
    actions.append(save, cancel);
    form.append(first.label, first.input, second.label, second.input, actions);
    register.set("anchor:backup-password", view);
    view.append(form);
    return view;
  };

  /** "Sicherung einspielen" (card NG-58): the file and its password; or, for a profile that is here already, the choice. */
  const backupRestoreView = (open: BackupRestoreMode, register: Map<string, Focusable>): HTMLElement => {
    const view = element("section", "caregiver-section caregiver-takeover caregiver-backup");
    view.append(element("h2", "", BACKUP_RESTORE));
    const actions = element("div", "caregiver-profile-actions");
    const cancel = button(CANCEL);
    cancel.addEventListener("click", leaveMode);
    register.set("restore-cancel", cancel);
    const conflict = open.draft.conflict;
    if (conflict !== null) {
      backupFields = null;
      view.append(element("p", "caregiver-notice caregiver-warning", restoreConflictLine(conflict.profile.displayName)), element("p", "caregiver-notice", RESTORE_CONFLICT_HELP));
      const replace = button(RESTORE_REPLACE, "caregiver-button caregiver-danger-quiet");
      replace.disabled = open.draft.busy;
      replace.addEventListener("click", () => {
        if (aimed(now())) settleRestoreConflict(open, "replace");
      });
      register.set("restore-replace", replace);
      const copy = button(RESTORE_COPY, "caregiver-button caregiver-primary");
      copy.disabled = open.draft.busy;
      copy.addEventListener("click", () => {
        if (aimed(now())) settleRestoreConflict(open, "copy");
      });
      register.set("restore-copy", copy);
      actions.append(copy, replace, cancel);
      view.append(actions);
      return view;
    }
    view.append(element("p", "caregiver-notice", RESTORE_INTRO));
    const form = element("form", "caregiver-backup-form");
    const fileLabel = element("label", "caregiver-backup-label", RESTORE_FILE);
    fileLabel.htmlFor = "caregiver-restore-file";
    const file = element("input", "caregiver-restore-file");
    file.type = "file";
    file.id = "caregiver-restore-file";
    file.accept = ".amysecho,application/octet-stream,application/json";
    register.set("restore-file", file);
    const password = passwordField("caregiver-restore-password", RESTORE_PASSWORD, "current-password", register, "restore-password");
    backupFields = { password: password.input, repeat: null, file };
    const go = element("button", "caregiver-button caregiver-primary", RESTORE_GO);
    go.type = "submit";
    go.disabled = open.draft.busy;
    register.set("restore-go", go);
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      if (aimed(now())) restoreBackup(open);
    });
    actions.append(go, cancel);
    form.append(fileLabel, file, password.label, password.input, actions);
    register.set("anchor:restore-file", view);
    view.append(form);
    return view;
  };

  /** "Text ändern" for one concept of a board: opens the rewording with the wording that is stored now. */
  const rewordButton = (profileId: string, entry: BoardEntry, register: Map<string, Focusable>): HTMLButtonElement => {
    const control = button(REWORD);
    control.setAttribute("aria-label", `${REWORD}: ${entry.labelDe}`);
    control.addEventListener("click", () => openMode({
      kind: "reword", id: profileId, conceptId: entry.id, title: entry.labelDe, source: entry.source,
      draft: { label: entry.labelDe, speech: entry.speechDe, step: "edit", busy: false },
    }, "reword-label"));
    register.set(`reword:${entry.id}`, control);
    return control;
  };

  const boardRow = (
    profileId: string, entry: BoardEntry, place: number, editableOrder: readonly string[], register: Map<string, Focusable>, newer: boolean,
    examples: number | undefined, newerPicture: boolean,
  ): HTMLElement => {
    const { id } = entry;
    const row = element("li", "caregiver-concept");
    // The target of the focus after "Hinzufügen" when no other concept is left to add.
    row.tabIndex = -1;
    register.set(`row:${id}`, row);
    const actions = element("div", "caregiver-row-actions");
    const move = (text: string, delta: -1 | 1, enabled: boolean): HTMLButtonElement => {
      const control = button(text, "caregiver-button caregiver-move");
      control.setAttribute("aria-label", `${entry.labelDe} ${text}`);
      control.disabled = !enabled;
      const key = `${delta < 0 ? "up" : "down"}:${id}`;
      control.addEventListener("click", () => {
        begin();
        changeBoard(profileId, [key, `${delta < 0 ? "down" : "up"}:${id}`, `remove:${id}`], [key], "Die Reihenfolge wurde gespeichert.",
          (ids, editable) => moved(ids, editable, id, delta));
      });
      register.set(key, control);
      return control;
    };
    const remove = button(REMOVE);
    remove.setAttribute("aria-label", `${REMOVE}: ${entry.labelDe}`);
    remove.addEventListener("click", () => {
      // After a removal another row is where this one was: a second tap on the same spot must not take that one off too.
      if (!removeGuard.armed()) {
        removeGuard.swallow();
        return;
      }
      removeGuard.take();
      begin();
      const focus = [editableOrder[place + 1], editableOrder[place - 1]].filter((other) => other !== undefined).map((other) => `remove:${other}`);
      let offer: UndoOffer | null = null;
      changeBoard(profileId, [...focus, "more-heading"], [`remove:${id}`], `${quoted(entry.labelDe)} wurde von der Tafel genommen.`, (ids, editable) => {
        // Only what this screen may edit is ever taken off; every other id stays in the list.
        const at = ids.indexOf(id);
        if (at < 0 || !editable.has(id)) return null;
        offer = { profileId, id, label: entry.labelDe, before: ids[at + 1] ?? null };
        return ids.filter((other) => other !== id);
      }, (succeeded) => {
        removeGuard.settle(succeeded);
        if (!succeeded || offer === null || acting !== session) return;
        // A removal can be taken back at once, also when the guard of an earlier undo is still running.
        undoGuard.reset();
        undoStack = [...undoStack, offer];
        renderUndo();
      });
    });
    register.set(`remove:${id}`, remove);
    // An entry a newer app wrote is not overwritten: no rewording, and a line that says what to do.
    const teach = teachButton(profileId, entry, register);
    const demo = demoButton(profileId, entry, register);
    actions.append(
      move(MOVE_UP, -1, place > 0), move(MOVE_DOWN, 1, place < editableOrder.length - 1),
      ...(newer ? [] : [rewordButton(profileId, entry, register)]), ...(newerPicture ? [] : [pictureButton(profileId, entry, register)]),
      ...(teach === null ? [] : [teach]), ...(demo === null ? [] : [demo]), remove,
    );
    row.append(conceptText(entry, "", examples), actions);
    if (newer) row.append(element("p", "caregiver-concept-note", NEWER_ENTRY));
    if (newerPicture) row.append(element("p", "caregiver-concept-note", NEWER_PICTURE));
    return row;
  };

  /**
   * A concept on the board that this version does not move or take off: shown
   * at its place with the reason. One that the board shows (a custom or a
   * retired concept) can be reworded; one it cannot show has no button.
   */
  const lockedRow = (
    profileId: string, id: string, entry: BoardEntry | undefined, register: Map<string, Focusable>, newer: boolean, examples: number | undefined,
    newerPicture: boolean,
  ): HTMLElement => {
    const row = element("li", "caregiver-concept caregiver-concept-locked");
    if (entry === undefined) {
      row.append(conceptText(null, `Begriff ${quoted(id)}`), element("p", "caregiver-concept-note", newer ? NEWER_ENTRY : NOT_EDITABLE));
      return row;
    }
    const actions = element("div", "caregiver-row-actions");
    const teach = teachButton(profileId, entry, register);
    const demo = demoButton(profileId, entry, register);
    actions.append(rewordButton(profileId, entry, register), ...(newerPicture ? [] : [pictureButton(profileId, entry, register)]), ...(teach === null ? [] : [teach]),
      ...(demo === null ? [] : [demo]));
    row.append(conceptText(entry, "", examples), actions, element("p", "caregiver-concept-note", entry.source === "retired" ? `${RETIRED} ${LOCKED_PLACE}` : LOCKED_PLACE));
    if (newerPicture) row.append(element("p", "caregiver-concept-note", NEWER_PICTURE));
    return row;
  };

  /**
   * The rewording of one concept. Like the delete confirmation it is the
   * whole body while it is open: the fields have room on a small phone, and
   * nothing else is there to be hit or to move.
   */
  const rewordView = (open: RewordMode, entry: BoardEntry, profileLabel: string, register: Map<string, Focusable>): HTMLElement => {
    const view = element("section", "caregiver-section caregiver-takeover");
    const known = entry.source === "catalogue" ? catalogue.find((concept) => concept.id === entry.id) : undefined;
    if (open.draft.step === "reset" && known !== undefined) {
      view.append(
        element("h2", "", `Text der App für ${quoted(entry.labelDe)} wiederherstellen?`),
        element("p", "caregiver-notice", `Danach steht auf der Taste ${quoted(known.labelDe)}, und das Gerät spricht ${quoted(known.speechDe)}.`),
      );
      const cancel = button(CANCEL);
      cancel.addEventListener("click", leaveMode);
      register.set("reset-cancel", cancel);
      register.set("anchor:reset-cancel", view);
      // A tap, not a hold: the own text can be typed again.
      const confirm = button(RESET_CONFIRM, "caregiver-button caregiver-primary");
      confirm.addEventListener("click", resetWording);
      const actions = element("div", "caregiver-profile-actions");
      actions.append(cancel, confirm);
      view.append(actions);
      return view;
    }
    view.append(element("h2", "", `Text für ${quoted(entry.labelDe)} auf der Tafel von ${quoted(profileLabel)}`));
    const form = element("form", "caregiver-reword");
    const field = <K extends "input" | "textarea">(tag: K, id: string, text: string, key: "label" | "speech"): HTMLElementTagNameMap[K] => {
      const label = element("label", "", text);
      label.htmlFor = id;
      const control = element(tag, "caregiver-input");
      control.id = id;
      control.autocomplete = "off";
      // The same care as for a name: nothing typed here goes to a spelling service.
      control.spellcheck = false;
      // Capitals are left to the keyboard: German nouns and the start of a sentence want them.
      control.setAttribute("autocorrect", "off");
      control.value = open.draft[key];
      control.addEventListener("input", () => {
        open.draft[key] = control.value;
      });
      register.set(`reword-${key}`, control);
      form.append(label, control);
      return control;
    };
    const labelField = field("input", "caregiver-reword-label", REWORD_LABEL, "label");
    labelField.type = "text";
    labelField.setAttribute("enterkeyhint", "next");
    const speechField = field("textarea", "caregiver-reword-speech", REWORD_SPEECH, "speech");
    speechField.rows = 3;
    // Enter in the first field goes on to the second: it must not send the form with half of a wording (the action key of an on-screen keyboard is Enter).
    labelField.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      // Also while an input method composes: the form is never sent from here. The focus stays then, so the composition can end.
      event.preventDefault();
      if (!event.isComposing) speechField.focus();
    });
    register.set("anchor:reword-label", view);
    if (known !== undefined) form.append(element("p", "caregiver-notice caregiver-name-notice", `Text der App: ${quoted(known.labelDe)} – ${quoted(known.speechDe)}`));
    else if (entry.source === "retired") form.append(element("p", "caregiver-notice caregiver-name-notice", RETIRED));
    if (entry.symbolPath !== null) form.append(element("p", "caregiver-notice caregiver-name-notice", "Das Bild bleibt gleich."));
    const save = element("button", "caregiver-button caregiver-primary", SAVE);
    save.type = "submit";
    const cancel = button(CANCEL);
    cancel.addEventListener("click", leaveMode);
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      // A form that has only just appeared is not sent by a press that was meant for something else.
      if (!aimed(now())) return;
      open.draft.label = labelField.value;
      open.draft.speech = speechField.value;
      saveWording();
    });
    const actions = element("div", "caregiver-profile-actions");
    actions.append(save, cancel);
    form.append(actions);
    view.append(form);
    // Only where there is something to go back to: a stored wording that differs from the app's text now (an own one, or the copy of an earlier text of the app).
    if (known !== undefined && (known.labelDe !== entry.labelDe || known.speechDe !== entry.speechDe)) {
      const reset = button(RESET_WORDING);
      reset.addEventListener("click", () => {
        // Not while a save is under way: its answer would arrive in the second step.
        if (mode !== open || open.draft.busy) return;
        clearStatus();
        open.draft.label = labelField.value;
        open.draft.speech = speechField.value;
        open.draft.step = "reset";
        run(() => draw(["reset-cancel"], { toTop: true }));
      });
      register.set("reword-reset", reset);
      view.append(reset);
    }
    return view;
  };

  /** "Gebärde beibringen" for one concept of a board; null for an id examples cannot be stored under. */
  const teachButton = (profileId: string, entry: BoardEntry, register: Map<string, Focusable>): HTMLButtonElement | null => {
    if (!isExampleConceptId(entry.id)) return null;
    const control = button(TEACH);
    control.setAttribute("aria-label", `${TEACH}: ${entry.labelDe}`);
    control.addEventListener("click", () => openTeach(profileId, entry.id));
    register.set(`teach:${entry.id}`, control);
    return control;
  };

  /** The line under a concept's text that says how many gesture examples it has; null without any. */
  const gestureLine = (count: number | undefined): HTMLElement | null => (count === undefined || count === 0
    ? null
    : element("span", "caregiver-concept-gesture", `Gebärde: ${examplesText(count)}`));

  /** The two-step delete of examples: a hold and a release on "Endgültig löschen", as for a profile (rule 12). */
  const teachConfirmView = (
    open: TeachMode, confirm: TeachConfirm, entry: BoardEntry, profileLabel: string, register: Map<string, Focusable>, holds: HeldButton[],
  ): HTMLElement => {
    const view = element("section", "caregiver-section caregiver-confirm");
    // Rule 17: the board is named by its profile.
    const board = `auf der Tafel von ${quoted(profileLabel)}`;
    const title = confirm.kind === "one"
      ? `Beispiel ${confirm.number} von ${quoted(entry.labelDe)} ${board} löschen?`
      : `Alle ${examplesText(confirm.count)} von ${quoted(entry.labelDe)} ${board} löschen?`;
    view.append(element("h2", "caregiver-confirm-title", title), element("p", "caregiver-confirm-text", EXAMPLE_DELETE_LOSS));
    const cancel = button(CANCEL);
    cancel.addEventListener("click", leaveMode);
    register.set("confirm-cancel", cancel);
    register.set("anchor:confirm-cancel", view);
    const { control, parts } = deleteHold(holds, () => deleteTeachExamples(open, confirm));
    const actions = element("div", "caregiver-profile-actions");
    actions.append(cancel, control);
    view.append(actions, ...parts);
    return view;
  };

  /**
   * The teaching view of one concept. Like the rewording it is the whole body
   * while it is open. Its controls are one block right under the heading, in
   * the same place for the whole session: the box of the camera's preview (the
   * mirrored picture with the tracked points while the camera runs, card
   * NG-42; the same size when it is off), the live line, the camera's line,
   * then the one button that changes (camera, record, stop, keep) with
   * "Zurück". What changes in
   * length (the result, messages, the count, the instruction, the list) is
   * below it, so nothing above the button moves between examples.
   */
  /** The German line for how a usable recording fits the profile's examples (card NG-4); null when there is nothing to say. */
  const fitLine = (fit: ExampleFit, sequence: FeatureSequence, label: string, labelOf: (conceptId: string) => string): { text: string; warning: boolean } | null => {
    switch (fit.kind) {
      case "first": return null;
      case "fits": return { text: `Die Aufnahme passt zu den bisherigen Beispielen für ${quoted(label)}.`, warning: false };
      case "differs": return { text: `Die Aufnahme ist deutlich anders als die bisherigen Beispiele für ${quoted(label)}. War es dieselbe Gebärde? Behalten geht trotzdem.`, warning: true };
      case "other-hands": return {
        text: `Die bisherigen Beispiele für ${quoted(label)} wurden ${handsText(fit.hands)} gemacht, diese Aufnahme ${handsText(sequence.hands)}. Sie werden getrennt erkannt; am besten die Gebärde immer gleich machen.`,
        warning: true,
      };
      case "other-anchor": return {
        text: sequence.anchor === "hands"
          ? `Bei den bisherigen Beispielen für ${quoted(label)} waren die Schultern zu sehen, hier nicht. Solche Aufnahmen werden nicht miteinander verglichen.`
          : `Bei den bisherigen Beispielen für ${quoted(label)} waren die Schultern nicht zu sehen, hier schon. Solche Aufnahmen werden nicht miteinander verglichen.`,
        warning: true,
      };
      case "resembles": return {
        text: `Achtung: Die Aufnahme ähnelt der Gebärde für ${labelOf(fit.otherId)}. Wird sie behalten, können die beiden verwechselt werden.`,
        warning: true,
      };
    }
  };

  /** Draws one step of a replay on the canvas; does nothing where the canvas has no 2D context (an old browser, the tests). */
  const drawReplayStep = (canvas: HTMLCanvasElement, steps: readonly ReplayStep[], at: number, shoulders: boolean): void => {
    let context: CanvasRenderingContext2D | null = null;
    try {
      context = typeof canvas.getContext === "function" ? canvas.getContext("2d") : null;
    } catch {
      context = null;
    }
    if (context === null || context === undefined) return;
    const shoulderPoints: [number, number][] = shoulders ? [[-0.5, 0], [0.5, 0]] : [];
    const box = replayBox([...steps, { hands: shoulderPoints.length === 0 ? [] : [{ side: "left", points: shoulderPoints }] }], canvas.width, canvas.height);
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.lineCap = "round";
    if (shoulders) {
      const [a, b] = shoulderPoints.map((point) => box.place(point)) as [[number, number], [number, number]];
      context.strokeStyle = REPLAY_COLOURS.shoulders;
      context.lineWidth = 4;
      context.beginPath();
      context.moveTo(a[0], a[1]);
      context.lineTo(b[0], b[1]);
      context.stroke();
    }
    for (const hand of steps[at]?.hands ?? []) {
      const points = hand.points.map((point) => box.place(point));
      context.strokeStyle = REPLAY_COLOURS[hand.side];
      context.fillStyle = REPLAY_COLOURS[hand.side];
      context.lineWidth = 3;
      context.beginPath();
      for (const [from, to] of REPLAY_CONNECTIONS) {
        const a = points[from];
        const b = points[to];
        if (a === undefined || b === undefined) continue;
        context.moveTo(a[0], a[1]);
        context.lineTo(b[0], b[1]);
      }
      context.stroke();
      for (const [x, y] of points) {
        context.beginPath();
        context.arc(x, y, 3, 0, 2 * Math.PI);
        context.fill();
      }
    }
  };

  /**
   * "Abspielen": shows a stored example once as a moving stick-figure hand,
   * one step per `replayStepMs` of its recorded length, then keeps its last
   * step. It stops when the view closes, another example is played, or
   * "Anhalten" is pressed.
   */
  const playExample = (open: TeachMode, name: string): void => {
    const { state } = open;
    if (!teaching(open)) return;
    clearStatus();
    const replay = { name, step: 0, done: false };
    state.replay = replay;
    run(async () => {
      if (mode !== open || store === null) return;
      const example = (await listExamples(store, open.id, open.conceptId).catch(() => null))?.examples.find((item) => item.name === name);
      if (example === undefined || state.replay !== replay) {
        if (state.replay === replay) state.replay = null;
        await draw([`teach-play:${name}`, "teach-heading"]);
        return;
      }
      await draw([`teach-play:${name}`, "teach-heading"]);
      const steps = replaySteps(example.sequence);
      const stepMs = replayStepMs(example.record.durationMs, steps.length);
      const shoulders = example.sequence.anchor === "shoulders";
      const tick = (): void => {
        if (!teaching(open) || state.replay !== replay) return;
        if (replayCanvas !== null) drawReplayStep(replayCanvas, steps, replay.step, shoulders);
        if (replay.step >= steps.length - 1) {
          // Played through: the last step stays, and the button offers to play it again.
          replay.done = true;
          if (replayButton !== null) {
            replayButton.control.textContent = "Abspielen";
            replayButton.control.setAttribute("aria-label", replayButton.label);
          }
          return;
        }
        replay.step += 1;
        setTimer(tick, stepMs);
      };
      tick();
    });
  };

  const stopExample = (open: TeachMode): void => {
    if (!teaching(open) || open.state.replay === null) return;
    const name = open.state.replay.name;
    open.state.replay = null;
    drawTeach(open, [`teach-play:${name}`]);
  };

  const teachView = (open: TeachMode, entry: BoardEntry, profileLabel: string, listing: ExampleListing | null, register: Map<string, Focusable>): HTMLElement => {
    const { state } = open;
    const view = element("section", "caregiver-section caregiver-takeover caregiver-teach");
    const title = element("h2", "", `Gebärde für ${quoted(entry.labelDe)} beibringen – Tafel von ${quoted(profileLabel)}`);
    title.tabIndex = -1;
    register.set("teach-heading", title);
    register.set("anchor:teach-heading", view);
    view.append(title);

    const controls = element("div", "caregiver-teach-controls");
    // The box is there in every state of the session, camera on or off, so the buttons never move because of it.
    teachPreviewSlot = state.usage === "full" ? null : element("div", "caregiver-teach-preview");
    const live = element("p", "caregiver-teach-live", state.camera === "on" ? state.live : "");
    teachLive = live;
    let line = state.cameraLine;
    if (state.countdown !== null) line = COUNTDOWN_LINE(state.countdown);
    else if (state.recording) line = RECORDING;
    const cameraLine = element("p", state.cameraProblem && state.countdown === null && !state.recording ? "caregiver-teach-camera caregiver-warning" : "caregiver-teach-camera", line);
    teachCameraLine = cameraLine;
    const actions = element("div", "caregiver-profile-actions caregiver-teach-actions");
    const add = (key: string, text: string, onClick: () => void, className = "caregiver-button"): HTMLButtonElement => {
      const control = button(text, className);
      control.addEventListener("click", onClick);
      register.set(key, control);
      actions.append(control);
      return control;
    };
    const result = state.result;
    if (result?.usable === true) {
      add("teach-keep", KEEP, () => keepTeachResult(open), "caregiver-button caregiver-primary");
      add("teach-discard", DISCARD, () => discardTeachResult(open));
    } else if (state.usage !== "full") {
      if (state.camera !== "on") {
        const start = add("teach-camera", CAMERA_START, () => startTeachCamera(open), "caregiver-button caregiver-primary");
        // While the camera starts, a second tap does nothing; the button stays where it is.
        if (state.camera === "starting") start.setAttribute("aria-disabled", "true");
      } else if (state.countdown !== null) {
        add("teach-cancel", CANCEL_COUNTDOWN, () => cancelTeachCountdown(open));
      } else if (state.recording) {
        add("teach-stop", RECORD_STOP, () => stopTeachRecording(open, false), "caregiver-button caregiver-primary caregiver-recording");
      } else {
        add("teach-record", RECORD_START, () => startTeachRecording(open), "caregiver-button caregiver-primary");
      }
    }
    add("teach-back", BACK, leaveMode);
    if (teachPreviewSlot !== null) controls.append(teachPreviewSlot);
    controls.append(live, cameraLine, actions);
    // The camera choice (card NG-43): its own row under the buttons, so "Kamera starten" and the buttons after it keep their place.
    if (state.usage !== "full") {
      const choice = element("div", "camera-choice caregiver-teach-facing");
      choice.setAttribute("role", "group");
      choice.setAttribute("aria-label", CAMERA_CHOICE);
      choice.append(element("span", "camera-choice-label", CAMERA_CHOICE_LABEL));
      const current = currentFacing();
      const locked = !facingChangeable(state);
      for (const option of ["user", "environment"] as const) {
        const control = button(CAMERA_NAMES[option], "caregiver-button camera-choice-button");
        control.dataset["facing"] = option;
        control.setAttribute("aria-pressed", String(option === current));
        if (locked) control.setAttribute("aria-disabled", "true");
        control.addEventListener("click", () => chooseTeachFacing(open, option));
        register.set(`teach-facing:${option}`, control);
        choice.append(control);
      }
      controls.append(choice);
    }
    view.append(controls);

    if (state.note !== null) view.append(element("p", state.note.error ? "caregiver-teach-note caregiver-warning" : "caregiver-teach-note", state.note.text));
    if (result !== null) {
      const auto = result.auto ? `Die Aufnahme hat nach ${TEACH_MAX_RECORDING_MS / 1000} Sekunden von selbst geendet. ` : "";
      if (result.usable) {
        const shoulders = result.sequence.anchor === "hands" ? " Die Schultern waren nicht zu sehen. Am besten so aufnehmen, dass die Schultern im Bild sind." : "";
        view.append(element("p", "caregiver-teach-result", `${auto}Die Aufnahme kann verwendet werden: Gebärde ${handsText(result.sequence.hands)}.${shoulders} Behalten oder verwerfen?`));
        if (result.stillHand) view.append(element("p", "caregiver-notice caregiver-teach-hint", STILL_HAND));
        const fit = state.fit !== null && state.fit.result === result ? state.fit.fit : null;
        const line = fit === null ? null : fitLine(fit, result.sequence, entry.labelDe, teachLabels);
        if (line !== null) view.append(element("p", line.warning ? "caregiver-notice caregiver-teach-fit caregiver-warning" : "caregiver-notice caregiver-teach-fit", line.text));
      } else {
        view.append(element("p", "caregiver-teach-result caregiver-teach-refused", `${auto}Diese Aufnahme kann nicht verwendet werden. ${UNUSABLE[result.reason]} Es wurde nichts gespeichert.`));
      }
    }
    if (state.usage === "near" || state.usage === "full") view.append(element("p", "caregiver-notice caregiver-warning", USAGE_LINES[state.usage]));
    else if (state.usage === "unknown") view.append(element("p", "caregiver-notice caregiver-warning", USAGE_UNKNOWN));

    const examples = listing?.examples ?? [];
    const damaged = listing?.damaged ?? [];
    const newer = damaged.filter((item) => item.kind === "unsupported-version").length;
    const unreadable = damaged.length - newer;
    if (listing === null) {
      // Nothing is claimed about the count then.
      view.append(element("p", "caregiver-notice caregiver-warning", "Die gespeicherten Beispiele können gerade nicht gelesen werden."));
    } else {
      // The same count as the row on the board ("Gebärde: …"): every stored entry of this tile, the unusable ones said apart.
      const total = examples.length + damaged.length;
      const recommend = examples.length < RECOMMENDED_EXAMPLES ? ` Empfohlen sind mindestens ${RECOMMENDED_EXAMPLES}.` : "";
      const apart = damaged.length > 0 ? `, davon ${damaged.length} nicht verwendbar` : "";
      view.append(element("p", "caregiver-notice caregiver-teach-count", `${total === 0 ? "Noch kein Beispiel" : examplesText(total)} gespeichert${apart}.${recommend}`));
    }
    if (newer > 0) view.append(element("p", "caregiver-notice caregiver-warning", `${newer === 1 ? "1 Beispiel wurde" : `${newer} Beispiele wurden`} mit einer neueren Version gespeichert. Bitte die App aktualisieren.`));
    if (unreadable > 0) {
      view.append(element("p", "caregiver-notice caregiver-warning", `${unreadable === 1 ? "1 Beispiel kann" : `${unreadable} Beispiele können`} nicht verwendet werden und ${unreadable === 1 ? "muss" : "müssen"} neu aufgenommen werden. „${DELETE_ALL_EXAMPLES}“ entfernt ${unreadable === 1 ? "es" : "sie"}.`));
    }
    view.append(element("p", "caregiver-notice", TEACH_INTRO));

    const busy = state.recording || state.countdown !== null || result !== null;
    // Nothing is replayed while a recording counts down, runs or waits for "Behalten".
    if (busy) state.replay = null;
    replayCanvas = null;
    replayButton = null;
    const count = examples.length;
    if (count > 0) {
      view.append(element("h3", "", STORED_EXAMPLES));
      const list = element("ol", "caregiver-examples");
      examples.forEach((example, at) => {
        const row = element("li", "caregiver-example");
        const number = at + 1;
        row.append(element("span", "caregiver-example-text", `Beispiel ${number}: ${handsText(example.record.hands)}, ${shownTime(example.record.capturedAt)}`));
        if (!busy) {
          const playing = state.replay !== null && state.replay.name === example.name && !state.replay.done;
          const play = button(playing ? "Anhalten" : "Abspielen");
          play.setAttribute("aria-label", `Beispiel ${number} ${playing ? "anhalten" : "abspielen"}`);
          if (state.replay !== null && state.replay.name === example.name) replayButton = { control: play, label: `Beispiel ${number} abspielen` };
          // Decided at the tap: a replay that has played through since the row was drawn says "Abspielen" again.
          play.addEventListener("click", () => {
            const now = state.replay;
            if (now !== null && now.name === example.name && !now.done) stopExample(open);
            else playExample(open, example.name);
          });
          register.set(`teach-play:${example.name}`, play);
          row.append(play);
        }
        // Not while a recording counts down, runs or waits for "Behalten": nothing is deleted under it.
        if (!busy) {
          const remove = button(DELETE, "caregiver-button caregiver-danger-quiet");
          remove.setAttribute("aria-label", `Beispiel ${number} löschen`);
          remove.addEventListener("click", () => confirmTeachDelete(open, { kind: "one", name: example.name, number }));
          register.set(`teach-delete:${example.name}`, remove);
          row.append(remove);
        }
        if (state.replay !== null && state.replay.name === example.name) {
          const canvas = element("canvas", "caregiver-replay");
          canvas.width = 240;
          canvas.height = 180;
          canvas.setAttribute("role", "img");
          canvas.setAttribute("aria-label", `Beispiel ${number} als bewegte Hand, aus den gespeicherten Werten gezeichnet`);
          replayCanvas = canvas;
          row.append(canvas, element("p", "caregiver-notice caregiver-replay-note", REPLAY_NOTE));
        }
        list.append(row);
      });
      view.append(list);
    }
    const all = count + unreadable;
    if ((all >= 2 || unreadable > 0) && !busy) {
      const removeAll = button(DELETE_ALL_EXAMPLES, "caregiver-button caregiver-danger-quiet");
      removeAll.addEventListener("click", () => confirmTeachDelete(open, { kind: "all", count: all }));
      register.set("teach-delete-all", removeAll);
      view.append(removeAll);
    }
    return view;
  };

  /** The fields of "Eigenen Begriff anlegen". Like the rewording it is the whole body while it is open. */
  const createConceptView = (open: CreateConceptMode, profileLabel: string, register: Map<string, Focusable>): HTMLElement => {
    const view = element("section", "caregiver-section caregiver-takeover");
    view.append(element("h2", "", `Eigener Begriff für die Tafel von ${quoted(profileLabel)}`));
    const form = element("form", "caregiver-reword caregiver-new-concept");
    const field = <K extends "input" | "textarea">(tag: K, id: string, text: string, key: "label" | "speech"): HTMLElementTagNameMap[K] => {
      const label = element("label", "", text);
      label.htmlFor = id;
      const control = element(tag, "caregiver-input");
      control.id = id;
      control.autocomplete = "off";
      // The same care as for a rewording: nothing typed here goes to a spelling service.
      control.spellcheck = false;
      control.setAttribute("autocorrect", "off");
      control.value = open.draft[key];
      control.addEventListener("input", () => {
        open.draft[key] = control.value;
      });
      register.set(`new-concept-${key}`, control);
      form.append(label, control);
      return control;
    };
    const labelField = field("input", "caregiver-new-concept-label", REWORD_LABEL, "label");
    labelField.type = "text";
    labelField.setAttribute("enterkeyhint", "next");
    const speechField = field("textarea", "caregiver-new-concept-speech", REWORD_SPEECH, "speech");
    speechField.rows = 3;
    labelField.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      if (!event.isComposing) speechField.focus();
    });
    register.set("anchor:new-concept-label", view);
    form.append(element("p", "caregiver-notice caregiver-name-notice", OWN_CREATE_NOTE));
    const save = element("button", "caregiver-button caregiver-primary", SAVE);
    save.type = "submit";
    const cancel = button(CANCEL);
    cancel.addEventListener("click", leaveMode);
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      if (!aimed(now())) return;
      open.draft.label = labelField.value;
      open.draft.speech = speechField.value;
      saveNewConcept();
    });
    const actions = element("div", "caregiver-profile-actions");
    actions.append(save, cancel);
    form.append(actions);
    view.append(form);
    return view;
  };

  /** The confirmation before an own concept is deleted for good: a hold and a release, as for a profile. */
  const deleteConceptView = (title: string, profileLabel: string, register: Map<string, Focusable>, holds: HeldButton[]): HTMLElement => {
    const view = element("section", "caregiver-section caregiver-confirm");
    view.append(
      element("h2", "caregiver-confirm-title", `${quoted(title)} aus dem Profil ${quoted(profileLabel)} endgültig löschen?`),
      element("p", "caregiver-confirm-text", OWN_DELETE_LOSS),
    );
    const cancel = button(CANCEL);
    cancel.addEventListener("click", leaveMode);
    register.set("confirm-cancel", cancel);
    register.set("anchor:confirm-cancel", view);
    const { control, parts } = deleteHold(holds, deleteOwnConcept);
    const actions = element("div", "caregiver-profile-actions");
    actions.append(cancel, control);
    view.append(actions, ...parts);
    return view;
  };

  /** An own concept that is not on the board: it can be added back or deleted for good. */
  const ownRow = (profileId: string, concept: CustomConcept, register: Map<string, Focusable>): HTMLElement => {
    const { id } = concept;
    const row = element("li", "caregiver-concept");
    const add = button(ADD);
    add.setAttribute("aria-label", `${ADD}: ${concept.labelDe}`);
    add.addEventListener("click", () => {
      begin();
      changeBoard(profileId, [`row:${id}`], [`add:${id}`], `Gespeichert: ${quoted(concept.labelDe)} ist jetzt auf der Tafel.`, (ids) => {
        if (ids.includes(id)) return null;
        if (ids.length >= MAX_CONCEPT_IDS) throw new Refusal(BOARD_FULL);
        return [...ids, id];
      }, (succeeded) => {
        if (succeeded) dropUndo((offer) => offer.profileId === profileId && offer.id === id);
      });
    });
    register.set(`add:${id}`, add);
    const remove = button(DELETE_FOR_GOOD, "caregiver-button caregiver-danger-quiet");
    remove.setAttribute("aria-label", `${DELETE_FOR_GOOD}: ${concept.labelDe}`);
    remove.addEventListener("click", () => openMode({ kind: "delete-concept", id: profileId, conceptId: id, title: concept.labelDe }, "confirm-cancel"));
    register.set(`delete-concept:${id}`, remove);
    const actions = element("div", "caregiver-row-actions");
    actions.append(add, remove);
    row.append(conceptText({ ...concept, symbolPath: null }, ""), actions);
    return row;
  };

  /** A catalogue concept that is not on the board. */
  const moreRow = (profileId: string, concept: CatalogueConcept, place: number, rest: readonly CatalogueConcept[], register: Map<string, Focusable>): HTMLElement => {
    const { id } = concept;
    const row = element("li", "caregiver-concept");
    const add = button(ADD);
    add.setAttribute("aria-label", `${ADD}: ${concept.labelDe}`);
    add.addEventListener("click", () => {
      begin();
      const focus = [rest[place + 1], rest[place - 1]].filter((other) => other !== undefined).map((other) => `add:${other.id}`);
      changeBoard(profileId, [...focus, `row:${id}`], [`add:${id}`], `Gespeichert: ${quoted(concept.labelDe)} ist jetzt auf der Tafel.`, (ids) => {
        if (ids.includes(id)) return null;
        if (ids.length >= MAX_CONCEPT_IDS) throw new Refusal(BOARD_FULL);
        return [...ids, id];
      }, (succeeded) => {
        // Back on the board by hand: there is nothing left to take back for this concept.
        if (succeeded) dropUndo((offer) => offer.profileId === profileId && offer.id === id);
      });
    });
    register.set(`add:${id}`, add);
    const actions = element("div", "caregiver-row-actions");
    actions.append(add);
    row.append(conceptText(concept, ""), actions);
    return row;
  };

  const boardSection = async (
    current: ProfileStore, profile: ProfileV1, label: string, activeId: string | null, register: Map<string, Focusable>,
  ): Promise<HTMLElement> => {
    // What the child sees while another profile is edited: that profile's board, or examples when it has nothing to show.
    let notActive = EDITED_NONE_ACTIVE;
    if (activeId !== null && activeId !== profile.id) {
      try {
        notActive = (await resolveBoard(current, activeId, catalogue)).entries.length === 0 ? EDITED_NONE_ACTIVE : EDITED_NOT_ACTIVE;
      } catch {
        notActive = EDITED_NOT_ACTIVE_UNKNOWN;
      }
    }
    const section = element("section", "caregiver-section");
    const editorHeading = element("h2", "", `Tafel von ${quoted(label)} bearbeiten`);
    editorHeading.tabIndex = -1;
    register.set("editor-heading", editorHeading);
    section.append(editorHeading);
    // Which board the child sees must not depend on a status line that the next action replaces.
    if (profile.id !== activeId) {
      section.append(element("p", "caregiver-notice caregiver-warning", notActive));
    }
    let board: ResolvedBoard;
    try {
      board = await resolveBoard(current, profile.id, catalogue);
    } catch {
      section.append(element("p", "caregiver-notice", BOARD_UNREADABLE));
      return section;
    }
    if (profile.id === activeId && board.entries.length === 0) section.append(element("p", "caregiver-notice caregiver-warning", ACTIVE_WITHOUT_CONCEPTS));
    section.append(element("p", "caregiver-notice", CONCEPT_HELP));
    if (board.entries.length > BOARD_COMFORT_MAX) section.append(element("p", "caregiver-notice caregiver-warning", MANY_CONCEPTS));

    // From the data names only: reading every example on each redraw would cost a read of each.
    const examples = await countExamples(current, profile.id).catch(() => new Map<string, number>());
    const ids = board.profile.conceptIds;
    const editable = editableIds(board);
    const editableOrder = ids.filter((id) => editable.has(id));
    section.append(element("h3", "", ON_BOARD));
    if (ids.length === 0) {
      section.append(element("p", "caregiver-notice", BOARD_EMPTY));
    } else {
      const onBoard = element("ol", "caregiver-concepts");
      for (const id of ids) {
        const entry = board.entries.find((candidate) => candidate.id === id);
        const newerOf = (kind: "picture" | "entry"): boolean => board.problems.some((problem) => problem.conceptId === id && problem.damage === "unsupported-version"
          && (problem.kind === "damaged-symbol") === (kind === "picture"));
        const newer = newerOf("entry");
        const newerPicture = newerOf("picture");
        onBoard.append(entry !== undefined && editable.has(id)
          ? boardRow(profile.id, entry, editableOrder.indexOf(id), editableOrder, register, newer, examples.get(id), newerPicture)
          : lockedRow(profile.id, id, entry, register, newer, examples.get(id), newerPicture));
      }
      section.append(onBoard);
    }
    const create = button(CREATE_CONCEPT);
    create.addEventListener("click", () => openMode({ kind: "create-concept", id: profile.id, draft: { label: "", speech: "", busy: false } }, "new-concept-label"));
    register.set("create-concept", create);
    section.append(create);

    const moreHeading = element("h3", "", MORE_CONCEPTS);
    moreHeading.tabIndex = -1;
    register.set("more-heading", moreHeading);
    section.append(moreHeading);
    const rest = catalogue.filter((concept) => !ids.includes(concept.id));
    if (rest.length === 0) {
      section.append(element("p", "caregiver-notice", NO_MORE_CONCEPTS));
    } else {
      const more = element("ul", "caregiver-concepts");
      rest.forEach((concept, place) => more.append(moreRow(profile.id, concept, place, rest, register)));
      section.append(more);
    }
    // Own concepts that are not on the board (taken off, or a creation whose second write failed).
    const own = await listCustomConcepts(current, profile.id).then((listing) => listing.concepts.filter((concept) => !ids.includes(concept.id)), () => []);
    if (own.length > 0) {
      const ownHeading = element("h3", "", OWN_CONCEPTS);
      ownHeading.tabIndex = -1;
      register.set("own-heading", ownHeading);
      const ownList = element("ul", "caregiver-concepts");
      for (const concept of own) ownList.append(ownRow(profile.id, concept, register));
      section.append(ownHeading, element("p", "caregiver-notice", OWN_HELP), ownList);
    }
    return section;
  };

  /** A text field for a profile name. Spell checking and correction can send typed text to a service; a name stays here. */
  const nameField = (id: string, value: string): HTMLInputElement => {
    const input = element("input", "caregiver-input");
    input.type = "text";
    input.id = id;
    input.autocomplete = "off";
    input.spellcheck = false;
    input.setAttribute("autocapitalize", "off");
    input.setAttribute("autocorrect", "off");
    input.value = value;
    return input;
  };

  /**
   * "Endgültig löschen" of a confirmation: no click handler, it has to be held
   * for `DELETE_HOLD_MS` and is carried out on the release on the button
   * (rules 12 and 20). `act` asks for the delete and says whether it did.
   * Returns the button and what goes below it (its bar and its line).
   */
  const deleteHold = (
    holds: HeldButton[], act: () => boolean, armed: { readonly ok: () => boolean; readonly refusal: () => string } | null = null,
  ): { control: HTMLButtonElement; parts: HTMLElement[]; rearm: () => void } => {
    // No click handler: like the opening control, it has to be held. A tap, however often, deletes nothing.
    const confirm = button(DELETE_FOR_GOOD, "caregiver-button caregiver-danger caregiver-hold");
    const holdProgress = element("progress", "caregiver-delete-progress");
    holdProgress.max = DELETE_HOLD_MS;
    holdProgress.value = 0;
    holdProgress.hidden = true;
    // The line below says the same in words.
    holdProgress.setAttribute("aria-hidden", "true");
    const holdHint = element("p", "caregiver-confirm-hint", DELETE_HOLD_HINT);
    holdHint.id = "caregiver-delete-hint";
    holdHint.setAttribute("role", "status");
    holdHint.setAttribute("aria-live", "polite");
    confirm.setAttribute("aria-describedby", holdHint.id);
    /** Until `armed` holds (the profile's name is typed), the button says so and a hold does nothing (owner decision on card NG-13). */
    let refused = false;
    const rearm = (): void => {
      if (armed === null) return;
      const ok = armed.ok();
      confirm.setAttribute("aria-disabled", ok ? "false" : "true");
      // The line follows what is typed: once the name is right, the refusal gives way to the hint at once.
      if (ok && refused) {
        refused = false;
        holdHint.textContent = DELETE_HOLD_HINT;
      }
    };
    const refuse = (): void => {
      if (armed === null) return;
      refused = true;
      holdHint.textContent = armed.refusal();
    };
    const idle = (): void => {
      holdProgress.hidden = true;
      holdProgress.value = 0;
      if (!refused) holdHint.textContent = DELETE_HOLD_HINT;
    };
    rearm();
    /** Only the button that is on screen acts: not one that was swapped out while a finger rested on it. */
    const current = (): boolean => bodyHolds.includes(held) && (confirm as { isConnected?: boolean }).isConnected !== false;
    const held: HeldButton = heldButton(confirm, {
      durationMs: DELETE_HOLD_MS,
      // A press on a button that has only just appeared is not a decision to delete.
      allowed: () => {
        if (!current() || !aimed(now())) return false;
        if (armed !== null && !armed.ok()) {
          refuse();
          return false;
        }
        return true;
      },
      onProgress: (elapsedMs, remainingSeconds) => {
        holdProgress.hidden = false;
        holdProgress.value = elapsedMs;
        const line = holdLine(remainingSeconds);
        if (holdHint.textContent !== line) holdHint.textContent = line;
      },
      onIdle: idle,
      // The delete waits for the finger to come up: what the redraw puts there must not be under a finger that is down.
      onReady: () => {
        holdProgress.value = DELETE_HOLD_MS;
        holdHint.textContent = RELEASE_TO_DELETE;
      },
      act: () => {
        idle();
        if (!current()) return;
        // The name was changed during the hold: nothing is deleted, and the line says why.
        if (armed !== null && !armed.ok()) {
          refuse();
          return;
        }
        if (act()) holdHint.textContent = DELETING;
      },
    });
    holds.push(held);
    return { control: confirm, parts: [holdProgress, holdHint], rearm };
  };

  /**
   * The delete confirmation. While it is open it is the whole body: no card,
   * no editor and no form is on screen, so nothing else can be hit, and
   * nothing can be drawn under a finger that rests on it.
   */
  const confirmView = (profile: ProfileV1, label: string, isActive: boolean, register: Map<string, Focusable>, holds: HeldButton[]): HTMLElement => {
    const view = element("section", "caregiver-section caregiver-confirm");
    const title = element("h2", "caregiver-confirm-title", `Profil ${quoted(label)} löschen?`);
    title.id = "caregiver-delete-title";
    const loss = element("p", "caregiver-confirm-text", DELETE_LOSS);
    loss.id = "caregiver-delete-loss";
    view.append(title, loss);
    const described = [title.id, loss.id];
    if (isActive) {
      const after = element("p", "caregiver-confirm-text", DELETE_ACTIVE);
      after.id = "caregiver-delete-active";
      described.push(after.id);
      view.append(after);
    }
    // Typing the name (owner decision on card NG-13): a child who got in cannot delete with a tap and a hold.
    const open = mode !== null && mode.kind === "delete" && mode.id === profile.id ? mode : null;
    const fieldLabel = element("label", "caregiver-delete-name-label", `Zum Bestätigen den Namen ${quoted(profile.displayName)} eingeben`);
    fieldLabel.htmlFor = "caregiver-delete-name";
    const field = nameField("caregiver-delete-name", open?.draft.typed ?? "");
    field.dataset["expected"] = profile.displayName;
    // Focus starts here: a screen reader hears what is deleted and what is lost with the field (card NG-8673319027843774136).
    field.setAttribute("aria-describedby", described.join(" "));
    const typed = (): string => deleteNameForm(field.value);
    const expected = deleteNameForm(profile.displayName);
    const named = (): boolean => typed() === expected;
    /** The refusal, with a hint when only the spaces or only capitals differ. */
    const refusal = (): string => {
      const base = `Der Name stimmt noch nicht. Bitte genau ${quoted(profile.displayName)} eingeben.`;
      const value = typed();
      let hint = "";
      if (value !== "" && value.replace(/\s/gu, "") === expected.replace(/\s/gu, "")) hint = " Achte auf die Leerzeichen.";
      else if (value !== "" && value.toLocaleLowerCase("de") === expected.toLocaleLowerCase("de")) hint = " Achte auf große und kleine Buchstaben.";
      return `${base}${hint} Es wurde nichts gelöscht.`;
    };
    view.append(fieldLabel, field);
    register.set("delete-name", field);
    register.set("anchor:delete-name", view);
    const cancel = button(CANCEL);
    cancel.addEventListener("click", leaveMode);
    register.set("confirm-cancel", cancel);
    register.set("anchor:confirm-cancel", view);
    const { control: confirm, parts, rearm } = deleteHold(holds, () => named() && deleteProfile(profile, label), { ok: named, refusal });
    field.addEventListener("input", () => {
      if (open !== null) open.draft.typed = field.value;
      rearm();
    });
    // "Abbrechen" first, and nothing below "Endgültig löschen" but its own bar and line.
    const actions = element("div", "caregiver-profile-actions");
    actions.append(cancel, confirm);
    view.append(actions, ...parts);
    return view;
  };

  /** `label` is the name as the area shows it: the stored name, with "(2)" and so on for a second profile of the same name. */
  const profileCard = (profile: ProfileV1, label: string, activeId: string | null, register: Map<string, Focusable>): HTMLElement => {
    const isActive = profile.id === activeId;
    const open = mode !== null && mode.id === profile.id ? mode : null;
    const item = element("li", "caregiver-profile");
    const head = element("div", "caregiver-profile-head");
    if (open?.kind === "rename") {
      const form = element("form", "caregiver-rename");
      const fieldLabel = element("label", "", `Neuer Name für ${quoted(label)}`);
      fieldLabel.htmlFor = "caregiver-rename-name";
      const input = nameField("caregiver-rename-name", open.draft);
      const save = element("button", "caregiver-button caregiver-primary", SAVE);
      save.type = "submit";
      const cancel = button(CANCEL);
      cancel.addEventListener("click", leaveMode);
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        // A form that has only just appeared is not sent by an Enter that was meant for something else.
        if (!aimed(now())) return;
        renameProfile(profile.id, input.value);
      });
      register.set("rename-name", input);
      register.set("anchor:rename-name", item);
      const actions = element("div", "caregiver-profile-actions");
      actions.append(save, cancel);
      form.append(fieldLabel, input, actions);
      head.append(form);
      if (isActive) head.append(element("span", "caregiver-active", ACTIVE_MARK));
      item.append(head);
      return item;
    }
    head.append(element("span", "caregiver-profile-name", label));
    if (isActive) head.append(element("span", "caregiver-active", ACTIVE_MARK));
    const actions = element("div", "caregiver-profile-actions");
    const action = (text: string, key: string, onClick: () => void, className = "caregiver-button"): HTMLButtonElement => {
      const control = button(text, className);
      control.setAttribute("aria-label", `${text}: ${label}`);
      control.addEventListener("click", onClick);
      register.set(`${key}:${profile.id}`, control);
      actions.append(control);
      return control;
    };
    if (!isActive) action(ACTIVATE, "activate", () => activate(profile, label));
    action(EDIT_BOARD, "edit", () => select(profile, label)).setAttribute("aria-pressed", profile.id === selectedId ? "true" : "false");
    action(RENAME, "rename", () => openMode({ kind: "rename", id: profile.id, draft: profile.displayName }, "rename-name"));
    action(BACKUP_SAVE, "backup-save", () => openMode({ kind: "backup-save", id: profile.id, draft: { busy: false } }, "backup-password"));
    action(DELETE, "delete", () => openMode({ kind: "delete", id: profile.id, draft: { typed: "" } }, "delete-name"), "caregiver-button caregiver-danger-quiet");
    item.append(head, actions);
    return item;
  };

  /** What the child's screen shows once the area is closed, read off the store the way start-up reads it. */
  const afterCloseLine = async (current: ProfileStore, activeId: string | null, labels: ReadonlyMap<string, string>, damaged: number): Promise<string> => {
    // Without a readable active profile, damaged entries decide (as at start-up); one of them may be the active one.
    if (activeId === null) return damaged > 0 ? afterDamagedLine(damaged) : AFTER_NONE_ACTIVE;
    try {
      const board = await resolveBoard(current, activeId, catalogue);
      return board.entries.length === 0 ? AFTER_ACTIVE_EMPTY : `${AFTER_CLOSE} Tafel von ${quoted(labels.get(activeId) ?? board.profile.displayName)}`;
    } catch {
      return AFTER_ACTIVE_UNREADABLE;
    }
  };

  const build = async (current: ProfileStore, register: Map<string, Focusable>, holds: HeldButton[], draftName: string): Promise<Built> => {
    const listing = await current.list();
    // Null also when the active profile's record is unreadable; the damaged note below covers that.
    const activeId = await current.getActive();
    const profiles = [...listing.profiles].sort((a, b) => a.displayName.localeCompare(b.displayName, "de") || a.id.localeCompare(b.id));
    if (!profiles.some((profile) => profile.id === selectedId)) {
      selectedId = profiles.find((profile) => profile.id === activeId)?.id ?? (profiles.length === 1 ? (profiles[0] as ProfileV1).id : null);
    }
    // A rename field or confirmation for a profile that is gone has nothing to show.
    if (mode !== null && mode.kind !== "backup-restore" && !profiles.some((profile) => profile.id === mode?.id)) mode = null;
    if (mode === null || (mode.kind !== "backup-save" && mode.kind !== "backup-restore")) backupFields = null;
    // Two profiles of one name (from data stored before the area refused that) are told apart on screen only.
    const labels = new Map<string, string>();
    const met = new Map<string, number>();
    for (const profile of profiles) {
      const count = (met.get(nameKey(profile.displayName)) ?? 0) + 1;
      met.set(nameKey(profile.displayName), count);
      labels.set(profile.id, count === 1 ? profile.displayName : `${profile.displayName} (${count})`);
    }
    const labelOf = (profile: ProfileV1): string => labels.get(profile.id) ?? profile.displayName;
    const header = await afterCloseLine(current, activeId, labels, listing.damaged.length);
    // The confirmation takes over: see `confirmView`.
    const confirming = mode !== null && mode.kind === "delete" ? profiles.find((profile) => profile.id === mode?.id) : undefined;
    if (confirming !== undefined) {
      return { content: [confirmView(confirming, labelOf(confirming), confirming.id === activeId, register, holds)], afterClose: header, confirming: true };
    }

    // So do saving and restoring a backup (card NG-58).
    if (mode !== null && mode.kind === "backup-save") {
      const open = mode;
      const owner = profiles.find((profile) => profile.id === open.id);
      if (owner !== undefined) return { content: [backupSaveView(open, labelOf(owner), register)], afterClose: header, confirming: true };
      mode = null;
    }
    if (mode !== null && mode.kind === "backup-restore") {
      return { content: [backupRestoreView(mode, register)], afterClose: header, confirming: true };
    }

    // So do creating an own concept and the confirmation before one is deleted (card NG-34).
    if (mode !== null && mode.kind === "create-concept") {
      const open = mode;
      const owner = profiles.find((profile) => profile.id === open.id);
      if (owner !== undefined) return { content: [createConceptView(open, labelOf(owner), register)], afterClose: header, confirming: true };
      mode = null;
    }
    if (mode !== null && mode.kind === "delete-concept") {
      const open = mode;
      const owner = profiles.find((profile) => profile.id === open.id);
      const own = owner === undefined ? [] : await listCustomConcepts(current, owner.id).then((listing) => listing.concepts, () => []);
      if (owner !== undefined && own.some((concept) => concept.id === open.conceptId)) {
        return { content: [deleteConceptView(open.title, labelOf(owner), register, holds)], afterClose: header, confirming: true };
      }
      mode = null;
    }

    // And choosing a picture, while the concept is on the board and shown there.
    if (mode !== null && mode.kind === "picture") {
      const open = mode;
      const owner = profiles.find((profile) => profile.id === open.id);
      const board = owner === undefined ? null : await resolveBoard(current, owner.id, catalogue).catch(() => null);
      const entry = board?.entries.find((candidate) => candidate.id === open.conceptId);
      if (owner !== undefined && entry !== undefined) return { content: [pictureView(open, entry, labelOf(owner), register)], afterClose: header, confirming: true };
      mode = null;
    }

    // And the demo clip of a concept (card NG-56), while the concept is on the board and shown there.
    if (mode !== null && mode.kind === "demo") {
      const open = mode;
      const owner = profiles.find((profile) => profile.id === open.id);
      const board = owner === undefined ? null : await resolveBoard(current, owner.id, catalogue).catch(() => null);
      const entry = board?.entries.find((candidate) => candidate.id === open.conceptId);
      if (owner !== undefined && entry !== undefined) {
        const stored = await readDemoClip(current, owner.id, open.conceptId).catch((): StoredDemoClip => ({ state: "damaged", damage: "unreadable" }));
        return { content: [demoView(open, stored, labelOf(owner), register)], afterClose: header, confirming: true, demo: open };
      }
      mode = null;
    }

    // So does the rewording of a concept, while that concept is on the board and this version may write its entry.
    if (mode !== null && mode.kind === "reword") {
      const open = mode;
      const owner = profiles.find((profile) => profile.id === open.id);
      const board = owner === undefined ? null : await resolveBoard(current, owner.id, catalogue).catch(() => null);
      // An entry that turns out to be a newer app's while this is open is not shown by the board any more (a custom or
      // retired one) or shown with the app's text. The fields stay, with what was typed, for as long as the id is on
      // the board; saving says why it cannot.
      const entry = board?.entries.find((candidate) => candidate.id === open.conceptId)
        ?? (board?.profile.conceptIds.includes(open.conceptId) === true
          ? { id: open.conceptId, labelDe: open.title, speechDe: open.draft.speech, symbolPath: null, source: open.source }
          : undefined);
      if (owner !== undefined && entry !== undefined) {
        return { content: [rewordView(open, entry, labelOf(owner), register)], afterClose: header, confirming: true };
      }
      mode = null;
    }

    // And teaching a gesture, while the concept is on the board and shown there.
    if (mode !== null && mode.kind === "teach") {
      const open = mode;
      const owner = profiles.find((profile) => profile.id === open.id);
      const board = owner === undefined ? null : await resolveBoard(current, owner.id, catalogue).catch(() => null);
      const entry = board?.entries.find((candidate) => candidate.id === open.conceptId);
      if (owner !== undefined && entry !== undefined) {
        if (open.state.confirm !== null) {
          return { content: [teachConfirmView(open, open.state.confirm, entry, labelOf(owner), register, holds)], afterClose: header, confirming: true };
        }
        const listing = await listExamples(current, owner.id, open.conceptId).catch(() => null);
        // How a usable recording fits the profile's examples: worked out once per recording, from all of the profile's examples (card NG-4).
        const result = open.state.result;
        if (result !== null && result.usable && (open.state.fit === null || open.state.fit.result !== result)) {
          const all = await listExamples(current, owner.id).catch(() => null);
          const examples = all?.examples.map((example) => ({ conceptId: example.record.conceptId, sequence: example.sequence })) ?? null;
          open.state.fit = { result, fit: examples === null ? null : exampleFit(result.sequence, open.conceptId, examples) };
        }
        teachLabels = (conceptId) => {
          const known = board?.entries.find((candidate) => candidate.id === conceptId) ?? catalogue.find((concept) => concept.id === conceptId);
          return known === undefined ? "einen anderen Begriff dieses Profils" : quoted(known.labelDe);
        };
        return { content: [teachView(open, entry, labelOf(owner), listing, register)], afterClose: header, confirming: true, teaching: open };
      }
      mode = null;
    }

    const profileSection = element("section", "caregiver-section");
    const profilesHeading = element("h2", "", "Profile");
    profilesHeading.tabIndex = -1;
    register.set("profiles-heading", profilesHeading);
    profileSection.append(profilesHeading);
    if (listing.damaged.length > 0) profileSection.append(element("p", "caregiver-notice caregiver-damaged", damagedLine(listing.damaged.length)));
    if (profiles.length === 0) {
      // Damaged entries are not "no profile yet": the device is not new.
      profileSection.append(element("p", "caregiver-notice", listing.damaged.length > 0 ? ONLY_DAMAGED : NO_PROFILES));
    } else {
      const list = element("ul", "caregiver-profiles");
      for (const profile of profiles) list.append(profileCard(profile, labelOf(profile), activeId, register));
      profileSection.append(list);
      if (activeId === null) profileSection.append(element("p", "caregiver-notice caregiver-warning", NONE_ACTIVE));
    }
    // Card NG-58: a backup comes back here, also on a new device without any profile.
    const restore = button(BACKUP_RESTORE);
    restore.addEventListener("click", () => openMode({ kind: "backup-restore", id: "", draft: { busy: false, conflict: null } }, "restore-file"));
    register.set("restore", restore);
    profileSection.append(restore);

    const form = element("form", "caregiver-create");
    const nameLabel = element("label", "", "Name für ein neues Profil");
    nameLabel.htmlFor = "caregiver-new-name";
    const nameInput = nameField("caregiver-new-name", draftName);
    const nameShort = element("p", "caregiver-notice caregiver-name-notice", NAME_SHORT);
    nameShort.id = "caregiver-new-name-notice";
    nameInput.setAttribute("aria-describedby", nameShort.id);
    const submit = element("button", "caregiver-button", "Profil anlegen");
    submit.type = "submit";
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      if (!aimed(now())) return;
      createProfile(nameInput.value);
    });
    const more = element("details", "caregiver-details");
    more.append(element("summary", "", NAME_DETAILS), element("p", "caregiver-notice", NAME_NOTICE));
    // Folding moves what is below it: what comes under the finger has only just appeared.
    more.addEventListener("toggle", markSwap);
    form.append(nameLabel, nameInput, submit, nameShort, more);
    register.set("create-name", nameInput);
    profileSection.append(form);

    const content = [profileSection];
    const selected = profiles.find((profile) => profile.id === selectedId);
    if (selected !== undefined) content.push(await boardSection(current, selected, labelOf(selected), activeId, register));
    else if (profiles.length > 0) content.push(element("p", "caregiver-notice", SELECT_PROFILE));
    return { content, afterClose: header };
  };

  const close = (): Promise<void> => {
    if (!isOpen) return closing;
    const running = work;
    isOpen = false;
    session += 1;
    cancelIdle();
    // The next opening edits the active profile again, whatever was picked this time.
    selectedId = null;
    stopTeachCamera();
    teachLive = null;
    teachCameraLine = null;
    teachPreviewSlot = null;
    demoPreviewSlot = null;
    demoLine = null;
    mode = null;
    createDraft = "";
    dropHold();
    bodyHolds = [];
    closingNo += 1;
    const mine = closingNo;
    away = "waiting";
    // Names do not stay in the page. Until the board is the refreshed one,
    // nothing of it can be tapped: what the board region holds may be the
    // board of the profile that was active before.
    const line = element("p", "caregiver-notice", BOARD_LOADING);
    line.setAttribute("role", "status");
    line.setAttribute("aria-live", "polite");
    caregiverRegion.replaceChildren(line);
    markSwap();
    heading = null;
    topBlock = null;
    afterClose = null;
    status = null;
    undoBar = null;
    body = null;
    help = null;
    focusables = new Map();
    closing = new Promise((resolve) => {
      let cancelBound = (): void => undefined;
      /** Only while this closing is the latest and the area has not been opened since. */
      const showBoard = (): void => {
        cancelBound();
        if (mine === closingNo && away !== "no") {
          away = "no";
          caregiverRegion.hidden = true;
          caregiverRegion.replaceChildren();
          boardRegion.hidden = false;
          entry.hidden = false;
          opener.focus();
        }
        resolve();
      };
      /** The bound has passed: no board rather than a board that may be out of date. */
      const stall = (): void => {
        if (mine === closingNo && away === "waiting") {
          if (!boardMayBeStale()) {
            // Nothing can have changed what the board shows, or it shows examples: back to it.
            showBoard();
            return;
          }
          away = "stalled";
          line.textContent = NO_BOARD_YET;
          const retry = button(RELOAD_BOARD);
          let attempt = 0;
          retry.addEventListener("click", () => {
            attempt += 1;
            const thisAttempt = attempt;
            line.textContent = BOARD_LOADING;
            // The line changes its height, and with it the place of the button.
            markSwap();
            // Any refresh asked for now reads what is stored now, so its answer may show the board.
            void within(refreshBoard(), CLOSE_WAIT_MS).then((answer) => {
              if (answer !== TIMED_OUT) showBoard();
              else if (mine === closingNo && away === "stalled" && thisAttempt === attempt) {
                line.textContent = NO_BOARD_YET;
                markSwap();
              }
            });
          });
          caregiverRegion.replaceChildren(line, retry);
          markSwap();
          entry.hidden = false;
          retry.focus();
        }
        resolve();
      };
      try {
        cancelBound = setTimer(stall, CLOSE_WAIT_MS);
      } catch {
        // Without a timer closing waits for the refresh.
      }
      // A write that is still under way finishes first, so the board is read after it.
      void running.then(refreshBoard).then(showBoard);
    });
    return closing;
  };

  /** Starts the idle period again; when it passes without another event, the area closes. */
  const restartIdle = (): void => {
    cancelIdle();
    cancelIdle = () => undefined;
    if (!isOpen) return;
    const mine = session;
    try {
      cancelIdle = setTimer(() => {
        if (isOpen && mine === session) void close();
      }, IDLE_CLOSE_MS);
    } catch {
      // Without a timer the area stays open until it is closed by hand.
    }
  };
  caregiverRegion.addEventListener("pointerdown", restartIdle);

  // The press shield: a click counts only if its press began after what it lands on was on screen (`aimed`).
  // The listeners are on the region, in the capture phase, so that they hear every press and decide before any button does.
  const pointerPresses = new Map<number, number>();
  let lastPointerPress: number | null = null;
  let keyPress: { at: number; seenAt: number; upAt: number | null } | null = null;
  caregiverRegion.addEventListener("pointerdown", (event) => {
    const at = now();
    if (pointerPresses.size > 32) pointerPresses.clear();
    if (typeof event.pointerId === "number") pointerPresses.set(event.pointerId, at);
    lastPointerPress = at;
    // A second finger anywhere else is the way to back out of a hold: it ends every hold but one on the button it lands on.
    for (const held of bodyHolds) if (event.target !== held.control) held.cancel();
  }, true);
  caregiverRegion.addEventListener("keydown", (event) => {
    if (!isHoldKey(event.key)) return;
    const at = now();
    if (!event.repeat) keyPress = { at, seenAt: at, upAt: null };
    else if (keyPress !== null) keyPress.seenAt = at;
    // A repeat without a press seen here: the key went down somewhere else, before this content.
    else keyPress = { at: Number.NEGATIVE_INFINITY, seenAt: at, upAt: null };
  }, true);
  caregiverRegion.addEventListener("keyup", (event) => {
    if (isHoldKey(event.key) && keyPress !== null) keyPress.upAt = now();
  }, true);
  caregiverRegion.addEventListener("click", (event) => {
    // The summaries only fold and unfold text: nothing is lost by a press that was not aimed.
    const target = event.target as Partial<Element> | null;
    if (String(target?.tagName ?? "").toLowerCase() === "summary" || (typeof target?.closest === "function" && target.closest("summary") !== null)) return;
    const at = now();
    const id = (event as Partial<PointerEvent>).pointerId;
    const byPointer = typeof id === "number" ? id >= 0 : event.detail > 0;
    // A click without a press of its own (assistive technology, a script) begins when it arrives.
    let pressAt = at;
    if (byPointer) {
      // A pointer whose press this region did not see went down on something that is gone.
      pressAt = (typeof id === "number" ? pointerPresses.get(id) : lastPointerPress) ?? Number.NEGATIVE_INFINITY;
    } else if (keyPress !== null && (keyPress.upAt === null ? at - keyPress.seenAt <= KEY_STALE_MS : at - keyPress.upAt <= KEY_CLICK_WINDOW_MS)) {
      pressAt = keyPress.at;
    }
    if (aimed(pressAt)) return;
    event.preventDefault();
    event.stopPropagation();
  }, true);
  /** Events that Escape was already answered for: one that bubbles from the region reaches the document as well. */
  const answered = new WeakSet<object>();
  const onEscape = (event: KeyboardEvent): void => {
    // While an input method composes a character, Escape belongs to it.
    if (event.key !== "Escape" || !isOpen || event.isComposing === true || answered.has(event)) return;
    answered.add(event);
    event.preventDefault();
    // Escape leaves the innermost thing: an open rename field or confirmation first.
    if (mode !== null) {
      leaveMode();
      return;
    }
    // Then a text field with something typed into it: focus leaves the field, the text stays, the area stays open.
    const target = event.target as Partial<HTMLInputElement> | null | undefined;
    if (String(target?.tagName ?? "").toLowerCase() === "input" && target?.type === "text" && target.value !== "") {
      heading?.focus();
      return;
    }
    void close();
  };
  caregiverRegion.addEventListener("keydown", (event) => {
    restartIdle();
    onEscape(event);
  });
  // Also with the focus on nothing inside the area (after a tap on text, say). While the area is closed this does nothing.
  if (typeof document.addEventListener === "function") document.addEventListener("keydown", onEscape);
  // A message must not keep the block at the top tall while the caregiver reads on. Wheel and touch only: the area scrolls by itself after a focus move.
  caregiverRegion.addEventListener("wheel", clearOnScroll, { passive: true });
  caregiverRegion.addEventListener("touchmove", clearOnScroll, { passive: true });
  caregiverRegion.addEventListener("input", restartIdle);

  const open = (): boolean => {
    if (isOpen) return true;
    if (away === "waiting") return false;
    const startup = boardRegion.dataset["startup"];
    if (startup === undefined || startup === "pending") return false;
    away = "no";
    isOpen = true;
    session += 1;
    cancelRunningSpeech();

    // Stays at the top while the rest scrolls: the title, the board the child gets, the way out, and what was just done.
    const top = element("div", "caregiver-top");
    topBlock = top;
    const header = element("header", "caregiver-header");
    heading = element("h1", "caregiver-heading", OPEN_LABEL);
    heading.tabIndex = -1;
    afterClose = element("p", "caregiver-after-close");
    const closer = button(DONE, "caregiver-button caregiver-primary");
    closer.addEventListener("click", () => void close());
    header.append(heading, afterClose, closer);
    status = element("p", "caregiver-status", READING);
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");
    undoBar = element("div", "caregiver-undo");
    undoBar.hidden = true;
    top.append(header, status, undoBar);
    body = element("div", "caregiver-body");

    help = element("details", "caregiver-details caregiver-help");
    const reload = button(RELOAD_BOARD);
    reload.addEventListener("click", () => {
      begin();
      run(async () => {
        say(RELOADING);
        const answer = await within(refreshBoard(), CLOSE_WAIT_MS);
        // The board answers a failed refresh with the examples; that is not "reloaded".
        const startup = boardRegion.dataset["startup"];
        const fallback = boardRegion.dataset["boardFallback"];
        if (answer === TIMED_OUT || startup === "refresh-timeout") say(RELOAD_FAILED, true);
        else if (startup === "demo-unavailable" || fallback === "storage-unavailable") say(RELOAD_NO_STORAGE, true);
        else if (startup === "failed" || startup === "unrenderable" || fallback === "render-failed") say(RELOAD_NOT_DRAWN, true);
        else say(RELOADED);
        // Also after a read that failed earlier: the area shows what the store holds now.
        await draw(null);
      });
    });
    help.append(element("summary", "", HELP_SUMMARY), element("p", "caregiver-notice", RELOAD_HELP), reload, element("p", "caregiver-notice", VOICE_HELP));
    help.addEventListener("toggle", markSwap);

    boardRegion.hidden = true;
    entry.hidden = true;
    mode = null;
    // What an earlier visit removed is not offered again: the bar is new and the stack starts empty.
    undoStack = [];
    dropHold();
    bodyHolds = [];
    createDraft = "";
    statusIsError = false;
    statusStale = false;
    undoButton = null;
    removeGuard.reset();
    undoGuard.reset();
    caregiverRegion.replaceChildren(top, body, help);
    markSwap();
    caregiverRegion.hidden = false;
    heading.focus();
    restartIdle();
    run(async () => {
      // A store that does not answer must not leave the area on "wird gelesen" for good.
      const answer = await within(app.store(), STORE_WAIT_MS);
      store = answer === TIMED_OUT ? null : answer;
      say("");
      await draw(null);
    });
    return true;
  };

  const showIdle = (line: string): void => {
    progress.hidden = true;
    progress.value = 0;
    hint.textContent = line;
  };
  const openerHold = heldButton(opener, {
    durationMs: HOLD_DURATION_MS,
    allowed: () => true,
    onProgress: (elapsedMs, remainingSeconds) => {
      progress.hidden = false;
      progress.value = elapsedMs;
      const line = holdLine(remainingSeconds);
      if (hint.textContent !== line) hint.textContent = line;
    },
    onIdle: (reason) => showIdle(reason === "released" ? HOLD_HINT : ""),
    act: () => showIdle(open() ? "" : STILL_STARTING),
  });
  // An open area must not be left behind on a device that is put away or handed to the child.
  (options.onPageHidden ?? defaultPageHidden)(() => {
    openerHold.cancel();
    if (isOpen) void close();
  });

  entry.replaceChildren(opener, progress, hint);
  entry.hidden = false;

  return {
    open,
    close,
    isOpen: () => isOpen,
    async settled() {
      // Work may queue more work; wait until the queue stands still.
      let seen: Promise<void> | null = null;
      while (seen !== work) {
        seen = work;
        await seen;
      }
    },
  };
}
