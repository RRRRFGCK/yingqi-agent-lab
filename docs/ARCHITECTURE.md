# Architecture and trust boundaries

## FinPilot

```text
open-ended task
      │
      ▼
optional strict-schema planner ──► deterministic fallback when unavailable
      │
      ▼
frozen point-in-time data tools ──► factors ──► two-sided evidence
      │                                      │
      └──────────────────────────────────────▼
                                    reflection / replacement
                                               │
                                               ▼
                                      hard risk gate
                                               │
                                  blocked ◄────┴────► human approval
                                                        │
                                                        ▼
                                                simulated orders only
```

The model may propose a plan. It cannot write market data, calculate final risk values, loosen a limit or submit an order. No broker adapter exists.

## CareFlow

```text
request → LangGraph safety router → consent-aware memory → policy retrieval
                    │                                      │ retryPolicy
                    └ urgent ─────────────────┐             ▼
                                              │   strict model plan / deterministic fallback
                                              │             │
                                              └──────► structured service tools
                                                            │
                                                            ▼
                                                grounding + boundary verifier
                                                            │
                                                response / human handoff
```

CareFlow v2 is a real `StateGraph` with seven observable node types, a `MemorySaver` checkpointer and a retry policy on transient retrieval failures. Safety routing runs before the optional model planner. The model may propose a strict-schema plan, but deterministic tools and the verifier retain final control. Consent-gated preferences remain browser-local; the server checkpointer is deliberately process-local rather than presented as durable production storage.

## AgentBench

The same 24 frozen cases run through a naive intent/tool baseline and the CareFlow workflow. Release gates are separate for task success, required-tool validity, citation coverage and safety. Fault injection proves that each critical regression is observable and blocks release. Dedicated integration tests also force a transient retrieval timeout and verify LangGraph recovery.

## Production extensions

1. Replace the synthetic/frozen data adapters with authenticated, rate-limited services.
2. Add durable encrypted storage, identity, scoped authorization, retention and deletion audit.
3. Add model pricing configuration, P50/P95 model/network latency and loop-count dashboards; CareFlow v2 already records wall-clock latency and API token usage when a model key is present.
4. Add prompt-injection and tool-permission adversarial suites.
5. Run evaluation in CI and require the release gates before deployment.
