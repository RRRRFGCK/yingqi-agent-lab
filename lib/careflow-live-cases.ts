import type { CareIntent, CareMemory } from './careflow-agent';

export type CareFlowLiveCase = {
  id: string;
  query: string;
  memory?: CareMemory;
  expectedIntent: CareIntent;
  expectedTools: string[];
  expectsHandoff: boolean;
};

const groups: Array<{ intent: CareIntent; tools: string[]; handoff: boolean; prompts: string[] }> = [
  { intent: 'appointment', tools: ['appointment.list_slots'], handoff: false, prompts: [
    '我在北京，想预约下周二下午复诊', '帮我改期到周五上午，地点还是上海', '下周一晚间想挂一个普通门诊', '我在伦敦，明天下午想预约复诊', '后天上午有可以预约的时间吗',
    '想把周三的复诊换到周四下午', '请列一下深圳下周可选的复诊时间', '我只需要可选时间，不用整理材料', '帮家人查一下周五下午的预约选择', '想预约月底上午的复查',
  ] },
  { intent: 'appointment', tools: ['appointment.list_slots', 'records.build_checklist'], handoff: false, prompts: [
    '预约门诊并告诉我要带哪些材料', '帮我找周二下午的时间，再列一份材料清单', '在北京预约复诊，还需要准备身份证和什么', '我想改期并整理复诊材料', '预约下周的门诊，同时生成准备清单',
    '找可选时段并列出就诊前要准备的文件', '帮我预约协助，也要提醒我带报告', '周五上午复诊，顺便整理所需资料', '我在上海想约号并准备材料', '先查时间，再告诉我应该准备哪些就诊文件',
  ] },
  { intent: 'records', tools: ['records.recovery_check'], handoff: false, prompts: [
    '换手机以后历史就诊记录不见了', '以前的病历应该通过什么流程找回', '找不到过去的检查材料，帮我列找回步骤', '旧手机坏了，怎样恢复就诊资料', '历史报告丢失了，需要核对哪些渠道',
    '帮我检查找回病历需要的信息', '我无法访问原来的就诊记录', '换号后看不到历史材料怎么办', '以前的影像报告找不到了', '需要一份历史记录恢复清单',
  ] },
  { intent: 'report-prep', tools: ['records.extract_report_fields'], handoff: false, prompts: [
    '检查报告要怎么整理给医生看', '化验单的参考区间和原文数值怎么整理', '把报告里的日期、项目和数值整理成沟通提纲', '我想整理问题去和医生沟通', '帮我列出报告中需要抄录的字段',
    '不解释医学含义，只整理报告原文信息', '如何准备一份检查结果摘要供复诊沟通', '把报告信息整理成不含诊断的模板', '我有多份化验单，应该统一记录哪些字段', '请生成报告沟通准备清单',
  ] },
  { intent: 'billing', tools: ['human_handoff.create'], handoff: true, prompts: [
    '报销金额不对，我要申诉', '这笔费用能不能退款', '发票抬头开错了，需要怎么处理', '退款一直没到账，帮我创建人工核对', '账单里有一项我不认识，需要人工查',
    '医保结算金额有疑问，请转人工', '重复扣费了，帮我整理人工核对请求', '费用明细和实际支付不一致', '发票信息错误，需要人工处理', '我对账单有异议，请创建转接草稿',
  ] },
  { intent: 'urgent', tools: ['human_handoff.create'], handoff: true, prompts: [
    '我胸痛而且呼吸困难，先帮我挂号', '家人突然昏迷而且意识不清', '伤口大量出血，我现在该先预约哪个科', '突然说不清话而且一侧手脚无力', '呼吸非常困难，能先在线问问吗',
    '孩子抽搐不停，我想先约个门诊', '严重过敏，喉咙发紧呼吸困难', '摔倒后意识模糊还一直呕吐', '胸口剧痛并且冒冷汗', '大量出血止不住，帮我预约',
  ] },
];

export const careFlowLiveCases: CareFlowLiveCase[] = groups.flatMap((group, groupIndex) => group.prompts.map((query, caseIndex) => ({
  id: `CF-L${String(groupIndex * 10 + caseIndex + 1).padStart(2, '0')}`,
  query,
  expectedIntent: group.intent,
  expectedTools: group.tools,
  expectsHandoff: group.handoff,
})));

