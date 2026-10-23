import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Yingqi Agent Lab · 研究、执行与验证',
  description: '体验 FinPilot 策略比较、CareFlow 多轮服务工作流，以及 AgentBench 真实离线故障回归。',
};

export default function ToolLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
