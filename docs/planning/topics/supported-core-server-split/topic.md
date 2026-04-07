# supported-core-server-split — Split server route/bootstrap modules

## Kanban Status
- **Column:** Done
- **Owner:** Team
- **Last updated:** 2026-04-07

## Amy impact
- Reduces server startup and route wiring complexity so reliability fixes around Amy's communication backend are easier to review and safer to change.

## Scope
- Extract generic Express bootstrap concerns from `server/src/server.ts`.
- Extract shared rate-limiter construction from `server/src/server.ts`.
- Extract package-version lookup and auto-listen startup wiring from `server/src/server.ts`.
- Move miscellaneous utility endpoints out of `server/src/server.ts` into a dedicated route registration module.

## Entry points
- `server/src/server.ts`
- `server/src/bootstrap/expressApp.ts`
- `server/src/bootstrap/rateLimiters.ts`
- `server/src/bootstrap/serverPackage.ts`
- `server/src/bootstrap/startServer.ts`
- `server/src/routes/utilityRoutes.ts`

## Evidence required for Done
- TypeScript server type-check passes.
- Full-server import/integration tests that exercise the exported `app` and `databaseReady` pass.

## Checklist
- [x] Discovery complete
- [x] Implementation complete
- [x] Tests pass
- [x] Evidence recorded

## Evidence
- `npm run type-check` in `server/` passed on 2026-04-07.
- `npm run lint` in `server/` passed on 2026-04-07.
- `npm run test:ts:serial -- utilityRoutes.test.ts healthCheck.test.ts integration/apiIntegration.test.ts integration/stress.test.ts` in `server/` passed on 2026-04-07: 4 suites, 18 tests.

## Next command
- `npm run type-check && npm run lint && npm run test:ts:serial -- utilityRoutes.test.ts healthCheck.test.ts integration/apiIntegration.test.ts integration/stress.test.ts`
