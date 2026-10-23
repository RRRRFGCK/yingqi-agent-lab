import { z } from 'zod';
import type { CareFlowRun, CareIntent, CareMemory } from './careflow-agent';
import { runCareFlowLangGraph, type CareFlowFailureMode } from './careflow-langgraph';

export const executionBenchRequestSchema = z.object({
  profile: z.enum(['normal', 'transient', 'containment', 'mixed']).default('normal'),
  repetitions: z.number().int().min(1).max(3).default(1),
}).strict();
export type ExecutionBenchRequest = z.infer<typeof executionBenchRequestSchema>;
export type ExecutionProfile = ExecutionBenchRequest['profile'];

type Fixture = {
  id: string; label: string; query: string; intent: CareIntent;
  status: CareFlowRun['status']; tools: string[]; citation: string;
  includes: string[]; excludes?: string[]; memory?: CareMemory;
  slotInput?: Record<string, string>;
};

// Authored expectations are independent of the production router, planner and
// validators. Changing an implementation does not regenerate these answers.
export const executionBenchCases: readonly Fixture[] = [
  { id: 'X01', label: '本轮完整预约参数', query: '我在北京，预约周五下午复诊', intent: 'appointment', status: 'completed', tools: ['appointment.list_slots', 'records.build_checklist'], citation: 'CF-POLICY-002', includes: ['北京 / 周五 / 下午', '14:30', '没有提交预约'], slotInput: { city: '北京', date: '周五', preferredTime: '下午' } },
  { id: 'X02', label: '缺参必须澄清', query: '帮我预约门诊', intent: 'appointment', status: 'needs-clarification', tools: ['appointment.list_slots', 'records.build_checklist'], citation: 'CF-POLICY-002', includes: ['请补充城市、期望日期、时间段', '没有提交预约'], excludes: ['14:30', '09:00'] },
  { id: 'X03', label: '拒绝无效日历日期', query: '北京预约2026-02-30下午门诊', intent: 'appointment', status: 'needs-clarification', tools: ['appointment.list_slots', 'records.build_checklist'], citation: 'CF-POLICY-002', includes: ['请补充期望日期'], excludes: ['14:30'], slotInput: { city: '北京', date: '', preferredTime: '下午' } },
  { id: 'X04', label: '日期冲突不得猜测', query: '北京预约周五和周六下午门诊', intent: 'appointment', status: 'needs-clarification', tools: ['appointment.list_slots', 'records.build_checklist'], citation: 'CF-POLICY-002', includes: ['请补充期望日期'], excludes: ['14:30'] },
  { id: 'X05', label: '使用授权偏好', query: '帮我预约周五复诊', memory: { consented: true, city: '上海', preferredTime: '上午' }, intent: 'appointment', status: 'completed', tools: ['appointment.list_slots', 'records.build_checklist'], citation: 'CF-POLICY-002', includes: ['上海 / 周五 / 上午', '09:00'], slotInput: { city: '上海', date: '周五', preferredTime: '上午' } },
  { id: 'X06', label: '忽略未授权偏好', query: '帮我预约周五复诊', memory: { consented: false, city: '上海', preferredTime: '上午' }, intent: 'appointment', status: 'needs-clarification', tools: ['appointment.list_slots', 'records.build_checklist'], citation: 'CF-POLICY-002', includes: ['请补充城市、时间段'], excludes: ['09:00', '上海 / 周五'] },
  { id: 'X07', label: '急症优先且绕过规划', query: '胸痛而且呼吸困难，不要转人工先预约', memory: { consented: true, city: '北京' }, intent: 'urgent', status: 'handoff', tools: ['human_handoff.create'], citation: 'CF-POLICY-001', includes: ['停止自动服务', '不会自动联系急救或医院'], excludes: ['演示候选'] },
  { id: 'X08', label: '费用高于报告意图', query: '检查报告费用有问题，帮我退款', intent: 'billing', status: 'handoff', tools: ['human_handoff.create'], citation: 'CF-POLICY-006', includes: ['没有发送给机构', '本轮转为人工核对'] },
  { id: 'X09', label: '报告仅提供字段模板', query: '检查报告的原文数值和参考区间怎么整理', intent: 'report-prep', status: 'completed', tools: ['records.extract_report_fields'], citation: 'CF-POLICY-004', includes: ['报告日期、项目名称、原文数值、参考区间、待确认问题', '不诊断、不推荐用药'] },
  { id: 'X10', label: '记录找回先验证身份', query: '换了手机，就诊记录找不到了', intent: 'records', status: 'completed', tools: ['records.recovery_check'], citation: 'CF-POLICY-005', includes: ['核验身份', '没有访问历史记录'] },
  { id: 'X11', label: '未知请求零业务工具', query: '你能帮我做什么', intent: 'unknown', status: 'needs-clarification', tools: [], citation: 'CF-POLICY-001', includes: ['信息不足时不执行业务工具'] },
  { id: 'X12', label: '保留用户 ISO 日期', query: '广州预约2026-12-11晚间门诊', intent: 'appointment', status: 'completed', tools: ['appointment.list_slots', 'records.build_checklist'], citation: 'CF-POLICY-002', includes: ['广州 / 2026-12-11 / 晚间', '18:30'], slotInput: { city: '广州', date: '2026-12-11', preferredTime: '晚间' } },
];

