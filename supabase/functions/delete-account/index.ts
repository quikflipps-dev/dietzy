// Dietzy "delete-account" server function (Supabase Edge Function).
// Permanently deletes the signed-in user's saved data and their login.
// Only the user themselves can call it for their own account.
// SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are provided automatically.

import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Use POST." }, 405);

  const userClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: req.headers.get("Authorization") || "" } },
  });
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return json({ error: "Please sign in again." }, 401);

  let body: any = {};
  try { body = await req.json(); } catch { /* empty body is fine */ }
  if (body.confirm !== "DELETE") return json({ error: "Missing confirmation." }, 400);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  // Rows are also removed automatically when the login is deleted (on delete cascade); delete explicitly first anyway.
  for (const table of ["user_docs", "ai_usage", "consents"]) {
    const { error } = await admin.from(table).delete().eq("user_id", user.id);
    if (error) { console.error("delete", table, error.message); return json({ error: "Couldn't delete your data. Try again or email support." }, 500); }
  }
  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) { console.error("deleteUser", error.message); return json({ error: "Your data was deleted, but closing the login failed. Email support." }, 500); }
  return json({ ok: true });
});
