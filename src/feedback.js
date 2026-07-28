/* Cook history.
 *
 * After you finish a recipe you can say how it went. Those verdicts get fed
 * back into future prompts so the app learns what you actually like.
 *
 * Local-only on purpose: the browser already sends this to the server with each
 * request (the same way it sends your pantry), so syncing isn't needed for the
 * feature to work — it would only matter for sharing history between devices.
 */

const LOCAL_KEY = "dinner-spinner-history";
const MAX_ENTRIES = 40;   // plenty of signal, keeps storage small
const HINT_COUNT = 8;     // how many recent verdicts to send to the model

export const RATINGS = {
  LOVED: "loved",
  FINE: "fine",
  NEVER: "never",
};

export const RATING_OPTIONS = [
  { key: RATINGS.LOVED, icon: "😍", label: "Loved it",   hint: "more like this",     color: "#3D6E52" },
  { key: RATINGS.FINE,  icon: "🙂", label: "It was fine", hint: "no strong feelings", color: "#7A5C2E" },
  { key: RATINGS.NEVER, icon: "😕", label: "Not again",   hint: "avoid this style",   color: "#8B4A3A" },
];

export function loadHistory() {
  try {
    const parsed = JSON.parse(localStorage.getItem(LOCAL_KEY) || "[]");
    return Array.isArray(parsed) ? parsed.filter(e => e && e.name) : [];
  } catch {
    return [];
  }
}

export function recordCook({ recipe, rating, note, results }) {
  const entry = {
    name: String(recipe?.name || "").slice(0, 120),
    rating,
    note: String(note || "").trim().slice(0, 200),
    // Keep the wheel picks so hints can mention the combination, not just the dish.
    combo: results ? [results.protein, results.veggie, results.carb, results.style].filter(Boolean).join(" / ") : "",
    at: new Date().toISOString(),
  };
  if (!entry.name) return loadHistory();

  // Re-cooking something replaces the old verdict rather than double-counting it.
  const next = [entry, ...loadHistory().filter(e => e.name !== entry.name)].slice(0, MAX_ENTRIES);
  try { localStorage.setItem(LOCAL_KEY, JSON.stringify(next)); } catch { /* quota */ }
  return next;
}

export function clearHistory() {
  try { localStorage.removeItem(LOCAL_KEY); } catch { /* ignore */ }
  return [];
}

/* Recent likes and dislikes for the prompt. Only names and notes — the model
   doesn't need timestamps, and shorter prompts stay cheaper and sharper. */
export function feedbackHints(history) {
  const recent = (history || []).slice(0, HINT_COUNT);
  const pack = rating => recent
    .filter(e => e.rating === rating)
    .map(e => e.note ? e.name + " (" + e.note + ")" : e.name);
  return { loved: pack(RATINGS.LOVED), disliked: pack(RATINGS.NEVER) };
}
