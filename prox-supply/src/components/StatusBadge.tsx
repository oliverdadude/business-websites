import { STATUS_LABEL, type OrderStatus } from "@/lib/orders";

const STYLE: Record<OrderStatus, string> = {
  PENDING_APPROVAL: "badge-warn",
  ACCEPTED: "badge-info",
  GATHERING_MATERIALS: "badge-info",
  CRAFTING: "badge-brand",
  READY_FOR_DELIVERY: "badge-ok",
  COMPLETED: "badge-neutral",
  CANCELLED: "badge-bad",
};

export function StatusBadge({ status }: { status: OrderStatus }) {
  return <span className={STYLE[status]}>{STATUS_LABEL[status]}</span>;
}

export function VerifiedBadge({ verified, label }: { verified: boolean; label?: string }) {
  return verified ? <span className="badge-ok">Verified</span> : <span className="badge-warn">{label ?? "Unverified"}</span>;
}
