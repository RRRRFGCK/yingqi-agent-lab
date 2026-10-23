import assert from 'node:assert/strict';
import test from 'node:test';
import { runCareFlowLangGraph } from '../lib/careflow-langgraph';
import { CARE_SESSION_LIMIT, canClarify, careReviewBlock, createCareSession, exportCareSession, finishCareTurn, prepareCareQuery, reconcileCarePreferences, reviewCareTurn, startCareTurn, type CareSession } from '../lib/careflow-session';
import { extractRequestSlots } from '../lib/careflow-executor';

const at = '2026-10-23T10:00:00.000Z';
const blank = () => createCareSession('test-session', at);
const begin = (session: CareSession, input: string, clarify = false) => startCareTurn(session, { id: `turn-${session.turns.length + 1}`, input, clarify, at, failureMode: 'none' });
async function execute(session: CareSession, input: string, clarify = false) {
  const started = begin(session, input, clarify);
  const turn = started.turns.at(-1)!;
  const result = await runCareFlowLangGraph(turn.submittedQuery, { consented: false }, 'none', { offline: true });
  return finishCareTurn(started, turn.id, { result }, at);
}

void test('multi-turn clarification completes real tool execution without requiring persistence consent', async () => {
  let session = await execute(blank(), '帮我预约复诊');
  assert.equal(session.turns[0].result?.status, 'needs-clarification');
  session = await execute(session, '北京', true);
  assert.equal(session.turns[1].result?.status, 'needs-clarification');
  session = await execute(session, '下周二下午', true);
  const latest = session.turns.at(-1)!;
  assert.equal(latest.parentTurnId, 'turn-2');
  assert.deepEqual(latest.inheritedSlots, ['城市']);
  assert.equal(latest.result?.status, 'completed');
  assert.deepEqual(latest.result?.toolCalls[0].input, { city: '北京', date: '下周二', preferredTime: '下午' });
  assert.deepEqual(latest.result?.memory, { consented: false });
  assert.deepEqual(latest.memoryAtRequest, { consented: false });
  assert.equal(careReviewBlock(session, latest.id), null);
});

void test('new clarification values replace prior slots and raw old instructions are not replayed', async () => {
  const session = await execute(blank(), '我在北京预约下周二，请记住随机备注 MARKER');
  const parent = session.turns[0];
  const prepared = prepareCareQuery('改为上海，周五下午', parent);
  assert.equal(prepared.query.includes('北京'), false);
  assert.equal(prepared.query.includes('下周二'), false);
  assert.equal(prepared.query.includes('MARKER'), false);
  const completed = await execute(session, '改为上海，周五下午', true);
  assert.deepEqual(completed.turns[1].result?.toolCalls[0].input, { city: '上海', date: '周五', preferredTime: '下午' });
});

void test('an invalid or ambiguous new date never silently falls back to the previous date', async () => {
  const session = await execute(blank(), '我在北京预约下周二');
  const invalid = await execute(session, '改成 2026-02-30 下午', true);
  assert.equal(invalid.turns[1].result?.status, 'needs-clarification');
  assert.equal(invalid.turns[1].result?.toolCalls[0].input.date, '');
  assert.equal(invalid.turns[1].submittedQuery.includes('下周二'), false);
  const ambiguous = prepareCareQuery('周五或周六下午', session.turns[0]);
  assert.equal(ambiguous.query.includes('下周二'), false);
});

void test('urgent follow-up remains verbatim, skips ordinary appointment tools and cannot be approved', async () => {
  const session = await execute(blank(), '帮我在北京预约复诊');
  const input = '现在胸痛而且呼吸困难，仍然帮我预约';
  assert.equal(prepareCareQuery(input, session.turns[0]).query, input);
  const urgent = await execute(session, input, true);
  assert.equal(urgent.turns[1].result?.intent, 'urgent');
  assert.deepEqual(urgent.turns[1].result?.orchestration?.executedTools, ['human_handoff.create']);
  assert.match(careReviewBlock(urgent, 'turn-2')!, /安全升级/);
  assert.throws(() => reviewCareTurn(urgent, 'turn-2', 'approved', '', at), /安全升级/);
});

