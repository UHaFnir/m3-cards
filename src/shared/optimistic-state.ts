// Holds a state the card asked for until the real one catches up.
//
// Written for the vacuum card, which talks to an integration that polls every
// thirty seconds and pushes nothing: a tap on Start changes nothing visible
// for up to half a minute, which reads as a broken button rather than a slow
// one. Printers have the same shape — MQTT is quick, but a "pause" still takes
// a few seconds to come back — so the bookkeeping lives here rather than in
// each card.
//
// Two ways out, and both are needed. The expected one is that an update brings
// the state we asked for, and the guess is dropped because it has become the
// truth. The other is that it never arrives — the machine refused, the command
// was lost — and then the guess has to expire on its own, or the card would
// lie until the next tap.

export interface OptimisticOptions<T> {
  /** How long a guess stands before the card gives up on it. */
  ttlMs?: number;
  /** Called when it expires, so the host can re-render. */
  onExpire?: () => void;
  /**
   * States that override a standing guess the moment they arrive. An error is
   * the one thing a user must not be kept from seeing for the sake of a smooth
   * animation.
   */
  overriding?: readonly T[];
}

export class OptimisticState<T> {
  private _guess?: T;
  private _since = 0;
  private _timer?: number;
  private readonly _ttl: number;
  private readonly _onExpire?: () => void;
  private readonly _overriding: readonly T[];

  public constructor(options: OptimisticOptions<T> = {}) {
    this._ttl = options.ttlMs ?? 70_000;
    this._onExpire = options.onExpire;
    this._overriding = options.overriding ?? [];
  }

  public set(value: T): void {
    this._guess = value;
    this._since = Date.now();
    if (this._timer) clearTimeout(this._timer);
    this._timer = setTimeout(() => {
      this._guess = undefined;
      this._timer = undefined;
      this._onExpire?.();
    }, this._ttl) as unknown as number;
  }

  public clear(): void {
    this._guess = undefined;
    if (this._timer) clearTimeout(this._timer);
    this._timer = undefined;
  }

  /**
   * The value to paint. Reporting whether the guess still stands lets the card
   * dim its button for exactly as long as it is showing something it has not
   * yet been told is true.
   */
  public resolve(actual: T): { value: T; pending: boolean } {
    if (this._guess === undefined) return { value: actual, pending: false };
    if (actual === this._guess) {
      // Confirmed — stop guessing, and stop dimming.
      this.clear();
      return { value: actual, pending: false };
    }
    if (this._overriding.includes(actual)) {
      this.clear();
      return { value: actual, pending: false };
    }
    return { value: this._guess, pending: true };
  }

  public get pendingSince(): number {
    return this._guess === undefined ? 0 : this._since;
  }
}
