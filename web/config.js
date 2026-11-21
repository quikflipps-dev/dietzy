// Dietzy settings for this website.
// Fill these two in from Supabase: Project Settings -> API.
// Both are safe to be public (they're meant to sit in the website).
// NEVER put the "service_role" key or any AI key here.
window.DIETZY_CONFIG = {
  supabaseUrl: "https://jiwqyslxgrsynfirbjkj.supabase.co",      // e.g. "https://abcd1234.supabase.co"
  supabaseAnonKey: "sb_publishable_Au-nXE1h4LBUFqjUH6qxQA_SvAseLhF",  // publishable (public) key - safe to be here
  googleSignIn: true,  // true shows "Continue with Google" (turn on Google in Supabase first)
  builtInAI: true,      // offer "Dietzy AI (built in)" (paid by you, with daily limits). New users start on their own AI either way.
  emailEnabled: false,  // false = never send emails (no "forgot password" / "email me a link") until an email service is connected
  supportEmail: "quikflipps@gmail.com",
  termsVersion: "2026-11-18" // bump when the Terms or Privacy Policy change, so people re-accept
};
