"use client";
import { useState } from "react";

export function CopyLink() {
  const [done, setDone] = useState(false);
  return (
    <button
      className="btn-secondary btn-sm"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(window.location.href.split("?")[0]);
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        } catch {}
      }}
    >
      {done ? "Copied ✓" : "Copy tracking link"}
    </button>
  );
}
