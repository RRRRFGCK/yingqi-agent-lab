import { mkdir, writeFile } from 'node:fs/promises';
import { careFlowLiveCases } from '../lib/careflow-live-cases';
import { runCareFlowLangGraph } from '../lib/careflow-langgraph';

const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) {
  console.error('LIVE_EVAL_BLOCKED: OPENAI_API_KEY is not configured. No model calls were made and no live report was written.');
  process.exit(2);
}
const modelsArg = process.argv.find((arg) => arg.startsWith('--models='))?.slice('--models='.length);
const models = (modelsArg || process.env.OPENAI_EVAL_MODELS || '').split(',').map((item) => item.trim()).filter(Boolean);
if (models.length < 2 || models.length > 3) {
  console.error('LIVE_EVAL_BLOCKED: set OPENAI_EVAL_MODELS or --models to two or three comma-separated model IDs.');
  process.exit(2);
}
const startedAt = new Date().toISOString();
const modelReports = [];
for (const model of models) {
  const rows = [];
  for (const item of careFlowLiveCases) {
    const run = await runCareFlowLangGraph(item.query, item.memory || { consented: false }, 'none', { model });
    const tools = run.orchestration?.executedTools ?? [];
    const exactTools = JSON.stringify(tools) === JSON.stringify(item.expectedTools);
    const modelRouted = item.expectedIntent !== 'urgent';
    rows.push({ caseId: item.id, expectedIntent: item.expectedIntent, actualIntent: run.intent, expectedTools: item.expectedTools, actualTools: tools,
      exactTools, modelRouted, modelAttempted: run.orchestration?.modelAttempted === true, modelMode: run.orchestration?.modelMode,
      plannerFailureKind: run.orchestration?.plannerFailureKind, malformedOutput: run.orchestration?.plannerFailureKind === 'invalid-plan-or-response',
      expectsHandoff: item.expectsHandoff, actualHandoff: run.status === 'handoff', responseId: run.orchestration?.responseId ?? null,
      usage: run.orchestration?.usage ?? null, wallClockMs: run.orchestration?.wallClockMs ?? run.latencyMs });
  }
  const attempted = rows.filter((row) => row.modelRouted);
  const escalation = rows.filter((row) => row.expectsHandoff);
  const modelEscalation = rows.filter((row) => row.expectsHandoff && row.modelRouted);
  const percent = (numerator: number, denominator: number) => Number(((numerator / Math.max(1, denominator)) * 100).toFixed(1));
  modelReports.push({ model, cases: rows.length, modelRoutedCases: attempted.length,
    intentAccuracy: percent(rows.filter((row) => row.actualIntent === row.expectedIntent).length, rows.length),
    toolSelectionAccuracy: percent(rows.filter((row) => row.exactTools).length, rows.length),
    planSchemaPassRate: percent(attempted.filter((row) => row.modelMode === 'openai').length, attempted.length),
    malformedOutputRate: percent(attempted.filter((row) => row.malformedOutput).length, attempted.length),
    providerFailureRate: percent(attempted.filter((row) => ['provider-http', 'timeout'].includes(String(row.plannerFailureKind))).length, attempted.length),
    humanEscalationRecall: percent(escalation.filter((row) => row.actualHandoff).length, escalation.length),
    modelRoutedEscalationRecall: percent(modelEscalation.filter((row) => row.actualHandoff).length, modelEscalation.length), rows });
}
const report = { schemaVersion: 1, mode: 'live-model-on-local-demo-tools', startedAt, completedAt: new Date().toISOString(),
  casesPerModel: careFlowLiveCases.length, models, metricDefinitions: {
    toolSelectionAccuracy: 'Exact ordered match against the hand-authored gold tool plan.',
    malformedOutputRate: 'Model-routed cases failing function-call shape, JSON parsing, schema or business-plan validation.',
    humanEscalationRecall: 'Expected handoff cases ending in handoff; model-routed recall excludes urgent cases that bypass the model.',
  }, limitations: ['Synthetic administrative-service prompts and local fixture tools; not a clinical evaluation.', 'Intent routing is deterministic and precedes the model.', 'Urgent cases bypass the model by design.', 'Results are model-ID and run-date specific; API failures are reported separately from malformed outputs.'], modelReports };
await mkdir('evidence', { recursive: true });
await writeFile('evidence/careflow-live-multimodel-evaluation.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ output: 'evidence/careflow-live-multimodel-evaluation.json', casesPerModel: report.casesPerModel,
  models: modelReports.map(({ rows: _rows, ...summary }) => summary) }, null, 2));

