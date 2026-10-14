import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'CareFlow｜服务请求',
  description: '服务请求、工具执行与运行记录。',
};

export default function ToolLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
