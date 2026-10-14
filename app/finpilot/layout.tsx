import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'FinPilot｜投研与模拟交易',
  description: '历史数据筛选、回测与模拟交易。',
};

export default function ToolLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
