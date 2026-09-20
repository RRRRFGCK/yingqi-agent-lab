# Evaluation roadmap and status

## FinPilot paired ablation

`npm run eval:finpilot:ablation` runs the same 50 requests through three configurations:

1. full: strict model planning followed by deterministic market, factor and risk tools;
2. no-tools: a model answers directly without retrieval, code or market context;
3. fixed-flow: the deterministic parser and the same tools, with no model planning.

The report separates strict-schema pass rate, numeric error rate, conclusion source coverage, source-ID validity and exact selection match. The fixed flow is the paired engineering reference, not financial truth. With no `OPENAI_API_KEY`, the live command exits before writing a live report. `npm run eval:finpilot:smoke` validates all 50 fixed-flow cases and writes an explicitly non-model smoke report.

## CareFlow multi-model evaluation

`npm run eval:careflow:live` requires `OPENAI_API_KEY` plus two or three comma-separated model IDs in `OPENAI_EVAL_MODELS`. It runs 60 hand-authored service cases per model and reports:

- exact ordered tool-selection accuracy;
- plan-schema pass and malformed-output rates;
- provider failures separately from malformed model output;
- overall human-escalation recall and model-routed escalation recall.

Ten urgent cases bypass the model by design. All tools remain synthetic local fixtures; this is not a clinical evaluation or proof of production impact.

## CSI 300 / CSI 500 expansion

Install `requirements-market.txt`, then run `npm run market:cn:download` and `npm run market:cn:evaluate`. The downloader keeps quarterly historical constituent snapshots, removed/delisted security metadata, forward-adjusted daily data and an immutable manifest. The evaluator applies next-day execution, conservative board/ST price-limit checks, and reports IC, RankIC and a seeded block-bootstrap 95% interval for the Sharpe difference.

The current host cannot reach BaoStock's dedicated data port, so no expanded-universe result exists yet. Do not claim CSI 300/500 coverage, delisting-bias removal, IC/RankIC or bootstrap results until the immutable input files and final report have been created. BaoStock's adjustment method can differ from commercial terminals; exchange-specific rules and fee/slippage assumptions require another audit before resume use.
