import type { Tier } from "@/lib/engine";

/** What the storefront is allowed to know about an item. Never includes costs. */
export interface PublicItem {
  id: string;
  slug: string;
  name: string;
  category: string;
  description: string;
  basePrice: number;
  tiers: Tier[];
  quoteThreshold: number | null;
  featured: boolean;
  popular: boolean;
}
