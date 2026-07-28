/* Pantry storage.
 *
 * Two lists:
 *   staples  — things you always have (salt, olive oil, soy sauce). Recipes may
 *              use them freely and they are LEFT OFF the shopping list.
 *   useSoon  — things to use up (half tin of coconut milk, wilting cilantro).
 *              Recipes actively try to work these in.
 *
 * Items are stored as { name, addedAt } so "use up soon" can show how long
 * something has been sitting there and nudge you to clear stale entries.
 *
 * Syncs to Supabase when VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY are set,
 * otherwise falls back to this browser's localStorage.
 *
 * Talks to Supabase's REST API directly — no extra npm package needed.
 */

const URL_BASE = (import.meta.env.VITE_SUPABASE_URL || "").replace(/\/$/, "");
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || "";

export const syncEnabled = Boolean(URL_BASE && ANON_KEY);

const LOCAL_KEY = "dinner-spinner-pantry";
/* SHOPPING is your own running errands list — things you need that no recipe
   asked for. Stored in the same table with a different kind so it syncs too. */
export const KINDS = { STAPLE: "staple", USE_SOON: "use_soon", SHOPPING: "shopping" };
export const STALE_DAYS = 14;

const LIST_KEYS = { [KINDS.STAPLE]: "staples", [KINDS.USE_SOON]: "useSoon", [KINDS.SHOPPING]: "shopping" };
const listKeyFor = kind => LIST_KEYS[kind] || "staples";

/* ── Name matching ──────────────────────────────────────── */

