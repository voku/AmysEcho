/**
 * Recognising a gesture on the child's board (card NG-20, docs/recognise.md).
 *
 * The child taps "Gebärde" on the board. Only then the camera starts, through
 * the capture module's bridge (as teaching does, card NG-19); after a short
 * countdown one attempt is recorded until "Stopp" or a time limit, the camera
 * stops, and the attempt is compared with the active profile's examples.
 *
 * Speaking a wrong word is the worst failure (docs/recognition.md, "Known
 * limits"), so nothing is ever spoken here without a confirming tap:
 * - a match is shown large, with "Ja, sagen" and "Nein"; only "Ja, sagen"
 *   speaks, through the board's own tile path (`MountedBoard.say`);
 * - an unknown answer says so and offers up to three candidates from
 *   `rankConcepts` (through `matchGesture`'s ranking); a tap on one speaks it
 *   like a tile;
 * - an unusable recording is refused with a short reason and "Nochmal".
 *
 * Nothing is stored or sent: the tracked frames of the attempt live in memory
 * until it has been compared, and no picture is ever kept (capture.md).
 *
 * Always the front camera (card NG-43, second build): the child uses the board
 * alone, facing the screen, and only the front camera sees the child there.
 * The "vorne / hinten" choice of teaching and the camera test is never read
 * here: after a parent taught with "hinten", it would point the camera away
 * from the child, every attempt would end in "no hands", and the child could
 * not tell why. For the same reason a front camera that does not open is not
 * replaced by the back one (`fallback: false`): the capture's own problem line
 * says so instead.
 *
 * A live preview (card NG-44): while the camera runs (countdown and
 * recording) the view shows the camera's picture, mirrored, with the tracked
 * hands ("L"/"R") and shoulders drawn over it, the preview of teaching and
 * the camera test (card NG-42), so whoever makes the gesture sees whether the
 * hands are in the picture. It comes from the bridge (`createPreview`); a
 * bridge without one, or a preview that fails, leaves the view as before.
 * Nothing of the picture is kept or sent.
 *
 * Feedback without reading (card NG-45): under the picture, two hand symbols
 * light up for the hands the camera sees (the frame turns green with a hand,
 * orange without), and five dots stand for the seconds of the recording; one
 * goes out each second. Words are there too, for a caregiver, but nothing has
 * to be read. Nothing moves: the dots change in steps, the row keeps its size.
 *
 * The controller (`createRecogniser`) has no DOM and is tested in Node; the
 * view (`attachRecognise`) draws its states into the board region.
 */
import type { BoardEntry } from "../board-data.js";
import type { MountedBoard } from "../board.js";
import type { CaptureBridge, CapturePreview, CaptureProblem, CaptureSession, PreviewSink } from "../capture/capture.js";
import { sequenceFromRecording } from "../recognition/examples.js";
import type { FeatureFailure, HandKind } from "../recognition/features.js";
import { DEFAULT_MIN_MARGIN, calibrateMaxDistance, matchGesture } from "../recognition/matcher.js";
import type { GestureExample, UnknownReason } from "../recognition/matcher.js";
import { toLandmarkFrame } from "../recognition/tracker-adapter.js";
import type { TrackerFrame } from "../recognition/tracker-adapter.js";

/** Seconds counted down after the camera runs and before frames are kept, so the hand that tapped can leave the picture. As in teaching. */
export const RECOGNISE_COUNTDOWN_S = 3;
/** One attempt is recorded for at most this long; "Stopp" ends it sooner. A guess, not tried with a child. */
export const RECOGNISE_MAX_RECORDING_MS = 5000;
/**
 * A press on a control of a view that appeared less than this long ago, or
 * that began before then, was aimed at what was there before ("Stopp" and
 * "Ja, sagen" can be at the same place). It is ignored. The board ignores
 * presses for as long after the view closed. A guess.
 */
export const RECOGNISE_GUARD_MS = 700;
/** The dots of the recording's time: one per second of `RECOGNISE_MAX_RECORDING_MS`. */
export const RECOGNISE_SECONDS = Math.ceil(RECOGNISE_MAX_RECORDING_MS / 1000);
/** How many candidates an unknown answer offers at most. */
export const MAX_CANDIDATES = 3;
/**
 * The global name of the capture bridge (`CAPTURE_BRIDGE_KEY` in the capture
 * module; a test compares them). This module does not import the capture
 * module: a failure in it must never stop the board.
 */
