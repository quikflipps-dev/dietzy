# Dietzy — Dieting made easy

Dietzy is a diet, nutrition and weight-tracking web app with an AI coach. It works on any phone or computer and can be installed to a phone's home screen like an app.

Owned by JAj Group Inc., Brooklyn, NY.

---

## What's in this repository

| Folder / file | What it is |
|---|---|
| `web/` | The website people use. No build step — it's plain files. |
| `web/index.html` | The whole Dietzy app. |
| `web/config.js` | The two Supabase settings the site needs (safe to be public). |
| `web/backend.js` | Sign-in, saving data to Supabase, and talking to the AI server function. |
| `web/privacy.html`, `web/terms.html` | Privacy Policy and Terms of Use (drafts — have a lawyer review). |
| `web/manifest.webmanifest`, `web/sw.js`, `web/icons/` | What makes it installable on a phone. |
| `web/_headers` | Security settings for Cloudflare Pages. |
| `supabase/migrations/001_init.sql` | Database setup: tables + rules so each person only sees their own data. |
| `supabase/functions/ai/index.ts` | Server function that holds the AI key and calls Claude. |
| `supabase/functions/delete-account/index.ts` | Server function that permanently deletes a user's account. |

**Never put secret keys in this repository** (the AI key, the Supabase `service_role` key, database passwords). They go in the Supabase and Cloudflare dashboards only.

---

## One-time setup (about 30–45 minutes)

### 1. Supabase — database and sign-in
1. Create a project at [supabase.com](https://supabase.com/dashboard) (name: `dietzy`, region: US East). Save the database password somewhere safe.
2. **Database:** open **SQL Editor → New query**, paste everything in `supabase/migrations/001_init.sql`, and click **Run**. You should see "Success".
3. **Sign-in settings:** open **Authentication**:
   - **URL Configuration** → set **Site URL** to your website (for example `https://dietzy.app`). Under **Redirect URLs** add the same address, plus your Cloudflare test address (for example `https://dietzy.pages.dev`).
   - **Emails (important for testers):** Supabase's built-in email only sends to members of your Supabase team, and only 2 emails per hour. Until custom email is set up (step 6), either:
     - turn **off** "Confirm email" (Authentication → Sign In / Providers → Email) so testers can sign up and start right away, **or**
     - add each tester to your Supabase organization's team.
     "Forgot password" and "email me a sign-in link" also need custom email to reach testers.
4. **Server functions:** open **Edge Functions → Deploy a new function → Via Editor**:
   - Name it `ai`, replace the sample code with everything in `supabase/functions/ai/index.ts`, click **Deploy**.
   - Do the same for `delete-account` with `supabase/functions/delete-account/index.ts`.
5. **AI key:** in the [Claude Console](https://platform.claude.com) create an API key and add a few dollars of credit. Then in Supabase open **Edge Functions → Secrets** and add `ANTHROPIC_API_KEY` = your key. Optional secrets: `AI_MODEL` (default `claude-haiku-5-5`), `DAILY_AI_CALLS` (default 150), `DAILY_PHOTOS` (default 20).
6. **Custom email (before inviting lots of people):** sign up at [resend.com](https://resend.com) (free tier), verify your domain, then in Supabase **Authentication → SMTP Settings** enter Resend's SMTP details. Then turn "Confirm email" back on.

### 2. Connect the website to Supabase
In Supabase open **Project Settings → API** and copy the **Project URL** and the **anon / public** key into `web/config.js`. (These two are meant to be public. Never use the `service_role` key here.)

### 3. Cloudflare Pages — publish the website
1. In [Cloudflare](https://dash.cloudflare.com) open **Workers & Pages → Create → Pages → Connect to Git**, and pick this repository.
2. Build settings: **Framework preset: None**, **Build command: (leave empty)**, **Build output directory: `web`**.
3. Deploy. You'll get a test address like `https://dietzy.pages.dev`.
4. **Custom domain:** in the Pages project open **Custom domains** and add `dietzy.app` (or your domain). Then update the Site URL in Supabase (step 1.3).

Every time a change is pushed to this repository, Cloudflare updates the website automatically.

---

## Testing checklist
- [ ] Create an account (all three boxes must be ticked) and complete setup.
- [ ] Log a food, weigh in, refresh the page — everything is still there.
- [ ] Sign in on a second device — same data appears.
- [ ] Snap a meal photo and ask the AI coach a question.
- [ ] Settings → Your account: sign out, sign back in.
- [ ] Install to your phone: Chrome menu → **Add to Home screen** / **Install app**.
- [ ] Have a tester create their own account and confirm they can't see your data.

## Moving data from the old (in-Claude) version
On the old version: **Settings → Your data → Backup** and copy it. On the new site, sign in, then **Settings → Your data → Restore** and paste.

## Plans and limits (for later)
The AI server function already enforces daily limits per user (`DAILY_AI_CALLS`, `DAILY_PHOTOS`). Free/Plus/Pro plans and payments will build on this.

## Legal
The Privacy Policy and Terms are drafts and have not been reviewed by a lawyer. Dietzy is for education only and is not medical advice. Dietzy does not sell personal or health data.
