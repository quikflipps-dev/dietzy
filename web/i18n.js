/* Dietzy languages: English (built into the app), Spanish and Russian.
 * The app draws its screens in English; this swaps every piece of on-screen text for the chosen
 * language as it appears. Numbers are matched as {0}, {1}… so "1,732 cal left" and "900 cal left"
 * share one translation. In a translation, {0} puts the number back and {0:día|días} picks a word
 * form for that number (Russian takes three forms: {0:день|дня|дней}).
 * Text without a translation simply stays in English.
 * Dictionaries live in i18n-es.js and i18n-ru.js (loaded after this file).
 */
(function () {
  const LS = "dietzy-lang"; // device setting; not cleared on sign-out
  const LANGS = { en: "English", es: "Español", ru: "Русский" };
  const LOCALE = { en: "en-US", es: "es", ru: "ru" };
  const DICT = (window.DZ_DICT = window.DZ_DICT || {});
  let lang = "en";
  try { const v = localStorage.getItem(LS); if (v && LANGS[v]) lang = v; } catch {}
  if (lang === "en") {
    try { if (!localStorage.getItem(LS)) { const n = String(navigator.language || "en").slice(0, 2).toLowerCase(); if (LANGS[n]) lang = n; } } catch {}
  }
  document.documentElement.lang = lang;
  // Load only the dictionary for the chosen language (runs while the page is still loading, so it's ready before the app draws).
  if (lang !== "en") document.write('<script src="i18n-' + lang + '.js?v=4"><\/script>');

  const NUM = /\d[\d,]*(?:\.\d+)?/g;
  function form(n, forms) {
    const x = Math.abs(parseFloat(String(n).replace(/,/g, "")));
    if (lang === "ru") {
      if (!Number.isInteger(x)) return forms[1] || forms[0];
      const a = x % 10, b = x % 100;
      return (a === 1 && b !== 11 ? forms[0] : a >= 2 && a <= 4 && (b < 12 || b > 14) ? forms[1] : forms[2]) || forms[forms.length - 1];
    }
    return x === 1 ? forms[0] : forms[1] || forms[0];
  }
  function fill(t, nums) {
    return t.replace(/\{(\d+)(?::([^}]*))?\}/g, (all, i, f) => {
      const v = nums[+i]; if (v == null) return all;
      return f ? form(v, f.split("|")) : v;
    });
  }
  // Translate one string; returns it unchanged if there's no translation.
  function tr(s) {
    if (lang === "en" || !s) return s;
    const D = DICT[lang]; if (!D) return s;
    const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(s);
    const core = m[2].replace(/\s+/g, " ");
    if (!/[A-Za-z]/.test(core)) return s;
    const nums = [];
    const key = core.replace(NUM, x => "{" + (nums.push(x) - 1) + "}");
    let t = D[key];
    if (t == null && core.includes(" · ")) {
      // "Sam · Female, 32 · 5′10″" — translate each piece on its own
      const parts = core.split(" · "), out = parts.map(tr);
      if (out.some((x, i) => x !== parts[i])) return m[1] + out.join(" · ") + m[3];
    }
    if (t == null) {
      // "🥩 Protein" → try "Protein" and keep the emoji
      const em = /^([^A-Za-z{]+)([\s\S]+)$/.exec(key);
      if (em && D[em[2]] != null) t = em[1] + D[em[2]];
      else return s;
    }
    return m[1] + fill(t, nums) + m[3];
  }
  const ATTRS = ["placeholder", "aria-label", "title", "data-sum"];
  const skip = el => !el || el.closest("script,style,textarea,[data-notr],[contenteditable]") || el.classList.contains("msg");
  function doNode(n) {
    if (n.nodeType === 3) {
      if (skip(n.parentElement)) return;
      const v = n.nodeValue, t = tr(v); if (t !== v) n.nodeValue = t;
    } else if (n.nodeType === 1) {
      if (n.closest("[data-notr]")) return;
      for (const a of ATTRS) if (n.hasAttribute(a)) { const v = n.getAttribute(a), t = tr(v); if (t !== v) n.setAttribute(a, t); }
      if (n.matches("script,style,textarea")) return;
      const w = document.createTreeWalker(n, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
      let c; while ((c = w.nextNode())) {
        if (c.nodeType === 1) { for (const a of ATTRS) if (c.hasAttribute(a)) { const v = c.getAttribute(a), t = tr(v); if (t !== v) c.setAttribute(a, t); } }
        else if (!skip(c.parentElement)) { const v = c.nodeValue, t = tr(v); if (t !== v) c.nodeValue = t; }
      }
    }
  }
  function start() {
    if (lang === "en") return;
    doNode(document.body);
    new MutationObserver(recs => {
      for (const r of recs) {
        if (r.type === "childList") r.addedNodes.forEach(doNode);
        else if (r.type === "characterData") doNode(r.target);
        else if (r.type === "attributes") doNode(r.target);
      }
    }).observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  }
  if (document.body) start(); else document.addEventListener("DOMContentLoaded", start);

  window.dzLang = () => lang;
  window.dzLangs = LANGS;
  window.dzLocale = () => LOCALE[lang];
  window.T = tr; // for text drawn outside the page (charts, pop-ups)
  window.dzSetLang = l => { if (!LANGS[l] || l === lang) return; try { localStorage.setItem(LS, l); } catch {} location.reload(); };
  // Told to the AI so its replies, food names and notes come back in the person's language.
  window.dzAiLangNote = () => lang === "en" ? "" : `\n\nLANGUAGE: Write every word the person will read (replies, food names, servings, notes, tips) in ${lang === "es" ? "Spanish" : "Russian"}. Keep JSON keys, tags, codes and fixed values exactly as specified above in English (for example meal names Breakfast, Lunch, Dinner, Snack inside tags). The catchphrase "Let's make it EZ" becomes ${lang === "es" ? "\"¡Hagámoslo EZ!\"" : "\"Сделаем это EZ!\""}.`;
})();
