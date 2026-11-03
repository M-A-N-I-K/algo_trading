@AGENTS.md

# Strategy guides

Every coded strategy ships with a beginner guide in `src/guides/` (shown at `/guides`). When you add or change a strategy in `src/strategies/registry.ts`:

- Write or update its guide (`src/guides/<name>.ts`, registered in `src/guides/index.ts`). `src/guides/tests/guides.test.ts` fails if one is missing.
- Write it for a complete beginner: define every term, give chart setup, long and short steps in order, entry, stop, target, management, when not to trade, common mistakes, a worked example with numbers, a schematic diagram and a pre-trade checklist.
- Take every rule from the strategy's code and defaults, not from memory, so the guide teaches the same trades the backtest measures.
- Quote real backtest numbers (same period and settings as the other guides, see `src/guides/shared.ts`) and say plainly when it lost money.
- Check the diagram in a browser for overlapping labels.