export const CAPTURE_BRIDGE_KEY = "amysEchoCapture";

/** Everything the child's screen says here. German, short, and nothing needs to be read to go on. */
export const RECOGNISE_TEXT = {
  start: "Gebärde",
  title: "Gebärde",
  back: "Zurück zur Tafel",
  countdown: (left: number): string =>
    `Gleich geht’s los: ${Array.from({ length: RECOGNISE_COUNTDOWN_S }, (_, at) => RECOGNISE_COUNTDOWN_S - at).filter((step) => step >= left).join(" … ")}`,
  recording: "Jetzt die Gebärde machen.",
  finish: "Stopp",
  question: "Meinst du das?",
  yes: "Ja, sagen",
  no: "Nein",
  unknown: "Das habe ich nicht verstanden.",
  candidates: "Vielleicht eins davon?",
  again: "Nochmal",
  noCamera: "Die Kamera kann gerade nicht starten. Die Tafel geht auch ohne Kamera.",
  /**
   * The capture's problems, short and for this view: its retry is "Nochmal", not "Kamera starten"
   * (the capture's own texts name that button of the camera test and teaching).
   */
  problems: {
    denied: "Die Kamera ist nicht erlaubt. Eine Bezugsperson kann sie in den Einstellungen erlauben.",
    no_camera: "Es wurde keine Kamera gefunden.",
    busy: "Die Kamera ist gerade besetzt. Bitte „Nochmal“ tippen.",
    unsupported: "Dieser Browser kann die Kamera nicht benutzen.",
    tracker_download: "Die Handerkennung braucht beim ersten Mal Internet. Mit Internet „Nochmal“ tippen.",
    tracker_storage: "Für die Handerkennung ist nicht genug Speicher frei.",
    tracker_timeout: "Die Handerkennung lädt nicht weiter. Bitte „Nochmal“ tippen.",
    tracker_unavailable: "Die Handerkennung startet gerade nicht.",
    tracker_failed: "Die Handerkennung ist ausgefallen. Bitte „Nochmal“ tippen.",
  } satisfies Record<CaptureProblem, string>,
  stopped: "Die Kamera ist ausgegangen. Bitte „Nochmal“ tippen.",
  /** Under the picture while the camera runs (card NG-45), for a caregiver; the child sees the hand symbols. */
  seen: ["Keine Hand im Bild", "Eine Hand im Bild", "Zwei Hände im Bild"],
  /** The accessible name of the dots: the seconds left of the recording. */
  timeLeft: (seconds: number): string => (seconds === 1 ? "Noch 1 Sekunde" : `Noch ${seconds} Sekunden`),
  unusable: {
    no_frames: "Die Kamera hat kein Bild geschickt.",
    bad_timestamps: "Die Aufnahme hat nicht geklappt.",
    bad_landmarks: "Die Aufnahme hat nicht geklappt.",
    no_hands: "Ich habe keine Hand gesehen.",
    too_short: "Das war zu kurz.",
    hands_unclear: "Ich konnte die Hände nicht gut sehen.",
    hand_lost: "Eine Hand war zu lange weg.",
  } satisfies Record<FeatureFailure, string>,
} as const;

/** What one attempt came to. */
export type AttemptOutcome =
  | { readonly kind: "match"; readonly conceptId: string; readonly hands: HandKind }
  | { readonly kind: "unknown"; readonly reason: UnknownReason; readonly candidates: readonly string[]; readonly hands: HandKind }
  | { readonly kind: "unusable"; readonly reason: FeatureFailure };

/**
 * One recorded attempt against the examples: the feature builder, then the
 * matcher with limits calibrated from the examples. One-hand and two-hand
 * attempts are compared only with examples of the same kind (matcher rules).
 */
export function analyseAttempt(frames: readonly TrackerFrame[], examples: readonly GestureExample[], maxDistance: ReadonlyMap<string, number> = calibrateMaxDistance(examples)): AttemptOutcome {
  const recording = sequenceFromRecording(frames);
  if (!recording.ok) return { kind: "unusable", reason: recording.reason };
  const { hands } = recording.sequence;
  const result = matchGesture(recording.sequence, examples, { maxDistance, minMargin: DEFAULT_MIN_MARGIN });
  if (result.kind === "match") return { kind: "match", conceptId: result.conceptId, hands };
  return { kind: "unknown", reason: result.reason, candidates: result.ranked.slice(0, MAX_CANDIDATES).map((entry) => entry.conceptId), hands };
}

