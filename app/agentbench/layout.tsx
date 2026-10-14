import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'AgentBench｜离线规则评测',
  description: '合成用例、评分故障模拟与用例结果。',
};

export default function ToolLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
