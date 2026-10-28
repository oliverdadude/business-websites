import { CartView } from "@/components/store/CartView";
import { getSettings } from "@/server/settings";

export const metadata = { title: "Cart" };

export default async function CartPage() {
  const s = await getSettings();
  return (
    <div className="container-x py-10">
      <h1 className="h1 mb-6">Cart</h1>
      <CartView ordersOpen={s.ordersOpen} />
    </div>
  );
}
