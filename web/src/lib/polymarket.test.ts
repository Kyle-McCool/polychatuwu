import { describe, it, expect } from "vitest";
import { brier } from "./polymarket";

describe("brier score (settled vs the market)", () => {
  it("is 0 for a perfect, confident forecast", () => {
    expect(brier(1, 1)).toBe(0);
    expect(brier(0, 0)).toBe(0);
  });
  it("is 1 for a confident wrong forecast", () => {
    expect(brier(1, 0)).toBe(1);
    expect(brier(0, 1)).toBe(1);
  });
  it("rewards the more confident correct call (lower is better)", () => {
    expect(brier(0.7, 1)).toBeCloseTo(0.09);
    expect(brier(0.55, 1)).toBeCloseTo(0.2025);
    expect(brier(0.7, 1)).toBeLessThan(brier(0.55, 1));
  });
  it("scores a coin-flip at 0.25 regardless of outcome", () => {
    expect(brier(0.5, 1)).toBe(0.25);
    expect(brier(0.5, 0)).toBe(0.25);
  });
});
