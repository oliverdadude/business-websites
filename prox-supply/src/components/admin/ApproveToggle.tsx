"use client";
import { useState } from "react";

/** "Approved for sale" checkbox that warns before approving items with unverified data. */
export function ApproveToggle({ defaultChecked, warnings }: { defaultChecked: boolean; warnings: string[] }) {
  const [checked, setChecked] = useState(defaultChecked);
  return (
    <div>
      <label className="flex items-center gap-2 text-sm font-medium">
        <input
          type="checkbox"
          name="approvedForSale"
          className="check"
          checked={checked}
          onChange={(e) => {
            if (e.target.checked && warnings.length > 0) {
              const ok = window.confirm(`This item has unverified or missing data:\n\n• ${warnings.join("\n• ")}\n\nApprove it for sale anyway?`);
              if (!ok) return;
            }
            setChecked(e.target.checked);
          }}
        />
        Approved for sale
      </label>
      {warnings.length > 0 && (
        <ul className="notice-warn mt-2 list-inside list-disc space-y-0.5 text-xs">
          {warnings.map((w) => <li key={w}>{w}</li>)}
        </ul>
      )}
    </div>
  );
}
