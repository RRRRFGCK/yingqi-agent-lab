import { mkdir, writeFile } from 'node:fs/promises';
import { finPilotEvalCases } from '../lib/finpilot-eval-cases';
import { runFinPilotAgent, type AgentRun, type PlannerOverrides, type Strategy } from '../lib/finpilot-agent';

type PlannerCall = { strategy: Strategy; candidateCount: number; maxPosition: number; maxDrawdown: number; reflectionRequired: boolean; rationale: string };
type DirectAnswer = PlannerCall & { selectedSymbols: string[]; weights: number[]; conclusion: string; sourceIds: string[] };
type Mode = 'full' | 'no-tools' | 'fixed-flow';
type TokenUsage = { inputTokens: number; outputTokens: number; totalTokens: number };

const offlineSmoke = process.argv.includes('--offline-smoke');
const apiKey = process.env.OPENAI_API_KEY;
const model = process.env.OPENAI_MODEL || 'gpt-5.4-mini';
const output = offlineSmoke ? 'evidence/finpilot-ablation-smoke.json' : 'evidence/finpilot-ablation-live.json';
if (!offlineSmoke && !apiKey) {
  console.error('LIVE_EVAL_BLOCKED: OPENAI_API_KEY is not configured. No model calls were made and no live ablation report was written.');
  process.exit(2);
}

const plannerSchema = {
  type: 'object', properties: {
    strategy: { type: 'string', enum: ['low-volatility', 'balanced', 'quality-growth'] },
    candidateCount: { type: 'integer', minimum: 2, maximum: 5 },
    maxPosition: { type: 'number', minimum: 20, maximum: 60 },
    maxDrawdown: { type: 'number', minimum: 8, maximum: 35 },
    reflectionRequired: { type: 'boolean' }, rationale: { type: 'string', minLength: 8, maxLength: 240 },
  }, required: ['strategy', 'candidateCount', 'maxPosition', 'maxDrawdown', 'reflectionRequired', 'rationale'], additionalProperties: false,
} as const;

function isPlannerCall(value: unknown): value is PlannerCall {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<PlannerCall>;
  return ['low-volatility', 'balanced', 'quality-growth'].includes(item.strategy || '')
    && Number.isInteger(item.candidateCount) && Number(item.candidateCount) >= 2 && Number(item.candidateCount) <= 5
    && Number.isFinite(item.maxPosition) && Number(item.maxPosition) >= 20 && Number(item.maxPosition) <= 60
    && Number.isFinite(item.maxDrawdown) && Number(item.maxDrawdown) >= 8 && Number(item.maxDrawdown) <= 35
    && typeof item.reflectionRequired === 'boolean' && typeof item.rationale === 'string' && item.rationale.length >= 8;
}
function isDirectAnswer(value: unknown): value is DirectAnswer {
  if (!isPlannerCall(value)) return false;
  const item = value as Partial<DirectAnswer>;
  return Array.isArray(item.selectedSymbols) && item.selectedSymbols.every((entry) => typeof entry === 'string')
    && Array.isArray(item.weights) && item.weights.every((entry) => Number.isFinite(entry))
    && typeof item.conclusion === 'string' && Array.isArray(item.sourceIds) && item.sourceIds.every((entry) => typeof entry === 'string');
}
async function functionCall(name: string, description: string, parameters: object, task: string, instructions: string) {
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST', signal: AbortSignal.timeout(30000), headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, store: false, parallel_tool_calls: false, max_output_tokens: 1800, instructions, input: task,
      tools: [{ type: 'function', name, description, strict: true, parameters }], tool_choice: { type: 'function', name } }),
  });
  if (!response.ok) throw new Error(`provider_http_${response.status}`);
  const payload = await response.json() as {
    id?: string;
    output?: Array<{ type?: string; name?: string; arguments?: string }>;
    usage?: { input_tokens?: number; output_tokens?: number; total_tokens?: number };
  };
  const call = payload.output?.find((item) => item.type === 'function_call' && item.name === name);
  if (!call?.arguments) throw new Error('missing_function_call');
  return {
    parsed: JSON.parse(call.arguments) as unknown,
    responseId: payload.id ?? null,
    usage: {
      inputTokens: payload.usage?.input_tokens ?? 0,
      outputTokens: payload.usage?.output_tokens ?? 0,
      totalTokens: payload.usage?.total_tokens ?? 0,
    } satisfies TokenUsage,
  };
}
async function planWithModel(task: string) {
  return functionCall('create_research_plan', 'Create a constrained plan for deterministic research tools.', plannerSchema, task,
    'You plan an educational historical-research workflow. Preserve every explicit numeric limit. Call the function exactly once. Do not calculate securities data.');
}
async function answerWithoutTools(task: string) {
  const schema = { ...plannerSchema, properties: { ...plannerSchema.properties,
    selectedSymbols: { type: 'array', minItems: 2, maxItems: 5, items: { type: 'string' } },
    weights: { type: 'array', minItems: 2, maxItems: 5, items: { type: 'number', minimum: 0, maximum: 100 } },
    conclusion: { type: 'string', minLength: 8, maxLength: 500 },
    sourceIds: { type: 'array', items: { type: 'string' } },
  }, required: [...plannerSchema.required, 'selectedSymbols', 'weights', 'conclusion', 'sourceIds'] };
  return functionCall('answer_research_question', 'Answer directly without data or calculation tools.', schema, task,
    'Answer the investment-research request directly without external tools, retrieval, code, or hidden market context. Never pretend to have used a source. Use an empty sourceIds array if no source was actually provided. Call the function exactly once.');
}

