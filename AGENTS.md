# Working in this repository

## Development server

Never run `npm run dev`, `next dev`, `npm run build`, `next build`, or start any
long-running server unless the user explicitly asks.

The user manages the running app. Background servers can hold ports and
interfere with their session. Verify changes with static checks such as:

```bash
npm run typecheck
```

If browser verification requires a running app, ask the user to start it. If
the user explicitly asks you to start one, stop it when verification is done.