/** No match: why, and up to `MAX_CANDIDATES` concepts of the board to choose from. */
export interface UnknownState { readonly kind: "unknown"; readonly reason: UnknownReason; readonly candidates: readonly string[]; readonly hands: HandKind }

/** How many hands the camera sees: none, one or two (the tracker's usable hands, sided as in the preview). */
export type HandsSeen = 0 | 1 | 2;

/** The hands of one tracked frame as the preview draws them (`toLandmarkFrame`). */
export function handsSeen(frame: TrackerFrame): HandsSeen {
  try {
    const sided = toLandmarkFrame(frame, frame.timestampMs);
    return ((sided.left === null ? 0 : 1) + (sided.right === null ? 0 : 1)) as HandsSeen;
  } catch {
    return 0;
  }
}

export type RecogniseState =
  /** The board is shown; the camera is off. */
  | { readonly kind: "idle" }
  /** The tracker loads or the camera is asked for. `line` is the capture's own text for the step. */
  | { readonly kind: "starting"; readonly line: string }
  | { readonly kind: "countdown"; readonly left: number }
  | { readonly kind: "recording" }
  /** `hands`: which hands the attempt showed (one-hand and two-hand attempts are compared with examples of their kind only). */
  /**
   * `from`: the unknown answer whose candidate the child tapped; "Nein" goes back to it. Absent
   * when the matcher itself proposed the concept; "Nein" then goes back to the board.
   */
  | { readonly kind: "confirm"; readonly conceptId: string; readonly hands: HandKind; readonly from?: UnknownState }
  | UnknownState
  | { readonly kind: "unusable"; readonly reason: FeatureFailure }
  /** The camera or tracker could not start or failed; `line` says why. */
  | { readonly kind: "problem"; readonly line: string };

/** Calls `callback` once after `milliseconds`; the returned function cancels that. */
export type SetTimer = (callback: () => void, milliseconds: number) => () => void;

export interface RecogniserOptions {
  /** The profile's examples of concepts on the board. Others are dropped. */
  readonly examples: readonly GestureExample[];
  /** The concept ids of the board's tiles: only those can be confirmed or offered. */
  readonly onBoard: ReadonlySet<string>;
  /** The capture bridge, looked up when the camera is to start; null when the capture module did not load. */
  readonly bridge: () => CaptureBridge | null;
  /** Receives the hidden video element of the capture. */
  readonly host: () => HTMLElement;
  readonly setTimer: SetTimer;
  /** Milliseconds from a steady clock, for the press guard. */
  readonly now: () => number;
  /** Does what a tap on the concept's tile does. Called only from "Ja, sagen" or a candidate. */
  readonly speak: (conceptId: string) => void;
  readonly onChange: (state: RecogniseState) => void;
  /** False while the board region is not on screen (the caregiver area took over): the attempt ends. */
  readonly stillShown?: () => boolean;
  /**
   * A live preview for one camera start (card NG-44), or null for none. Asked once per start,
   * before the camera; the capture closes it when it ends, and so does the controller.
   */
  readonly preview?: (bridge: CaptureBridge) => PreviewSink | null;
  /**
   * Card NG-45: how many hands each tracked frame shows, while the countdown or the recording is
   * on screen. Called on every frame, without a redraw; `onChange` is not called for it.
   */
  readonly onSeen?: (hands: HandsSeen) => void;
  /**
   * Card NG-45: the whole seconds of the recording still left, from `RECOGNISE_SECONDS` when it
   * starts down to 1; called once a second, without a redraw (a redraw would reset the press guard).
   */
  readonly onTimeLeft?: (seconds: number) => void;
  /** Replaces `analyseAttempt`; for tests. */
  readonly analyse?: (frames: readonly TrackerFrame[]) => AttemptOutcome;
}

export interface Recogniser {
  state(): RecogniseState;
  /** "Gebärde" on the board, and "Nochmal": starts the camera. `pressAt` is when the press began (default now). */
  start(pressAt?: number): void;
  /** "Stopp": ends the recording now. */
  finish(pressAt?: number): void;
  /** "Ja, sagen": back to the board, which then speaks the concept once. */
  confirm(pressAt?: number): void;
  /** "Nein": back to the board, or to the candidates the concept was chosen from; nothing spoken. */
  reject(pressAt?: number): void;
  /** A candidate of an unknown answer: the confirm view for it ("Nein" returns to the candidates). Speaks nothing. */
  choose(conceptId: string, pressAt?: number): void;
  /** "Zurück zur Tafel", from every state: camera off, nothing spoken. Always takes effect. */
  back(): void;
  /** Like `back`, without telling `onChange`: the board is being replaced. */
  dispose(): void;
}

