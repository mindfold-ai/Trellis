export interface ActiveTurn {
  inputSeq: number;
  turnId: string;
}

export type TurnOutcome = "done" | "error" | "aborted";

export interface TurnTrackerHooks {
  /** Called when the tracker transitions from idle to mid-turn. */
  onIdleExit?: () => void;
  /** Called when the tracker transitions back to idle. */
  onIdleEnter?: () => void;
}

/**
 * Host-local turn tracker for one supervisor process.
 *
 * The durable SOT is events.jsonl. This object only remembers the input
 * message seq long enough for the inbox watcher and stdout pump to emit
 * matching `turn_started` / `turn_finished` events.
 *
 * Optional hooks fire on the idle ↔ mid-turn transition so the
 * supervisor idle-timer (OOM guard) can pause / reset without each
 * inbox or stdout call site having to know about it.
 */
export class TurnTracker {
  #turns: ActiveTurn[] = [];
  #hooks: TurnTrackerHooks;

  constructor(hooks: TurnTrackerHooks = {}) {
    this.#hooks = hooks;
  }

  begin(inputSeq: number): ActiveTurn {
    const wasIdle = this.#turns.length === 0;
    const turn: ActiveTurn = {
      inputSeq,
      turnId: `msg:${inputSeq}`,
    };
    this.#turns.push(turn);
    if (wasIdle) this.#hooks.onIdleExit?.();
    return turn;
  }

  finish(): ActiveTurn | undefined {
    const turn = this.#turns.pop();
    if (turn && this.#turns.length === 0) this.#hooks.onIdleEnter?.();
    return turn;
  }

  abortCurrent(): ActiveTurn | undefined {
    const turn = this.#turns.pop();
    if (turn && this.#turns.length === 0) this.#hooks.onIdleEnter?.();
    return turn;
  }

  current(): ActiveTurn | undefined {
    return this.#turns.at(-1);
  }
}
