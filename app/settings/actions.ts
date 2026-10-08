"use server";
import { supabaseServer } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
export type AuthState = { message: string; success: boolean };
export async function authenticate(_: AuthState, data: FormData): Promise<AuthState> {
  const client = await supabaseServer();
  if (!client) return { message: "Supabase is not configured.", success: false };
  const email = data.get("email"), password = data.get("password"), intent = data.get("intent");
  if (typeof email !== "string" || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    || typeof password !== "string" || password.length < 8 || password.length > 128
    || !["signin", "signup"].includes(String(intent))) {
    return { message: "Enter a valid email and a password between 8 and 128 characters.", success: false };
  }
  try {
    const result = intent === "signup" ? await client.auth.signUp({ email, password }) : await client.auth.signInWithPassword({ email, password });
    if (result.error) return { message: "Authentication failed. Check your details and local Auth configuration.", success: false };
    if (!result.data.session) return { message: "Check your email to confirm your account before signing in.", success: true };
  } catch { return { message: "Authentication is unavailable. Please try again.", success: false }; }
  revalidatePath("/", "layout");
  redirect("/settings");
}
export async function signOut() {
  const client = await supabaseServer();
  if (client) {
    const { error } = await client.auth.signOut();
    if (error) redirect("/settings?error=signout");
  }
  revalidatePath("/", "layout");
  redirect("/settings");
}
