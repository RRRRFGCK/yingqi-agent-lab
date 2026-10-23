import { classifyCareIntent, type CareFlowRun, type CareMemory } from './careflow-agent';
import { extractRequestSlotSignals } from './careflow-executor';

export const CARE_SESSION_LIMIT = 12;
export const CARE_QUERY_LIMIT = 1200;
export type CareSessionTurn = {
  id: string;
  input: string;
  submittedQuery: string;
  parentTurnId?: string;
  inheritedSlots: string[];
  memoryAtRequest: CareMemory;
  failureMode: string;
  startedAt: string;
  completedAt?: string;
  status: 'running' | 'succeeded' | 'failed' | 'cancelled';
  result?: CareFlowRun;
  error?: string;
  review?: { decision: 'approved' | 'rejected'; note: string; at: string; effect: 'local-draft-only' };
};
export type CareSession = {
  version: 1;
  id: string;
  createdAt: string;
  turns: CareSessionTurn[];
  events: Array<{ at: string; kind: 'started' | 'succeeded' | 'failed' | 'cancelled' | 'approved' | 'rejected'; turnId: string }>;
};

export function createCareSession(id: string, at: string): CareSession {
  return { version: 1, id, createdAt: at, turns: [], events: [] };
}

/** A response may update preferences only under the exact authorization revision it started with. */
export function reconcileCarePreferences(requestRevision: number, currentRevision: number, memoryAtRequest: CareMemory, currentMemory: CareMemory, returnedMemory: CareMemory) {
  if (requestRevision !== currentRevision) {
    return { apply: false as const, memory: currentMemory, resultMemory: { consented: false } as CareMemory };
  }
  const memory = memoryAtRequest.consented && currentMemory.consented ? returnedMemory : { consented: false };
  return { apply: true as const, memory, resultMemory: memory };
}

export function canClarify(turn?: CareSessionTurn): boolean {
  return !!turn && turn.status === 'succeeded' && !!turn.result?.orchestration && turn.result.safety.passed && turn.result.status === 'needs-clarification';
}

/** Only carry structured task slots from the latest actual tool result, never previous instructions. */
export function prepareCareQuery(input: string, parent?: CareSessionTurn) {
  const normalized = input.trim();
  if (!normalized || normalized.length > CARE_QUERY_LIMIT) throw new Error('请输入 1–1200 字；新任务至少需要 4 字。');
  if (parent && !canClarify(parent)) throw new Error('只有最新成功运行的待补充任务可以继续澄清。');
  const nextIntent = classifyCareIntent(normalized);
  const inheritedSlots: string[] = [];
  let query = normalized;
  // A new explicit topic or risk signal goes through routing verbatim, without inherited appointment context.
  if (parent?.result?.intent === 'appointment' && ['appointment', 'unknown'].includes(nextIntent)) {
    const prior = parent.result.toolCalls.find((call) => call.tool === 'appointment.list_slots' && call.status === 'ok')?.input;
    const fresh = extractRequestSlotSignals(normalized);
    const additions: string[] = [];
    if (!fresh.mentioned.city && typeof prior?.city === 'string' && prior.city) { additions.push(`城市：${prior.city}`); inheritedSlots.push('城市'); }
    if (!fresh.mentioned.date && typeof prior?.date === 'string' && prior.date) { additions.push(`期望日期：${prior.date}`); inheritedSlots.push('期望日期'); }
    if (!fresh.mentioned.preferredTime && typeof prior?.preferredTime === 'string' && prior.preferredTime) { additions.push(`时间段：${prior.preferredTime}`); inheritedSlots.push('时间段'); }
    query = `预约协助。${additions.length ? additions.join('；') + '。' : ''}本轮补充：${normalized}`;
  }
  if (query.length < 4 || query.length > CARE_QUERY_LIMIT) throw new Error('合并后的请求需为 4–1200 字，请缩短输入或开始独立任务。');
  return { query, inheritedSlots };
}

