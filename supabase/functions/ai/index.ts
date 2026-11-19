// Dietzy "ai" server function (Supabase Edge Function).
// The app calls this instead of an AI company directly, so the AI key never reaches anyone's browser.
// It checks the user is signed in, applies daily limits, then calls Anthropic's Claude API.
//
// Secrets to set (Supabase dashboard -> Edge Functions -> Secrets):
//   ANTHROPIC_API_KEY  (required)  your key from the Claude Console
//   AI_MODEL           (optional)  default "claude-haiku-5-5"
//   DAILY_AI_CALLS     (optional)  default 150 requests per user per day
//   DAILY_PHOTOS       (optional)  default 20 photo analyses per user per day
// SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are provided automatically.

import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

type Msg = { role: "user" | "assistant"; text: string };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Use POST." }, 405);

  // 1) Who is calling?
  const auth = req.headers.get("Authorization") || "";
  const userClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: auth } },
  });
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return json({ error: "Please sign in again." }, 401);

  const key = Deno.env.get("ANTHROPIC_API_KEY");
  if (!key) return json({ error: "The AI isn't set up yet (missing ANTHROPIC_API_KEY)." }, 500);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "Bad request." }, 400); }
  const mode = body.mode === "chat" ? "chat" : "ask";
  const image = mode === "ask" && body.image && body.image.data ? body.image : null;

  // 2) Daily limits.
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: usage, error: uErr } = await admin.rpc("bump_ai_usage", { p_user: user.id, p_photo: !!image });
  if (uErr) return json({ error: "Couldn't check your AI allowance. Try again." }, 500);
  const row = Array.isArray(usage) ? usage[0] : usage;
  const maxCalls = Number(Deno.env.get("DAILY_AI_CALLS") || 150);
  const maxPhotos = Number(Deno.env.get("DAILY_PHOTOS") || 20);
  if (row && row.calls > maxCalls) return json({ error: `You've reached today's AI limit (${maxCalls}). It resets tomorrow.` }, 429);
  if (image && row && row.photos > maxPhotos) return json({ error: `You've used today's ${maxPhotos} photo scans. Describe the meal instead, or try again tomorrow.` }, 429);

  // 3) Build the Claude request.
  const model = Deno.env.get("AI_MODEL") || "claude-haiku-5-5";
  let payload: Record<string, unknown>;
  if (mode === "chat") {
    let msgs: Msg[] = (Array.isArray(body.messages) ? body.messages : []).slice(-24)
      .filter((m: Msg) => m && (m.role === "user" || m.role === "assistant") && typeof m.text === "string" && m.text.trim());
    while (msgs.length && msgs[0].role !== "user") msgs = msgs.slice(1);
    if (!msgs.length) return json({ error: "Say something first." }, 400);
    payload = {
      model, max_tokens: 1200,
      system: String(body.system || "").slice(0, 60000),
      messages: msgs.map((m) => ({ role: m.role, content: m.text.slice(0, 8000) })),
    };
  } else {
    const content: unknown[] = [];
    if (image) content.push({ type: "image", source: { type: "base64", media_type: image.media_type || "image/jpeg", data: image.data } });
    content.push({ type: "text", text: String(body.prompt || "").slice(0, 60000) });
    payload = { model, max_tokens: 1500, messages: [{ role: "user", content }] };
  }
  const stream = !!body.stream;
  if (stream) payload.stream = true;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const t = await res.text();
    console.error("Anthropic error", res.status, t.slice(0, 500));
    return json({ error: res.status === 429 || res.status === 529 ? "The AI is busy — wait a minute and try again." : "The AI request failed. Try again." }, 502);
  }

  if (!stream) {
    const j = await res.json();
    const text = (j.content || []).map((c: any) => c.text || "").join("");
    return json({ text });
  }

  // 4) Streaming: pass along just the text as it arrives (plain text chunks).
  const enc = new TextEncoder(), dec = new TextDecoder();
  const out = new ReadableStream({
    async start(ctrl) {
      const reader = res.body!.getReader();
      let buf = "";
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          let i;
          while ((i = buf.indexOf("\n")) >= 0) {
            const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
            if (!line.startsWith("data:")) continue;
            try {
              const ev = JSON.parse(line.slice(5));
              if (ev.type === "content_block_delta" && ev.delta && ev.delta.type === "text_delta") ctrl.enqueue(enc.encode(ev.delta.text));
            } catch { /* ignore keep-alives */ }
          }
        }
      } finally { ctrl.close(); }
    },
  });
  return new Response(out, { headers: { ...CORS, "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-cache" } });
});
