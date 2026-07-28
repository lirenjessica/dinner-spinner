import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { generateRecipes, normalizeInput } from './api/_core.js'

/* Vite's dev server doesn't know about Vercel's /api folder, so this plugin
   serves the same endpoint locally. Without it `npm run dev` would 404 on
   /api/recipes and you'd have to run `vercel dev` just to test recipes. */
function recipesApiDevServer(apiKey) {
  return {
    name: 'recipes-api-dev',
    configureServer(server) {
      server.middlewares.use('/api/recipes', async (req, res) => {
        const send = (code, payload) => {
          res.statusCode = code
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify(payload))
        }

        if (req.method !== 'POST') return send(405, { error: 'Method not allowed' })

        try {
          const chunks = []
          for await (const chunk of req) chunks.push(chunk)
          const body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')

          let input
          try {
            input = normalizeInput(body)
          } catch (e) {
            return send(400, { error: e.message })
          }

          // Dev only: print the exact prompt so its wording can be reviewed.
          const recipes = await generateRecipes(apiKey, input, {
            onPrompt: p => console.log('\n───────── PROMPT SENT TO GEMINI ─────────\n' + p + '\n─────────────────────────────────────────\n'),
          })
          send(200, { recipes })
        } catch (e) {
          console.error('[dev] Recipe generation failed:', e.message)
          send(502, { error: 'Could not generate recipes right now. Please try again.' })
        }
      })
    },
  }
}

export default defineConfig(({ mode }) => {
  // '' loads every var, not just VITE_-prefixed ones, so the dev server can read
  // the server-only GEMINI_KEY the same way Vercel does in production.
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [react(), recipesApiDevServer(env.GEMINI_KEY)],
  }
})
