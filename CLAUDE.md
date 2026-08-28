# Working in this repo

## Do not run the app

Never run `npm run dev` / `next dev`, `npm run build` / `next build`, or start any
long-running server unless I explicitly ask.

I manage running the app myself. Background dev servers hold ports and interfere
with my session.

Verify work with static checks instead:

```bash
npx tsc --noEmit
```

If confirming behaviour genuinely needs a running server, ask me to start it
rather than starting it yourself. If I do ask you to start one, kill it when
you're done.
