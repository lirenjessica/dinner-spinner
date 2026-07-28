/* Saved recipes.
 *
 * Same storage strategy as the pantry: Supabase when configured, otherwise this
 * browser's localStorage. The whole recipe object is stored as JSON so a saved
 * favourite stays readable even if the prompt or model changes later.
 *
 * Needs the favorite_recipes table — SQL is in SETUP.md. If the table is missing
 * we quietly fall back to local storage rather than breaking the save button.
 */

const URL_BASE = (import.meta.env.VITE_SUPABASE_URL || "").replace(/\/$/, "");
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || "";

export const syncEnabled = Boolean(URL_BASE && ANON_KEY);

const LOCAL_KEY = "dinner-spinner-favorites";

function headers() {
  return { apikey: ANON_KEY, Authorization: "Bearer " + ANON_KEY, "Content-Type": "application/json" };
}

async function sbRequest(path, options) {
  const res = await fetch(URL_BASE + "/rest/v1/" + path, { ...options, headers: headers() });
  if (!res.ok) throw new Error("Supabase " + res.status + ": " + (await res.text()).slice(0, 120));
  return res.status === 204 ? null : res.json();
}

function readLocal() {
  try {
    const parsed = JSON.parse(localStorage.getItem(LOCAL_KEY) || "[]");
    return Array.isArray(parsed) ? parsed.filter(f => f && f.recipe?.name) : [];
  } catch {
    return [];
  }
}

function writeLocal(list) {
  try { localStorage.setItem(LOCAL_KEY, JSON.stringify(list)); } catch { /* quota */ }
}

// Recipe names are the identity here — there are no ids on generated recipes.
export function isFavorite(list, recipe) {
  const n = (recipe?.name || "").trim().toLowerCase();
  return list.some(f => (f.recipe?.name || "").trim().toLowerCase() === n);
}

export async function loadFavorites() {
  if (!syncEnabled) return readLocal();
  try {
    const rows = await sbRequest("favorite_recipes?select=recipe,servings,created_at&order=created_at.desc", { method: "GET" });
    const list = (rows || []).map(r => ({ recipe: r.recipe, servings: r.servings, savedAt: r.created_at }));
    writeLocal(list);
    return list;
  } catch (e) {
    console.warn("Favourites sync unavailable, using local copy:", e.message);
    return readLocal();
  }
}

export async function saveFavorite(recipe, servings) {
  const list = readLocal();
  if (isFavorite(list, recipe)) return list;

  const entry = { recipe, servings, savedAt: new Date().toISOString() };
  const next = [entry, ...list];
  writeLocal(next);

  if (syncEnabled) {
    try { await sbRequest("favorite_recipes", { method: "POST", body: JSON.stringify({ recipe, servings }) }); }
    catch (e) { console.warn("Favourites sync (save) failed, saved locally:", e.message); }
  }
  return next;
}

export async function removeFavorite(recipe) {
  const name = (recipe?.name || "").trim();
  const next = readLocal().filter(f => (f.recipe?.name || "").trim() !== name);
  writeLocal(next);

  if (syncEnabled) {
    try { await sbRequest("favorite_recipes?recipe->>name=eq." + encodeURIComponent(name), { method: "DELETE" }); }
    catch (e) { console.warn("Favourites sync (remove) failed, removed locally:", e.message); }
  }
  return next;
}