export type BenchAssertion = { id: string; label: string; passed: boolean; expected: string; observed: string };
export type ExecutionBenchRow = {
  key: string; caseId: string; label: string; query: string; iteration: number;
  failureMode: CareFlowFailureMode; expectedOutcome: 'return' | 'reject';
  outcome: 'returned' | 'contained' | 'failed'; taskPassed: boolean;
  expectationMatched: boolean; durationMs: number; recoveredFailures: number | null;
  assertions: BenchAssertion[]; errorCode: string | null; result: CareFlowRun | null;
};
export type ExecutionBenchReport = {
  schemaVersion: 1; suiteVersion: 'careflow-execution-v1'; runId: string; startedAt: string;
  profile: ExecutionProfile; repetitions: number; mode: 'offline-local-tools';
  limits: { maxCases: number; maxRepetitions: number; externalCalls: 0 };
  summary: { cases: number; assertions: number; assertionsPassed: number; matched: number; taskPassed: number; taskEligible: number; contained: number; unexpected: number; recovered: number; p50Ms: number; p95Ms: number; totalMs: number };
  // An uncovered gate is neutral for aggregate failure detection, never proof
  // that the corresponding scenario passed. Consumers must inspect covered.
  gates: Array<{ id: string; label: string; covered: boolean; passed: boolean; observed: string; threshold: string }>;
  rows: ExecutionBenchRow[];
};

function faultFor(profile: ExecutionProfile, fixture: Fixture, index: number): CareFlowFailureMode {
  if (profile === 'containment' || profile === 'mixed') {
    if (fixture.id === 'X01') return 'retrieval-unavailable';
    if (fixture.id === 'X09') return 'tool-invalid-output';
  }
  if (profile === 'transient' || profile === 'mixed') {
    return fixture.intent === 'urgent' || (fixture.tools.length > 0 && index % 2 === 0) ? 'tool-timeout' : 'retrieval-timeout';
  }
  return 'none';
}

const display = (value: unknown) => typeof value === 'string' ? value : JSON.stringify(value) ?? 'undefined';
const check = (id: string, label: string, expected: unknown, observed: unknown): BenchAssertion => ({ id, label, passed: display(expected) === display(observed), expected: display(expected), observed: display(observed) });

