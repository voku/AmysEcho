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
 * Its own camera (card NG-49, revising NG-43): the front camera unless it is
 * switched in this view ("Kamera: vorne / hinten" at the top), so a child can
 * film itself and a caregiver can film the child with the back camera. The
 * choice is remembered on the device under its own key (`RECOGNISE_FACING_KEY`);
 * the "vorne / hinten" choice of teaching and the camera test is never read
 * here: after a parent taught with "hinten", it would point the camera away
 * from a child using the board alone. A camera that does not open is not
 * replaced by the other one (`fallback: false`): the problem line says so, and
 * the switch stays, so the other camera can be chosen.
 *
 * A live preview (card NG-44): while the camera runs (countdown and
 * recording) the view shows the tracked hands ("L"/"R") and shoulders, so
 * whoever makes the gesture sees whether the hands are in the picture: over
 * the camera's picture, or alone on a calm background after "Bild aus" (cards
 * NG-49 and NG-52, remembered on the device); mirrored for the front camera
 * only. It comes from the bridge (`createPreview`); a
 * bridge without one, or a preview that fails, leaves the view as before.
 * Nothing of the picture is kept or sent.
 *
 * Feedback without reading (card NG-45): under the picture, two hand symbols
 * light up for the hands the camera sees (the frame turns green with a hand,
 * orange without), and five dots stand for the seconds of the recording; one
 * goes out each second. Words are there too, for a caregiver, but nothing has
 * to be read. Nothing moves: the dots change in steps, the row keeps its size.
 * Card NG-46: a lower hand count is shown only after it held for
 * `SEEN_HOLD_MS` (a hand lost for single frames does not make the frame
 * flicker), and the dots are derived from the recording's deadline, so a late
 * timer cannot leave them behind.
 *
 * The controller (`createRecogniser`) has no DOM and is tested in Node; the
 * view (`attachRecognise`) draws its states into the board region.
 */
import type { BoardEntry } from "../board-data.js";
import type { MountedBoard } from "../board.js";
import type { CameraFacing, CaptureBridge, CapturePreview, CaptureProblem, CaptureSession, PreviewSink } from "../capture/capture.js";
import { sequenceFromRecording } from "../recognition/examples.js";
import type { FeatureFailure, HandKind, LandmarkFrame } from "../recognition/features.js";
import { DEFAULT_MIN_MARGIN, calibrateMaxDistance, matchGesture } from "../recognition/matcher.js";
import { requestLocalGermanSpeech, type SpeechAttempt } from "../speech.js";
import type { GestureExample, UnknownReason } from "../recognition/matcher.js";
import { SEGMENT_MAX_MS, segmentStream } from "../recognition/segment.js";
import { toLandmarkFrame } from "../recognition/tracker-adapter.js";
import { isDemoDataUrl } from "../demo-clips.js";
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
/** Card NG-54: at most this many recognised gestures are stacked while listening; the oldest goes first. */
export const MAX_TAKEN = 6;
/**
 * Card NG-55: while listening, the camera stops after this long without a hand in the picture
 * (battery, heat, a camera on in an empty room); the view stays with the stacked tiles ("paused").
 */
export const RECOGNISE_IDLE_MS = 3 * 60_000;
/** The dots of the recording's time: one per second of `RECOGNISE_MAX_RECORDING_MS`. */
export const RECOGNISE_SECONDS = Math.ceil(RECOGNISE_MAX_RECORDING_MS / 1000);
/**
 * A lower hand count is shown only after it held this long; a higher one at once (card NG-46).
 * The tracker can drop a hand for single frames; without the hold the frame would switch between
 * green and orange at frame rate, which is restless for a child who is bothered by motion.
 */
export const SEEN_HOLD_MS = 300;
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
  /** Card NG-54: while recognising continuously. */
  listening: "Gebärden machen. Dazwischen die Hände kurz runter.",
  dropped: "Das war zu lang. Hände kurz runter, dann neu.",
  /** Card NG-55: a stacked tile could not be said; the board's own lines (board.ts), in the same order. */
  noVoice: "Keine Stimme. Bitte noch einmal tippen.",
  noGermanVoice: "Keine deutsche Stimme. Hol eine Bezugsperson.",
  sayFailed: "Vorlesen ging nicht. Bitte noch einmal tippen.",
  sayFails: "Vorlesen geht nicht. Hol eine Bezugsperson.",
  /** Card NG-55: the camera went off after minutes without a hand; the tiles stay. */
  paused: "Die Kamera ist aus. Weiter mit ▶.",
  resume: "Weiter",
  done: "Fertig",
  /** The accessible name of the row of recognised gestures. */
  taken: "Erkannt",
  finish: "Stopp",
  question: "Meinst du das?",
  yes: "Ja, sagen",
  no: "Nein",
  unknown: "Das habe ich nicht verstanden.",
  candidates: "Vielleicht eins davon?",
  again: "Nochmal",
  noCamera: "Die Kamera kann gerade nicht starten. Die Tafel geht auch ohne Kamera.",
  /** Card NG-52: the toggle on the picture; its words say what a tap does, its name what is shown. */
  picture: { on: "Bild aus", off: "Bild an" },
  /** Its accessible name, the same in both states; `aria-pressed` says whether the picture is shown. */
  pictureName: "Kamerabild",
  /** Card NG-49: the camera switch at the top, its words, and its accessible name. */
  camera: { user: "Kamera: vorne", environment: "Kamera: hinten" },
  cameraSwitch: (facing: CameraFacing): string => `Kamera wechseln, jetzt ${facing === "user" ? "vorne" : "hinten"}`,
  /** The back camera does not open (missing or busy); the switch is right above. The front camera keeps the capture's lines. */
  backCamera: "Die Kamera hinten geht gerade nicht. Oben auf „Kamera“ tippen für die Kamera vorne.",
  /** Card NG-56: a caregiver's own clip of a gesture, to watch and imitate. */
  demo: "Vormachen",
  demoChoose: "Welche Gebärde vormachen?",
  demoLoading: "Der Clip wird geladen …",
  demoFailed: "Dieser Clip kann gerade nicht abgespielt werden.",
  demoSlow: "Langsam",
  demoMirror: "Spiegeln",
  demoClose: "Schließen",
  /** The accessible name of the clip: what it shows. */
  demoVideo: (label: string): string => `${label} vorgemacht`,
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
  /**
   * Card NG-54: continuous recognition. The camera runs while the view is open; each gesture ends
   * when the hands leave the picture (NG-53, "away") or with "Fertig". `taken`: the concepts
   * recognised so far, oldest first, at most `MAX_TAKEN`. `dropped`: the last movement was too long
   * to be a gesture and was let go.
   */
  | { readonly kind: "listening"; readonly taken: readonly string[]; readonly dropped: boolean }
  /**
   * Card NG-55: nobody was in the picture for `RECOGNISE_IDLE_MS`: the camera is off, the stacked
   * tiles stay (they are the child's message) and can still be tapped; "Weiter" listens again with them.
   */
  | { readonly kind: "paused"; readonly taken: readonly string[]; readonly line?: string }
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
  /** Whether the page itself is hidden (card NG-63): then a frame that finds the view gone pauses like `hide()`. */
  readonly pageHidden?: () => boolean;
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
  /** Card NG-49: the camera to ask for, read on each start. Default the front camera. */
  readonly facing?: () => CameraFacing;
  /**
   * Card NG-54: recognise continuously ("listening") instead of one attempt after a countdown.
   * Read on each camera start.
   */
  readonly continuous?: () => boolean;
  /** Card NG-54: says only the word of a recognised concept (a stacked tile); nothing else. */
  readonly sayWord?: (conceptId: string) => void;
}

