import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '工具',
  description: 'FinPilot、CareFlow、AgentBench。',
};

export default function ToolLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