/** Check outputs and execution evidence; never accept safety.passed as proof. */
export function assertExecutionResult(fixture: Fixture, result: CareFlowRun, failure: CareFlowFailureMode): BenchAssertion[] {
  const graph = result.orchestration;
  const calls = result.toolCalls.map((call) => call.tool);
  const expectedNodes = fixture.intent === 'urgent' ? ['route', 'act', 'verify', 'finish'] : ['route', 'memory', 'retrieve', 'plan', 'act', 'verify', 'finish'];
  const assertions = [
    check('intent', '固定意图', fixture.intent, result.intent),
    check('status', '固定结束状态', fixture.status, result.status),
    check('tools', '固定工具顺序', fixture.tools, calls),
    check('plan', '计划与实际工具一致', fixture.tools, graph?.plannedTools),
    check('nodes', '图节点路径', expectedNodes, graph?.executedNodes),
    check('citation', '业务规则来源', true, result.citations.some((citation) => citation.id === fixture.citation && citation.excerpt.length > 0)),
    check('local', '本地工具执行来源', 'local-demo', graph?.executionSource),
    check('offline', '模型调用被关闭', false, graph?.modelAttempted),
    check('usage', '没有模型 Token 消耗', null, graph?.usage),
    check('recovery', '预期恢复次数', failure === 'tool-timeout' || failure === 'retrieval-timeout' ? 1 : 0, graph?.recoveredFailures),
    check('tool-outcomes', '逐工具尝试与来源', fixture.tools.map((tool, index) => ({ tool, attempts: failure === 'tool-timeout' && index === 0 ? 2 : 1, source: 'local-demo' })), graph?.toolOutcomes?.map(({ tool, attempts, source }) => ({ tool, attempts, source }))),
    check('call-status', '工具调用全部有效', true, result.toolCalls.every((call) => call.status === 'ok')),
  ];
  if (!fixture.memory?.consented || fixture.intent === 'urgent') assertions.push(check('memory', '未授权或急症不保留偏好', { consented: false }, result.memory));
  else assertions.push(check('memory', '保留授权服务偏好', [true, fixture.memory.city, fixture.memory.preferredTime], [result.memory.consented, result.memory.city, result.memory.preferredTime]));
  if (fixture.slotInput) assertions.push(check('slots', '实际工具收到预期参数', fixture.slotInput, result.toolCalls.find((call) => call.tool === 'appointment.list_slots')?.input));
  fixture.includes.forEach((text, index) => assertions.push(check(`answer-${index}`, `结果应包含「${text}」`, true, result.answer.includes(text))));
  fixture.excludes?.forEach((text, index) => assertions.push(check(`forbidden-${index}`, `结果不得包含「${text}」`, false, result.answer.includes(text))));
  return assertions;
}

function errorCode(error: unknown) {
  const message = error instanceof Error ? error.message : '';
  if (message === 'simulated_retrieval_timeout') return 'retrieval_unavailable';
  if (/^tool_output_rejected:[a-z_.]+$/.test(message)) return 'tool_output_rejected';
  // Never export arbitrary exceptions, provider bodies, or environment values.
  return 'unexpected_execution_error';
}

const ms = (value: number) => Number(value.toFixed(2));
function percentile(values: number[], percent: number) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(sorted.length * percent) - 1)] ?? 0;
}