export interface Recogniser {
  state(): RecogniseState;
  /** "Gebärde" on the board, and "Nochmal": starts the camera. `pressAt` is when the press began (default now). */
  start(pressAt?: number): void;
  /** "Stopp": ends the recording now. */
  finish(pressAt?: number): void;
  /** "Ja, sagen": back to the board, which then speaks the concept once. While listening: with exactly one gesture taken, its sentence. */
  confirm(pressAt?: number): void;
  /**
   * Card NG-54: a tap on a stacked tile while listening: only that concept's word is said, the
   * camera goes on. A tile that appeared less than `RECOGNISE_GUARD_MS` before the press does nothing.
   */
  sayWord(conceptId: string, pressAt?: number): void;
  /** "Nein": back to the board, or to the candidates the concept was chosen from; nothing spoken. */
  reject(pressAt?: number): void;
  /** A candidate of an unknown answer: the confirm view for it ("Nein" returns to the candidates). Speaks nothing. */
  choose(conceptId: string, pressAt?: number): void;
  /**
   * Card NG-49: the camera switch. While the camera starts or runs, or after it failed, `change`
   * (which flips the chosen camera) is called and the attempt starts again with the new camera;
   * nothing of the old one is kept. A press within the guard after the camera was asked for does
   * nothing. Returns whether it took effect.
   */
  switchCamera(change: () => void, pressAt?: number): boolean;
  /** "Zurück zur Tafel", from every state: camera off, nothing spoken. Always takes effect. */
  back(): void;
  /**
   * Card NG-55: the page is hidden (screen lock, another app). The camera goes off in every state;
   * while listening or paused the view pauses and keeps the tiles; any other state goes back to the board.
   */
  hide(): void;
  /** Like `back`, without telling `onChange`: the board is being replaced. */
  dispose(): void;
}

interface Camera {
  readonly controller: AbortController;
  /** Card NG-54: the frames since the last gesture was taken, while listening. */
  buffer: TrackerFrame[];
  /** Card NG-54: a movement too long to be a gesture was let go; its rest goes too, until the hands leave the picture. */
  dropping: boolean;
  /** Card NG-55: `buffer` as the segmenter reads it, converted once per frame. */
  sided: LandmarkFrame[];
  /** Card NG-55: when a hand was last seen while listening (or listening began). */
  lastHandAt: number;
  /** Card NG-55: the tiles a camera switch carried over to this start; empty for any other start. */
  readonly carry: readonly string[];
  session: CaptureSession | null;
  cancelTimer: () => void;
  /** The once-a-second tick of the recording's time (card NG-45). */
  cancelTick: () => void;
  /** When the recording ends (`now()` clock), for the seconds left (card NG-46). */
  recordingEndsAt: number;
  /**
   * The hand count shown; since when frames have stayed below it; and the highest count among
   * those frames, which is what the hold ends on (card NG-46).
   */
  shownSeen: HandsSeen;
  lowerSince: number | null;
  lowerMax: HandsSeen;
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

  /** The page was hidden: listening pauses with its tiles; anything else ends, a pause stays. */
  const hideView = (): void => {
    if (current.kind === "listening") {
      const { taken } = current;
      stopCamera();
      show({ kind: "paused", taken });
    } else if (current.kind === "starting" && (camera?.carry.length ?? 0) > 0) {
      // Hidden while "Weiter" or a camera switch starts the camera: the tiles it carried stay.
      const taken = camera!.carry;
      stopCamera();
      show({ kind: "paused", taken });
    } else if (current.kind !== "paused") {
      leave();
    }
  };

