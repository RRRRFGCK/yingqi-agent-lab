import assert from 'node:assert/strict';
import test from 'node:test';
import { POST } from '../app/api/agentbench/run/route';
import { assertExecutionResult, executionBenchCases, executionBenchRequestSchema, runExecutionBench, type ExecutionBenchReport } from '../lib/agentbench-execution';

void test('offline normal suite checks independently authored outputs, boundaries and measured durations', async (context) => {
  const previousKey = process.env.OPENAI_API_KEY;
  const previousLive = process.env.CAREFLOW_LIVE_ENABLED;
  process.env.OPENAI_API_KEY = 'test-only-no-real-key';
  process.env.CAREFLOW_LIVE_ENABLED = 'true';
  let externalCalls = 0;
  context.mock.method(globalThis, 'fetch', async () => { externalCalls++; throw new Error('network_must_not_run'); });
  try {
    const report = await runExecutionBench({ profile: 'normal' });
    assert.equal(externalCalls, 0);
    assert.equal(report.mode, 'offline-local-tools');
    assert.equal(report.suiteVersion, 'careflow-execution-v1');
    assert.equal(report.summary.cases, 12);
    assert.equal(report.summary.taskPassed, 12);
    assert.equal(report.summary.matched, 12);
    assert.equal(report.summary.recovered, 0);
    assert.equal(report.summary.contained, 0);
    assert.equal(report.summary.unexpected, 0);
    assert.ok(report.gates.every((gate) => gate.passed));
    assert.deepEqual(report.gates.filter((gate) => !gate.covered).map((gate) => [gate.id, gate.observed]), [['containment', '未覆盖']]);
    assert.ok(report.gates.filter((gate) => gate.id !== 'containment').every((gate) => gate.covered));
    assert.ok(report.summary.assertions > 150);
    assert.equal(report.summary.assertionsPassed, report.summary.assertions);
    const [complete, missing, invalid, conflict, consented, declined, urgent, billing] = report.rows;
    assert.equal(complete.result?.status, 'completed');
    assert.deepEqual(complete.result?.toolCalls[0].input, { city: '北京', date: '周五', preferredTime: '下午' });
    assert.match(complete.result?.answer ?? '', /北京 \/ 周五 \/ 下午/);
    for (const row of [missing, invalid, conflict, declined]) assert.equal(row.result?.status, 'needs-clarification', row.caseId);
    assert.match(consented.result?.answer ?? '', /上海 \/ 周五 \/ 上午/);
    assert.deepEqual(declined.result?.memory, { consented: false });
    assert.deepEqual(urgent.result?.orchestration?.executedNodes, ['route', 'act', 'verify', 'finish']);
    assert.equal(urgent.result?.status, 'handoff');
    assert.equal(billing.result?.intent, 'billing');
    assert.deepEqual(billing.result?.toolCalls.map((call) => call.tool), ['human_handoff.create']);
    const observed = report.rows.map((row) => row.durationMs).sort((a, b) => a - b);
    assert.equal(report.summary.p50Ms, observed[5]);
    assert.equal(report.summary.p95Ms, observed[11]);
    assert.ok(report.summary.totalMs >= Math.max(...observed));
    assert.ok(observed.every((duration) => Number.isFinite(duration) && duration > 0));

    // The evaluator must notice a regression even if the graph claims safety.
    const corrupted = structuredClone(complete.result!);
    corrupted.safety.passed = true;
    corrupted.status = 'handoff';
    corrupted.answer = '上海 / 周六 / 上午：已完成预约';
    corrupted.toolCalls[0].input.date = '周六';
    corrupted.citations = [];
    const checks = assertExecutionResult(executionBenchCases[0], corrupted, 'none');
    for (const id of ['status', 'citation', 'slots', 'answer-0']) assert.equal(checks.find((item) => item.id === id)?.passed, false, id);
  } finally {
    if (previousKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previousKey;
    if (previousLive === undefined) delete process.env.CAREFLOW_LIVE_ENABLED;
    else process.env.CAREFLOW_LIVE_ENABLED = previousLive;
  }
});

void test('transient faults really retry and preserve task output including urgent bypass', async () => {
  const report = await runExecutionBench({ profile: 'transient' });
  assert.equal(report.summary.taskPassed, 12);
  assert.equal(report.summary.recovered, 12);
  assert.equal(report.summary.unexpected, 0);
  assert.equal(report.gates.find((gate) => gate.id === 'containment')?.covered, false);
  assert.equal(report.gates.find((gate) => gate.id === 'containment')?.observed, '未覆盖');
  assert.ok(report.rows.every((row) => row.recoveredFailures === 1));
  for (const row of report.rows) {
    if (row.failureMode === 'tool-timeout') {
      assert.equal(row.result?.orchestration?.toolOutcomes?.[0].attempts, 2);
      assert.ok(row.result?.orchestration?.toolOutcomes?.slice(1).every((outcome) => outcome.attempts === 1));
    } else {
      assert.equal(row.failureMode, 'retrieval-timeout');
      assert.match(row.result?.trace.find((step) => step.id === 'retrieve')?.detail ?? '', /重试恢复/);
    }
  }
  assert.deepEqual(report.rows.find((row) => row.caseId === 'X07')?.result?.orchestration?.executedNodes, ['route', 'act', 'verify', 'finish']);
});

void test('permanent injected failures count as containment but never task success or recovery', async () => {
  const report = await runExecutionBench({ profile: 'containment' });
  assert.equal(report.summary.cases, 12);
  assert.equal(report.summary.matched, 12);
  assert.equal(report.summary.taskPassed, 10);
  assert.equal(report.summary.taskEligible, 10);
  assert.equal(report.summary.contained, 2);
  assert.equal(report.summary.recovered, 0);
  assert.ok(report.gates.every((gate) => gate.covered));
  assert.equal(report.gates.find((gate) => gate.id === 'containment')?.observed, '2/2');
  const blocked = report.rows.filter((row) => row.outcome === 'contained');
  assert.deepEqual(blocked.map((row) => [row.caseId, row.errorCode]), [['X01', 'retrieval_unavailable'], ['X09', 'tool_output_rejected']]);
  for (const row of blocked) {
    assert.equal(row.taskPassed, false);
    assert.equal(row.expectationMatched, true);
    assert.equal(row.result, null);
    assert.equal(row.recoveredFailures, null, 'failed graph does not expose reliable partial retry evidence');
    assert.ok(row.durationMs > 0);
  }
  assert.ok(report.gates.every((gate) => gate.passed));
});

void test('mixed run separates recovered tasks, contained errors and total outcomes', async () => {
  const report = await runExecutionBench({ profile: 'mixed' });
  assert.equal(report.summary.taskPassed, 10);
  assert.equal(report.summary.recovered, 10);
  assert.equal(report.summary.contained, 2);
  assert.equal(report.summary.matched, 12);
  assert.ok(report.gates.every((gate) => gate.covered));
  assert.equal(report.summary.unexpected, 0);
  assert.equal(report.rows.filter((row) => row.result !== null).length, 10);
});

void test('repetition budget and case identities remain stable for comparison', async () => {
  const report = await runExecutionBench({ repetitions: 2 });
  assert.equal(report.summary.cases, 24);
  assert.equal(new Set(report.rows.map((row) => row.key)).size, 24);
  assert.deepEqual(report.rows.slice(0, 12).map((row) => row.caseId), report.rows.slice(12).map((row) => row.caseId));
  assert.equal(report.rows[12].key, 'X01:2');
  assert.equal(report.summary.taskPassed, 24);
  assert.equal(report.limits.externalCalls, 0);
});

void test('strict request schema rejects arbitrary prompts, model options, unknown faults and excessive work', async () => {
  for (const input of [null, [], { repetitions: 0 }, { repetitions: 4 }, { repetitions: 1.5 }, { repetitions: '2' }, { profile: 'live' }, { query: 'custom user input' }, { offline: false }, { fixturePlanner: 'unsafe' }, { model: 'custom' }]) {
    assert.equal(executionBenchRequestSchema.safeParse(input).success, false, JSON.stringify(input));
  }
  assert.deepEqual(executionBenchRequestSchema.parse({}), { profile: 'normal', repetitions: 1 });
  assert.equal(executionBenchRequestSchema.parse({ repetitions: 3 }).repetitions, 3);
  await assert.rejects(runExecutionBench({ repetitions: 4 }));
  const abort = new AbortController();
  abort.abort();
  await assert.rejects(runExecutionBench({}, abort.signal), /bench_cancelled_or_deadline/);
});

void test('HTTP endpoint validates JSON and bounded body, and always returns offline evidence', async () => {
  const request = (body: string) => new Request('http://localhost/api/agentbench/run', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
  assert.equal((await POST(request('{bad json'))).status, 400);
  assert.equal((await POST(request('null'))).status, 400);
  assert.equal((await POST(request(JSON.stringify({ profile: 'normal', model: 'untrusted' })))).status, 400);
  assert.equal((await POST(request(JSON.stringify({ repetitions: 100 })))).status, 400);
  assert.equal((await POST(request(' '.repeat(1025)))).status, 413);
  const response = await POST(request('{}'));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  const { result } = await response.json() as { result: ExecutionBenchReport };
  assert.equal(result.mode, 'offline-local-tools');
  assert.equal(result.summary.cases, 12);
  assert.equal(result.summary.taskPassed, 12);
  assert.equal(result.summary.unexpected, 0);
});
