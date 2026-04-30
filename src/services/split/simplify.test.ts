import { describe, it, expect } from "vitest";
import { simplify, type Balance } from "./simplify.js";

describe("simplify", () => {
  it("returns empty array when everyone is settled", () => {
    const balances: Balance[] = [
      { userId: "a", netPaise: 0 },
      { userId: "b", netPaise: 0 },
    ];
    expect(simplify(balances)).toEqual([]);
  });

  it("matches a single creditor with a single debtor", () => {
    const balances: Balance[] = [
      { userId: "a", netPaise: 1000 },   // a is owed ₹10
      { userId: "b", netPaise: -1000 },  // b owes ₹10
    ];
    expect(simplify(balances)).toEqual([
      { fromUserId: "b", toUserId: "a", amountPaise: 1000 },
    ]);
  });
});

describe("simplify — multi-party", () => {
  it("handles 3-way uneven split", () => {
    const balances: Balance[] = [
      { userId: "a", netPaise: 3000 },   // owed 30
      { userId: "b", netPaise: -1000 },  // owes 10
      { userId: "c", netPaise: -2000 },  // owes 20
    ];
    const result = simplify(balances);
    expect(result).toHaveLength(2);
    const totalSettled = result.reduce((s, r) => s + r.amountPaise, 0);
    expect(totalSettled).toBe(3000);
    // c owes the most, settles to a first
    expect(result[0]).toEqual({ fromUserId: "c", toUserId: "a", amountPaise: 2000 });
    expect(result[1]).toEqual({ fromUserId: "b", toUserId: "a", amountPaise: 1000 });
  });

  it("never produces more than N-1 settlements for N parties", () => {
    const balances: Balance[] = [
      { userId: "a", netPaise: 1500 },
      { userId: "b", netPaise: 500 },
      { userId: "c", netPaise: -800 },
      { userId: "d", netPaise: -1200 },
    ];
    const result = simplify(balances);
    expect(result.length).toBeLessThanOrEqual(3);
  });

  it("conservation: sum of settlements equals total credit", () => {
    const balances: Balance[] = [
      { userId: "a", netPaise: 250 },
      { userId: "b", netPaise: 750 },
      { userId: "c", netPaise: -300 },
      { userId: "d", netPaise: -700 },
    ];
    const totalCredit = balances.filter((b) => b.netPaise > 0).reduce((s, b) => s + b.netPaise, 0);
    const result = simplify(balances);
    const totalSettled = result.reduce((s, r) => s + r.amountPaise, 0);
    expect(totalSettled).toBe(totalCredit);
  });

  it("never produces negative settlements", () => {
    const balances: Balance[] = [
      { userId: "a", netPaise: 100 },
      { userId: "b", netPaise: -100 },
    ];
    const result = simplify(balances);
    for (const s of result) {
      expect(s.amountPaise).toBeGreaterThan(0);
    }
  });

  it("ignores zero balances in the input", () => {
    const balances: Balance[] = [
      { userId: "a", netPaise: 500 },
      { userId: "b", netPaise: 0 },
      { userId: "c", netPaise: -500 },
    ];
    const result = simplify(balances);
    expect(result).toEqual([{ fromUserId: "c", toUserId: "a", amountPaise: 500 }]);
  });
});
