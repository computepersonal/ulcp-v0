export type GstRate = 0 | 5 | 12 | 18 | 28;

export interface GstBreakdown {
  baseAmount: number;
  cgst: number;
  sgst: number;
  igst: number;
  totalTax: number;
  totalAmount: number;
  isInterState: boolean;
}

/**
 * Calculate GST on a price (in paise).
 * @param priceInPaise - price in minor units (paise)
 * @param rate - GST rate percentage
 * @param isTaxInclusive - whether price already includes GST
 * @param isInterState - IGST (inter-state) vs CGST+SGST (intra-state)
 */
export function calculateGst(
  priceInPaise: number,
  rate: GstRate,
  isTaxInclusive: boolean,
  isInterState: boolean
): GstBreakdown {
  let baseAmount: number;
  let totalTax: number;

  if (isTaxInclusive) {
    baseAmount = Math.round((priceInPaise * 100) / (100 + rate));
    totalTax = priceInPaise - baseAmount;
  } else {
    baseAmount = priceInPaise;
    totalTax = Math.round((priceInPaise * rate) / 100);
  }

  const cgst = isInterState ? 0 : Math.round(totalTax / 2);
  const sgst = isInterState ? 0 : totalTax - cgst;
  const igst = isInterState ? totalTax : 0;

  return {
    baseAmount,
    cgst,
    sgst,
    igst,
    totalTax,
    totalAmount: baseAmount + totalTax,
    isInterState,
  };
}