const numericVector = (run: AgentRun) => [run.candidateCount, run.maxPosition, run.maxDrawdown, ...run.portfolio.map((item) => item.weight)];
const directVector = (answer: DirectAnswer) => [answer.candidateCount, answer.maxPosition, answer.maxDrawdown, ...answer.weights];
function grade(mode: Mode, gold: AgentRun, schemaPassed: boolean, vector: number[], sourceIds: string[], selectedSymbols: string[]) {
  const expected = numericVector(gold);
  const compared = Math.max(expected.length, vector.length);
  let errors = 0;
  for (let index = 0; index < compared; index += 1) if (!Number.isFinite(vector[index]) || !Number.isFinite(expected[index]) || Math.abs(vector[index] - expected[index]) > 0.5) errors += 1;
  const validSources = new Set(gold.candidates.flatMap((candidate) => candidate.sourceIds));
  return {
    mode, schemaPassed, numericFieldsCompared: compared, numericErrors: errors, numericErrorRate: Number(((errors / Math.max(1, compared)) * 100).toFixed(1)),
    conclusionHasSources: sourceIds.length > 0, validSourceRate: Number(((sourceIds.filter((id) => validSources.has(id)).length / Math.max(1, sourceIds.length)) * 100).toFixed(1)),
    selectionExactMatch: JSON.stringify(selectedSymbols) === JSON.stringify(gold.portfolio.map((item) => item.symbol)),
  };
}