interface Camera {
  readonly controller: AbortController;
  session: CaptureSession | null;
  cancelTimer: () => void;
  /** The once-a-second tick of the recording's time (card NG-45). */
  cancelTick: () => void;
  readonly preview: PreviewSink | null;
}

export function createRecogniser(options: RecogniserOptions): Recogniser {
  const examples = options.examples.filter((example) => options.onBoard.has(example.conceptId));
  const maxDistance = calibrateMaxDistance(examples);
  const analyse = options.analyse ?? ((frames: readonly TrackerFrame[]) => analyseAttempt(frames, examples, maxDistance));
  let current: RecogniseState = { kind: "idle" };
  let shownAt = Number.NEGATIVE_INFINITY;
  let camera: Camera | null = null;
  let disposed = false;

  const show = (next: RecogniseState, redraw = true): void => {
    current = next;
    shownAt = options.now();
    if (redraw && !disposed) options.onChange(next);
  };
  /** A press that began before the view was there, or too soon after, was aimed at the view before. */
  const aimed = (pressAt: number | undefined): boolean => (pressAt ?? options.now()) >= shownAt + RECOGNISE_GUARD_MS;

  /** Ends the camera at whatever step it is: tracker loading, permission asked, countdown, recording. A recording is dropped. */
  const stopCamera = (): TrackerFrame[] => {
    const running = camera;
    if (running === null) return [];
    camera = null;
    running.cancelTimer();
    running.cancelTick();
    const frames = running.session?.stopRecording() ?? [];
    running.controller.abort();
    running.session?.stop();
    // The capture closes its preview when it ends; a start cancelled before the camera opened never showed it.
    try {
      running.preview?.close();
    } catch {
      // Nothing: the preview only shows.
    }
    return frames;
  };

  const leave = (): void => {
    stopCamera();
    if (current.kind !== "idle") show({ kind: "idle" });
  };

  /** The attempt ends because the board is no longer shown. */
  const gone = (): boolean => {
    if (options.stillShown === undefined || options.stillShown()) return false;
    leave();
    return true;
  };

  const schedule = (own: Camera, callback: () => void, milliseconds: number): void => {
    own.cancelTimer();
    try {
      own.cancelTimer = options.setTimer(callback, milliseconds);
    } catch {
      own.cancelTimer = () => undefined;
      callback();
    }
  };

  const finishRecording = (): void => {
    const own = camera;
    if (own === null || current.kind !== "recording") return;
    const frames = stopCamera();
    let outcome: AttemptOutcome;
    try {
      outcome = analyse(frames);
    } catch {
      outcome = { kind: "unusable", reason: "bad_landmarks" };
    }
    if (outcome.kind === "unusable") {
      show({ kind: "unusable", reason: outcome.reason });
    } else if (outcome.kind === "match" && options.onBoard.has(outcome.conceptId)) {
      show({ kind: "confirm", conceptId: outcome.conceptId, hands: outcome.hands });
    } else {
      const reason = outcome.kind === "unknown" ? outcome.reason : "too_far";
      const candidates = outcome.kind === "unknown" ? outcome.candidates : [];
      show({ kind: "unknown", reason, candidates: candidates.filter((id) => options.onBoard.has(id)).slice(0, MAX_CANDIDATES), hands: outcome.hands });
    }
  };

  const countdown = (own: Camera, left: number): void => {
    if (camera !== own || gone()) return;
    if (left > 0) {
      show({ kind: "countdown", left });
      schedule(own, () => countdown(own, left - 1), 1000);
      return;
    }
    own.session?.startRecording();
    show({ kind: "recording" });
    schedule(own, () => {
      if (camera === own && !gone()) finishRecording();
    }, RECOGNISE_MAX_RECORDING_MS);
    tick(own, RECOGNISE_SECONDS);
  };

  /** Tells the view the seconds left, now and then once a second; the last second ends with the recording. */
  const tick = (own: Camera, left: number): void => {
    if (camera !== own || current.kind !== "recording") return;
    try {
      options.onTimeLeft?.(left);
    } catch {
      // Only a display.
    }
    if (left <= 1) return;
    try {
      own.cancelTick = options.setTimer(() => tick(own, left - 1), 1000);
    } catch {
      own.cancelTick = () => undefined;
    }
  };

  const startCamera = (): void => {
    stopCamera();
    let bridge: CaptureBridge | null;
    try {
      bridge = options.bridge();
    } catch {
      bridge = null;
    }
    if (bridge === null) {
      show({ kind: "problem", line: RECOGNISE_TEXT.noCamera });
      return;
    }
    const text = bridge.text;
    let preview: PreviewSink | null = null;
    try {
      preview = options.preview?.(bridge) ?? null;
    } catch {
      // Without a preview the view works as before.
    }
    const own: Camera = { controller: new AbortController(), session: null, cancelTimer: () => undefined, cancelTick: () => undefined, preview };
    camera = own;
    const ours = (): boolean => camera === own && !own.controller.signal.aborted;
    const failed = (line: string): void => {
      if (camera !== own) return;
      stopCamera();
      show({ kind: "problem", line });
    };
    show({ kind: "starting", line: text.preparing });
    let started: ReturnType<CaptureBridge["start"]>;
    try {
      started = bridge.start(options.host(), {
        signal: own.controller.signal,
        // The front camera only, and no other in its place: a back camera cannot see a child facing the screen.
        facing: "user",
        fallback: false,
        ...(preview === null ? {} : { preview }),
        onStep: (step) => {
          if (!ours() || current.kind !== "starting" || (step !== "preparing" && step !== "asking")) return;
          show({ kind: "starting", line: text[step] });
        },
        onFrame: (frame) => {
          if (!ours() || gone()) return;
          if (options.onSeen === undefined || (current.kind !== "countdown" && current.kind !== "recording")) return;
          try {
            options.onSeen(handsSeen(frame));
          } catch {
            // Only a display.
          }
        },
      });
    } catch {
      failed(RECOGNISE_TEXT.problems.tracker_unavailable);
      return;
    }
    void Promise.resolve(started).then((answer) => {
      if (!answer.ok) {
        if ("problem" in answer) failed(RECOGNISE_TEXT.problems[answer.problem]);
        else if (camera === own) leave();
        return;
      }
      if (!ours()) {
        answer.session.stop();
        return;
      }
      own.session = answer.session;
      void answer.session.ended.then((end) => {
        // Ended by this module (a way out, or after the attempt): nothing to say.
        if (camera !== own) return;
        failed(end.kind === "problem" ? RECOGNISE_TEXT.problems[end.problem] : RECOGNISE_TEXT.stopped);
      });
      countdown(own, RECOGNISE_COUNTDOWN_S);
    }, () => failed(RECOGNISE_TEXT.problems.tracker_unavailable));
  };

  return {
    state: () => current,
    start(pressAt) {
      if (disposed) return;
      if (current.kind === "idle") {
        startCamera();
        return;
      }
      if ((current.kind === "unusable" || current.kind === "problem") && aimed(pressAt)) startCamera();
    },
    finish(pressAt) {
      if (current.kind === "recording" && aimed(pressAt)) finishRecording();
    },
    confirm(pressAt) {
      if (current.kind !== "confirm" || !aimed(pressAt)) return;
      const { conceptId } = current;
      // The view goes first, so a second tap finds nothing to confirm: spoken once.
      show({ kind: "idle" });
      options.speak(conceptId);
    },
    reject(pressAt) {
      if (current.kind !== "confirm" || !aimed(pressAt)) return;
      // A candidate's "Nein" goes back to the candidates: the child was choosing among them.
      show(current.from ?? { kind: "idle" });
    },
    choose(conceptId, pressAt) {
      if (current.kind !== "unknown" || !current.candidates.includes(conceptId) || !aimed(pressAt)) return;
      // Nothing is spoken from the view without "Ja, sagen": a candidate is asked about like a match.
      show({ kind: "confirm", conceptId, hands: current.hands, from: current });
    },
    back: leave,
    dispose() {
      disposed = true;
      stopCamera();
      current = { kind: "idle" };
    },
  };
}

