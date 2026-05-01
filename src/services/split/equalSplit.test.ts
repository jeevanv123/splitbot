import { describe, it, expect } from "vitest";
import { equalSplit } from "./equalSplit.js";
import type { Bill } from "../../types/domain.js";

function bill(totalPaise: number): Bill {
  return { items: [], taxPaise: 0, tipPaise: 0, totalPaise, currency: "INR" };
}

describe("equalSplit", () => {
  it("returns [] for zero participants", () => {
    expect(equalSplit({ bill: bill(1000), participants: [] })).toEqual([]);
  });

  it("splits evenly when total divides cleanly", () => {
    const out = equalSplit({
      bill: bill(60000),
      participants: [{ userId: "+a" }, { userId: "+b" }, { userId: "+c" }],
    });
    expect(out).toEqual([
      { userId: "+a", sharePaise: 20000 },
      { userId: "+b", sharePaise: 20000 },
      { userId: "+c", sharePaise: 20000 },
    ]);
  });

  it("distributes the remainder paise to the first n participants", () => {
    // 100 paise / 3 = 33 r 1 → first participant gets +1
    const out = equalSplit({
      bill: bill(100),
      participants: [{ userId: "+a" }, { userId: "+b" }, { userId: "+c" }],
    });
    expect(out).toEqual([
      { userId: "+a", sharePaise: 34 },
      { userId: "+b", sharePaise: 33 },
      { userId: "+c", sharePaise: 33 },
    ]);
  });

  it("assignments always sum exactly to totalPaise", () => {
    for (const total of [1, 7, 99, 100, 12345, 67000]) {
      for (const n of [1, 2, 3, 5, 7, 11]) {
        const ps = Array.from({ length: n }, (_, i) => ({ userId: `u${i}` }));
        const out = equalSplit({ bill: bill(total), participants: ps });
        const sum = out.reduce((s, x) => s + x.sharePaise, 0);
        expect(sum).toBe(total);
        expect(out).toHaveLength(n);
      }
    }
  });

  it("handles a single participant taking the whole bill", () => {
    const out = equalSplit({ bill: bill(1234), participants: [{ userId: "+a" }] });
    expect(out).toEqual([{ userId: "+a", sharePaise: 1234 }]);
  });

  it("handles a zero-rupee bill", () => {
    const out = equalSplit({
      bill: bill(0),
      participants: [{ userId: "+a" }, { userId: "+b" }],
    });
    expect(out).toEqual([
      { userId: "+a", sharePaise: 0 },
      { userId: "+b", sharePaise: 0 },
    ]);
  });
});
