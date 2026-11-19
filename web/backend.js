// Dietzy backend: Supabase sign-in, per-user storage and the AI server function.
// Exposes window.DZ for the app. Storage mimics a tiny document store:
//   DZ.coll("main").doc("profile").set({...}) / .get() / .delete(),  DZ.coll("main").get() -> { docs: [{ id, data() }] }
(function () {
  const cfg = window.DIETZY_CONFIG || {};
  const ready = !!(cfg.supabaseUrl && cfg.supabaseAnonKey && window.supabase && window.supabase.createClient);
  const sb = ready
    ? window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
      })
    : null;
  let session = null;
  const listeners = [];

  function coll(name) {
    const uid = () => {
      if (!session) throw new Error("Not signed in.");
      return session.user.id;
    };
    return {
      async get() {
        const { data, error } = await sb.from("user_docs").select("id,data").eq("coll", name);
        if (error) throw error;
        return { docs: (data || []).map((r) => ({ id: r.id, data: () => r.data })) };
      },
      doc(id) {
        return {
          async set(obj) {
            const { error } = await sb
              .from("user_docs")
              .upsert({ user_id: uid(), coll: name, id, data: obj }, { onConflict: "user_id,coll,id" });
            if (error) throw error;
          },
          async get() {
            const { data, error } = await sb.from("user_docs").select("data").eq("coll", name).eq("id", id).maybeSingle();
            if (error) throw error;
            return { exists: !!data, data: () => (data ? data.data : undefined) };
          },
          async delete() {
            const { error } = await sb.from("user_docs").delete().eq("coll", name).eq("id", id);
            if (error) throw error;
          },
        };
      },
    };
  }

  async function accessToken() {
    const { data } = await sb.auth.getSession();
    return data && data.session ? data.session.access_token : null;
  }
  async function callFn(name, body) {
    const t = await accessToken();
    if (!t) throw new Error("Please sign in again.");
    let res;
    try {
      res = await fetch(cfg.supabaseUrl.replace(/\/+$/, "") + "/functions/v1/" + name, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + t, apikey: cfg.supabaseAnonKey },
        body: JSON.stringify(body),
      });
    } catch (e) {
      throw new Error("Couldn't reach Dietzy. Check your internet connection.");
    }
    if (!res.ok) {
      let msg = "Something went wrong. Try again.";
      try { const j = await res.json(); msg = j.error || msg; } catch (e) {}
      throw new Error(msg);
    }
    return res;
  }
  const friendly = (e) => {
    const m = (e && e.message) || String(e || "");
    if (/invalid login credentials/i.test(m)) return "That email and password don't match.";
    if (/email not confirmed/i.test(m)) return "Please confirm your email first — check your inbox for the link.";
    if (/already registered|already been registered/i.test(m)) return "There's already an account with that email. Try signing in.";
    if (/password should be at least/i.test(m)) return "Use a password with at least 8 characters.";
    if (/rate limit|too many/i.test(m)) return "Too many tries — wait a minute and try again.";
    return m || "Something went wrong.";
  };

  window.DZ = {
    ready,
    sb,
    get user() { return session ? session.user : null; },
    coll,
    onAuth(fn) { listeners.push(fn); },
    async init() {
      if (!sb) return null;
      const { data } = await sb.auth.getSession();
      session = data ? data.session : null;
      sb.auth.onAuthStateChange((event, s) => {
        session = s;
        listeners.forEach((fn) => { try { fn(event, s); } catch (e) {} });
      });
      return session;
    },
    async signIn(email, password) {
      const { data, error } = await sb.auth.signInWithPassword({ email, password });
      if (error) throw new Error(friendly(error));
      session = data.session;
      return data.session;
    },
    async signUp(email, password, consents) {
      const { data, error } = await sb.auth.signUp({
        email,
        password,
        options: { data: { consents }, emailRedirectTo: location.origin + location.pathname },
      });
      if (error) throw new Error(friendly(error));
      session = data.session; // null when email confirmation is required
      return data;
    },
    async google() {
      const { error } = await sb.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: location.origin + location.pathname },
      });
      if (error) throw new Error(friendly(error));
    },
    async magicLink(email) {
      const { error } = await sb.auth.signInWithOtp({
        email,
        options: { shouldCreateUser: false, emailRedirectTo: location.origin + location.pathname },
      });
      if (error) throw new Error(friendly(error));
    },
    async resetPassword(email) {
      const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
      if (error) throw new Error(friendly(error));
    },
    async updatePassword(password) {
      const { error } = await sb.auth.updateUser({ password });
      if (error) throw new Error(friendly(error));
    },
    async signOut() {
      try { await sb.auth.signOut(); } catch (e) {}
      session = null;
    },
    // Records the Terms / Privacy / health-data consents given at sign-up (once per account per version).
    async recordConsents() {
      if (!session) return;
      if (this._rc) return this._rc; // one at a time
      this._rc = this._recordConsents().finally(() => { this._rc = null; });
      return this._rc;
    },
    async _recordConsents() {
      const c = (session.user.user_metadata || {}).consents;
      if (!c || !c.version) return;
      const { data, error } = await sb.from("consents").select("kind").eq("version", c.version);
      if (error) return;
      const have = new Set((data || []).map((r) => r.kind));
      const rows = ["terms", "privacy", "health_data", "age_18"]
        .filter((k) => c[k] && !have.has(k))
        .map((k) => ({ user_id: session.user.id, kind: k, version: c.version, accepted_at: c.at || new Date().toISOString() }));
      if (rows.length) await sb.from("consents").insert(rows);
    },
    async acceptCurrentTerms(version) {
      if (!session) return;
      const at = new Date().toISOString();
      const { data: upd, error: ue } = await sb.auth.updateUser({ data: { consents: { version, at, terms: true, privacy: true, health_data: true, age_18: true } } });
      if (ue) throw new Error(friendly(ue));
      if (upd && upd.user) session.user = upd.user;
      await sb.from("consents").insert(["terms", "privacy", "health_data", "age_18"].map((k) => ({ user_id: session.user.id, kind: k, version, accepted_at: at })));
    },
    // AI through the server function.
    async ai(body) {
      const r = await callFn("ai", body);
      return (await r.json()).text || "";
    },
    async aiStream(body, onText) {
      const r = await callFn("ai", Object.assign({}, body, { stream: true }));
      if (!r.body || !r.body.getReader) { const t = await r.text(); onText && onText(t); return t; }
      const reader = r.body.getReader(), dec = new TextDecoder();
      let all = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        all += dec.decode(value, { stream: true });
        if (onText) onText(all);
      }
      return all;
    },
    async deleteAccount() {
      await callFn("delete-account", { confirm: "DELETE" });
      await this.signOut();
    },
  };
})();