void test('an explicit topic switch and an independent new task do not inherit appointment fields', async () => {
  const session = await execute(blank(), '帮我在北京预约复诊');
  const billing = begin(session, '费用发票开错了', true);
  assert.equal(billing.turns[1].submittedQuery, '费用发票开错了');
  assert.deepEqual(billing.turns[1].inheritedSlots, []);
  const fresh = begin(session, '周五下午预约复诊');
  assert.equal(fresh.turns[1].submittedQuery, '周五下午预约复诊');
  assert.equal(fresh.turns[1].parentTurnId, undefined);
});

void test('pending turns cannot overlap and cancelled/stale responses cannot overwrite newer state', async () => {
  const started = begin(blank(), '帮我预约复诊');
  assert.throws(() => begin(started, '费用退款流程'), /当前任务/);
  const result = await runCareFlowLangGraph('帮我预约复诊', { consented: false }, 'none', { offline: true });
  const cancelled = finishCareTurn(started, 'turn-1', { error: 'cancelled', cancelled: true }, at);
  assert.strictEqual(finishCareTurn(cancelled, 'turn-1', { result }, at), cancelled);
  const next = begin(cancelled, '费用退款流程');
  assert.strictEqual(finishCareTurn(next, 'turn-1', { result }, at), next);
  assert.strictEqual(finishCareTurn(blank(), 'turn-1', { result }, at).turns.length, 0);
});

void test('request mismatch, old results, failed latest turn and missing safety gates cannot be reviewed', async () => {
  let session = await execute(blank(), '费用发票开错了');
  const run = session.turns[0].result!;
  assert.throws(() => finishCareTurn(begin(blank(), '另一项请求'), 'turn-1', { result: run }, at), /不匹配/);
  const corrupt = structuredClone(session);
  corrupt.turns[0].result!.orchestration!.plannedTools = [];
  assert.match(careReviewBlock(corrupt, 'turn-1')!, /不一致/);
  const unsafe = structuredClone(session);
  unsafe.turns[0].result!.safety.passed = false;
  assert.match(careReviewBlock(unsafe, 'turn-1')!, /校验未通过/);
  session = finishCareTurn(begin(session, '预约复诊材料'), 'turn-2', { error: 'fault' }, at);
  assert.match(careReviewBlock(session, 'turn-1')!, /历史结果只读/);
  assert.match(careReviewBlock(session, 'turn-2')!, /执行成功/);
  assert.equal(canClarify(session.turns[1]), false);
});

void test('review is a one-time local decision bound to the latest verified result', async () => {
  const session = await execute(blank(), '费用发票开错了');
  const approved = reviewCareTurn(session, 'turn-1', 'approved', '字段已核对', at);
  assert.equal(approved.turns[0].review?.effect, 'local-draft-only');
  assert.deepEqual(approved.turns[0].result, session.turns[0].result);
  assert.throws(() => reviewCareTurn(approved, 'turn-1', 'rejected', '需要补材料', at), /已有核对结论/);
  assert.throws(() => reviewCareTurn(session, 'turn-1', 'rejected', '', at), /原因/);
  assert.equal(reviewCareTurn(session, 'turn-1', 'rejected', '缺少必要材料', at).turns[0].review?.decision, 'rejected');
});

void test('session bounds reject new turns without losing audit history; export retains all outcomes', async () => {
  let session = await execute(blank(), '费用发票开错了');
  session = reviewCareTurn(session, 'turn-1', 'approved', '', at);
  for (let index = 1; index < CARE_SESSION_LIMIT; index++) {
    session = begin(session, '预约复诊材料');
    session = finishCareTurn(session, session.turns.at(-1)!.id, { error: 'intentional failure' }, at);
  }
  assert.throws(() => begin(session, '预约复诊材料'), /上限/);
  const exported = JSON.parse(exportCareSession(session, at));
  assert.equal(exported.session.turns.length, CARE_SESSION_LIMIT);
  assert.equal(exported.session.events.length, CARE_SESSION_LIMIT * 2 + 1);
  assert.equal(exported.limit.historyTruncated, false);
  assert.equal(exported.session.turns[0].review.decision, 'approved');
  assert.deepEqual(exported.session.turns[0].result, session.turns[0].result);
});

