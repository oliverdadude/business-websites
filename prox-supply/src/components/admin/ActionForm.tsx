"use client";
import { useActionState, useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";
import type { ActionResult } from "@/lib/form";

type Action = (prev: ActionResult, fd: FormData) => Promise<ActionResult>;

export function ActionForm({
  action,
  children,
  className,
  confirm,
  resetOnSuccess,
  inlineMessage,
  onResult,
}: {
  action: Action;
  children: React.ReactNode;
  className?: string;
  confirm?: string;
  resetOnSuccess?: boolean;
  inlineMessage?: boolean;
  onResult?: (r: ActionResult) => void;
}) {
  const [state, formAction] = useActionState(action, null);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok && resetOnSuccess) ref.current?.reset();
    if (state) onResult?.(state);
  }, [state, resetOnSuccess, onResult]);
  return (
    <form
      ref={ref}
      action={formAction}
      className={className}
      onSubmit={confirm ? (e) => { if (!window.confirm(confirm)) e.preventDefault(); } : undefined}
    >
      {children}
      {state?.message && (
        <p role="status" className={`${inlineMessage ? "text-xs" : "mt-2 text-sm"} ${state.ok ? (state.message.includes("but") ? "text-warn" : "text-ok") : "text-bad"} animate-rise`}>
          {state.message}
        </p>
      )}
    </form>
  );
}

export function Submit({ children, className = "btn-primary", pendingText }: { children: React.ReactNode; className?: string; pendingText?: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={className} disabled={pending}>
      {pending ? pendingText ?? "Saving…" : children}
    </button>
  );
}

/** Button that runs a no-argument server action, with optional confirm. */
export function ActionButton({ action, children, className = "btn-secondary", confirm }: { action: () => Promise<unknown>; children: React.ReactNode; className?: string; confirm?: string }) {
  return (
    <form action={async () => { await action(); }} onSubmit={confirm ? (e) => { if (!window.confirm(confirm)) e.preventDefault(); } : undefined} className="inline">
      <Submit className={className} pendingText="Working…">{children}</Submit>
    </form>
  );
}
