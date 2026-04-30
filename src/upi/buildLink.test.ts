import { describe, it, expect } from "vitest";
import { buildUpiLink } from "./buildLink.js";

describe("buildUpiLink", () => {
  it("builds a basic UPI deep link", () => {
    const link = buildUpiLink({ pa: "anu@okhdfc", amPaise: 45000, tn: "Splitbot" });
    expect(link).toBe("upi://pay?pa=anu%40okhdfc&am=450.00&cu=INR&tn=Splitbot");
  });

  it("URL-encodes special characters in pa and tn", () => {
    const link = buildUpiLink({
      pa: "rohit+test@ybl",
      amPaise: 12000,
      tn: "Goa Trip ₹120",
    });
    expect(link).toContain("pa=rohit%2Btest%40ybl");
    expect(link).toContain("tn=Goa%20Trip%20%E2%82%B9120");
  });

  it("formats paise to 2-decimal rupees", () => {
    expect(buildUpiLink({ pa: "x@y", amPaise: 1, tn: "t" })).toContain("am=0.01");
    expect(buildUpiLink({ pa: "x@y", amPaise: 99, tn: "t" })).toContain("am=0.99");
    expect(buildUpiLink({ pa: "x@y", amPaise: 100, tn: "t" })).toContain("am=1.00");
    expect(buildUpiLink({ pa: "x@y", amPaise: 100000, tn: "t" })).toContain("am=1000.00");
  });

  it("rejects non-positive amounts", () => {
    expect(() => buildUpiLink({ pa: "x@y", amPaise: 0, tn: "t" })).toThrow();
    expect(() => buildUpiLink({ pa: "x@y", amPaise: -1, tn: "t" })).toThrow();
  });

  it("rejects malformed UPI IDs", () => {
    expect(() => buildUpiLink({ pa: "noatsign", amPaise: 100, tn: "t" })).toThrow();
    expect(() => buildUpiLink({ pa: "", amPaise: 100, tn: "t" })).toThrow();
  });
});
