import Link from "next/link";
import { getSettings } from "@/server/settings";
import { createItemAction } from "@/server/admin-actions";
import { ActionForm, Submit } from "@/components/admin/ActionForm";
import { ItemFields } from "@/components/admin/ItemForm";
import { PageHeader } from "@/components/admin/Stat";

export const metadata = { title: "New item" };

export default async function NewItemPage() {
  const s = await getSettings();
  return (
    <>
      <Link href="/admin/items" className="text-xs text-fog-400 hover:text-fog-100">← Items</Link>
      <PageHeader title="New item" sub="Only add real data you have checked in-game. Leave unknown prices blank. New items get a copy of the default discount tiers." />
      <ActionForm action={createItemAction} className="card card-pad space-y-6">
        <ItemFields defaults={{ minMarginPct: s.defaultMinMarginPct, quoteThreshold: s.defaultQuoteThreshold }} warnings={["New item: add a recipe or buy price and verify prices first"]} />
        <Submit>Create item</Submit>
      </ActionForm>
    </>
  );
}
