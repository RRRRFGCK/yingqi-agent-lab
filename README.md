# FinPilot, CareFlow & AgentBench

Tools for historical investment research, synthetic service requests and offline workflow evaluation.

[Open the tools](https://rrrrfgck.vercel.app) · [Evaluation commands](docs/EVALUATION_ROADMAP.md) · [CareFlow implementation](docs/careflow-v3.md) · [Vercel deployment](docs/VERCEL.md)

## Projects

| Tool | What it does | Start reading |
| --- | --- | --- |
| FinPilot | Parses research constraints, calculates a historical portfolio, checks risk limits and records user-approved simulated orders. | [Workflow](lib/finpilot-agent.ts), [API](app/api/finpilot/run/route.ts) |
| CareFlow | Validates a service plan, dispatches allowlisted local tools, retries transient failures and returns results with sources. | [State graph](lib/careflow-langgraph.ts), [Tool executor](lib/careflow-executor.ts) |
| AgentBench | Compares a FAQ baseline with a rule workflow across 24 synthetic cases and simulates failures in the scoring layer. | [Evaluator](lib/agentbench.ts), [Tests](tests/agents.test.ts) |

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

The test suite currently contains 24 tests. The CareFlow evidence report separately contains 24 offline graph cases; these are not 24 live-model evaluations.

## Evaluation

```bash
npm run evidence:careflow
npm run eval:finpilot:smoke
```

The repository also includes a 50-question, three-configuration FinPilot ablation harness and a 60-case CareFlow multi-model harness:

```bash
npm run eval:finpilot:ablation
npm run eval:careflow:live
```

These commands require model credentials and configuration described in [EVALUATION_ROADMAP.md](docs/EVALUATION_ROADMAP.md). Checked-in reports under `evidence/` are offline runs or test fixtures. Real-model comparative results are not claimed.

The optional Chinese-equity dataset and backtest scripts are separate from the eight-stock web demo; their presence is not evidence of a completed large-universe experiment.

## Model and data settings

Copy `.env.example` to an ignored `.env.local` and configure server-side credentials if needed. Never place keys in browser code or commit them.

The public CareFlow endpoint defaults to offline planning. Live access additionally requires `CAREFLOW_LIVE_ENABLED=true`; enable it only with suitable access and rate controls. Model plans are validated before local tool dispatch. Browser preferences are opt-in; graph checkpoints are process-local.

This is a prototype. It does not provide investment or medical advice, use real patient records, or execute real financial transactions.

## License

[MIT](LICENSE)
