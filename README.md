# scrub

Scan prose for AI writing tells: dashes, stock phrases, pre-negation, flat rhythm. A gate for anything published under your name.

```bash
bun install
bun run src/index.ts --help
bun run src/index.ts describe        # every command and flag, as JSON
bun run src/index.ts hello --name Ada --json
bun test
```

Scaffolded with mkcmd-agent. See AGENTS.md for the output contract and how to add commands.
