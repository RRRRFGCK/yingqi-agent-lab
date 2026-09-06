import assert from 'node:assert/strict';
import test from 'node:test';
import { careFlowEvalCases, type CareMemory } from '../lib/careflow-agent';
import { deterministicPlan, validateServicePlan } from '../lib/careflow-executor';
import { runCareFlowLangGraph } from '../lib/careflow-langgraph';

const query = '我在北京，想预约周五下午复诊，顺便整理材料';
const plan = (tools: string[]) => ({ objective: '准备预约', tools, needsHumanReview: tools.includes('human_handoff.create'), rationale: '选择本地演示工具验证计划与实际执行的对应关系。' });

void test('different valid plans change both actual tools and answer for the same query', async () => {
  const a = await runCareFlowLangGraph(query, { consented: false }, 'none', { fixturePlanner: async () => plan(['appointment.list_slots']) });
  const b = await runCareFlowLangGraph(query, { consented: false }, 'none', { fixturePlanner: async () => plan(['appointment.list_slots', 'records.build_checklist']) });
  assert.deepEqual(a.orchestration?.executedTools, ['appointment.list_slots']);
  assert.deepEqual(b.orchestration?.executedTools, ['appointment.list_slots', 'records.build_checklist']);
  assert.doesNotMatch(a.answer, /资料清单/);
  assert.match(b.answer, /资料清单/);
  assert.notEqual(a.answer, b.answer);
  assert.equal(a.orchestration?.modelMode, 'test-fixture');
  assert.equal(a.orchestration?.usage, null);
  assert.deepEqual(b.orchestration?.plannedTools, b.orchestration?.executedTools);
});

void test('plan order is execution order', async () => {
  const tools = ['records.build_checklist', 'appointment.list_slots'];
  const run = await runCareFlowLangGraph(query, { consented: false }, 'none', { fixturePlanner: async () => plan(tools) });
  assert.deepEqual(run.toolCalls.map((call) => call.tool), tools);
  assert.ok(run.answer.indexOf('资料清单') < run.answer.indexOf('演示候选'));
});

void test('billing takes precedence over report-preparation in mixed requests', async () => {
  const run = await runCareFlowLangGraph('检查报告费用有问题，帮我退款', { consented: false }, 'none', { offline: true });
  assert.equal(run.intent, 'billing');
  assert.equal(run.status, 'handoff');
  assert.deepEqual(run.orchestration?.executedTools, ['human_handoff.create']);
});

void test('handoff must be last; no tools execute after escalation', () => {
  assert.throws(() => validateServicePlan(plan(['human_handoff.create', 'appointment.list_slots']), 'appointment'), /terminate/);
});

void test('ISO dates are preserved; invalid or conflicting dates require clarification', async () => {
  const valid = await runCareFlowLangGraph('北京预约2026-09-11下午门诊', { consented: false }, 'none', { offline: true });
  assert.match(valid.answer, /2026-09-11/);
  for (const date of ['32月99日', '2026-02-30', '周五和周六']) {
    const run = await runCareFlowLangGraph('北京预约' + date + '下午门诊', { consented: false }, 'none', { offline: true });
    assert.equal(run.status, 'needs-clarification', date);
  }
});

void test('reject unknown, duplicate, missing, mismatched and over-budget tools', () => {
  for (const tools of [['shell.exec'], ['appointment.list_slots', 'appointment.list_slots'], [], ['records.recovery_check'], Array(6).fill('appointment.list_slots')]) {
    assert.throws(() => validateServicePlan(plan(tools), 'appointment'));
  }
  assert.throws(() => validateServicePlan({ ...plan(['appointment.list_slots']), extra: 'untrusted' }, 'appointment'));
  assert.throws(() => validateServicePlan({ ...plan(['human_handoff.create']), needsHumanReview: false }, 'billing'));
});

void test('unsafe fixture plan falls back without executing its disallowed tool', async () => {
  const run = await runCareFlowLangGraph(query, { consented: false }, 'none', { fixturePlanner: async () => plan(['shell.exec']) });
  assert.equal(run.orchestration?.modelMode, 'deterministic-fallback');
  assert.deepEqual(run.orchestration?.executedTools, deterministicPlan('appointment').tools);
  assert.ok(!run.toolCalls.some((call) => call.tool === 'shell.exec'));
});

void test('urgent request bypasses planner and can only create a local handoff draft', async () => {
  let plannerCalls = 0;
  const run = await runCareFlowLangGraph('胸痛、呼吸困难，不要转人工先预约', { consented: false }, 'none', { fixturePlanner: async () => { plannerCalls++; return plan(['appointment.list_slots']); } });
  assert.equal(plannerCalls, 0);
  assert.equal(run.status, 'handoff');
  assert.deepEqual(run.orchestration?.executedTools, ['human_handoff.create']);
  assert.match(run.answer, /不会自动联系/);
});

