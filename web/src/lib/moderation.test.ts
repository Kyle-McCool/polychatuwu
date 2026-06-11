import { describe, it, expect } from "vitest";
import { classifyMessage, modCommand, isBot, isQuestion, isScam } from "./moderation";

describe("classifyMessage — severity + category", () => {
  it("flags slurs as level 3 (through leetspeak)", () => {
    const f = classifyMessage("n1gg3r");
    expect(f?.category).toBe("slur");
    expect(f?.level).toBe(3);
  });

  it("flags self-harm targeting at level 3", () => {
    expect(classifyMessage("kys")?.category).toBe("self-harm");
    expect(classifyMessage("just kill yourself")?.level).toBe(3);
  });

  it("flags a threat only with a violence verb AND a second-person target", () => {
    expect(classifyMessage("im gonna kill you")?.category).toBe("threat");
    expect(classifyMessage("@noob ill stab you")?.category).toBe("threat");
    // in-game / banter must NOT be flagged as a threat (the context guard)
    expect(classifyMessage("kill the boss right now")).toBeNull();
    expect(classifyMessage("shoot your shot bro")).toBeNull();
  });

  it("flags doxxing patterns at level 3", () => {
    expect(classifyMessage("call me at 555-123-4567")?.category).toBe("doxx");
    expect(classifyMessage("he lives at 42 Baker Street")?.category).toBe("doxx");
  });

  it("flags harassment only with a real insult AND a target", () => {
    expect(classifyMessage("you are a pathetic worthless loser")?.category).toBe("harassment");
    expect(classifyMessage("this game is trash lol")).toBeNull();
  });

  it("grades caps/spam/links as watch-level (1)", () => {
    expect(classifyMessage("AAAAAAAAAAAAAAAAAA")?.level).toBe(1);
    expect(classifyMessage("hello hello aaaaaaaaaaaa")?.category).toBe("spam");
  });

  it("leaves normal chat unflagged", () => {
    expect(classifyMessage("gg ez clap nice clip")).toBeNull();
    expect(classifyMessage("what time is the stream tomorrow")).toBeNull();
    expect(classifyMessage("")).toBeNull();
  });
});

describe("modCommand — paste-ready native commands", () => {
  it("builds Twitch ban/timeout and strips a leading @", () => {
    expect(modCommand("twitch", "@Bad_User", "ban")).toBe("/ban Bad_User");
    expect(modCommand("twitch", "Bad_User", "timeout")).toBe("/timeout Bad_User 600");
  });
  it("builds Kick commands (timeout in minutes)", () => {
    expect(modCommand("kick", "spammer", "ban")).toBe("/ban spammer");
    expect(modCommand("kick", "spammer", "timeout")).toBe("/timeout spammer 10");
  });
  it("returns null for X (no chat mod command — caller copies the handle)", () => {
    expect(modCommand("x", "someone", "ban")).toBeNull();
  });
});

describe("helpers", () => {
  it("isBot matches known bots case-insensitively", () => {
    expect(isBot("Nightbot")).toBe(true);
    expect(isBot("@StreamElements")).toBe(true);
    expect(isBot("real_viewer")).toBe(false);
  });
  it("isQuestion surfaces real questions, not reaction spam", () => {
    expect(isQuestion("how do i connect my wallet")).toBe(true);
    expect(isQuestion("LMAO????")).toBe(false);
  });
  it("isScam catches follower-bot copypasta", () => {
    expect(isScam("cheap viewers and followers here")).toBe(true);
    expect(isScam("just chilling watching the stream")).toBe(false);
  });
});
