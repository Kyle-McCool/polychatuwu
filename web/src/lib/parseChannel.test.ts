import { describe, it, expect } from "vitest";
import { channelLabel } from "./parseChannel";

describe("channelLabel — clean source chips", () => {
  it("leaves Twitch / Kick handles untouched", () => {
    expect(channelLabel("twitch", "caseoh_")).toBe("caseoh_");
    expect(channelLabel("kick", "classybeef")).toBe("classybeef");
  });
  it("shows a bare X handle as @handle", () => {
    expect(channelLabel("x", "davidgokhshtein")).toBe("@davidgokhshtein");
    expect(channelLabel("x", "@elonmusk")).toBe("@elonmusk");
  });
  it("pulls the handle out of an X profile or post URL", () => {
    expect(channelLabel("x", "https://x.com/davidgokhshtein")).toBe("@davidgokhshtein");
    expect(channelLabel("x", "https://x.com/someone/status/123")).toBe("@someone");
  });
  it("shows a broadcast as 'X live' instead of a raw id", () => {
    expect(channelLabel("x", "https://x.com/i/broadcasts/1wxWjjvwWDDJQ")).toBe("X live");
    expect(channelLabel("x", "1wxWjjvwWDDJQ")).toBe("X live"); // bare mixed-case broadcast id
  });
});
