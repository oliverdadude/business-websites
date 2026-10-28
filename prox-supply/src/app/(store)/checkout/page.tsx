import { CheckoutForm } from "@/components/store/CheckoutForm";
import { getSettings } from "@/server/settings";

export const metadata = { title: "Checkout" };

export default async function CheckoutPage() {
  const s = await getSettings();
  return (
    <div className="container-x py-10">
      <h1 className="h1 mb-6">Checkout</h1>
      <CheckoutForm ordersOpen={s.ordersOpen} sellerDiscord={s.sellerDiscord} />
    </div>
  );
}
