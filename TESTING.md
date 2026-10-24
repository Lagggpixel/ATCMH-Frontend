# Testing

Use Node.js 24 and install the locked dependencies with `npm ci` when needed.

`npm test` runs every source test file through Node's test runner and the tsx loader. The runner limits file concurrency to four and supplies an absolute `tsconfig.test.json`, including in subprocesses that change directory. This keeps JSX rendering tests on the automatic React runtime.

Discovery includes `.test` and `.spec` files with JavaScript or TypeScript extensions. It excludes dependency folders, Git metadata, Next.js output, `build`, `dist`, `out`, and `coverage`. Release snapshots under `build` remain recoverable archives; their old test copies are not part of the active suite. Do not remove active tests to conceal failures.

- Full suite: `npm test`
- Inventory only: `npm test -- --list`
- Full discovery with a name filter (focused validation): `npm test -- --test-name-pattern="description"`
- Explicit file (focused validation, PowerShell):

```powershell
$env:TSX_TSCONFIG_PATH = (Resolve-Path .\tsconfig.test.json).Path
node --import tsx --test .\src\simulator\engine.test.ts
```

Report focused results separately from a full run. Existing subprocess test entry points may be skipped when directly discovered while their parent tests execute them with the required environment and module-mocking flags.

Relevant additional checks are `npm run lint`, `node node_modules/typescript/bin/tsc --noEmit --incremental false`, and `npm run build`. Image publication commands are not validation steps.
