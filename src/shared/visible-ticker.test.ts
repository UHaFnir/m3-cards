import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { VisibleTicker } from "./visible-ticker";

describe("VisibleTicker at frame cadence", () => {
  let frames: FrameRequestCallback[];

  beforeEach(() => {
    frames = [];
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      frames.push(cb);
      return frames.length;
    });
    vi.stubGlobal("cancelAnimationFrame", () => {});
    vi.stubGlobal("document", { hidden: false, addEventListener: () => {}, removeEventListener: () => {} });
  });

  afterEach(() => vi.unstubAllGlobals());

  /** Runs whatever frame is queued, as the browser would. */
  const nextFrame = () => frames.shift()?.(0);

  it("keeps ticking while nothing stops it", () => {
    let ticks = 0;
    const ticker = new VisibleTicker({} as HTMLElement, () => ticks++);
    ticker.setCadence("frame");
    ticker.connect();
    const before = ticks;
    nextFrame();
    nextFrame();
    expect(ticks - before).toBe(2);
    expect(frames.length).toBe(1);
    ticker.disconnect();
  });

  it("stops for good when the callback disconnects it", () => {
    // An animation that has settled stops its own ticker. The next frame used
    // to be scheduled after that stop, so the loop ran on with nothing left to
    // cancel it.
    let ticks = 0;
    const ticker: VisibleTicker = new VisibleTicker({} as HTMLElement, () => {
      ticks++;
      if (ticks >= 2) ticker.disconnect();
    });
    ticker.setCadence("frame");
    ticker.connect();
    for (let i = 0; i < 5; i++) nextFrame();
    expect(ticker.running).toBe(false);
    expect(frames.length).toBe(0);
  });
});
