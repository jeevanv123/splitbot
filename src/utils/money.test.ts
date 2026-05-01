import { describe, it, expect } from "vitest";
import { formatMoney } from "./money.js";

describe("formatMoney", () => {
  it("formats INR with ₹ symbol", () => {
    expect(formatMoney(60000, "INR")).toBe("₹600");
  });

  it("formats USD with $ symbol", () => {
    expect(formatMoney(60000, "USD")).toBe("$600");
  });

  it("formats EUR with € symbol", () => {
    expect(formatMoney(12345, "EUR")).toBe("€123.45");
  });

  it("falls back to '<value> <CODE>' for unknown currency", () => {
    expect(formatMoney(50000, "ZAR")).toBe("500 ZAR");
  });

  it("strips trailing .00", () => {
    expect(formatMoney(10000, "INR")).toBe("₹100");
  });

  it("keeps non-zero decimals", () => {
    expect(formatMoney(10050, "INR")).toBe("₹100.50");
  });

  it("handles lowercase currency code", () => {
    expect(formatMoney(20000, "usd")).toBe("$200");
  });
});