// ---------------------------------------------------------------------------
// The view.

export interface AttachOptions {
  /** The board region. */
  readonly root: HTMLElement;
  /** The board mounted with a gesture control whose tap calls `open` of the result. */
  readonly board: MountedBoard;
  readonly entries: readonly BoardEntry[];
  readonly examples: readonly GestureExample[];
  /** The capture bridge; default the one `capture/capture.js` leaves under `CAPTURE_BRIDGE_KEY`, looked up on each start. For tests. */
  readonly capture?: CaptureBridge | null;
  readonly setTimer?: SetTimer;
  readonly now?: () => number;
}

export interface AttachedRecogniser {
  /** The tap on "Gebärde". */
  open(): void;
  /** The board is being replaced: camera off, listeners gone, nothing drawn. */
  dispose(): void;
  readonly recogniser: Recogniser;
}

function element(tag: string, className: string, text = ""): HTMLElement {
  const node = document.createElement(tag);
  node.className = className;
  node.textContent = text;
  return node;
}

function button(className: string, text: string): HTMLElement {
  const node = element("button", className, text);
  (node as HTMLButtonElement).type = "button";
  return node;
}

/** The picture and the label of a concept, as on its tile. */
function conceptContent(target: HTMLElement, entry: BoardEntry, size: number): void {
  if (entry.symbolPath !== null) {
    const symbol = document.createElement("img") as HTMLImageElement;
    symbol.src = entry.symbolPath;
    symbol.alt = "";
    symbol.width = size;
    symbol.height = size;
    symbol.draggable = false;
    target.append(symbol);
  }
  target.append(element("span", "", entry.labelDe));
}

