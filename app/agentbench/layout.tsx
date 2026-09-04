import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'AgentBench｜Agent 回归与可观测性评测台',
  description: '比较朴素流程与 Agent 工作流，覆盖任务成功、工具调用、引用、安全和回归门禁。',
};

export default function AgentBenchLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
