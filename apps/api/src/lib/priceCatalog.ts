export type BillableTier = "pro" | "team";

interface CatalogEntry {
  tier: BillableTier;
  priceId: string;
}

// Built once from env — the whitelist CLAUDE.md's Security Rules require
// ("Whitelist price_id server-side — reject unknown price IDs"). Both
// checkout (tier -> priceId) and the webhook (priceId -> tier) go through
// this single source of truth so they can never disagree.
const CATALOG: CatalogEntry[] = [
  ...(process.env.STRIPE_PRO_PRICE_ID ? [{ tier: "pro" as const, priceId: process.env.STRIPE_PRO_PRICE_ID }] : []),
  ...(process.env.STRIPE_TEAM_PRICE_ID ? [{ tier: "team" as const, priceId: process.env.STRIPE_TEAM_PRICE_ID }] : []),
];

export function priceIdForTier(tier: BillableTier): string | undefined {
  return CATALOG.find((e) => e.tier === tier)?.priceId;
}

/** Returns null for any price ID not in the whitelist — callers must treat
 * that as "reject", never as "fall back to a default tier". */
export function tierForPriceId(priceId: string): BillableTier | null {
  return CATALOG.find((e) => e.priceId === priceId)?.tier ?? null;
}
