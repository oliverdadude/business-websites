import { STATUS_LABEL, type OrderStatus } from "@/lib/orders";
import { dateTime } from "@/lib/format";

export function Timeline({ events }: { events: { id: string; status: OrderStatus; note: string; createdAt: Date }[] }) {
  return (
    <ol className="relative ml-2 border-l border-ink-600">
      {events.map((e, i) => {
        const last = i === events.length - 1;
        return (
          <li key={e.id} className="mb-5 ml-5 last:mb-0">
            <span
              className={`absolute -left-[5px] mt-1.5 h-2.5 w-2.5 rounded-full ring-4 ring-ink-900 ${
                e.status === "CANCELLED" ? "bg-bad" : last ? "bg-brand-500 animate-pulseDot" : "bg-fog-400"
              }`}
            />
            <p className="text-sm font-medium">{STATUS_LABEL[e.status]}</p>
            <p className="text-xs text-fog-400">{dateTime(e.createdAt)}</p>
            {e.note && <p className="mt-1 text-sm text-fog-300">{e.note}</p>}
          </li>
        );
      })}
    </ol>
  );
}

/** Progress bar through the normal lifecycle. */
export function StatusSteps({ status }: { status: OrderStatus }) {
  const steps: OrderStatus[] = ["PENDING_APPROVAL", "ACCEPTED", "GATHERING_MATERIALS", "CRAFTING", "READY_FOR_DELIVERY", "COMPLETED"];
  if (status === "CANCELLED") return <div className="notice-bad">This order was cancelled.</div>;
  const at = steps.indexOf(status);
  return (
    <div className="grid grid-cols-6 gap-1.5" aria-label={`Status: ${STATUS_LABEL[status]}`}>
      {steps.map((s, i) => (
        <div key={s} className="min-w-0">
          <div className={`h-1.5 rounded-full transition-colors ${i <= at ? "bg-brand-500" : "bg-ink-700"}`} />
          <p className={`mt-1.5 hidden truncate text-[11px] sm:block ${i === at ? "text-fog-100" : "text-fog-500"}`}>{STATUS_LABEL[s]}</p>
        </div>
      ))}
    </div>
  );
}