export function startCareTurn(session: CareSession, options: { id: string; input: string; clarify: boolean; at: string; failureMode: string; memory?: CareMemory }): CareSession {
  if (session.turns.some((turn) => turn.status === 'running')) throw new Error('请等待当前任务结束，或先取消本轮。');
  if (session.turns.length >= CARE_SESSION_LIMIT) throw new Error('本次会话已达到 12 轮上限。请先导出记录，再清空会话开始新任务。');
  if (session.turns.some((turn) => turn.id === options.id)) throw new Error('重复的任务编号。');
  const parent = options.clarify ? session.turns.at(-1) : undefined;
  if (options.clarify && !canClarify(parent)) throw new Error('当前没有可继续的澄清任务。');
  const prepared = prepareCareQuery(options.input, parent);
  const turn: CareSessionTurn = {
    id: options.id, input: options.input.trim(), submittedQuery: prepared.query,
    parentTurnId: parent?.id, inheritedSlots: prepared.inheritedSlots,
    memoryAtRequest: options.memory?.consented ? { ...options.memory } : { consented: false },
    failureMode: options.failureMode, startedAt: options.at, status: 'running',
  };
  return { ...session, turns: [...session.turns, turn], events: [...session.events, { at: options.at, kind: 'started', turnId: turn.id }] };
}

export function finishCareTurn(session: CareSession, turnId: string, outcome: { result: CareFlowRun } | { error: string; cancelled?: boolean }, at: string): CareSession {
  const pending = session.turns.at(-1);
  // A cancelled/reset/replaced request can never overwrite a newer result.
  if (!pending || pending.id !== turnId || pending.status !== 'running') return session;
  if ('result' in outcome && outcome.result.query !== pending.submittedQuery) throw new Error('执行结果与本轮请求不匹配。');
  const kind = 'result' in outcome ? 'succeeded' : outcome.cancelled ? 'cancelled' : 'failed';
  const next: CareSessionTurn = { ...pending, status: kind, completedAt: at, ...('result' in outcome ? { result: outcome.result } : { error: outcome.error }) };
  return { ...session, turns: [...session.turns.slice(0, -1), next], events: [...session.events, { at, kind, turnId }] };
}

export function careReviewBlock(session: CareSession, turnId?: string): string | null {
  const latest = session.turns.at(-1);
  if (!latest || latest.id !== turnId) return '历史结果只读；仅可核对最新一轮草稿。';
  const run = latest.result;
  if (latest.status !== 'succeeded' || !run?.orchestration) return '本轮执行成功后才可核对草稿。';
  if (run.intent === 'urgent') return '安全升级不可由本地核对解除；请直接联系当地急救或现场专业人员。';
  if (run.status === 'needs-clarification') return '请先补齐必要信息并重新运行。';
  if (!run.safety.passed || !run.citations.length || run.toolCalls.some((call) => call.status !== 'ok') || !run.trace.some((step) => step.id === 'verify' && step.status === 'done')) return '安全或来源校验未通过，草稿不可确认。';
  const actual = run.toolCalls.map((call) => call.tool);
  if (!actual.length || JSON.stringify(actual) !== JSON.stringify(run.orchestration.executedTools) || JSON.stringify(actual) !== JSON.stringify(run.orchestration.plannedTools)) return '实际工具与计划不一致，草稿不可确认。';
  if (latest.review) return '此草稿已有核对结论；修改需求后请开始新任务。';
  return null;
}

export function reviewCareTurn(session: CareSession, turnId: string, decision: 'approved' | 'rejected', note: string, at: string): CareSession {
  const blocked = careReviewBlock(session, turnId);
  if (blocked) throw new Error(blocked);
  if (note.trim().length > 240 || (decision === 'rejected' && note.trim().length < 4)) throw new Error('退回请填写 4–240 字原因。');
  const turns = session.turns.map((turn) => turn.id === turnId ? { ...turn, review: { decision, note: note.trim(), at, effect: 'local-draft-only' as const } } : turn);
  return { ...session, turns, events: [...session.events, { at, kind: decision, turnId }] };
}

export function exportCareSession(session: CareSession, at: string) {
  return JSON.stringify({
    format: 'careflow-session-audit/v1', exportedAt: at,
    scope: '本地演示会话；核对只修改本地草稿状态。没有联系机构、读取病历、预约或发送信息。',
    retention: '会话默认只在页面内存中；本文件由用户主动导出，包含原始输入和完整执行结果。',
    limit: { maxTurns: CARE_SESSION_LIMIT, maxSubmittedQueryCharacters: CARE_QUERY_LIMIT, historyTruncated: false },
    session,
  }, null, 2);
}