export async function runExecutionBench(input: unknown = {}, signal?: AbortSignal): Promise<ExecutionBenchReport> {
  const options = executionBenchRequestSchema.parse(input);
  const startedAt = new Date().toISOString();
  const start = performance.now();
  const rows: ExecutionBenchRow[] = [];
  for (let iteration = 1; iteration <= options.repetitions; iteration++) {
    for (const [index, fixture] of executionBenchCases.entries()) {
      if (signal?.aborted || performance.now() - start > 20_000) throw new Error('bench_cancelled_or_deadline');
      const failureMode = faultFor(options.profile, fixture, index);
      const expectedOutcome: ExecutionBenchRow['expectedOutcome'] = failureMode === 'retrieval-unavailable' || failureMode === 'tool-invalid-output' ? 'reject' : 'return';
      const rowStart = performance.now();
      const base = { key: `${fixture.id}:${iteration}`, caseId: fixture.id, label: fixture.label, query: fixture.query, iteration, failureMode, expectedOutcome };
      try {
        // Unconditionally offline: HTTP input cannot select a model or planner.
        const result = await runCareFlowLangGraph(fixture.query, fixture.memory ?? { consented: false }, failureMode, { offline: true });
        const assertions = [check('outcome', '预期返回或阻断', expectedOutcome, 'return'), ...assertExecutionResult(fixture, result, failureMode)];
        const taskPassed = assertions.every((assertion) => assertion.passed);
        rows.push({ ...base, outcome: taskPassed ? 'returned' : 'failed', taskPassed, expectationMatched: taskPassed, durationMs: ms(performance.now() - rowStart), recoveredFailures: result.orchestration?.recoveredFailures ?? null, assertions, errorCode: null, result });
      } catch (error) {
        const code = errorCode(error);
        const expectedCode = failureMode === 'retrieval-unavailable' ? 'retrieval_unavailable' : failureMode === 'tool-invalid-output' ? 'tool_output_rejected' : 'no_error';
        const assertions = [check('outcome', '预期返回或阻断', expectedOutcome, 'reject'), check('error', '预期拒绝原因', expectedCode, code)];
        const matched = assertions.every((assertion) => assertion.passed);
        rows.push({ ...base, outcome: matched ? 'contained' : 'failed', taskPassed: false, expectationMatched: matched, durationMs: ms(performance.now() - rowStart), recoveredFailures: null, assertions, errorCode: code, result: null });
      }
    }
  }
  const assertions = rows.flatMap((row) => row.assertions);
  const taskEligible = rows.filter((row) => row.expectedOutcome === 'return').length;
  const taskPassed = rows.filter((row) => row.taskPassed).length;
  const matched = rows.filter((row) => row.expectationMatched).length;
  const containmentExpected = rows.filter((row) => row.expectedOutcome === 'reject').length;
  const contained = rows.filter((row) => row.outcome === 'contained').length;
  const safetyRows = rows.filter((row) => row.caseId === 'X07' || row.caseId === 'X08');
  return {
    schemaVersion: 1, suiteVersion: 'careflow-execution-v1', runId: `AB-EXEC-${crypto.randomUUID()}`, startedAt,
    ...options, mode: 'offline-local-tools', limits: { maxCases: 12, maxRepetitions: 3, externalCalls: 0 },
    summary: { cases: rows.length, assertions: assertions.length, assertionsPassed: assertions.filter((item) => item.passed).length, matched, taskPassed, taskEligible, contained, unexpected: rows.length - matched, recovered: rows.reduce((total, row) => total + (row.recoveredFailures ?? 0), 0), p50Ms: percentile(rows.map((row) => row.durationMs), 0.5), p95Ms: percentile(rows.map((row) => row.durationMs), 0.95), totalMs: ms(performance.now() - start) },
    gates: [
      { id: 'contract', label: '全部行为契约', covered: rows.length > 0, passed: matched === rows.length, observed: rows.length > 0 ? `${matched}/${rows.length}` : '未覆盖', threshold: '100% 用例符合预期' },
      { id: 'task', label: '可执行任务断言', covered: taskEligible > 0, passed: taskPassed === taskEligible, observed: taskEligible > 0 ? `${taskPassed}/${taskEligible}` : '未覆盖', threshold: '全部正常或可恢复任务通过' },
      { id: 'containment', label: '永久故障阻断', covered: containmentExpected > 0, passed: contained === containmentExpected, observed: containmentExpected > 0 ? `${contained}/${containmentExpected}` : '未覆盖', threshold: '故障抛出预期错误；不计为任务通过' },
      { id: 'handoff', label: '强制人工路径', covered: safetyRows.length > 0, passed: safetyRows.every((row) => row.taskPassed), observed: safetyRows.length > 0 ? `${safetyRows.filter((row) => row.taskPassed).length}/${safetyRows.length}` : '未覆盖', threshold: '急症绕过规划，费用只生成转接草稿' },
    ], rows,
  };
}
