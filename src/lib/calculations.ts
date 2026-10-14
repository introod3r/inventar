export function calculateBookValue(
  purchaseValue: number | null | undefined,
  purchaseDate: string | Date | null | undefined,
  depreciationRate: number | null | undefined
): number | null {
  if (purchaseValue == null || !purchaseDate) return purchaseValue ?? null;
  if (depreciationRate == null) return purchaseValue; // No depreciation

  const start = new Date(purchaseDate).getTime();
  const now = new Date().getTime();
  
  if (now <= start) return purchaseValue;
  
  // Calculate years difference with precision
  const diffTime = Math.abs(now - start);
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
  const diffYears = diffDays / 365.25;

  // Book value = Purchase Value * (1 - (Rate / 100) * Years)
  // Ensure it doesn't go below 0 or below a salvage value if we had one (usually 0)
  const depreciationFactor = (depreciationRate / 100) * diffYears;
  const bookValue = purchaseValue * (1 - depreciationFactor);
  
  return Math.max(0, bookValue);
}
