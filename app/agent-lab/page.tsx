const tools = [
  { name: 'FinPilot', task: '投研与模拟交易', href: '/finpilot' },
  { name: 'CareFlow', task: '服务请求处理', href: '/careflow' },
  { name: 'AgentBench', task: '离线规则评测', href: '/agentbench' },
];

export default function ToolsPage() {
  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-5">
          <h1 className="text-lg font-semibold">工具</h1>
          <a href="https://github.com/RRRRFGCK/yingqi-agent-lab" target="_blank" rel="noreferrer" className="text-sm text-slate-500 hover:text-slate-900">源码</a>
        </div>
      </header>
      <section className="mx-auto grid max-w-5xl gap-4 px-6 py-8 sm:grid-cols-3">
        {tools.map((tool) => (
          <a key={tool.name} href={tool.href} className="rounded-lg border border-slate-200 bg-white p-6 transition hover:border-slate-400 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-slate-600">
            <h2 className="text-lg font-semibold">{tool.name}</h2>
            <p className="mt-2 text-sm text-slate-500">{tool.task}</p>
            <span className="mt-8 block text-sm font-medium">打开 →</span>
          </a>
        ))}
      </section>
    </main>
  );
}
