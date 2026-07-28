/* POST /api/recipes
 *
 * Runs on Vercel's servers, so GEMINI_KEY never reaches the browser.
 * Note the env var has NO "VITE_" prefix — that prefix is what tells Vite to
 * bundle a value into client code, which is exactly what we're avoiding.
 */
import { generateRecipes, normalizeInput } from "./_core.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  let input;
  try {
    input = normalizeInput(req.body);
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }

  try {
    const recipes = await generateRecipes(process.env.GEMINI_KEY, input);
    return res.status(200).json({ recipes });
  } catch (e) {
    // Log the real reason server-side; send the client something safe and useful.
    console.error("Recipe generation failed:", e);
    const message = /timed out/i.test(e.message)
      ? "That took too long — please try again."
      : "Could not generate recipes right now. Please try again.";
    return res.status(502).json({ error: message });
  }
}
