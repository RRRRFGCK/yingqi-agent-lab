import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'CareFlow｜安全可溯源的服务 Agent',
  description: '包含 Agentic RAG、多 Agent 校验、授权记忆、工具调用与安全升级的全栈演示。',
};

export default function CareFlowLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
