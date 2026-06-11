import { describe, it, expect } from "vitest";
import { sentimentOf } from "./sentiment";

describe("sentimentOf — directional chat read", () => {
  it("reads bullish words", () => {
    expect(sentimentOf("lfg moon pump").bull).toBe(1);
  });
  it("reads bearish words", () => {
    expect(sentimentOf("dump it, totally rugged").bear).toBe(1);
  });
  it("counts one vote per message, not one per keyword", () => {
    expect(sentimentOf("moon pump bull lfg").bull).toBe(1);
  });
  it("reads emoji", () => {
    expect(sentimentOf("🚀🚀🚀").bull).toBe(1);
    expect(sentimentOf("📉 ngl").bear).toBe(1);
  });
  it("does NOT read ambiguous filler as directional (the accuracy fix)", () => {
    expect(sentimentOf("gm whats up everyone").bull).toBe(0);
    expect(sentimentOf("its over there on the left").bear).toBe(0);
  });
  it("matches whole words only (no Scunthorpe-style substring hits)", () => {
    expect(sentimentOf("supergroup meeting").bull).toBe(0); // not "up"
    expect(sentimentOf("i got bored").bear).toBe(0); // not "red"
  });
});