/** The symbols on the view's buttons, for a child who does not read: the text stays next to them. */
export const RECOGNISE_SYMBOLS = { yes: "✓", no: "✗", finish: "■", again: "↻" } as const;

/**
 * A big button of the view: a symbol first, then the text; `picture` (the
 * concept's symbol) between them on "Ja, sagen", so the child sees what will
 * be said. The accessible name is the text alone.
 */
function actionButton(className: string, symbol: string, text: string, picture: string | null = null): HTMLElement {
  const node = button(`recognise-action ${className}`, "");
  node.setAttribute("aria-label", text);
  const mark = element("span", "recognise-mark", symbol);
  mark.setAttribute("aria-hidden", "true");
  node.append(mark);
  if (picture !== null) {
    const image = document.createElement("img") as HTMLImageElement;
    image.className = "recognise-action-picture";
    image.src = picture;
    image.alt = "";
    image.width = 40;
    image.height = 40;
    image.draggable = false;
    node.append(image);
  }
  node.append(element("span", "recognise-action-text", text));
  return node;
}

const defaultTimer: SetTimer = (callback, milliseconds) => {
  const timer = setTimeout(callback, milliseconds);
  return () => clearTimeout(timer);
};

/**
 * Draws the recogniser into the board region. While it is not idle the board
 * is covered by one framed view (`section.recognise`): "Zurück zur Tafel" at
 * the top, always at the same place; the text and pictures of the state in
 * the middle; the state's buttons at the bottom.
 */