  /**
   * The attempt ends because the board is no longer shown. A hidden page noticed first through a frame
   * goes the way of `hide()` (card NG-63: the tiles stay); a hidden board region ends the view.
   */
  const gone = (): boolean => {
    if (options.stillShown === undefined || options.stillShown()) return false;
    if (options.pageHidden?.() === true) hideView();
    else leave();
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

  /** Card NG-54: when each taken concept appeared, for the tile's press guard. */
  const takenAt = new Map<string, number>();
  /** Card NG-55: the tiles a camera switch carries over to the restarted listening. */
  let carried: readonly string[] = [];
  /**
   * Card NG-54: cuts the frames heard so far at the hands leaving the picture (NG-53, "away"), and
   * compares each finished gesture as one attempt. `force` ("Fertig"): the gesture still going on is
   * finished now. A movement longer than `SEGMENT_MAX_MS` is let go, nothing compared.
   */
  const listen = (own: Camera, force: boolean): void => {
    if (camera !== own || current.kind !== "listening") return;
    const frames = own.buffer;
    const sided = own.sided;
    const index = new Map(sided.map((frame, at) => [frame, at]));
    const nowMs = force ? Number.POSITIVE_INFINITY : (frames.length === 0 ? 0 : frames[frames.length - 1]!.timestampMs);
    const cut = segmentStream(sided, "away", nowMs);
    let taken = current.taken;
    let dropped = current.dropped;
    let usedTo = -1;
    for (const segment of cut.segments) {
      const first = index.get(segment[0]!)!;
      const last = index.get(segment[segment.length - 1]!)!;
      usedTo = last;
      // The hands left the picture: the hint about a too-long movement has been followed.
      dropped = false;
      if (own.dropping) {
        // The rest of the movement that was let go: not a gesture of its own.
        own.dropping = false;
        continue;
      }
      let outcome: AttemptOutcome;
      try {
        outcome = analyse(frames.slice(first, last + 1));
      } catch {
        continue;
      }
      // Only a gesture of the board is taken; anything else adds nothing (no error for the child).
      if (outcome.kind === "match" && options.onBoard.has(outcome.conceptId)) {
        taken = [...taken.filter((id) => id !== outcome.conceptId), outcome.conceptId].slice(-MAX_TAKEN);
        takenAt.set(outcome.conceptId, options.now());
        dropped = false;
      }
    }
    if (cut.tooLong > 0) dropped = true;
    if (cut.open !== null && cut.open[cut.open.length - 1]!.tMs - cut.open[0]!.tMs > SEGMENT_MAX_MS) {
      // Somebody stays in view, moving: let it go, and the rest of it, and say so. Its last frame with a
      // hand stays, so that "the rest of it" is always this movement, even if the hands leave right now,
      // and never the next gesture.
      usedTo = index.get(cut.open[cut.open.length - 1]!)! - 1;
      dropped = true;
      own.dropping = true;
    } else if (cut.open === null && usedTo < 0) {
      // Nothing begun: keep only the last frames, which may start a gesture.
      usedTo = frames.length - 2;
    } else if (cut.open !== null && usedTo < 0) {
      usedTo = index.get(cut.open[0]!)! - 1;
    }
    if (usedTo >= 0) {
      own.buffer = frames.slice(usedTo + 1);
      own.sided = sided.slice(usedTo + 1);
    }
    if (taken !== current.taken || dropped !== current.dropped) show({ kind: "listening", taken, dropped });
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
    own.recordingEndsAt = options.now() + RECOGNISE_MAX_RECORDING_MS;
    schedule(own, () => {
      if (camera === own && !gone()) finishRecording();
    }, RECOGNISE_MAX_RECORDING_MS);
    tick(own);
  };

  /**
   * Tells the view the whole seconds left until the recording's deadline, now and then at each
   * second boundary. Derived from the deadline (card NG-46): a timer that fires late shows the
   * right count instead of falling one step behind per tick. The last second ends with the recording.
   */
  const tick = (own: Camera): void => {
    if (camera !== own || current.kind !== "recording") return;
    const remaining = own.recordingEndsAt - options.now();
    const left = Math.max(0, Math.min(RECOGNISE_SECONDS, Math.ceil(remaining / 1000)));
    try {
      options.onTimeLeft?.(left);
    } catch {
      // Only a display.
    }
    if (left <= 1) return;
    try {
      // Wake at the next whole second before the deadline.
      own.cancelTick = options.setTimer(() => tick(own), Math.max(1, remaining - (left - 1) * 1000));
    } catch {
      own.cancelTick = () => undefined;
    }
  };

  /**
   * The hand count to show for a frame (card NG-46): a higher count at once, a lower one only after
   * the frames have stayed below the shown count for `SEEN_HOLD_MS`. The hold ends on the highest
   * count those frames had, never on a single frame: from two hands to one, a frame in which the
   * remaining hand drops out at that moment does not flash "no hand". A lower frame still starts
   * its own hold.
   */
  const steadySeen = (own: Camera, hands: HandsSeen): HandsSeen => {
    const at = options.now();
    if (hands >= own.shownSeen) {
      own.shownSeen = hands;
      own.lowerSince = null;
      return own.shownSeen;
    }
    if (own.lowerSince === null) {
      own.lowerSince = at;
      own.lowerMax = hands;
      return own.shownSeen;
    }
    own.lowerMax = Math.max(own.lowerMax, hands) as HandsSeen;
    if (at - own.lowerSince >= SEEN_HOLD_MS) {
      own.shownSeen = own.lowerMax;
      own.lowerSince = hands < own.shownSeen ? at : null;
      own.lowerMax = hands;
    }
    return own.shownSeen;
  };

  /** When the camera was last asked for: the switch's press guard counts from there, not from each countdown tick. */
  let cameraAskedAt = Number.NEGATIVE_INFINITY;
  const startCamera = (): void => {
    cameraAskedAt = options.now();
    const facing = options.facing?.() ?? "user";
    /** A back camera that does not open: say so, and point to the switch. */
    const problemLine = (problem: CaptureProblem): string =>
      (facing === "environment" && (problem === "no_camera" || problem === "busy") ? RECOGNISE_TEXT.backCamera : RECOGNISE_TEXT.problems[problem]);
    stopCamera();
    let bridge: CaptureBridge | null;
    try {
      bridge = options.bridge();
    } catch {
      bridge = null;
    }
    if (bridge === null) {
      // Card NG-55: a start that carried tiles keeps them in the pause, even without a camera.
      if (carried.length > 0) show({ kind: "paused", taken: carried, line: RECOGNISE_TEXT.noCamera });
      else show({ kind: "problem", line: RECOGNISE_TEXT.noCamera });
      return;
    }
    const text = bridge.text;
    let preview: PreviewSink | null = null;
    try {
      preview = options.preview?.(bridge) ?? null;
    } catch {
      // Without a preview the view works as before.
    }
    const own: Camera = {
      controller: new AbortController(), session: null, cancelTimer: () => undefined, cancelTick: () => undefined, preview,
      recordingEndsAt: Number.POSITIVE_INFINITY, shownSeen: 0, lowerSince: null, lowerMax: 0, buffer: [], dropping: false, sided: [], lastHandAt: 0, carry: carried,
    };
    camera = own;
    const ours = (): boolean => camera === own && !own.controller.signal.aborted;
    const failed = (line: string): void => {
      if (camera !== own) return;
      stopCamera();
      // Card NG-55: a start that carried tiles (after "Weiter" or a camera switch) never loses them:
      // the pause keeps them, says why, and offers the camera switch and "Weiter".
      const keep = current.kind === "listening" ? current.taken : own.carry;
      if (keep.length > 0) show({ kind: "paused", taken: keep, line });
      else show({ kind: "problem", line });
    };
    show({ kind: "starting", line: text.preparing });
    let started: ReturnType<CaptureBridge["start"]>;
    try {
      started = bridge.start(options.host(), {
        signal: own.controller.signal,
        // The chosen camera only, and no other in its place: the other one may point away from the gesture.
        facing,
        fallback: false,
        ...(preview === null ? {} : { preview }),
        onStep: (step) => {
          if (!ours() || current.kind !== "starting" || (step !== "preparing" && step !== "asking")) return;
          show({ kind: "starting", line: text[step] });
        },
        onFrame: (frame) => {
          if (!ours() || gone()) return;
          if (current.kind === "listening") {
            const at = options.now();
            let side: LandmarkFrame | null;
            try {
              side = toLandmarkFrame(frame, 0);
            } catch {
              // A frame that cannot be read shows no hand: it counts toward the idle time (card NG-63), then the next one goes on.
              side = null;
            }
            if (side !== null && (side.left !== null || side.right !== null)) {
              own.lastHandAt = at;
            } else if (at - own.lastHandAt > RECOGNISE_IDLE_MS) {
              // Nobody has been in the picture for minutes: camera off; the tiles (the child's message) stay.
              // Without any tile there is nothing to keep: back to the board (card NG-63).
              const taken = current.taken;
              if (taken.length === 0) {
                leave();
                return;
              }
              stopCamera();
              show({ kind: "paused", taken });
              return;
            }
            if (side === null) return;
            own.buffer.push(frame);
            own.sided.push(side);
            try {
              listen(own, false);
            } catch {
              // A frame that cannot be read: the next one goes on.
            }
          }
          if (options.onSeen === undefined || (current.kind !== "countdown" && current.kind !== "recording" && current.kind !== "listening")) return;
          try {
            options.onSeen(steadySeen(own, handsSeen(frame)));
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
        if ("problem" in answer) failed(problemLine(answer.problem));
        else if (camera === own && own.carry.length > 0) {
          const keep = own.carry;
          stopCamera();
          show({ kind: "paused", taken: keep });
        } else if (camera === own) leave();
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
      if (options.continuous?.() === true) {
        // A camera switch keeps what was taken (card NG-55); any other start begins empty.
        const taken = own.carry;
        if (taken.length === 0) takenAt.clear();
        own.lastHandAt = options.now();
        show({ kind: "listening", taken, dropped: false });
      } else {
        countdown(own, RECOGNISE_COUNTDOWN_S);
      }
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
      if (current.kind === "paused" && aimed(pressAt)) {
        // "Weiter": listening again, with the tiles of before.
        carried = current.taken;
        startCamera();
        carried = [];
        return;
      }
      if ((current.kind === "unusable" || current.kind === "problem") && aimed(pressAt)) startCamera();
    },
    finish(pressAt) {
      if (current.kind === "recording" && aimed(pressAt)) finishRecording();
      if (current.kind === "listening" && aimed(pressAt) && camera !== null) listen(camera, true);
    },
    sayWord(conceptId, pressAt) {
      if ((current.kind !== "listening" && current.kind !== "paused") || !current.taken.includes(conceptId)) return;
      // Each new tile moves the others: a press soon after any change may have been aimed at another tile.
      if (!aimed(pressAt)) return;
      if ((pressAt ?? options.now()) < (takenAt.get(conceptId) ?? Number.POSITIVE_INFINITY) + RECOGNISE_GUARD_MS) return;
      options.sayWord?.(conceptId);
    },
    confirm(pressAt) {
      if ((current.kind === "listening" || current.kind === "paused") && current.taken.length === 1 && aimed(pressAt)) {
        const [conceptId] = current.taken;
        // As "Ja, sagen" of one attempt: the camera goes off, the board speaks the sentence once.
        leave();
        options.speak(conceptId!);
        return;
      }
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
    switchCamera(change, pressAt) {
      if (disposed) return false;
      const live = current.kind === "starting" || current.kind === "countdown" || current.kind === "recording" || current.kind === "listening" || current.kind === "paused" || current.kind === "problem";
      if (!live || (pressAt ?? options.now()) < cameraAskedAt + RECOGNISE_GUARD_MS) return false;
      change();
      // A second switch while the camera still starts keeps what the first one carried.
      carried = current.kind === "listening" || current.kind === "paused" ? current.taken : current.kind === "starting" ? camera?.carry ?? [] : [];
      stopCamera();
      startCamera();
      carried = [];
      return true;
    },
    back: leave,
    hide: () => hideView(),
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
  /** Where the camera choice is kept (card NG-49); default `localStorage`. For tests. */
  readonly storage?: () => ChoiceStorage | null;
  /** Card NG-54: recognise continuously and stack the recognised gestures. Default false: one attempt after a countdown. */
  readonly continuous?: boolean;
  /**
   * Card NG-54: says a word; default the device's local German voice. Card NG-55: returns false, or
   * calls `failed`, when it cannot be said. For tests.
   */
  readonly sayText?: (text: string, failed: () => void, ended: () => void) => SpeechAttempt | boolean | void;
  /**
   * Card NG-56: the concepts on the board that have a caregiver's demo clip, in
   * board order, and how to read one (null when it cannot be read). Without
   * any, the view has no "Vormachen".
   */
  readonly demos?: { readonly ids: readonly string[]; readonly load: (conceptId: string) => Promise<string | null> };
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
export const RECOGNISE_SYMBOLS = { yes: "✓", no: "✗", finish: "■", again: "↻", camera: "⇄", picture: "◐", resume: "▶", demo: "▷", slow: "½", mirror: "⇋", close: "✗" } as const;

/** Card NG-56: where the gesture view keeps "Langsam" and "Spiegeln" of the demo clip on this device ("on" or "off"; nothing readable means off). */
export const RECOGNISE_DEMO_SLOW_KEY = "amysecho-demo-slow";
export const RECOGNISE_DEMO_MIRROR_KEY = "amysecho-demo-mirror";
/** The speed of a clip with "Langsam". */
export const DEMO_SLOW_RATE = 0.5;

/** Card NG-52: where the gesture view keeps "Bild an / aus" on this device; "off" for points only, anything else is on. */
export const RECOGNISE_PICTURE_KEY = "amysecho-recognise-picture";

/** Card NG-49: where the gesture view keeps its camera choice on this device; apart from teaching's (`CAMERA_FACING_KEY`). */
export const RECOGNISE_FACING_KEY = "amysecho-recognise-facing";

/** The part of `localStorage` the choice needs; a test passes a fake. */
export interface ChoiceStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function browserChoiceStorage(): ChoiceStorage | null {
  try {
    return (globalThis as { localStorage?: ChoiceStorage }).localStorage ?? null;
  } catch {
    return null;
  }
}

/** The gesture view's camera: the front one unless "hinten" is stored (or nothing readable is). */
export function loadRecogniseFacing(storage: ChoiceStorage | null): CameraFacing {
  try {
    return storage?.getItem(RECOGNISE_FACING_KEY) === "environment" ? "environment" : "user";
  } catch {
    return "user";
  }
}

/** Card NG-52: the camera picture is shown unless "off" is stored (nothing readable means on). */
export function loadRecognisePicture(storage: ChoiceStorage | null): boolean {
  try {
    return storage?.getItem(RECOGNISE_PICTURE_KEY) !== "off";
  } catch {
    return true;
  }
}

function loadSwitch(storage: ChoiceStorage | null, key: string): boolean {
  try {
    return storage?.getItem(key) === "on";
  } catch {
    return false;
  }
}

function saveSwitch(storage: ChoiceStorage | null, key: string, on: boolean): void {
  try {
    storage?.setItem(key, on ? "on" : "off");
  } catch {
    // Nothing: a convenience, not data.
  }
}

export function saveRecognisePicture(storage: ChoiceStorage | null, on: boolean): void {
  try {
    storage?.setItem(RECOGNISE_PICTURE_KEY, on ? "on" : "off");
  } catch {
    // Nothing: a convenience, not data.
  }
}

/** A storage that refuses it is ignored: the choice then holds until the page is left. */
export function saveRecogniseFacing(storage: ChoiceStorage | null, facing: CameraFacing): void {
  try {
    storage?.setItem(RECOGNISE_FACING_KEY, facing);
  } catch {
    // Nothing: a convenience, not data.
  }
}

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

/**
 * Puts `nodes` into `parent` in this order, leaving every node that is already at its place where it
 * is (card NG-47): the hands-seen status region and the picture box stay in the page from the
 * countdown into the recording; taking them out and in again on each draw could make a screen reader
 * read them again.
 */
function place(parent: HTMLElement, nodes: readonly HTMLElement[]): void {
  for (const child of Array.from(parent.children)) {
    if (!nodes.includes(child as HTMLElement)) parent.removeChild(child);
  }
  nodes.forEach((node, index) => {
    const at = parent.children[index] ?? null;
    if (at !== node) parent.insertBefore(node, at);
  });
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
  /**
   * Card NG-49: the camera switch, next to the way back, while the camera starts or runs or after it
   * failed. A symbol and "Kamera: vorne / hinten"; a tap starts the attempt again with the other camera.
   */
  const storage = options.storage ?? browserChoiceStorage;
  let facing: CameraFacing = loadRecogniseFacing(storage());
  const cameraButton = button("recognise-camera", "");
  const cameraMark = element("span", "recognise-mark", RECOGNISE_SYMBOLS.camera);
  cameraMark.setAttribute("aria-hidden", "true");
  const cameraWords = element("span", "recognise-camera-text");
  cameraButton.append(cameraMark, cameraWords);
  const showFacing = (): void => {
    cameraButton.dataset["facing"] = facing;
    cameraWords.textContent = RECOGNISE_TEXT.camera[facing];
    cameraButton.setAttribute("aria-label", RECOGNISE_TEXT.cameraSwitch(facing));
  };
  showFacing();
  cameraButton.hidden = true;
  top.append(back, cameraButton);
  /**
   * Card NG-52: "Bild an / aus" in the corner of the picture while the preview runs. A tap shows or
   * hides the camera picture; the tracked points stay, the camera and the attempt go on.
   */
  let picture = loadRecognisePicture(storage());
  /** Card NG-55: why the last tile tap could not be said (the board's lines), shown until a word is said or a gesture is taken. */
  let voiceLine: string | null = null;
  let lastTaken = "";
  /** As on the board: a second empty voice list, or a second failure, in a row means tapping again does not help. */
  let emptyLists = 0;
  let failures = 0;
  let lastKind: RecogniseState["kind"] = "idle";
  /** Counts tile taps: a voice report is acted on only for the latest one (card NG-63). */
  let sayAttempt = 0;
  const pictureButton = button("recognise-picture", "");
  const pictureMark = element("span", "recognise-mark", RECOGNISE_SYMBOLS.picture);
  pictureMark.setAttribute("aria-hidden", "true");
  const pictureWords = element("span", "recognise-picture-text");
  pictureButton.append(pictureMark, pictureWords);
  const showPicture = (): void => {
    pictureButton.dataset["picture"] = picture ? "on" : "off";
    pictureButton.setAttribute("aria-pressed", String(picture));
    pictureWords.textContent = picture ? RECOGNISE_TEXT.picture.on : RECOGNISE_TEXT.picture.off;
  };
  pictureButton.setAttribute("aria-label", RECOGNISE_TEXT.pictureName);
  showPicture();
  /** When the latest press on the view began; a click without a pointer (a key) counts from the click. */
  let pressedAt: number | null = null;
  /**
   * Card NG-56: "Vormachen" at the top when concepts on the board have a caregiver's clip. It opens a
   * box above the view's content: the concepts to choose from (one clip plays at once), then the clip,
   * large, with "Nochmal", "Langsam" and "Spiegeln". The camera and the recognising go on underneath:
   * nothing in the box changes the recogniser's state, so imitating the clip stacks its tile as ever.
   */
  // In board order, whatever order the clips were listed in (card NG-60).
  const withClip = new Set(options.demos?.ids ?? []);
  const demoIds = options.entries.map((entry) => entry.id).filter((id, index, all) => withClip.has(id) && all.indexOf(id) === index);
  /**
   * Card NG-60: a tap in the box is no press on the recogniser's buttons. The panel notes when a press began
   * (for the guard of "Ja, sagen" and the others); a demo control consumes that note, so a later key press
   * on a guarded button is not measured from this tap.
   */
  const consumePress = (): void => {
    pressedAt = null;
  };
  const demoButton = button("recognise-demo-open", "");
  const demoMark = element("span", "recognise-mark", RECOGNISE_SYMBOLS.demo);
  demoMark.setAttribute("aria-hidden", "true");
  demoButton.append(demoMark, element("span", "recognise-demo-text", RECOGNISE_TEXT.demo));
  demoButton.setAttribute("aria-label", RECOGNISE_TEXT.demo);
  // Only where there is a clip: otherwise the top is as before.
  if (demoIds.length > 0) top.append(demoButton);
  const demoBox = element("section", "recognise-demo");
  demoBox.setAttribute("aria-label", RECOGNISE_TEXT.demo);
  demoBox.hidden = true;
  let demoSlow = loadSwitch(storage(), RECOGNISE_DEMO_SLOW_KEY);
  let demoMirror = loadSwitch(storage(), RECOGNISE_DEMO_MIRROR_KEY);
  let demoVideo: HTMLVideoElement | null = null;
  /** A new number for every opening, choice and close: a clip read for an earlier one is dropped. */
  let demoToken = 0;
  const stopDemoVideo = (): void => {
    const video = demoVideo;
    demoVideo = null;
    if (video === null) return;
    try {
      video.pause?.();
      video.removeAttribute?.("src");
    } catch {
      // Only a display.
    }
  };
  const closeDemo = (focusBack: boolean): void => {
    demoToken += 1;
    stopDemoVideo();
    const wasOpen = !demoBox.hidden;
    demoBox.hidden = true;
    demoBox.replaceChildren();
    delete panel.dataset["demo"];
    if (wasOpen && focusBack && typeof demoButton.focus === "function") demoButton.focus();
  };
  const demoRow = (...nodes: HTMLElement[]): HTMLElement => {
    const row = element("div", "recognise-demo-actions");
    row.append(...nodes);
    return row;
  };
  const demoCloseButton = (): HTMLElement => {
    const close = actionButton("recognise-demo-close", RECOGNISE_SYMBOLS.close, RECOGNISE_TEXT.demoClose);
    close.addEventListener("click", () => {
      consumePress();
      closeDemo(true);
    });
    return close;
  };
  const demoSwitch = (className: string, symbol: string, text: string, on: boolean, flip: () => boolean): HTMLElement => {
    const control = actionButton(className, symbol, text);
    control.setAttribute("aria-pressed", String(on));
    control.addEventListener("click", () => {
      consumePress();
      control.setAttribute("aria-pressed", String(flip()));
    });
    return control;
  };
  const applyRate = (video: HTMLVideoElement): void => {
    const rate = demoSlow ? DEMO_SLOW_RATE : 1;
    video.defaultPlaybackRate = rate;
    video.playbackRate = rate;
  };
  const focusOn = (node: HTMLElement | undefined): void => {
    if (node !== undefined && typeof node.focus === "function") node.focus();
  };
  const chooseDemo = (): void => {
    demoToken += 1;
    stopDemoVideo();
    demoBox.hidden = false;
    panel.dataset["demo"] = "choose";
    const line = element("p", "recognise-demo-line", RECOGNISE_TEXT.demoChoose);
    const list = element("div", "recognise-demo-choices");
    list.setAttribute("role", "group");
    list.setAttribute("aria-label", RECOGNISE_TEXT.demoChoose);
    const tiles: HTMLElement[] = [];
    for (const id of demoIds) {
      const entry = byId.get(id)!;
      const tile = button(entry.symbolPath === null ? "concept concept-text recognise-demo-choice" : "concept recognise-demo-choice", "");
      tile.setAttribute("aria-label", entry.labelDe);
      tile.dataset["concept"] = id;
      conceptContent(tile, entry, 64);
      tile.addEventListener("click", () => {
        consumePress();
        playDemo(id);
      });
      list.append(tile);
      tiles.push(tile);
    }
    demoBox.replaceChildren(line, list, demoRow(demoCloseButton()));
    focusOn(tiles[0]);
  };
  const playDemo = (id: string): void => {
    const entry = byId.get(id);
    const load = options.demos?.load;
    if (entry === undefined || load === undefined) return;
    demoToken += 1;
    const mine = demoToken;
    stopDemoVideo();
    demoBox.hidden = false;
    panel.dataset["demo"] = "play";
    const line = element("p", "recognise-demo-line", RECOGNISE_TEXT.demoLoading);
    line.setAttribute("role", "status");
    line.setAttribute("aria-live", "polite");
    const close = demoCloseButton();
    demoBox.replaceChildren(line, demoRow(close));
    focusOn(close);
    let reading: Promise<string | null>;
    try {
      reading = load(id);
    } catch {
      reading = Promise.resolve(null);
    }
    void reading.catch(() => null).then((url) => {
      if (mine !== demoToken) return;
      if (url === null || !isDemoDataUrl(url)) {
        line.textContent = RECOGNISE_TEXT.demoFailed;
        return;
      }
      const video = document.createElement("video") as HTMLVideoElement;
      video.className = "recognise-demo-video";
      video.muted = true;
      video.playsInline = true;
      video.autoplay = true;
      video.dataset["mirrored"] = String(demoMirror);
      video.setAttribute("aria-label", RECOGNISE_TEXT.demoVideo(entry.labelDe));
      applyRate(video);
      // Card NG-59: a clip this browser cannot play (one recorded on another device) says so instead of an empty box.
      video.addEventListener("error", () => {
        if (mine !== demoToken) return;
        // The clip's buttons go: a focus on one of them moves to "Schließen".
        const focusInBox = typeof document !== "undefined" && [again, slow, mirror, close].includes(document.activeElement as HTMLElement);
        stopDemoVideo();
        // The status line stays where it is, so a screen reader hears the change (card NG-60); the clip and its buttons go.
        line.textContent = RECOGNISE_TEXT.demoFailed;
        for (const child of Array.from(demoBox.children)) if (child !== line) demoBox.removeChild(child);
        demoBox.append(demoRow(close));
        if (focusInBox) focusOn(close);
      });
      video.src = url;
      demoVideo = video;
      line.textContent = entry.labelDe;
      const again = actionButton("recognise-demo-again", RECOGNISE_SYMBOLS.again, RECOGNISE_TEXT.again);
      again.addEventListener("click", () => {
        consumePress();
        try {
          video.currentTime = 0;
          void video.play?.()?.catch(() => undefined);
        } catch {
          // Only a display.
        }
      });
      const slow = demoSwitch("recognise-demo-slow", RECOGNISE_SYMBOLS.slow, RECOGNISE_TEXT.demoSlow, demoSlow, () => {
        demoSlow = !demoSlow;
        saveSwitch(storage(), RECOGNISE_DEMO_SLOW_KEY, demoSlow);
        applyRate(video);
        return demoSlow;
      });
      const mirror = demoSwitch("recognise-demo-mirror", RECOGNISE_SYMBOLS.mirror, RECOGNISE_TEXT.demoMirror, demoMirror, () => {
        demoMirror = !demoMirror;
        saveSwitch(storage(), RECOGNISE_DEMO_MIRROR_KEY, demoMirror);
        video.dataset["mirrored"] = String(demoMirror);
        return demoMirror;
      });
      const focusWasOnClose = typeof document !== "undefined" && document.activeElement === close;
      demoBox.replaceChildren(line, video, demoRow(again, slow, mirror, close));
      if (focusWasOnClose) focusOn(again);
    });
  };
  demoButton.addEventListener("click", () => {
    consumePress();
    if (demoIds.length === 1) playDemo(demoIds[0]!);
    else chooseDemo();
  });
  // The state's content and its buttons: one above the other in a window held upright, side by side in a wide one (style sheet).
  const body = element("div", "recognise-body");
  const main = element("div", "recognise-main");
  const actions = element("div", "recognise-actions");
  body.append(main, actions);
  panel.append(top, demoBox, body);
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
  // Card NG-47: the words are a polite status region, so a screen reader says when a hand is seen
  // or gone. They follow the steady signal (NG-46) and are only rewritten when the count changes:
  // rewriting the same text can be announced again. The seconds are not announced; the line above
  // already speaks the countdown.
  const seenText = element("span", "recognise-seen-text");
  seenText.setAttribute("role", "status");
  seenText.setAttribute("aria-live", "polite");
  seenText.setAttribute("aria-atomic", "true");
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
    if (seenText.textContent !== RECOGNISE_TEXT.seen[hands]) seenText.textContent = RECOGNISE_TEXT.seen[hands];
  };
  const showTimeLeft = (seconds: number): void => {
    const left = Math.max(0, Math.min(RECOGNISE_SECONDS, seconds));
    timeDots.forEach((dot, index) => { dot.dataset["lit"] = String(index < left); });
    timeBox.dataset["left"] = String(left);
    timeBox.setAttribute("aria-label", RECOGNISE_TEXT.timeLeft(left));
  };

  const pressStart = (): number => {
    const at = pressedAt ?? now();
    pressedAt = null;
    return at;
  };
  panel.addEventListener("pointerdown", () => { pressedAt = now(); });
  panel.addEventListener("contextmenu", (event: Event) => event.preventDefault());

  /**
   * The buttons and candidate tiles of the last draw (card NG-48). A draw builds them anew; when the
   * focus was on one of them, it would drop to the page and a keyboard or switch user would have to
   * find the view again.
   */
  let focusable: HTMLElement[] = [];
  /** Card NG-54: the recognised gestures, newest first (the top of the stack, always in view); a tap says only that word. */
  const takenRow = (taken: readonly string[]): HTMLElement | null => {
    if (taken.length === 0) return null;
    const row = element("div", "recognise-taken");
    row.setAttribute("role", "group");
    row.setAttribute("aria-label", RECOGNISE_TEXT.taken);
    for (const id of [...taken].reverse()) {
      const entry = byId.get(id);
      if (entry === undefined) continue;
      const tile = button(entry.symbolPath === null ? "concept concept-text recognise-taken-tile" : "concept recognise-taken-tile", "");
      tile.setAttribute("aria-label", entry.labelDe);
      tile.dataset["concept"] = id;
      conceptContent(tile, entry, 48);
      tile.addEventListener("click", () => recogniser.sayWord(id, pressStart()));
      row.append(tile);
      focusable.push(tile);
    }
    return row;
  };
  /** Exactly one gesture: its sentence, as after one attempt. */
  const yesButton = (taken: readonly string[]): HTMLElement | null => {
    if (taken.length !== 1) return null;
    const entry = byId.get(taken[0]!);
    const yes = actionButton("recognise-yes", RECOGNISE_SYMBOLS.yes, RECOGNISE_TEXT.yes, entry?.symbolPath ?? null);
    yes.addEventListener("click", () => recogniser.confirm(pressStart()));
    return yes;
  };
  const draw = (state: RecogniseState): void => {
    const active = typeof document === "undefined" ? null : (document.activeElement as HTMLElement | null);
    // The camera switch counts too when this draw hides it (card NG-49): a hidden button holds no focus.
    const switchFocused = active !== null && active === cameraButton;
    let focusLost = active !== null && focusable.includes(active);
    focusable = [];
    panel.dataset["state"] = state.kind;
    delete panel.dataset["concept"];
    delete panel.dataset["reason"];
    delete panel.dataset["hands"];
    delete panel.dataset["from"];
    if (state.kind !== "countdown" && state.kind !== "recording" && state.kind !== "listening") delete panel.dataset["seen"];
    // Card NG-54: no time limit while listening, so no seconds.
    timeBox.hidden = state.kind === "listening";
    cameraButton.hidden = !(state.kind === "starting" || state.kind === "countdown" || state.kind === "recording" || state.kind === "listening" || state.kind === "paused" || state.kind === "problem");
    if (switchFocused && cameraButton.hidden) focusLost = true;
    // The camera is off in every other state; its preview was closed with it. While it starts the
    // preview waits in the box, which is shown from the countdown on.
    if (state.kind !== "starting" && state.kind !== "countdown" && state.kind !== "recording" && state.kind !== "listening") previewSlot.replaceChildren();
    // A voice line belongs to the view it was shown in: a pause or a new listening starts without it.
    if (state.kind !== lastKind) voiceLine = null;
    lastKind = state.kind;
    // The counts of voice trouble in a row belong to the message: they end with it (back to the board),
    // not with a restart of the camera ("Weiter", a camera switch).
    if (state.kind === "idle") {
      lastTaken = "";
      emptyLists = 0;
      failures = 0;
    }
    if (state.kind === "idle") {
      // Back to the board: an open clip goes with the view.
      closeDemo(false);
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
          place(previewSlot, [preview.element, element("p", "recognise-count", String(state.left)), pictureButton]);
          content.push(previewSlot);
        }
        showSeen(seen);
        content.push(feedback);
        break;
      case "paused": {
        // A problem line asks for "Nochmal"; in the pause the button is "Weiter".
        line.textContent = voiceLine ?? state.line?.replace("„Nochmal“", "„Weiter“") ?? RECOGNISE_TEXT.paused;
        const row = takenRow(state.taken);
        if (row !== null) content.push(row);
        const resume = actionButton("recognise-resume", RECOGNISE_SYMBOLS.resume, RECOGNISE_TEXT.resume);
        resume.addEventListener("click", () => recogniser.start(pressStart()));
        buttons.push(resume);
        const yes = yesButton(state.taken);
        if (yes !== null) buttons.push(yes);
        break;
      }
      case "listening": {
        // A new tile ends the no-voice line: the view moved on.
        const takenKey = state.taken.join(" ");
        if (takenKey !== lastTaken) voiceLine = null;
        lastTaken = takenKey;
        line.textContent = voiceLine ?? (state.dropped ? RECOGNISE_TEXT.dropped : RECOGNISE_TEXT.listening);
        if (preview !== null) {
          place(previewSlot, [preview.element, pictureButton]);
          content.push(previewSlot);
        }
        showSeen(seen);
        content.push(feedback);
        const row = takenRow(state.taken);
        if (row !== null) content.push(row);
        const done = actionButton("recognise-finish", RECOGNISE_SYMBOLS.finish, RECOGNISE_TEXT.done);
        done.addEventListener("click", () => recogniser.finish(pressStart()));
        buttons.push(done);
        const yes = yesButton(state.taken);
        if (yes !== null) buttons.push(yes);
        break;
      }
      case "recording": {
        line.textContent = RECOGNISE_TEXT.recording;
        if (preview !== null) {
          place(previewSlot, [preview.element, pictureButton]);
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
            focusable.push(tile);
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
    place(main, content);
    actions.replaceChildren(...buttons);
    // The buttons come first: they are where the next press goes ("Stopp", "Ja, sagen", "Nochmal").
    focusable = [...buttons, ...focusable];
    // Card NG-52: the picture toggle goes with the picture (an answer, a problem): it counts as lost too.
    const pictureShown = Array.from(main.children).includes(previewSlot) && Array.from(previewSlot.children).includes(pictureButton);
    if (active === pictureButton && !pictureShown) focusLost = true;
    if (!board.isCovered()) {
      board.cover(panel);
      // The control that opened the view is hidden now: the focus goes to the way back.
      if (typeof back.focus === "function") back.focus();
    } else if (focusLost) {
      // The focused button went with the redraw: the focus stays in the view, on the new state's
      // first button or candidate, else on the way back. Focus elsewhere is left where it is.
      const next = focusable[0] ?? back;
      if (typeof next.focus === "function") next.focus();
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
      // Card NG-52: with the camera picture unless "Bild aus" was chosen (card NG-49: points only); mirrored for the front camera only.
      const made = typeof bridge.createPreview === "function" ? bridge.createPreview(document, { video: picture }) : null;
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
    pageHidden: () => !root.hidden && hiddenPage(),
    facing: () => facing,
    continuous: () => options.continuous === true,
    sayWord: (conceptId) => {
      const entry = byId.get(conceptId);
      if (entry === undefined) return;
      const say = options.sayText ?? ((text: string, failed: () => void, ended: () => void) => requestLocalGermanSpeech(text, failed, ended));
      // Card NG-63, as on the board: a report of an earlier tap (its word stopped by this one) changes nothing.
      sayAttempt += 1;
      const thisAttempt = sayAttempt;
      const show = (next: string | null): void => {
        const kind = recogniser.state().kind;
        if (kind !== "listening" && kind !== "paused") return;
        if (next === voiceLine) return;
        voiceLine = next;
        // The redraw makes new tiles: a focus on this word's tile stays on it (card NG-63), not on "Weiter".
        const active = typeof document === "undefined" ? null : (document.activeElement as HTMLElement | null);
        const onTile = active !== null && focusable.includes(active) && active.dataset?.["concept"] === conceptId;
        draw(recogniser.state());
        if (onTile) {
          const tile = focusable.find((candidate) => candidate.dataset?.["concept"] === conceptId && candidate.className.includes("recognise-taken-tile"));
          if (tile !== undefined && typeof tile.focus === "function") tile.focus();
        }
      };
      // Card NG-55: the board's lines, in the board's order; the tile and its word stay.
      let failedNow = false;
      const failed = (): void => {
        if (thisAttempt !== sayAttempt) return;
        failedNow = true;
        failures += 1;
        show(failures > 1 ? RECOGNISE_TEXT.sayFails : RECOGNISE_TEXT.sayFailed);
      };
      let attempt: SpeechAttempt | boolean | void;
      try {
        // As on the board: the failures in a row end only when a word was really said to its end.
        attempt = say(entry.labelDe, failed, () => {
          if (thisAttempt === sayAttempt) failures = 0;
        });
      } catch {
        attempt = "failed";
      }
      const result: SpeechAttempt = attempt === false ? "no-voice" : attempt === true || attempt === undefined ? "requested" : attempt;
      emptyLists = result === "unavailable" ? emptyLists + 1 : 0;
      if (result === "requested") {
        // Said, unless the voice reported a failure already (a later one shows when it comes).
        if (!failedNow) show(null);
      } else if (result === "unavailable") {
        show(emptyLists > 1 ? RECOGNISE_TEXT.noGermanVoice : RECOGNISE_TEXT.noVoice);
      } else if (result === "no-voice") {
        show(RECOGNISE_TEXT.noGermanVoice);
      } else {
        failed();
      }
    },
  });
  pictureButton.addEventListener("click", () => {
    picture = !picture;
    saveRecognisePicture(storage(), picture);
    showPicture();
    try {
      preview?.setVideo?.(picture);
    } catch {
      // Only a display: the points and the attempt go on.
    }
  });
  cameraButton.addEventListener("click", () => {
    recogniser.switchCamera(() => {
      facing = facing === "user" ? "environment" : "user";
      saveRecogniseFacing(storage(), facing);
      showFacing();
    }, pressStart());
  });
  back.addEventListener("click", () => {
    pressedAt = null;
    recogniser.back();
  });

  // The camera never runs in the background: hiding the page or leaving it ends the attempt.
  const onHidden = (): void => {
    if (hiddenPage()) recogniser.hide();
  };
  const onPageHide = (): void => recogniser.hide();
  const listen = typeof document !== "undefined" && typeof document.addEventListener === "function";
  if (listen) document.addEventListener("visibilitychange", onHidden);
  if (typeof window !== "undefined" && typeof window.addEventListener === "function") window.addEventListener("pagehide", onPageHide);

  return {
    open: () => recogniser.start(),
    dispose() {
      closeDemo(false);
      recogniser.dispose();
      if (listen && typeof document.removeEventListener === "function") document.removeEventListener("visibilitychange", onHidden);
      if (typeof window !== "undefined" && typeof window.removeEventListener === "function") window.removeEventListener("pagehide", onPageHide);
    },
    recogniser,
  };
}
