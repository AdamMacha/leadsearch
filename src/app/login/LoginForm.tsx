"use client";

import { useActionState } from "react";
import { login } from "@/app/actions";

export function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(login, undefined);
  return (
    <form action={action} className="stack" style={{ gap: 14 }}>
      <input type="hidden" name="next" value={next} />
      <div>
        <label className="label" htmlFor="password">Heslo</label>
        <input id="password" name="password" type="password" className="input" autoFocus required autoComplete="current-password" />
      </div>
      {state?.error && <div className="alert alert-bad">{state.error}</div>}
      <button className="btn btn-primary btn-lg" disabled={pending} id="login-submit">
        {pending ? <span className="spinner" /> : "Přihlásit se"}
      </button>
    </form>
  );
}
