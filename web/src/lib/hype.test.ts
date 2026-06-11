import { describe, it, expect } from "vitest";
import { classify, hypeSeries, hypeNow } from "./hype";
import type { ChatMessage } from "./types";

function msg(user: string, text: string, sec: number, i = 0): ChatMessage {
  return { id: `${user}-${sec}-${i}`, platform: "twitch", channel: "c", user, color: null, badges: [], text, ts: sec * 1000 };
}

describe("classify — affect detection", () => {
  it("maps tokens to the right affect (collapsing repeats)", () => {
    expect(classify("LMAOOOO").affect).toBe("funny");
    expect(classify("pump it lfg").affect).toBe("hype");
    expect(classify("rip rekt copium").affect).toBe("rekt");
    expect(classify("monkaS holy").affect).toBe("shock");
  });
  it("flags clip-keyword messages", () => {
    expect(classify("CLIP IT").clipKw).toBe(true);
    expect(classify("just chatting").clipKw).toBe(false);
  });
  it("normalizes for convergence so spelling variants group together", () => {
    expect(classify("LMAOOOO").norm).toBe(classify("lmaooo").norm);
  });
});

const T = 1_000_000; // arbitrary fixed second (no Date.now in tests)

describe("hypeSeries — clip firing is guarded", () => {
  it("fires on a diverse, convergent hype burst (a real moment)", () => {
    const msgs = Array.from({ length: 12 }, (_, i) => msg(`viewer${i}`, "LETSGOOO INSANE", T));
    const series = hypeSeries(msgs, T - 5, T, T - 5);
    expect(series.some((p) => p.fired)).toBe(true);
  });

  it("does NOT fire for a single user spamming (diversity guard)", () => {
    const msgs = Array.from({ length: 50 }, (_, i) => msg("spammer", "LETSGOOO INSANE", T, i));
    const series = hypeSeries(msgs, T - 5, T, T - 5);
    expect(series.some((p) => p.fired)).toBe(false);
  });

  it("does NOT fire for a bot flood (bot guard)", () => {
    const bots = ["nightbot", "fossabot", "streamelements", "streamlabs", "moobot", "wizebot", "botrix", "soundalerts"];
    const msgs = bots.map((b) => msg(b, "LETSGOOO INSANE", T));
    const series = hypeSeries(msgs, T - 5, T, T - 5);
    expect(series.some((p) => p.fired)).toBe(false);
  });
});

describe("hypeNow — readout", () => {
  it("is calm with no chat and never fires a clip", () => {
    const now = T * 1000;
    const h = hypeNow([], now);
    expect(h.clip).toBe(false);
    expect(h.score).toBeLessThan(20);
    expect(h.intensity).toBe("calm");
  });
});