// "Soy  Sauce!" -> "soy sauce"
function normalize(s) {
  return String(s || "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

// Crude singular form so "carrots" matches "carrot".
function singular(s) {
  return s.replace(/ies$/, "y").replace(/(?:ses|xes|zes|ches|shes)$/, m => m.slice(0, -2)).replace(/s$/, "");
}

// Levenshtein distance — how many single-character edits separate two strings.
function editDistance(a, b) {
  if (a === b) return 0;
  if (!a.length || !b.length) return Math.max(a.length, b.length);
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const curr = [i];
    for (let j = 1; j <= b.length; j++) {
      curr[j] = Math.min(
        prev[j] + 1,
        curr[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
    prev = curr;
  }
  return prev[b.length];
}

/* Finds an existing entry that probably means the same thing.
 * Returns { name, exact } or null.
 *   exact  — same item, just typed differently ("Soy Sauce" / "carrots")
 *   !exact — likely a typo ("soys sauce"), so we ask before adding.
 * Tolerance scales with length: short words differ meaningfully by one letter
 * ("rice"/"ice"), long ones usually don't ("corriander"/"coriander"). */
export function findSimilar(names, candidate) {
  const n = normalize(candidate);
  if (!n) return null;
  const sn = singular(n);
  for (const existing of names) {
    const e = normalize(existing);
    if (e === n || singular(e) === sn) return { name: existing, exact: true };
    const tolerance = Math.min(n.length, e.length) <= 5 ? 1 : 2;
    if (editDistance(n, e) <= tolerance) return { name: existing, exact: false };
  }
  return null;
}

/* "2 tbsp soy sauce, divided" -> "soy sauce"
   "1 (14 oz) can coconut milk" -> "coconut milk"
   Strips amounts, units and prep words so shopping-list rows can become pantry
   entries. Deliberately conservative: if it can't find a name it returns "" and
   the caller skips that row rather than storing junk. */
const UNITS = "tbsp|tablespoons?|tsp|teaspoons?|cups?|ounces?|oz|pounds?|lbs?|lb|g|grams?|kg|ml|l|liters?|litres?|cloves?|cans?|tins?|jars?|packets?|packages?|pkg|blocks?|bunch(?:es)?|sprigs?|slices?|pieces?|heads?|stalks?|pinch(?:es)?|dash(?:es)?|handfuls?";
const MODIFIERS = "of|fresh|freshly|dried|ground|chopped|minced|sliced|diced|grated|shredded|crushed|large|small|medium|ripe|whole|boneless|skinless|extra[-\\s]?firm|firm|low[-\\s]?sodium|unsalted";
const AMOUNT = "[\\d\\s./¼½¾⅓⅔⅜⅝⅞⅛-]";

export function ingredientName(raw) {
  let s = String(raw || "").trim();
  s = s.replace(/\([^)]*\)/g, " ");                      // "(14 oz)" is a note, not the name
  s = s.split(/,| - | — | – /)[0];                       // ", divided"
  s = s.replace(/\bto taste\b/gi, "");
  s = s.replace(/\s+/g, " ").trim();

  // Amounts and units can repeat ("1 (14 oz) can" leaves "1 can"), and prep
  // words stack ("freshly chopped"), so peel them off until nothing changes.
  const peel = new RegExp("^(?:" + AMOUNT + "+|(?:" + UNITS + ")\\b\\.?|(?:" + MODIFIERS + ")\\b)\\s*", "i");
  let prev;
  do { prev = s; s = s.replace(peel, "").trim(); } while (s !== prev && s);

  return s.replace(/\s+/g, " ").trim().slice(0, 80);
}

export function daysSince(iso) {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return null;
  return Math.max(0, Math.floor((Date.now() - then) / 86400000));
}

/* ── localStorage ───────────────────────────────────────── */

// Older versions stored plain strings; upgrade them rather than losing the list.
function toItems(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map(v => (typeof v === "string" ? { name: v, addedAt: null } : v))
    .filter(v => v && typeof v.name === "string" && v.name.trim())
    .map(v => ({ name: v.name, addedAt: v.addedAt || null }));
}

export const EMPTY_PANTRY = { staples: [], useSoon: [], shopping: [] };

function readLocal() {
  try {
    const parsed = JSON.parse(localStorage.getItem(LOCAL_KEY) || "{}");
    return { staples: toItems(parsed.staples), useSoon: toItems(parsed.useSoon), shopping: toItems(parsed.shopping) };
  } catch {
    return { ...EMPTY_PANTRY };
  }
}

function writeLocal(pantry) {
  try { localStorage.setItem(LOCAL_KEY, JSON.stringify(pantry)); } catch { /* quota or private mode */ }
}

/* ── Supabase REST ──────────────────────────────────────── */
function headers(extra) {
  return { apikey: ANON_KEY, Authorization: "Bearer " + ANON_KEY, "Content-Type": "application/json", ...extra };
}

async function sbRequest(path, options) {
  const res = await fetch(URL_BASE + "/rest/v1/" + path, { ...options, headers: headers(options?.headers) });
  if (!res.ok) throw new Error("Supabase " + res.status + ": " + (await res.text()).slice(0, 120));
  return res.status === 204 ? null : res.json();
}

/* ── Public API ─────────────────────────────────────────── */

// Always resolves. If Supabase is unreachable we fall back to the local copy
// rather than leaving the user staring at an empty pantry.
export async function loadPantry() {
  if (!syncEnabled) return readLocal();
  try {
    const rows = await sbRequest("pantry_items?select=kind,name,created_at&order=created_at.asc", { method: "GET" });
    const map = kind => (rows || []).filter(r => r.kind === kind).map(r => ({ name: r.name, addedAt: r.created_at }));
    const pantry = { staples: map(KINDS.STAPLE), useSoon: map(KINDS.USE_SOON), shopping: map(KINDS.SHOPPING) };
    writeLocal(pantry); // local mirror for offline / failed loads
    return pantry;
  } catch (e) {
    console.warn("Pantry sync unavailable, using local copy:", e.message);
    return readLocal();
  }
}

/* Adds one or more names. Accepts "salt, pepper, cumin" or an array.
 * Returns { pantry, added: [], duplicates: [], similar: [{name, to}] }
 * Near-matches are NOT added — the caller decides whether to force them. */
export async function addItems(kind, input, { force = false } = {}) {
  const key = listKeyFor(kind);
  const raw = Array.isArray(input) ? input : String(input || "").split(",");
  const pantry = readLocal();
  const existing = pantry[key].map(i => i.name);

  const added = [], duplicates = [], similar = [];

  for (const piece of raw) {
    const name = String(piece).trim().replace(/\s+/g, " ").slice(0, 80);
    if (!name) continue;

    // Check against what's already there plus what we've accepted this round,
    // so "salt, salt" in one paste doesn't create two chips.
    const hit = findSimilar([...existing, ...added], name);
    if (hit?.exact) { duplicates.push(name); continue; }
    if (hit && !force) { similar.push({ name, to: hit.name }); continue; }
    added.push(name);
  }

  if (!added.length) return { pantry, added, duplicates, similar };

  const stamped = added.map(name => ({ name, addedAt: new Date().toISOString() }));
  const next = { ...pantry, [key]: [...pantry[key], ...stamped] };
  writeLocal(next);

  if (syncEnabled) {
    try {
      await sbRequest("pantry_items", { method: "POST", body: JSON.stringify(added.map(name => ({ kind, name }))) });
    } catch (e) { console.warn("Pantry sync (add) failed, saved locally:", e.message); }
  }
  return { pantry: next, added, duplicates, similar };
}

export async function removeItems(kind, names) {
  const key = listKeyFor(kind);
  const doomed = new Set(Array.isArray(names) ? names : [names]);
  const pantry = readLocal();
  const next = { ...pantry, [key]: pantry[key].filter(i => !doomed.has(i.name)) };
  writeLocal(next);

  if (syncEnabled) {
    try {
      const list = [...doomed].map(n => '"' + n.replace(/"/g, '\\"') + '"').join(",");
      await sbRequest("pantry_items?kind=eq." + encodeURIComponent(kind) + "&name=in.(" + encodeURIComponent(list) + ")", { method: "DELETE" });
    } catch (e) { console.warn("Pantry sync (remove) failed, removed locally:", e.message); }
  }
  return next;
}

// Names only — that's all the recipe prompt needs.
export function pantryNames(pantry) {
  return {
    staples: (pantry?.staples || []).map(i => i.name),
    useSoon: (pantry?.useSoon || []).map(i => i.name),
  };
}

export function staleItems(pantry) {
  return (pantry?.useSoon || []).filter(i => {
    const d = daysSince(i.addedAt);
    return d !== null && d >= STALE_DAYS;
  });
}