const startedAt = new Date().toISOString();
const rows: Array<Record<string, unknown>> = [];
for (const item of finPilotEvalCases) {
  const gold = runFinPilotAgent(item.task, item.expected.strategy, `FP-FIXED-${item.id}`);
  rows.push({ caseId: item.id, ...grade('fixed-flow', gold, true, numericVector(gold), gold.portfolio.flatMap((position) => gold.candidates.find((candidate) => candidate.symbol === position.symbol)?.sourceIds ?? []), gold.portfolio.map((position) => position.symbol)) });
  if (offlineSmoke) continue;
  try {
    const planned = await planWithModel(item.task);
    if (!isPlannerCall(planned.parsed)) throw new Error('planner_schema_invalid');
    const plan = planned.parsed;
    const full = runFinPilotAgent(item.task, plan.strategy, `FP-FULL-${item.id}`, { ...plan, model, rationale: plan.rationale } satisfies PlannerOverrides);
    rows.push({ caseId: item.id, responseId: planned.responseId, usage: planned.usage, ...grade('full', gold, true, numericVector(full), full.portfolio.flatMap((position) => full.candidates.find((candidate) => candidate.symbol === position.symbol)?.sourceIds ?? []), full.portfolio.map((position) => position.symbol)) });
  } catch (error) {
    rows.push({ caseId: item.id, mode: 'full', schemaPassed: false, error: error instanceof Error ? error.message : 'unknown_error' });
  }
  try {
    const directResult = await answerWithoutTools(item.task);
    if (!isDirectAnswer(directResult.parsed)) throw new Error('direct_schema_invalid');
    const direct = directResult.parsed;
    rows.push({ caseId: item.id, responseId: directResult.responseId, usage: directResult.usage, ...grade('no-tools', gold, true, directVector(direct), direct.sourceIds, direct.selectedSymbols) });
  } catch (error) {
    rows.push({ caseId: item.id, mode: 'no-tools', schemaPassed: false, error: error instanceof Error ? error.message : 'unknown_error' });
  }
}
const modes: Mode[] = offlineSmoke ? ['fixed-flow'] : ['full', 'no-tools', 'fixed-flow'];
const summary = modes.map((mode) => {
  const modeRows = rows.filter((row) => row.mode === mode);
  const numericCompared = modeRows.reduce((sum, row) => sum + Number(row.numericFieldsCompared || 0), 0);
  const numericErrors = modeRows.reduce((sum, row) => sum + Number(row.numericErrors || 0), 0);
  const usage = modeRows.reduce<TokenUsage>((sum, row) => {
    const item = row.usage as Partial<TokenUsage> | undefined;
    return {
      inputTokens: sum.inputTokens + Number(item?.inputTokens || 0),
      outputTokens: sum.outputTokens + Number(item?.outputTokens || 0),
      totalTokens: sum.totalTokens + Number(item?.totalTokens || 0),
    };
  }, { inputTokens: 0, outputTokens: 0, totalTokens: 0 });
  return { mode, cases: modeRows.length, schemaPassRate: Number(((modeRows.filter((row) => row.schemaPassed).length / Math.max(1, modeRows.length)) * 100).toFixed(1)),
    numericErrorRate: Number(((numericErrors / Math.max(1, numericCompared)) * 100).toFixed(1)),
    sourceCoverageRate: Number(((modeRows.filter((row) => row.conclusionHasSources).length / Math.max(1, modeRows.length)) * 100).toFixed(1)),
    exactSelectionRate: Number(((modeRows.filter((row) => row.selectionExactMatch).length / Math.max(1, modeRows.length)) * 100).toFixed(1)), usage };
});
const report = { schemaVersion: 1, mode: offlineSmoke ? 'offline-smoke-fixed-flow-only' : 'live-paired-ablation', model: offlineSmoke ? null : model,
  startedAt, completedAt: new Date().toISOString(), cases: finPilotEvalCases.length, pairedCaseIds: finPilotEvalCases.map((item) => item.id), summary,
  metricDefinitions: { numericErrorRate: 'Fields differing from the fixed-flow tool result by more than 0.5, divided by compared numeric fields.', sourceCoverageRate: 'Cases with at least one source ID; validSourceRate separately checks IDs against tool-produced evidence.', schemaPassRate: 'Responses passing the strict runtime validator.', exactSelectionRate: 'Ordered selected symbols exactly match the fixed-flow tool result.' },
  limitations: ['Frozen eight-stock US sample; not live trading.', 'The fixed flow is the paired engineering reference, not financial ground truth.', 'No-tools answers receive no market data; source presence does not imply source validity.', ...(offlineSmoke ? ['No model calls were made; this file is not an LLM ablation result.'] : [])], rows };
await mkdir('evidence', { recursive: true });
await writeFile(output, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ output, cases: report.cases, mode: report.mode, summary }, null, 2));
