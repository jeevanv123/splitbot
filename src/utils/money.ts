// Currency formatting helper. v1: assumes 2-decimal currencies (paise * 100 → major).
// JPY etc. would need per-currency precision rules; out of scope for now.
const SYMBOLS: Record<string, string> = {
  INR: "₹",
  USD: "$",
  EUR: "€",
  GBP: "£",
  JPY: "¥",
  AUD: "A$",
  CAD: "C$",
  SGD: "S$",
  AED: "د.إ",
};

export function formatMoney(paise: number, currency: string): string {
  const code = (currency ?? "INR").toUpperCase();
  const symbol = SYMBOLS[code];
  // For JPY-like 0-decimal currencies, drop the decimals. For now we assume 2 decimals
  // for all currencies — JPY use is rare in this product. Future: per-currency precision.
  const value = (paise / 100).toFixed(2).replace(/\.00$/, "");
  if (symbol) return `${symbol}${value}`;
  return `${value} ${code}`;
}
