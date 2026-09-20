import type { Strategy } from './finpilot-agent';

export type FinPilotEvalCase = {
  id: string;
  task: string;
  expected: { strategy: Strategy; candidateCount: number; maxPosition: number; maxDrawdown: number };
};

const strategyText: Record<Strategy, string> = {
  'low-volatility': '构建低波动组合并优先控制历史回撤',
  balanced: '在质量、估值、波动和趋势之间做均衡比较',
  'quality-growth': '寻找质量成长候选，同时审查高估值和高波动反证',
};
const counts = [2, 3, 4, 5] as const;
const caps = [25, 30, 35, 40, 45] as const;
const drawdowns = [12, 15, 18, 20, 22] as const;
const strategies = ['low-volatility', 'balanced', 'quality-growth'] as const;

export const finPilotEvalCases: FinPilotEvalCase[] = Array.from({ length: 50 }, (_, index) => {
  const strategy = strategies[index % strategies.length];
  const candidateCount = counts[(index * 3) % counts.length];
  const maxPosition = caps[(index * 2) % caps.length];
  const maxDrawdown = drawdowns[(index * 4) % drawdowns.length];
  return {
    id: `FP-E${String(index + 1).padStart(2, '0')}`,
    task: `仅使用 2024 年 12 月 31 日及以前的冻结信息，${strategyText[strategy]}；选择 ${candidateCount} 只股票，单只仓位不超过 ${maxPosition}%，最大回撤预算 ${maxDrawdown}%，给出支持和反对证据并附来源编号。`,
    expected: { strategy, candidateCount, maxPosition, maxDrawdown },
  };
});

