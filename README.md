# FinPilot, CareFlow & AgentBench

Tools for historical investment research, synthetic service requests and offline workflow evaluation.

[Open the tools](https://yingqi-agent-workbench.vercel.app) · [Evaluation commands](docs/EVALUATION_ROADMAP.md) · [CareFlow implementation](docs/careflow-v3.md) · [Vercel deployment](docs/VERCEL.md)

## Projects

| Tool | What it does | Start reading |
| --- | --- | --- |
| FinPilot | Compares three strategies under shared constraints, calculates daily portfolio/benchmark diagnostics, reconciles contribution and cost sensitivity, and exports JSON/CSV. | [Research engine](lib/finpilot-research.ts), [Workflow](lib/finpilot-agent.ts) |
| CareFlow | Executes validated tool plans, clarifies missing fields across a bounded session, records local human-review decisions and exports an audit trail. | [State graph](lib/careflow-langgraph.ts), [Session state](lib/careflow-session.ts) |
| AgentBench | Runs 12 independent fixtures through the actual offline graph with four fault profiles; separates task completion, recovery and failure containment. | [Execution evaluator](lib/agentbench-execution.ts), [API](app/api/agentbench/run/route.ts) |

## Try an end-to-end scenario

- **FinPilot:** open `/finpilot#research-lab`, compare the same three strategies, change entry cost from 10 to 50 bps, inspect the drawdown chart and position attribution, then export the daily CSV. The cutoff-selected portfolios are replayed retrospectively; this analysis has selection look-ahead and is not an out-of-sample return claim. The separate historical walk-forward tab retains its original methodology.
- **CareFlow:** enter `帮我预约复诊`, then fill `北京` and `下周二下午` in the session workbench. Inspect the actual tool results and complete a local draft review. The 12-turn, memory-only session records failures and cancellations as well as successful responses. Raw conversations are not persisted; downloads are explicit. Existing optional preference persistence remains separate. Emergency escalation cannot be cleared by a review click.
- **AgentBench:** run the normal profile and pin it as a baseline; run transient faults, then permanent containment. Inspect individual assertions, outputs, retries and measured durations. A contained failure is never counted as a completed task. Reports include a suite version, and baseline comparisons reject incompatible suites. The old 24-case score simulator remains available in a collapsed section, clearly labelled.

CareFlow uses a single seven-node LangGraph workflow, not multiple independent agents. Its five local handlers return synthetic appointment candidates, checklists, templates and handoff drafts. It does not submit bookings or contact staff.

FinPilot uses frozen observations for eight selected stocks and SPY. Historical results have a restricted, surviving-stock universe and approximate financial-data availability. Simulated orders never reach a broker.

## Run locally

Node.js 22.13+ is required.

```bash
npm ci
npm run dev
```

Open the URL printed by the development server. Routes: `/finpilot`, `/careflow`, `/agentbench`.

```bash
npm test
npm run build
```

The tests cover the original workflows plus portfolio arithmetic, session transitions, stale responses, review gates, real execution faults and endpoint validation. The older CareFlow evidence report separately contains 24 offline graph cases; those are not live-model evaluations.

## Evaluation

```bash
npm run evidence:careflow
npm run eval:finpilot:smoke
npm run evidence:workbenches
```

The repository also includes a 50-question, three-configuration FinPilot ablation harness and a 60-case CareFlow multi-model harness:

```bash
npm run eval:finpilot:ablation
npm run eval:careflow:live
```

The live/ablation commands require model credentials and configuration described in [EVALUATION_ROADMAP.md](docs/EVALUATION_ROADMAP.md). `evidence:workbenches` is entirely offline and writes [workbench-regression.json](evidence/workbench-regression.json), containing four graph profiles and a reproducible portfolio comparison. Durations depend on the host and injected retry backoff. Checked-in reports under `evidence/` are offline runs or test fixtures. Real-model comparative results are not claimed.

The optional Chinese-equity dataset and backtest scripts are separate from the eight-stock web demo; their presence is not evidence of a completed large-universe experiment.

## Model and data settings

Copy `.env.example` to an ignored `.env.local` and configure server-side credentials if needed. Never place keys in browser code or commit them.

The public CareFlow endpoint defaults to offline planning. Live access additionally requires `CAREFLOW_LIVE_ENABLED=true`; enable it only with suitable access and rate controls. Model plans are validated before local tool dispatch. Browser preferences are opt-in; graph checkpoints are process-local.

This is a prototype. It does not provide investment or medical advice, use real patient records, or execute real financial transactions.

## License

[MIT](LICENSE)
