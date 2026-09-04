import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'FinPilot｜证据驱动投研 Agent',
  description: '可运行、可审计、可评测的投研与模拟交易 Agent 工程演示。',
  openGraph: {
    title: 'FinPilot｜证据驱动投研 Agent',
    description: '工具调用、证据校验、Reflection、硬风控与模拟成交的完整闭环。',
    images: [],
  },
  twitter: {
    card: 'summary',
    title: 'FinPilot｜证据驱动投研 Agent',
    description: '工具调用、证据校验、Reflection、硬风控与模拟成交的完整闭环。',
    images: [],
  },
};

export default function FinPilotLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
