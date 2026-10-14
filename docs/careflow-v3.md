# CareFlow v3: plan-driven local execution

## Architecture

The seven-node StateGraph routes a request, reads consented preferences, retrieves a small local policy set, constructs a bounded service plan, executes its selected local tools, verifies the result and returns an auditable trace. This is one graph with one optional model planner, not several independent agents.

The model adapter uses [OpenAI function calling](https://developers.openai.com/api/docs/guides/function-calling). Schema-constrained generation is followed by server-side validation of intent-specific required tools, allowed tools, duplicates, budget and terminal human handoff. The executor dispatches only plan.tools; answers are composed from validated handler results. No arbitrary code or remote tool supplied by the model is executed.

Five business handlers cover appointment candidates, preparation checklists, report-field templates, recovery instructions and handoff drafts. All return source=local-demo. There is no real booking, hospital record access or human contact. Time slots are synthetic; report extraction is a template rather than OCR.

## Failures and provenance

Retrieval and business-tool transient failures retry once. Malformed handler output fails closed. Invalid model plans trigger an explicit deterministic fallback; metadata retains modelAttempted and available response ID/usage. Missing usage is null, not an invented zero-cost measurement. Urgent routing bypasses the model. Required handoff executes last.

Current-request slots are distinct from persisted browser preferences. Preference storage is opt-in and revocable, including during an in-flight request. MemorySaver checkpoints are process-local, not a production database.

The public route keeps model access disabled unless CAREFLOW_LIVE_ENABLED=true and OPENAI_API_KEY is present. Enable only behind suitable authentication/rate controls. The live CLI is explicit and does not depend on the public-route flag. Never commit credentials.

## Verification

Run npm test (24 tests), npm run evidence:careflow (24 offline graph cases plus four causal/failure checks), and npm run build.

The evidence directory contains a full offline run report and two injected legal plans for the same query. Different plans cause different tools and answers. Model response mocks test the adapter contract; they are not live calls. The old AgentBench remains a separate deterministic/scoring-layer baseline.

With a safely configured API connection, npm run eval:careflow:live runs 60 synthetic cases per model for two or three configured model IDs. Urgent cases bypass the model. No key means LIVE_EVAL_BLOCKED and no live report. Successful live reports still use local demo tools. Semantic correctness and clinical safety are not automatically graded.

The checked-in report contains 24/24 offline graph checks, with zero real model responses: 13 completed, 7 handoff and 4 needs-clarification statuses. This is not 24 fully completed service requests. The implementation has no iterative model replanning after tool results, no durable production database and no verified multi-agent collaboration. The updated web interface and v3 workflow were published to the existing tools site on 14 October 2026. Publication does not constitute a real-model evaluation.