export function attachRecognise(options: AttachOptions): AttachedRecogniser {
  const { root, board } = options;
  const now = options.now ?? ((): number => performance.now());
  const byId = new Map(options.entries.map((entry) => [entry.id, entry]));

  const panel = element("section", "recognise");
  panel.setAttribute("aria-label", RECOGNISE_TEXT.title);
  const top = element("div", "recognise-top");
  const back = button("recognise-back", RECOGNISE_TEXT.back);
  top.append(back);
  // The state's content and its buttons: one above the other in a window held upright, side by side in a wide one (style sheet).
  const body = element("div", "recognise-body");
  const main = element("div", "recognise-main");
  const actions = element("div", "recognise-actions");
  body.append(main, actions);
  panel.append(top, body);
  /** The preview of the current camera start (card NG-44); shown while the camera runs. */
  let preview: CapturePreview | null = null;
  /** The box the preview sits in, the same for countdown and recording, so the picture does not jump. */
  const previewSlot = element("div", "recognise-preview");
  /**
   * Card NG-45: the row under the picture, the same element for countdown and recording: two hand
   * symbols (lit for each hand seen) with words for a caregiver, and one dot per second of the
   * recording (all lit in the countdown, one goes out each second while recording).
   */
  const feedback = element("div", "recognise-feedback");
  const seenBox = element("div", "recognise-seen");
  const seenHands = [element("span", "recognise-seen-hand", "✋"), element("span", "recognise-seen-hand", "✋")];
  for (const hand of seenHands) hand.setAttribute("aria-hidden", "true");
  const seenText = element("span", "recognise-seen-text");
  seenBox.append(...seenHands, seenText);
  const timeBox = element("div", "recognise-time");
  timeBox.setAttribute("role", "img");
  const timeDots = Array.from({ length: RECOGNISE_SECONDS }, () => element("span", "recognise-time-dot"));
  timeBox.append(...timeDots);
  feedback.append(seenBox, timeBox);
  /** The hands seen last; shown again when the view is redrawn. */
  let seen: HandsSeen = 0;
  const showSeen = (hands: HandsSeen): void => {
    seen = hands;
    panel.dataset["seen"] = String(hands);
    feedback.dataset["seen"] = String(hands);
    seenHands.forEach((hand, index) => { hand.dataset["lit"] = String(index < hands); });
    seenText.textContent = RECOGNISE_TEXT.seen[hands];
  };
  const showTimeLeft = (seconds: number): void => {
    const left = Math.max(0, Math.min(RECOGNISE_SECONDS, seconds));
    timeDots.forEach((dot, index) => { dot.dataset["lit"] = String(index < left); });
    timeBox.dataset["left"] = String(left);
    timeBox.setAttribute("aria-label", RECOGNISE_TEXT.timeLeft(left));
  };

  /** When the latest press on the view began; a click without a pointer (a key) counts from the click. */
  let pressedAt: number | null = null;
  const pressStart = (): number => {
    const at = pressedAt ?? now();
    pressedAt = null;
    return at;
  };
  panel.addEventListener("pointerdown", () => { pressedAt = now(); });
  panel.addEventListener("contextmenu", (event: Event) => event.preventDefault());

  const draw = (state: RecogniseState): void => {
    panel.dataset["state"] = state.kind;
    delete panel.dataset["concept"];
    delete panel.dataset["reason"];
    delete panel.dataset["hands"];
    delete panel.dataset["from"];
    if (state.kind !== "countdown" && state.kind !== "recording") delete panel.dataset["seen"];
    // The camera is off in every other state; its preview was closed with it. While it starts the
    // preview waits in the box, which is shown from the countdown on.
    if (state.kind !== "starting" && state.kind !== "countdown" && state.kind !== "recording") previewSlot.replaceChildren();
    if (state.kind === "idle") {
      board.uncover();
      return;
    }
    const line = element("p", "recognise-line");
    line.setAttribute("role", "status");
    line.setAttribute("aria-live", "polite");
    const content: HTMLElement[] = [line];
    const buttons: HTMLElement[] = [];
    switch (state.kind) {
      case "starting":
      case "problem":
        // A new camera start: nothing seen yet, the whole time ahead.
        if (state.kind === "starting") {
          showSeen(0);
          showTimeLeft(RECOGNISE_SECONDS);
        }
        line.textContent = state.line;
        if (state.kind === "problem") buttons.push(againButton());
        break;
      case "countdown":
        line.textContent = RECOGNISE_TEXT.countdown(state.left);
        if (preview === null) {
          content.push(element("p", "recognise-count", String(state.left)));
        } else {
          // The number large over the picture: the picture keeps its size from the countdown into the recording.
          previewSlot.replaceChildren(preview.element, element("p", "recognise-count", String(state.left)));
          content.push(previewSlot);
        }
        showSeen(seen);
        content.push(feedback);
        break;
      case "recording": {
        line.textContent = RECOGNISE_TEXT.recording;
        if (preview !== null) {
          previewSlot.replaceChildren(preview.element);
          content.push(previewSlot);
        }
        showSeen(seen);
        content.push(feedback);
        const finish = actionButton("recognise-finish", RECOGNISE_SYMBOLS.finish, RECOGNISE_TEXT.finish);
        finish.addEventListener("click", () => recogniser.finish(pressStart()));
        buttons.push(finish);
        break;
      }
      case "confirm": {
        panel.dataset["concept"] = state.conceptId;
        panel.dataset["hands"] = state.hands;
        line.textContent = RECOGNISE_TEXT.question;
        const entry = byId.get(state.conceptId);
        const shown = element("div", "recognise-concept");
        if (entry !== undefined) conceptContent(shown, entry, 160);
        content.push(shown);
        if (state.from !== undefined) panel.dataset["from"] = "candidates";
        const no = actionButton("recognise-no", RECOGNISE_SYMBOLS.no, RECOGNISE_TEXT.no);
        no.addEventListener("click", () => recogniser.reject(pressStart()));
        const yes = actionButton("recognise-yes", RECOGNISE_SYMBOLS.yes, RECOGNISE_TEXT.yes, entry?.symbolPath ?? null);
        yes.addEventListener("click", () => recogniser.confirm(pressStart()));
        buttons.push(no, yes);
        break;
      }
      case "unknown": {
        panel.dataset["reason"] = state.reason;
        panel.dataset["hands"] = state.hands;
        line.textContent = RECOGNISE_TEXT.unknown;
        if (state.candidates.length > 0) {
          content.push(element("p", "recognise-hint", RECOGNISE_TEXT.candidates));
          const list = element("div", "recognise-candidates");
          list.setAttribute("role", "group");
          list.setAttribute("aria-label", RECOGNISE_TEXT.candidates);
          for (const id of state.candidates) {
            const entry = byId.get(id);
            if (entry === undefined) continue;
            const tile = button(entry.symbolPath === null ? "concept concept-text recognise-candidate" : "concept recognise-candidate", "");
            tile.setAttribute("aria-label", entry.labelDe);
            tile.dataset["concept"] = id;
            conceptContent(tile, entry, 64);
            tile.addEventListener("click", () => recogniser.choose(id, pressStart()));
            list.append(tile);
          }
          content.push(list);
        }
        break;
      }
      case "unusable":
        panel.dataset["reason"] = state.reason;
        line.textContent = RECOGNISE_TEXT.unusable[state.reason];
        buttons.push(againButton());
        break;
    }
    main.replaceChildren(...content);
    actions.replaceChildren(...buttons);
    if (!board.isCovered()) {
      board.cover(panel);
      // The control that opened the view is hidden now: the focus goes to the way back.
      if (typeof back.focus === "function") back.focus();
    }
  };
  const againButton = (): HTMLElement => {
    const again = actionButton("recognise-again", RECOGNISE_SYMBOLS.again, RECOGNISE_TEXT.again);
    again.addEventListener("click", () => recogniser.start(pressStart()));
    return again;
  };

  const hiddenPage = (): boolean => typeof document !== "undefined" && document.visibilityState === "hidden";
  const recogniser = createRecogniser({
    examples: options.examples,
    onBoard: new Set(byId.keys()),
    bridge: () => (options.capture === undefined
      ? ((globalThis as Record<string, unknown>)[CAPTURE_BRIDGE_KEY] as CaptureBridge | undefined) ?? null
      : options.capture),
    host: () => panel,
    preview: (bridge) => {
      // A preview of an earlier start is gone even when this one cannot be made (card NG-45).
      preview = null;
      previewSlot.replaceChildren();
      // The picture is mirrored for the front camera, which this view always uses.
      const made = typeof bridge.createPreview === "function" ? bridge.createPreview(document) : null;
      if (made === null) return null;
      preview = made;
      previewSlot.append(made.element);
      return {
        show(stream, facing) {
          try {
            made.show(stream, facing);
          } catch (error) {
            // No picture after all: the view goes on as without a preview, not with an empty box.
            if (preview === made) {
              preview = null;
              previewSlot.replaceChildren();
            }
            try {
              made.close();
            } catch {
              // Nothing more to undo.
            }
            throw error;
          }
        },
        draw: (frame) => made.draw(frame),
        close: () => made.close(),
      };
    },
    setTimer: options.setTimer ?? defaultTimer,
    now,
    speak: (conceptId) => { board.say(conceptId); },
    onChange: draw,
    onSeen: (hands) => { if (hands !== seen) showSeen(hands); },
    onTimeLeft: showTimeLeft,
    stillShown: () => !root.hidden && !hiddenPage(),
  });
  back.addEventListener("click", () => {
    pressedAt = null;
    recogniser.back();
  });

  // The camera never runs in the background: hiding the page or leaving it ends the attempt.
  const onHidden = (): void => {
    if (hiddenPage()) recogniser.back();
  };
  const onPageHide = (): void => recogniser.back();
  const listen = typeof document !== "undefined" && typeof document.addEventListener === "function";
  if (listen) document.addEventListener("visibilitychange", onHidden);
  if (typeof window !== "undefined" && typeof window.addEventListener === "function") window.addEventListener("pagehide", onPageHide);

  return {
    open: () => recogniser.start(),
    dispose() {
      recogniser.dispose();
      if (listen && typeof document.removeEventListener === "function") document.removeEventListener("visibilitychange", onHidden);
      if (typeof window !== "undefined" && typeof window.removeEventListener === "function") window.removeEventListener("pagehide", onPageHide);
    },
    recogniser,
  };
}
