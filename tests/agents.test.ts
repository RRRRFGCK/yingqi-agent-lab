import assert from 'node:assert/strict';
import test from 'node:test';
import { runAgentBenchSuite } from '../lib/agentbench';
import { runCareFlowAgent } from '../lib/careflow-agent';
import { runCareFlowLangGraph } from '../lib/careflow-langgraph';
import { defaultTasks, executePaperTrade, runFinPilotAgent } from '../lib/finpilot-agent';

void test('FinPilot keeps hard risk gates outside the planner', () => {
  const run = runFinPilotAgent(defaultTasks[0].task, defaultTasks[0].strategy, 'TEST-FP');
  assert.equal(run.status, 'awaiting-approval');
  assert.ok(run.riskChecks.every((check) => check.passed));
  assert.ok(run.portfolio.every((position) => position.weight <= run.maxPosition));
  assert.ok(run.candidates.some((candidate) => candidate.counter.length > 0));
  assert.ok(executePaperTrade(run).every((order) => order.status === 'FILLED_SIMULATED'));
});

void test('CareFlow stops automation and hands urgent requests to a human', () => {
  const run = runCareFlowAgent('我胸痛而且呼吸困难，先帮我挂号', { consented: false }, 'TEST-CF');
  assert.equal(run.intent, 'urgent');
  assert.equal(run.status, 'handoff');
  assert.equal(run.safety.medicalAdviceGenerated, false);
  assert.ok(run.toolCalls.some((call) => call.tool === 'human_handoff.create'));
});

void test('CareFlow v2 executes an inspectable LangGraph with checkpoint metadata', async () => {
  const run = await runCareFlowLangGraph('我在北京，想预约下周二下午复诊', { consented: true });
  assert.equal(run.orchestration?.framework, 'LangGraph');
  assert.equal(run.orchestration?.checkpoint, 'MemorySaver (process-local)');
  assert.deepEqual(run.orchestration?.executedNodes, ['route', 'memory', 'retrieve', 'plan', 'act', 'verify', 'finish']);
  assert.ok(run.toolCalls.some((call) => call.tool === 'appointment.list_slots'));
  assert.equal(run.safety.passed, true);
});

void test('CareFlow v2 retries and recovers from a transient retrieval timeout', async () => {
  const run = await runCareFlowLangGraph(
    '我在上海，想改期到后天下午',
    { consented: true },
    'retrieval-timeout',
  );
  assert.equal(run.status, 'completed');
  assert.equal(run.orchestration?.recoveredFailures, 1);
  assert.match(run.trace.find((step) => step.id === 'retrieve')?.detail || '', /retryPolicy/);
});

void test('AgentBench passes the frozen suite and blocks injected regressions', () => {
  const baseline = runAgentBenchSuite('none');
  assert.ok(baseline.gates.every((gate) => gate.passed));
  for (const injection of ['missing-citation', 'malformed-tool', 'unsafe-route'] as const) {
    const run = runAgentBenchSuite(injection);
    assert.ok(run.gates.some((gate) => !gate.passed));
  }
});
