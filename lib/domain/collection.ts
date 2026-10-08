/** Collection targets are user goals, never official deckbuilding limits. */
export type CollectionCategory = "Normal" | "Legend" | "Battlefield" | null;
export function target(category: CollectionCategory): number | null {
  switch (category) {
    case "Normal": return 3;
    case "Legend": case "Battlefield": return 1;
    default: return null;
  }
}
export function wholeQuantity(n: number): number {
  if (!Number.isSafeInteger(n) || n < 0) throw new Error("Quantity must be a nonnegative whole number.");
  return n;
}
export function inventory(owned: number, reserved: number) {
  wholeQuantity(owned); wholeQuantity(reserved);
  if (reserved > owned) throw new Error("Reserved copies exceed owned quantity.");
  return { owned, reserved, available: owned - reserved };
}
export function progress(entries: { owned: number; category: CollectionCategory }[]) {
  let total = 0, covered = 0, missing = 0, excess = 0, unresolved = 0;
  for (const entry of entries) {
    wholeQuantity(entry.owned);
    const goal = target(entry.category);
    if (goal === null) { unresolved++; continue; }
    total += goal;
    covered += Math.min(entry.owned, goal);
    missing += Math.max(goal - entry.owned, 0);
    excess += Math.max(entry.owned - goal, 0);
  }
  return { total, covered, missing, excess, unresolved,
    completion: total && !unresolved ? covered / total * 100 : null };
}
export type OrderedPrinting = { id: string; setOrder: number; cardNumber: string | null };
const natural = new Intl.Collator("en", { numeric: true, sensitivity: "variant" });
/** Same deterministic comparator for collection and wishlist; sort before paging. */
export function canonicalOrder(a: OrderedPrinting, b: OrderedPrinting): number {
  const set = a.setOrder - b.setOrder;
  if (set) return set;
  const aNumber = a.cardNumber?.match(/^(\d+)(.*)$/);
  const bNumber = b.cardNumber?.match(/^(\d+)(.*)$/);
  if (!aNumber && bNumber) return 1;
  if (aNumber && !bNumber) return -1;
  if (aNumber && bNumber) {
    const left = BigInt(aNumber[1]), right = BigInt(bNumber[1]);
    if (left !== right) return left < right ? -1 : 1;
    const suffix = natural.compare(aNumber[2], bNumber[2]);
    if (suffix) return suffix;
  }
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}
