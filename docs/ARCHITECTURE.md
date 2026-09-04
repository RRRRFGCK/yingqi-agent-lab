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
request → safety-first router → consent-aware memory read → policy retrieval
                      │                                  │
                      └ urgent ─► human handoff          ▼
                                                structured service tool
                                                         │
                                                         ▼
                                           grounding + boundary verifier
                                                         │
                                             response / human handoff
```

Safety routing runs before ordinary intent handling. The verifier blocks unsupported claims and medical advice. Long-term preferences are read and written only after explicit consent.

## AgentBench

The same 12 frozen cases run through a naive intent/tool baseline and the CareFlow workflow. Release gates are separate for task success, required-tool validity, citation coverage and safety. Fault injection proves that each critical regression is observable and blocks release.

## Production extensions

1. Replace the synthetic/frozen data adapters with authenticated, rate-limited services.
2. Add durable encrypted storage, identity, scoped authorization, retention and deletion audit.
3. Record real model/network latency, token use, cost and loop count.
4. Add prompt-injection and tool-permission adversarial suites.
5. Run evaluation in CI and require the release gates before deployment.
