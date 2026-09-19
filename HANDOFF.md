# Dinner Spinner — handoff notes

Context for picking this project up in a fresh session.
Last substantive work: late July 2026.

## What it is

React + Vite app. Spin four wheels (protein / veggie / carb / cuisine) → Gemini
generates 2 dinner recipes → shopping list → cooking steps → rate it at the end.

- **Live:** https://gurtdinner.vercel.app
- **Local folder:** `C:\Users\LirenTruong\dinner-spinner`
- **GitHub:** https://github.com/lirenjessica/dinner-spinner (public)
- **Vercel project:** `dinner-spinner-olfx` (owner `lirenjessica`, team `dinner-s-projects`)
- **Supabase project ref:** `kjiapkmuwfnnooayvbwd`

## Architecture — read this before changing the AI call

The Gemini API key is **server-side only**. The browser never sees it.

```
Browser (public)                     Server (secret)
src/App.jsx  ──POST /api/recipes──▶  api/recipes.js
  sends ingredient names only          └─ api/_core.js
                                          builds the prompt
             ◀──── recipes ─────         calls Gemini with GEMINI_KEY
src/pantry.js ─────────────────────▶  Supabase (pantry + shopping list)
src/favorites.js ──────────────────▶  Supabase (saved recipes)
```

Two rules that matter:

1. **`GEMINI_KEY` has no `VITE_` prefix — do not add one.** That prefix is what
   tells Vite to bundle a value into browser code. Adding it would leak the key.
   The Supabase vars *do* have the prefix because the browser needs them and the
   anon key is designed to be public.
2. **The client cannot send a raw prompt.** It sends ingredient names, which the
   server validates and length-caps (`normalizeInput`). This stops the endpoint
   being used as a free general-purpose AI proxy. Keep that property.

`vite.config.js` contains a small dev-server plugin that serves `/api/recipes`
locally using the same `api/_core.js`, so plain `npm run dev` works — you do
**not** need `vercel dev`.

## Files

| File | What it does |
|---|---|
| `api/_core.js` | **The prompt lives here** (`buildPrompt`), plus ingredient definitions, the Gemini call, and input validation |
| `api/recipes.js` | Thin Vercel endpoint wrapper |
| `src/App.jsx` | Entire UI — all screens, inline-styled with the `ZEN` palette |
| `src/pantry.js` | Staples / use-soon / shopping list; Supabase REST with localStorage fallback |
| `src/favorites.js` | Saved recipes, same storage pattern |
| `src/feedback.js` | Cook ratings; `feedbackHints()` feeds taste into prompts. **localStorage only** — the browser sends it with each request, so sync isn't needed for it to work |
| `src/index.css` | Deliberately minimal (~26 lines). Don't reintroduce starter CSS here |
| `SETUP.md` | Running, deploying, Supabase SQL |

## Commands

```bash
npm run dev        # app + /api/recipes on http://localhost:5173
npm run build      # production build (run before deploying to catch errors)
vercel             # preview deploy (protected — only openable while logged into Vercel)
vercel --prod      # deploy to gurtdinner.vercel.app
vercel env ls      # check env vars
```

Prompts print to the dev-server terminal on every generation (dev only), which is
the fastest way to tune wording.

## Gotchas that cost real time

- **UTF-8 BOM in `.env`.** Windows editors (Notepad, PowerShell `Set-Content`)
  add three invisible bytes, so Vite parses the variable as `\uFEFFGEMINI_KEY`
  and the value reads as `undefined` — while the file looks perfect. Symptom was
  Gemini returning "API key not valid" with a key that worked fine via curl.
  Check with `file .env` — it should say ASCII, not "with BOM".
- **Gemini free tier: 20 requests/minute** on `gemini-2.5-flash-lite`. Rapid
  testing exhausts it and the app shows a generic error. Space out test calls.
- **`master` and `newbranch` have unrelated histories** and cannot be merged.
  Current work is on `newbranch`, which is now GitHub's default branch. `master`
  holds unrelated older commits. Don't try to merge them.
- **Vercel deploys from the local folder, not GitHub.** There's no git
  integration on the project — pushing to GitHub deploys nothing.

## Prompt design (all in `api/_core.js`)

Decisions made deliberately — check before reverting:

- **Only the 4 selected ingredient definitions are sent**, not all 27. Sending
  every category bloated the prompt and caused the model to drift to the wrong
  protein.
- **Cuisine is a hard constraint** and the definitions say "cooking" not
  "flavors" — "South Asian flavors" was read as licence to return a shepherd's
  pie with curry powder.
- **`responseSchema`** forces all five recipe fields, so half-built recipes
  can't reach the UI.
- **Variety nudges were removed at the user's request.** Temperature 1.1 is the
  only thing spreading results now. If repeat spins feel samey, that's why.
- **Difficulty is sent with its meaning** — `Easy (~20 min, one pan)`. Note
  `DIFF_DETAIL` in `api/_core.js` duplicates `DIFF` in `src/App.jsx`; keep both
  in step.

## Outstanding / optional

- Rotate the Gemini key — it appeared in an old chat transcript. It's
  server-side so the public can't see it, but regenerate at aistudio.google.com
  and update with `vercel env rm GEMINI_KEY production` then `vercel env add`.
- Supabase RLS allows anyone with the URL + anon key to read/write the pantry.
  Both are visible in the browser bundle by design. Fine for a personal list;
  would need Supabase Auth to lock down.
- No allergy / dietary restriction handling anywhere (user declined it).
- Rename `newbranch` to something meaningful.

## Communication preference

Liren is a beginner coder. Explain in plain language, define jargon, teach the
"why" — but keep it concise. End substantive replies with a short summary:
Key takeaway / Decisions needed / Next steps / What changed.
