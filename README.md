# Yingqi Agent Lab

[![CI](https://github.com/RRRRFGCK/yingqi-agent-lab/actions/workflows/ci.yml/badge.svg)](https://github.com/RRRRFGCK/yingqi-agent-lab/actions/workflows/ci.yml)

Three runnable, auditable agent-engineering demos built to show more than a chat wrapper:

- **FinPilot** — constrained planning, deterministic tools, two-sided evidence, reflection, hard risk gates and human-approved paper execution.
- **CareFlow** — agentic retrieval, consent-aware memory, multi-role verification, structured tools and safety-first human handoff.
- **AgentBench** — a frozen regression suite comparing a naive baseline with the agent workflow, plus citation, tool-schema and safety fault injection.

Live demo: [Yingqi Agent Lab](https://yingqi-agent-lab.rrrrfgck.chatgpt.site)

> This is an engineering portfolio project. FinPilot is not investment advice and never connects to a broker or real capital. CareFlow does not diagnose, recommend treatment or replace professional care.

## What this repository demonstrates

| Capability | Where to inspect |
| --- | --- |
| Planning → acting → reflection | `lib/finpilot-agent.ts` |
| Deterministic tool and risk boundaries | `lib/finpilot-agent.ts` |
| Agentic retrieval and consent-aware memory | `lib/careflow-agent.ts` |
| Human handoff and safety veto | `lib/careflow-agent.ts` |
| Frozen evaluation cases and failure injection | `lib/agentbench.ts`, `tests/agents.test.ts` |
| Interactive product surfaces | `app/finpilot`, `app/careflow`, `app/agentbench` |
| Optional strict LLM function calling | `app/api/finpilot/run/route.ts` |

The deterministic workflow owns calculations, permissions and release decisions. The optional model planner may interpret an open-ended request, but it cannot bypass position limits, point-in-time data rules, safety routing or human approval.

## Quick start

Requirements: Node.js 22.13 or newer.

```bash
npm install
npm run dev
```

Open the local URL printed by Vinext, then use:

- `/` or `/agent-lab` — project index
- `/finpilot` — evidence-driven research agent
- `/careflow` — safety-oriented service workflow
- `/agentbench` — regression and observability console

Run validation:

```bash
npm test
npm run lint
npm run build
```

## Optional OpenAI planner

FinPilot works without a model by clearly falling back to a deterministic parser. To test strict function calling locally:

```bash
cp .env.example .env.local
```

Set `OPENAI_API_KEY` in `.env.local`. Never commit secrets. The planner uses a single strict `create_research_plan` function call; tool execution and risk checks remain deterministic.

## Honest scope

- Market observations are frozen historical snapshots, not live quotes.
- Walk-forward results are historical engineering measurements, not promises of return.
- CareFlow knowledge is a tiny synthetic service-policy corpus, not a medical knowledge base.
- Browser memory is local and consent-gated; this demo has no production identity or encrypted data store.
- P95 values model workflow-node time and exclude real network/model latency.
- The project has not been described as production deployment or external-user impact.

See [Architecture and trust boundaries](docs/ARCHITECTURE.md) for the data flow and extension points.

## License

MIT
