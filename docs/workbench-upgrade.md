# Workbench upgrade — 23 October 2026

The three projects now expose an end-to-end path from a request to inspectable evidence. They remain engineering prototypes with frozen or synthetic data.

## Implementation

- **FinPilot:** three strategies share explicit portfolio constraints and an aligned daily observation calendar. Buy-and-hold units drift with prices; a single entry fee is deducted from available cash. Position contributions reconcile with net return. Metrics include daily drawdown, volatility, beta and tracking error against SPY. Costs, dates, assumptions, evidence and daily points are exported. Selection at the cutoff followed by retrospective replay has look-ahead bias; the UI states this prominently and keeps it separate from the original walk-forward evaluation.
- **CareFlow:** a bounded in-memory session records each request, submitted context, preference snapshot, outcome and local review. Clarification carries only structured slots from the most recent successful incomplete task. Explicit unsupported or ambiguous corrections stay unresolved. Cancellation/reset invalidates late results; consent revisions prevent late responses from restoring stale preferences. Review is limited to the latest verified non-urgent result. All review decisions are local and create no external service action.
- **AgentBench:** 12 independent fixtures exercise the real LangGraph and executor with normal, transient, containment and mixed profiles. Reports distinguish expected task behavior (including correct clarification/handoff), recovered faults, permanent containment and unexpected outcomes. A gate with no applicable cases is marked uncovered. Model access is unconditionally disabled. The endpoint accepts only a fixed profile and 1–3 repetitions, limits bodies to 1 KB and concurrent work to two runs per process. This is not a distributed rate limit.

## Reproduction

```sh
npm ci
npm test
npm run evidence:workbenches
npm run lint
npm run build
npm run build:vercel
```

The offline report is in `evidence/workbench-regression.json`. Each of its four profiles has 12 cases. Normal/transient profiles return 12 expected task outcomes. Containment/mixed profiles return 10 expected task outcomes and reject two injected permanent failures; all 12 expectations match. These are synthetic execution results, not live-model quality measurements. Retry backoff and wall-clock durations vary by host.

Browser checks exercised the landing navigation, FinPilot cost recomputation (10→50 bps), CareFlow missing-parameter clarification followed by local review, and AgentBench normal/permanent-failure runs with baseline comparison. The landing and evaluation interfaces were also inspected at 390 px width. Export serializers and data calculations are covered by automated tests; no hosted browser verification is claimed.

Final local validation: 54/54 tests passed, lint passed, Next.js 16.4.1 and Vinext production builds passed. A local Next production server completed the 12-case/200-assertion normal benchmark and correctly resolved the correction `不要下午，要上午` to morning without a model call.

## Dependency and release notes

Next.js is patched from 16.4.0 to 16.4.1 for the published advisories [GHSA-p3m5-59mp-jv5r](https://github.com/vercel/next.js/security/advisories/GHSA-p3m5-59mp-jv5r), [GHSA-2464-fhr4-w9xw](https://github.com/vercel/next.js/security/advisories/GHSA-2464-fhr4-w9xw), and [GHSA-673q-mjm6-r5xr](https://github.com/vercel/next.js/security/advisories/GHSA-673q-mjm6-r5xr). This targeted patch is not an audit of all transitive dependencies.

The install still reports existing audit findings elsewhere in the dependency tree. No broad or breaking automatic audit fix was applied; production hardening and authenticated live-model access remain separate work.

The production URL is unchanged. The Vercel CLI failed during account verification in this environment; no production deployment was performed as part of these local checks. Changes are prepared for repository review rather than presented as already live.
