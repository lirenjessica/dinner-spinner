# Dinner Spinner

## How to explain things to Liren

Liren is a beginner coder. Write like you are talking to someone who took one
intro programming class and found it hard. This applies to every reply, not
just the long ones.

- Use plain words. If a technical term cannot be avoided, define it in the same
  sentence the first time it appears.
- Short sentences, one idea each.
- Give the exact commands to type, one step at a time, in order.
- After each step, say what should appear on screen. That way it is obvious
  when something has gone wrong, instead of silently continuing.
- Say why, briefly, not only what.
- Avoid unexplained jargon. Not "fast-forward merge", "the diff", "idempotent".
  Say what actually happens, or name the actual file.
- If an answer needs more than a few paragraphs, turn it into numbered steps.
- Flag anything that could lose work or break the live site before the step
  that does it, not after.
- End substantive replies with a short summary: Key takeaway / Decisions needed
  / Next steps / What changed.
- No em dashes or double dashes. Hyphens inside words like "server-side" are
  fine.
- Capitalize only the first word of a heading, unless it is a name.

## Before changing this project

Read HANDOFF.md first. It explains how the app is put together, where the AI
prompt lives, and the mistakes that have already cost time here.

The most important rule: GEMINI_KEY is server-side only. Never move the Gemini
call into the browser, and never put a VITE_ prefix on that variable. VITE_ is
what copies a value into the code that gets sent to every visitor, so adding it
would publish the key.
