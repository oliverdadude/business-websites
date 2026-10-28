"use client";
import { useActionState } from "react";
import { loginAction } from "@/server/admin-actions";

export function LoginForm() {
  const [state, action, pending] = useActionState(loginAction, null);
  return (
    <form action={action} className="mt-6 space-y-3">
      <div>
        <label htmlFor="password" className="label">Password</label>
        <input id="password" name="password" type="password" autoComplete="current-password" required className="input" autoFocus />
      </div>
      {state && !state.ok && <p className="text-sm text-bad" role="alert">{state.message}</p>}
      <button className="btn-primary w-full" disabled={pending}>{pending ? "Checking…" : "Log in"}</button>
    </form>
  );
}
