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
