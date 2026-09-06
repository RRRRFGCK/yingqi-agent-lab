import { z } from 'zod';
import type { CareCitation, CareFlowRun, CareIntent, CareMemory, CareToolCall } from './careflow-agent';

export const businessTools = ['appointment.list_slots', 'records.build_checklist', 'records.extract_report_fields', 'records.recovery_check', 'human_handoff.create'] as const;
export type CareBusinessTool = typeof businessTools[number];
export const servicePlanSchema = z.object({
  objective: z.string().min(2).max(80),
  tools: z.array(z.enum(businessTools)).max(5),
  needsHumanReview: z.boolean(),
  rationale: z.string().min(8).max(240),
}).strict();
export type ServicePlan = z.infer<typeof servicePlanSchema>;
export type CareRequestSlots = { city: string; date: string; preferredTime: string };
export type ToolFailure = 'none' | 'tool-timeout' | 'tool-invalid-output';

const allowedTools: Record<CareIntent, readonly CareBusinessTool[]> = {
  appointment: ['appointment.list_slots', 'records.build_checklist', 'human_handoff.create'],
  records: ['records.recovery_check', 'records.build_checklist', 'human_handoff.create'],
  'report-prep': ['records.extract_report_fields', 'records.build_checklist', 'human_handoff.create'],
  billing: ['human_handoff.create'], urgent: ['human_handoff.create'], unknown: [],
};
const requiredTools: Record<CareIntent, readonly CareBusinessTool[]> = {
  appointment: ['appointment.list_slots'], records: ['records.recovery_check'],
  'report-prep': ['records.extract_report_fields'], billing: ['human_handoff.create'], urgent: ['human_handoff.create'], unknown: [],
};

export function validateServicePlan(value: unknown, intent: CareIntent): ServicePlan {
  const plan = servicePlanSchema.parse(value);
  if (new Set(plan.tools).size !== plan.tools.length) throw new Error('duplicate tools');
  if (plan.tools.some((name) => !allowedTools[intent].includes(name))) throw new Error('tool outside intent allowlist');
  if (requiredTools[intent].some((name) => !plan.tools.includes(name))) throw new Error('missing required tool');
  if (plan.needsHumanReview !== plan.tools.includes('human_handoff.create')) throw new Error('human gate mismatch');
  if (plan.tools.includes('human_handoff.create') && plan.tools.at(-1) !== 'human_handoff.create') throw new Error('handoff must terminate the plan');
  if (['urgent', 'billing'].includes(intent) && !plan.needsHumanReview) throw new Error('mandatory human gate omitted');
  return plan;
}

export function deterministicPlan(intent: CareIntent): ServicePlan {
  const tools: CareBusinessTool[] = [...requiredTools[intent]];
  if (intent === 'appointment') tools.push('records.build_checklist');
  return { objective: '处理非诊疗服务请求', tools, needsHumanReview: ['urgent', 'billing'].includes(intent), rationale: '以最小业务工具处理请求；权限与人工升级由执行器独立校验。' };
}

export function extractRequestSlots(query: string, memory: CareMemory): CareRequestSlots {
  const dates = [...query.matchAll(/\b\d{4}-\d{1,2}-\d{1,2}\b|今天|明天|后天|下周[一二三四五六日天]?|周[一二三四五六日天]|\d{1,2}[月/-]\d{1,2}日?/g)].map((match) => match[0]);
  let date = new Set(dates).size === 1 ? dates[0] : '';
  if (date && /^\d/.test(date)) {
    const values = date.match(/\d+/g)!.map(Number);
    const [year, month, day] = values.length === 3 ? values : [new Date().getFullYear(), ...values];
    const parsed = new Date(Date.UTC(year, month - 1, day));
    if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) date = '';
  }
  // One-turn task parameters remain available without consenting to persistent memory.
  return {
    city: query.match(/北京|上海|深圳|广州|杭州|成都|伦敦/)?.[0] || (memory.consented ? memory.city : '') || '',
    date,
    preferredTime: query.match(/上午|下午|晚间/)?.[0] || (memory.consented ? memory.preferredTime : '') || '',
  };
}

const resultSchema = z.object({
  summary: z.string().min(1), answer: z.string().min(1), nextActions: z.array(z.string()),
  status: z.enum(['completed', 'handoff', 'needs-clarification']),
  source: z.literal('local-demo'),
}).strict();
type ToolResult = z.infer<typeof resultSchema>;
export type CareExecutionContext = { query: string; intent: CareIntent; memory: CareMemory; citations: CareCitation[]; slots: CareRequestSlots };