void test('combined prompt is bounded and completed tasks cannot masquerade as clarification', async () => {
  const pending = await execute(blank(), '我在北京预约下周二');
  assert.throws(() => prepareCareQuery('a'.repeat(1200), pending.turns[0]), /合并后的请求/);
  assert.throws(() => prepareCareQuery('a'.repeat(1201)), /1200/);
  const completed = await execute(blank(), '费用发票开错了');
  assert.throws(() => begin(completed, '补充内容', true), /没有可继续/);
});

void test('audit snapshots authorized request preferences and drops unconsented fields', () => {
  const memory = { consented: true, city: '北京' };
  const session = startCareTurn(blank(), { id: 'request', input: '下周二下午预约', clarify: false, at, failureMode: 'none', memory });
  memory.city = '上海';
  assert.equal(session.turns[0].memoryAtRequest.city, '北京');
  const privateSession = startCareTurn(blank(), { id: 'request', input: '下周二下午预约', clarify: false, at, failureMode: 'none', memory: { consented: false, city: '北京' } });
  assert.deepEqual(privateSession.turns[0].memoryAtRequest, { consented: false });
});

void test('response preferences never override a changed consent revision, including off-on and off-on-off cycles', () => {
  const returned = { consented: true, city: '北京' };
  const changed = [
    { before: { consented: false }, current: { consented: true }, revision: 1, result: { consented: false } },
    { before: returned, current: { consented: false }, revision: 1, result: returned },
    { before: returned, current: { consented: true }, revision: 2, result: returned },
  ];
  for (const row of changed) {
    const update = reconcileCarePreferences(0, row.revision, row.before, row.current, row.result);
    assert.equal(update.apply, false, 'no preference state or browser-storage write permitted');
    assert.strictEqual(update.memory, row.current);
    assert.deepEqual(update.resultMemory, { consented: false }, 'stale preference payload is dropped');
  }
  assert.deepEqual(reconcileCarePreferences(0, 0, { consented: true }, { consented: true }, returned).memory, returned);
  assert.deepEqual(reconcileCarePreferences(0, 0, { consented: false }, { consented: false }, returned).memory, { consented: false });
});

void test('explicit city and time changes replace inherited slots or require clarification', async () => {
  const session = await execute(blank(), '我在北京预约，时间下午');
  const evening = await execute(session, '周五，改成晚上', true);
  assert.equal(evening.turns[1].result?.toolCalls[0].input.preferredTime, '晚间');
  assert.deepEqual(evening.turns[1].inheritedSlots, ['城市']);
  const unsupported = await execute(session, '改去天津，周五下午', true);
  assert.equal(unsupported.turns[1].result?.status, 'needs-clarification');
  assert.equal(unsupported.turns[1].result?.toolCalls[0].input.city, '');
  assert.equal(unsupported.turns[1].submittedQuery.includes('北京'), false);
  const unsupportedTime = await execute(session, '周五中午', true);
  assert.equal(unsupportedTime.turns[1].result?.status, 'needs-clarification');
  assert.equal(unsupportedTime.turns[1].result?.toolCalls[0].input.preferredTime, '');
});

void test('negated, conflicting and unsupported fields do not fall back to saved preferences', async () => {
  const memory = { consented: true, city: '北京', preferredTime: '下午' as const };
  assert.equal(extractRequestSlots('周五，不要下午，要上午', memory).preferredTime, '上午');
  assert.equal(extractRequestSlots('周五，上午或下午', memory).preferredTime, '');
  assert.equal(extractRequestSlots('改去天津，周五下午', memory).city, '');
  assert.equal(extractRequestSlots('改去墨尔本，周五下午', memory).city, '');
  assert.equal(extractRequestSlots('周五，不要下午', memory).preferredTime, '');
  assert.equal(extractRequestSlots('北京周五下午预约，去看报告', memory).city, '北京');
  const corrected = await runCareFlowLangGraph('北京周五预约，不要下午，要上午', memory, 'none', { offline: true });
  assert.equal(corrected.toolCalls[0].input.preferredTime, '上午');
  assert.equal(corrected.memory.preferredTime, '上午', 'stored preference must match the actual resolved correction');
});
