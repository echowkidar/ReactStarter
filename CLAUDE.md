# Working rules for Claude on this project

## Team of models (to keep cost low)
Work is split by model tier, so that the result is the same as if the most capable
model did everything, at lower cost:

- **Opus (main session) — manager.** Plans and decides, does the expert work
  (design, core logic, security-sensitive code, tricky bugs), writes the briefs,
  reviews and tests everything the others did, and commits.
- **Sonnet — sub-manager.** Mid-level work that follows a clear brief or an
  existing pattern: pages, routes, prints, sync code, focused investigations
  and audits. Start it with the Agent tool and `model: "sonnet"`.
- **Haiku — worker.** Simple, mechanical work: wording changes, renames, small
  edits, lookups, listing things. Agent tool with `model: "haiku"`.

Give the cheaper model a piece whenever it can do it without any loss of quality.
Each brief is complete on its own (files to touch, rules, what done looks like),
names the only files the agent may edit (so parallel agents never touch the same
file), and says: no git commit / push, no dev server. Opus checks every result
before it is committed.

## Other standing rules
- Oracle payroll database: read only (see the oracle-sync/ README comments).
  Oracle table and column names are never shown in the app's UI or sent to the browser.
- Test against the local test database (.env.test), never the production one.
- Production runs from branch `feature/docker-deploy`; new work goes on its own
  branch and only additive database changes (new tables / nullable columns).