function executeLocalTool(name: CareBusinessTool, context: CareExecutionContext): ToolResult {
  const base = { source: 'local-demo' as const, status: 'completed' as const };
  switch (name) {
    case 'appointment.list_slots': {
      const { city, date, preferredTime } = context.slots;
      const missing = [!city && '城市', !date && '期望日期', !preferredTime && '时间段'].filter(Boolean) as string[];
      if (missing.length) return { ...base, status: 'needs-clarification', summary: `缺少：${missing.join('、')}`, answer: `预约信息尚不完整，请补充${missing.join('、')}。本轮没有提交预约。`, nextActions: missing.map((slot) => `补充${slot}`) };
      const slots = preferredTime === '上午' ? ['09:00', '10:20'] : preferredTime === '下午' ? ['14:30', '15:20'] : ['18:30', '19:20'];
      return { ...base, summary: `${city} / ${date} / ${preferredTime}：${slots.join('、')}（合成候选）`, answer: `按你提供的 ${city} / ${date} / ${preferredTime} 返回演示候选 ${slots.join('、')}。这些是本地合成数据，不代表真实号源；没有提交预约。`, nextActions: ['核对请求日期和候选时间', '通过正式渠道确认真实号源'] };
    }
    case 'records.build_checklist':
      return { ...base, summary: '资料清单含4项；未提供的内容保持待补', answer: '资料清单：身份与预约信息、既往就诊记录、检查报告原件、希望向专业人员确认的问题。缺失内容保持待补，不由系统猜测。', nextActions: ['核对4项资料清单并标记缺失项'] };
    case 'records.extract_report_fields':
      return { ...base, summary: '生成5项报告沟通字段模板，不提取或推断未提供的数据', answer: '报告沟通字段：报告日期、项目名称、原文数值、参考区间、待确认问题。当前只生成字段模板，不解释指标、不诊断、不推荐用药。', nextActions: ['逐字核对原文后再填写', '将问题交给专业人员判断'] };
    case 'records.recovery_check':
      return { ...base, summary: '身份未验证，仅生成找回步骤；未读取任何病历', answer: '记录找回步骤：确认原登记渠道，通过该渠道核验身份，再申请缺失记录。本演示没有访问历史记录，也不会显示他人的内容。', nextActions: ['确认原登记渠道', '在正式渠道核验身份', '列出待补资料'] };
    case 'human_handoff.create': {
      const urgent = context.intent === 'urgent';
      return { ...base, status: 'handoff', summary: `${urgent ? '紧急' : '普通'}人工转接草稿；未发送给任何机构`, answer: urgent ? '安全规则已停止自动服务。本系统不能提供医学判断，请立即联系所在地急救或现场专业人员；此处只生成转接草稿，不会自动联系急救或医院。' : '本轮转为人工核对。已整理本地转接草稿，没有发送给机构，也没有处理账单、退款或预约；正式提交仍需你确认。', nextActions: urgent ? ['停止自动预约', '联系当地急救或现场专业人员'] : ['核对转接原因和材料', '由本人通过正式渠道提交'] };
    }
  }
}

export async function executeServicePlan(planInput: unknown, context: CareExecutionContext, failure: ToolFailure = 'none') {
  const plan = validateServicePlan(planInput, context.intent);
  const calls: CareToolCall[] = [];
  const answers: string[] = [];
  const nextActions: string[] = [];
  let status: CareFlowRun['status'] = context.intent === 'unknown' ? 'needs-clarification' : 'completed';
  let retries = 0;
  const outcomes: Array<{ tool: CareBusinessTool; attempts: number; durationMs: number; source: 'local-demo' }> = [];
  for (const name of plan.tools) {
    const startedAt = performance.now();
    let output: ToolResult | undefined;
    let attempts = 0;
    while (!output && attempts < 2) {
      attempts++;
      try {
        if (failure === 'tool-timeout' && calls.length === 0 && attempts === 1) throw new Error('transient_tool_timeout');
        const raw: unknown = failure === 'tool-invalid-output' && calls.length === 0 ? { summary: null } : executeLocalTool(name, context);
        output = resultSchema.parse(raw);
      } catch (error) {
        if (error instanceof Error && error.message === 'transient_tool_timeout' && attempts === 1) { retries++; continue; }
        throw new Error(`tool_output_rejected:${name}`);
      }
    }
    if (!output) throw new Error(`tool_failed:${name}`);
    calls.push({ id: `planned-${calls.length + 1}`, tool: name, input: name === 'appointment.list_slots' ? { ...context.slots } : { intent: context.intent }, output: output.summary, status: 'ok' });
    outcomes.push({ tool: name, attempts, durationMs: Number((performance.now() - startedAt).toFixed(3)), source: 'local-demo' });
    answers.push(output.answer);
    nextActions.push(...output.nextActions);
    if (output.status === 'handoff' || (output.status === 'needs-clarification' && status !== 'handoff')) status = output.status;
  }
  if (!answers.length) { answers.push('请明确你要完成预约、资料准备、记录找回还是费用流程；信息不足时不执行业务工具。'); nextActions.push('选择一个具体服务任务'); }
  return { calls, outcomes, answer: answers.join('\n\n'), nextActions: [...new Set(nextActions)], status, retries, plan };
}
