import { describe, it, expect } from "vitest";
import { parseSlash } from "./slash.js";

describe("parseSlash", () => {
  it("returns null for non-slash text", () => {
    expect(parseSlash("hello")).toBeNull();
    expect(parseSlash("")).toBeNull();
    expect(parseSlash("/")).toBeNull();
  });

  it("parses /split with amount, description, with-list", () => {
    const parsed = parseSlash("/split 600 cab from airport with @919876543210 @919876543211");
    expect(parsed).toEqual({
      command: "split",
      amountPaise: 60000,
      description: "cab from airport",
      withMentions: ["919876543210", "919876543211"],
      exceptMentions: [],
    });
  });

  it("parses /split with username mention", () => {
    const parsed = parseSlash("/split 100 dosa with @anu");
    expect(parsed).toEqual({
      command: "split",
      amountPaise: 10000,
      description: "dosa",
      withMentions: ["anu"],
      exceptMentions: [],
    });
  });

  it("parses /split with decimal amount", () => {
    const parsed = parseSlash("/split 12.50 chai");
    expect(parsed).toEqual({
      command: "split",
      amountPaise: 1250,
      description: "chai",
      withMentions: [],
      exceptMentions: [],
    });
  });

  it("parses /split with `except`", () => {
    const parsed = parseSlash("/split 1200 dinner except @919999999999");
    expect(parsed).toEqual({
      command: "split",
      amountPaise: 120000,
      description: "dinner",
      withMentions: [],
      exceptMentions: ["919999999999"],
    });
  });

  it("parses /balance, /settle, /bills, /help with no args", () => {
    expect(parseSlash("/balance")).toEqual({ command: "balance" });
    expect(parseSlash("/settle")).toEqual({ command: "settle" });
    expect(parseSlash("/bills")).toEqual({ command: "bills" });
    expect(parseSlash("/help")).toEqual({ command: "help" });
  });

  it("parses /reset with no args", () => {
    expect(parseSlash("/reset")).toEqual({ command: "reset" });
  });

  it("parses /upi", () => {
    expect(parseSlash("/upi anu@okhdfc")).toEqual({
      command: "upi",
      upiId: "anu@okhdfc",
    });
  });

  it("parses /paid", () => {
    expect(parseSlash("/paid @919876543210 450")).toEqual({
      command: "paid",
      toUserId: "919876543210",
      amountPaise: 45000,
    });
  });

  it("returns invalid for malformed slash commands", () => {
    expect(parseSlash("/split")).toEqual({ command: "invalid", reason: expect.any(String) });
    expect(parseSlash("/upi")).toEqual({ command: "invalid", reason: expect.any(String) });
    expect(parseSlash("/paid")).toEqual({ command: "invalid", reason: expect.any(String) });
  });

  it("rejects unknown commands", () => {
    expect(parseSlash("/foobar")).toEqual({ command: "invalid", reason: expect.any(String) });
  });
});
