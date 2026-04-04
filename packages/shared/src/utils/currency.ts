/** Convert rupees/dollars to paise/cents (integer storage) */
export function toMinorUnits(amount: number): number {
  return Math.round(amount * 100);
}

/** Convert paise/cents back to display amount */
export function fromMinorUnits(amount: number): number {
  return amount / 100;
}

/** Format an integer (paise/cents) as a currency string */
export function formatCurrency(
  minorUnits: number,
  currencySymbol = "₹",
  symbolPosition: "before" | "after" = "before"
): string {
  const amount = (minorUnits / 100).toFixed(2);
  return symbolPosition === "before"
    ? `${currencySymbol}${amount}`
    : `${amount}${currencySymbol}`;
}
