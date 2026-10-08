"use client";
import { useActionState } from "react";
import { authenticate } from "./actions";
export function AuthForm() {
  const [state, action, pending] = useActionState(authenticate, { message: "", success: false });
  return <form action={action} className="auth-form">
    <label htmlFor="email">Email</label><input id="email" type="email" name="email" autoComplete="email" required maxLength={254}/>
    <label htmlFor="password">Password</label><input id="password" type="password" name="password" autoComplete="current-password" required minLength={8} maxLength={128}/>
    <div className="auth-buttons"><button type="submit" name="intent" value="signin" disabled={pending}>{pending ? "Please wait…" : "Sign in"}</button>
    <button type="submit" name="intent" value="signup" disabled={pending}>Create account</button></div>
    {state.message && <p role={state.success ? "status" : "alert"}>{state.message}</p>}
  </form>;
}
