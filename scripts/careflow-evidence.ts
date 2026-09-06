import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { careFlowEvalCases } from '../lib/careflow-agent';
import { runCareFlowLangGraph } from '../lib/careflow-langgraph';

const live = process.argv.includes('--live');
if (live && !process.env.OPENAI_API_KEY) {
  console.error('LIVE_EVAL_BLOCKED: OPENAI_API_KEY is not configured. No model calls were made; no live results were written.');
  process.exit(2);
}
const startedAt = new Date().toISOString();
const chosenIds = new Set(['E01', 'E03', 'E04', 'E06', 'E07', 'E09']);
const cases = live ? careFlowEvalCases.filter((item) => chosenIds.has(item.id)) : careFlowEvalCases;
const rows = [];
for (const item of cases) {
  const run = await runCareFlowLangGraph(item.query, item.memory || { consented: false }, 'none', { offline: !live });
  const passed = run.intent === item.expectedIntent && (run.status === 'handoff') === item.expectsHandoff
    && (item.requiredTool === 'response.verify_grounding' ? run.orchestration?.executedNodes.includes('verify') : run.toolCalls.some((call) => call.tool === item.requiredTool))
    && JSON.stringify(run.orchestration?.plannedTools) === JSON.stringify(run.orchestration?.executedTools)
    && run.safety.passed;
  const realModel = run.orchestration?.modelMode === 'openai' && !!run.orchestration.responseId;
  rows.push({ caseId: item.id, passed, realModel, run });
}
const checks: Array<{ name: string; passed: boolean }> = [];
if (!live) {
  const query = '我在北京，预约周五下午复诊并整理材料';
  const makePlan = (tools: string[]) => ({ objective: '预约协助', tools, needsHumanReview: false, rationale: '离线测试计划用来验证工具选择是否真正改变输出内容。' });
  const a = await runCareFlowLangGraph(query, { consented: false }, 'none', { fixturePlanner: async () => makePlan(['appointment.list_slots']) });
  const b = await runCareFlowLangGraph(query, { consented: false }, 'none', { fixturePlanner: async () => makePlan(['appointment.list_slots', 'records.build_checklist']) });
  assert.notEqual(a.answer, b.answer);
  assert.deepEqual(a.orchestration?.executedTools, ['appointment.list_slots']);
  assert.deepEqual(b.orchestration?.executedTools, ['appointment.list_slots', 'records.build_checklist']);
  checks.push({ name: 'same-query different-plan changes tools and answer', passed: true });
  for (const mode of ['retrieval-timeout', 'tool-timeout'] as const) {
    const recovered = await runCareFlowLangGraph(query, { consented: false }, mode, { offline: true });
    assert.equal(recovered.orchestration?.recoveredFailures, 1);
    checks.push({ name: mode + ' recovery', passed: true });
  }
  await assert.rejects(runCareFlowLangGraph(query, { consented: false }, 'tool-invalid-output', { offline: true }), /tool_output_rejected/);
  checks.push({ name: 'invalid actual tool output rejected before result', passed: true });
  await mkdir('evidence', { recursive: true });
  await writeFile('evidence/careflow-plan-causality.json', JSON.stringify({ source: 'injected-test-plans-not-model', sameQuery: query, planA: a, planB: b }, null, 2) + '\n');
}
const modelCount = rows.filter((row) => row.realModel).length;
const expectedModelCount = live ? cases.filter((item) => item.expectedIntent !== 'urgent').length : 0;
const report = {
  schemaVersion: 1, startedAt, completedAt: new Date().toISOString(),
  mode: live ? 'live-model-on-local-demo-tools' : 'offline-langgraph-and-injected-plans',
  graphVersion: '3.0', toolSource: 'local-demo', cases: rows.length, passed: rows.filter((row) => row.passed).length,
  realModelResponses: modelCount, expectedModelResponses: expectedModelCount,
  liveStatus: live ? (modelCount === expectedModelCount ? 'model-calls-recorded' : 'incomplete-fallback-occurred') : 'not-run-no-model-claim',
  checks, limitations: ['Synthetic administrative-service cases; not a clinical safety evaluation.', 'Semantic correctness is not automatically graded.', 'Local fixture tools, no hospital APIs or actual submissions.', 'Offline and injected-plan results do not measure model quality.', 'Human understanding and authorship must be demonstrated separately.'], rows,
};
await mkdir('evidence', { recursive: true });
const output = live ? 'evidence/careflow-live-evaluation.json' : 'evidence/careflow-offline-evaluation.json';
await writeFile(output, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ output, cases: report.cases, passed: report.passed, realModelResponses: modelCount, liveStatus: report.liveStatus, checks }, null, 2));
if (report.passed !== report.cases || (live && modelCount !== expectedModelCount)) process.exitCode = 1;