void test('billing cannot remove mandatory human review', async () => {
  const run = await runCareFlowLangGraph('退款一直没到账，替我处理', { consented: false }, 'none', { fixturePlanner: async () => plan([]) });
  assert.equal(run.status, 'handoff');
  assert.equal(run.orchestration?.modelMode, 'deterministic-fallback');
  assert.deepEqual(run.orchestration?.executedTools, ['human_handoff.create']);
});

void test('current-turn slots work without persistent consent, and preserve requested date', async () => {
  const run = await runCareFlowLangGraph(query, { consented: false, city: '上海', preferredTime: '上午' }, 'none', { offline: true });
  assert.equal(run.status, 'completed');
  assert.match(run.answer, /北京 \/ 周五 \/ 下午/);
  assert.doesNotMatch(run.answer, /下周二|上海/);
  assert.deepEqual(run.memory, { consented: false });
});

void test('missing slots request clarification and never claim booking submission', async () => {
  const run = await runCareFlowLangGraph('帮我预约门诊', { consented: false }, 'none', { offline: true });
  assert.equal(run.status, 'needs-clarification');
  assert.match(run.answer, /没有提交/);
  assert.doesNotMatch(run.answer, /14:30/);
});

void test('tool timeout is retried once and recorded', async () => {
  const run = await runCareFlowLangGraph(query, { consented: false }, 'tool-timeout', { offline: true });
  assert.equal(run.orchestration?.recoveredFailures, 1);
  assert.equal(run.orchestration?.toolOutcomes?.[0].attempts, 2);
});

void test('malformed actual tool result fails closed, not a scoring-only injection', async () => {
  await assert.rejects(runCareFlowLangGraph(query, { consented: false }, 'tool-invalid-output', { offline: true }), /tool_output_rejected/);
});

void test('persistent retrieval failure fails closed', async () => {
  await assert.rejects(runCareFlowLangGraph(query, { consented: false }, 'retrieval-unavailable', { offline: true }), /simulated_retrieval_timeout/);
});

void test('24 existing cases execute through LangGraph offline, with required tools and handoffs', async () => {
  for (const item of careFlowEvalCases) {
    const memory: CareMemory = item.memory || { consented: false };
    const run = await runCareFlowLangGraph(item.query, memory, 'none', { offline: true });
    assert.equal(run.intent, item.expectedIntent, item.id);
    // Verification is now a compulsory graph node, not a model-selected business tool.
    assert.ok(item.requiredTool === 'response.verify_grounding' ? run.orchestration?.executedNodes.includes('verify') : run.toolCalls.some((call) => call.tool === item.requiredTool), item.id);
    assert.equal(run.status === 'handoff', item.expectsHandoff, item.id);
    assert.equal(run.safety.passed, true, item.id);
    assert.equal(run.orchestration?.modelMode, 'deterministic-fallback');
    assert.equal(run.orchestration?.usage, null);
  }
});

void test('mocked API rejection retains attempted-call usage; this is not a live-model evaluation', async (context) => {
  const previousKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = 'test-fixture-not-a-real-key';
  let called = 0;
  context.mock.method(globalThis, 'fetch', async () => {
    called++;
    return Response.json({ id: 'resp_TEST_ONLY', status: 'completed', usage: { input_tokens: 400, output_tokens: 200, total_tokens: 600 }, output: [{ type: 'function_call', name: 'create_service_plan', arguments: JSON.stringify(plan([])) }] });
  });
  try {
    const run = await runCareFlowLangGraph(query, { consented: false });
    assert.equal(called, 1);
    assert.equal(run.orchestration?.modelAttempted, true);
    assert.equal(run.orchestration?.modelMode, 'deterministic-fallback');
    assert.equal(run.orchestration?.usage?.totalTokens, 600);
    assert.equal(run.orchestration?.responseId, 'resp_TEST_ONLY');
    assert.deepEqual(run.orchestration?.executedTools, deterministicPlan('appointment').tools);
  } finally {
    if (previousKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previousKey;
  }
});

void test('mocked successful API plan reaches actual tool dispatcher', async (context) => {
  const previousKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = 'test-fixture-not-a-real-key';
  context.mock.method(globalThis, 'fetch', async () => Response.json({ id: 'resp_TEST_ONLY_SUCCESS', status: 'completed', output: [{ type: 'function_call', name: 'create_service_plan', arguments: JSON.stringify(plan(['appointment.list_slots'])) }] }));
  try {
    const run = await runCareFlowLangGraph(query, { consented: false });
    assert.equal(run.orchestration?.modelMode, 'openai');
    assert.deepEqual(run.orchestration?.executedTools, ['appointment.list_slots']);
    assert.doesNotMatch(run.answer, /资料清单/);
    assert.equal(run.orchestration?.usage, null);
  } finally {
    if (previousKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previousKey;
  }
});
