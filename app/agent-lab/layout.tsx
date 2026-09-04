import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Yingqi Agent Lab｜可运行项目组合',
  description: 'FinPilot、CareFlow 与 AgentBench 组成的 Agent 应用全栈作品集。',
};

export default function AgentLabLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
