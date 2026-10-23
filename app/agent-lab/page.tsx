'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowDown, ArrowRight, ArrowUpRight, Check, ChevronRight, Code2, FlaskConical, GitBranch, Layers3, ShieldCheck } from 'lucide-react';

const projects = [
  {
    id: 'finpilot', number: '01', name: 'FinPilot', category: 'RESEARCH WORKSPACE', title: '让研究结论，经得起比较。',
    description: '从自然语言约束出发，追踪选股依据、风险门禁与组合表现。在同一组数据上比较策略，检查交易成本如何改变结果。',
    href: '/finpilot', experiment: '/finpilot#research-lab', action: '打开投研工作台', color: '#d8efac',
    tags: ['约束解析', '反向证据', '策略比较', '成本敏感性'],
    question: '同样的仓位限制下，低波动与成长策略有什么取舍？',
    steps: [
      ['定义研究任务', '把资金、候选数量和风险上限转换成可检查的约束。'],
      ['检索与交叉检查', '查看冻结行情与财务来源，同时保留支持和反对证据。'],
      ['比较策略与成本', '使用相同输入，对比收益、回撤、基准和成本变化。'],
      ['核对并导出', '查看风险门禁和持仓归因，导出研究结果供复核。'],
    ],
    boundary: '八只股票的冻结历史数据；回顾性分析与模拟订单。',
    source: 'lib/finpilot-agent.ts', test: 'tests/finpilot-research.test.ts',
  },
  {
    id: 'careflow', number: '02', name: 'CareFlow', category: 'SERVICE WORKSPACE', title: '把一次问答，推进成一项任务。',
    description: '服务请求先经过安全路由，再生成和校验工具计划。补齐缺失信息、核对人工转接草稿，并保留每一步实际执行记录。',
    href: '/careflow', experiment: '/careflow#session-workbench', action: '打开服务工作台', color: '#c9dff7',
    tags: ['状态图执行', '多轮澄清', '工具重试', '人工核对'],
    question: '先提出预约需求，再补充城市和时间，流程如何继续？',
    steps: [
      ['路由与识别', '识别服务意图；急症请求直接进入人工升级分支。'],
      ['补齐任务信息', '围绕已执行任务的缺失参数补充信息，保留本轮上下文。'],
      ['执行并验证', '按已验证计划执行本地工具，记录实际调用、失败和重试。'],
      ['人工核对与审计', '核对本地转接草稿，导出会话与执行记录。'],
    ],
    boundary: '合成服务数据；单个 LangGraph 工作流；转接仅生成草稿。',
    source: 'lib/careflow-langgraph.ts', test: 'tests/careflow-session.test.ts',
  },
  {
    id: 'agentbench', number: '03', name: 'AgentBench', category: 'EVALUATION WORKSPACE', title: '失败发生时，也要有答案。',
    description: '让冻结用例真正经过工作流与工具执行器。注入超时和异常输出，分别检查任务完成、失败隔离和恢复情况。',
    href: '/agentbench', experiment: '/agentbench#execution-workbench', action: '打开评测工作台', color: '#ead9f5',
    tags: ['真实离线执行', '故障注入', '逐例诊断', '回归比较'],
    question: '检索暂时超时与持续不可用，会产生什么不同的结果？',
    steps: [
      ['选择实验条件', '选择正常执行、瞬时超时或持续故障场景。'],
      ['运行冻结用例', '服务端调用实际状态图，保持模型访问关闭。'],
      ['检查独立断言', '分别判断任务是否完成、故障是否隔离、重试是否恢复。'],
      ['定位回归', '展开逐例工具和轨迹，与上一轮比较并导出 JSON。'],
    ],
    boundary: '合成用例的离线执行；不代表真实模型或生产环境成功率。',
    source: 'lib/agentbench-execution.ts', test: 'tests/agentbench-execution.test.ts',
  },
];
const repo = 'https://github.com/RRRRFGCK/yingqi-agent-lab';
const evidenceSource = `${repo}/blob/1e8f39fafce5e2814f428eefc8a5fdc8b26e11a9`;

export default function ToolsPage() {
  const [selected, setSelected] = useState(0);
  const project = projects[selected];
  return (
    <main className="min-h-screen bg-[#f4f5f0] text-[#202b29] selection:bg-[#d8efac]">
      <header className="border-b border-[#d7ddd3]"><div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-5 sm:px-8">
        <Link href="/" className="flex items-center gap-3 font-semibold tracking-tight"><span className="grid size-9 place-items-center rounded-xl bg-[#202e2b] text-[#d8efac]"><Layers3 className="size-5" /></span>Yingqi <span className="font-normal text-[#708078]">/ Agent Lab</span></Link>
        <nav aria-label="主导航" className="flex items-center gap-5 text-xs font-medium"><a href="#projects" className="hidden hover:underline sm:block">项目</a><a href="#evidence" className="hidden hover:underline sm:block">实现与证据</a><a href={repo} target="_blank" rel="noreferrer" className="flex items-center gap-1 hover:underline">GitHub <ArrowUpRight className="size-3.5" /></a></nav>
      </div></header>

      <section className="mx-auto grid max-w-7xl gap-10 px-5 pb-12 pt-12 sm:px-8 sm:pt-20 lg:grid-cols-[1.1fr_1fr] lg:items-center lg:gap-14 lg:pb-20">
        <div><p className="flex items-center gap-2 text-[10px] font-semibold tracking-[0.2em] text-[#65746a]"><span className="size-1.5 rounded-full bg-[#647f42]" /> APPLIED AI · INTERACTIVE PROJECTS</p>
          <h1 className="mt-6 text-4xl font-semibold leading-[1.22] tracking-[-0.055em] sm:text-5xl lg:text-[58px]">从提出任务，<br />到验证每一步。</h1>
          <p className="mt-6 max-w-lg text-sm leading-7 text-[#647168] sm:text-base sm:leading-8">三个可以动手使用的 AI 工作流项目：研究策略、处理服务请求，再用故障实验检验它们背后的执行过程。</p>
          <div className="mt-8 flex flex-wrap items-center gap-3"><a href="#projects" className="inline-flex items-center gap-5 rounded-full bg-[#253a32] px-6 py-3.5 text-sm font-medium text-white transition hover:bg-[#3c5149]">选择一个任务 <ArrowDown className="size-4" /></a><a href="#walkthrough" className="rounded-full border border-[#cbd4c8] px-6 py-3.5 text-sm hover:bg-white">查看演示路径</a></div>
          <div className="mt-9 flex flex-wrap gap-x-5 gap-y-2 text-xs text-[#748074]">{['无需密钥即可体验', '执行轨迹可检查', '结果可导出'].map(text => <span className="flex items-center gap-1.5" key={text}><Check className="size-3.5" />{text}</span>)}</div>
        </div>
        <div className="overflow-hidden rounded-[24px] bg-[#22352f] p-6 text-white shadow-[0_24px_70px_-35px_#22352f] sm:p-8">
          <div className="flex items-center justify-between border-b border-white/15 pb-5"><span className="font-mono text-[10px] tracking-[0.15em] text-[#b6c7bb]">WORKFLOW MAP</span><span className="rounded-full border border-white/20 px-2.5 py-1 text-[10px] text-[#c5d3cb]">设计概览</span></div>
          <div className="mt-6 flex items-start gap-3"><span className="mt-1 grid size-8 shrink-0 place-items-center rounded-full border border-[#bcd39d]/40 text-[#d8efac]"><GitBranch className="size-4" /></span><div><p className="text-lg font-medium">每个结果，都有来路。</p><p className="mt-1 text-xs leading-5 text-[#a8bdb1]">输入约束 → 计划 → 工具 → 验证 → 审阅</p></div></div>
          <div className="my-6 grid gap-2">{projects.map(item => <a key={item.id} href={item.href} className="group flex items-center gap-4 rounded-xl border border-white/10 bg-white/5 p-4 transition hover:bg-white/10"><span className="font-mono text-[11px] text-[#8ba195]">{item.number}</span><span className="min-w-0 flex-1"><span className="block text-sm font-semibold" style={{ color: item.color }}>{item.name}</span><span className="mt-1 block text-[11px] text-[#b4c3ba]">{item.tags.join(' / ')}</span></span><ArrowUpRight className="size-4 shrink-0 text-[#a8bdb1] group-hover:text-white" /></a>)}</div>
          <div className="flex gap-2 border-t border-white/15 pt-5 text-[11px] leading-5 text-[#a8bdb1]"><ShieldCheck className="mt-0.5 size-4 shrink-0 text-[#d8efac]" /><p>默认使用冻结或合成数据。研究、执行、评测各自标明数据来源和适用范围。</p></div>
        </div>
      </section>

      <section id="projects" className="scroll-mt-6 border-y border-[#d7ddd3] bg-[#eceedf]/45"><div className="mx-auto max-w-7xl px-5 py-12 sm:px-8">
        <div className="mb-7 flex items-end justify-between gap-4"><div><p className="font-mono text-[10px] tracking-[0.16em] text-[#748074]">THE WORKSPACES</p><h2 className="mt-2 text-2xl font-semibold tracking-tight">选择你想验证的问题</h2></div><span className="hidden text-xs text-[#748074] sm:block">03 个项目 / 一条完整验证路径</span></div>
        <div className="grid gap-4 lg:grid-cols-3">{projects.map(item => <article key={item.id} className="flex flex-col rounded-2xl border border-[#d9dfd3] bg-[#fafbf7] p-6"><div className="flex items-center justify-between"><span className="rounded-md px-2.5 py-1 font-mono text-xs" style={{ background: item.color }}>{item.number}</span><span className="font-mono text-[9px] tracking-widest text-[#7a887e]">{item.category}</span></div><h3 className="mt-6 text-2xl font-semibold tracking-tight">{item.name}</h3><p className="mt-2 text-sm font-medium">{item.title}</p><p className="mb-5 mt-4 text-xs leading-6 text-[#69766c]">{item.description}</p><div className="mb-6 mt-auto flex flex-wrap gap-1.5">{item.tags.map(tag => <span key={tag} className="rounded-md border border-[#e0e5dc] px-2 py-1 text-[10px] text-[#69766c]">{tag}</span>)}</div><a href={item.href} className="flex items-center justify-between border-t border-[#dde3d7] pt-4 text-xs font-semibold hover:text-[#5a7c2a]">{item.action}<ArrowRight className="size-4" /></a></article>)}</div>
      </div></section>

      <section id="walkthrough" className="mx-auto max-w-7xl scroll-mt-6 px-5 py-14 sm:px-8"><div className="grid gap-8 lg:grid-cols-[0.8fr_1.2fr]">
        <div><p className="font-mono text-[10px] tracking-[0.16em] text-[#748074]">TRY A SCENARIO</p><h2 className="mt-3 text-2xl font-semibold tracking-tight">不止看介绍，<br className="hidden lg:block" />亲手跑一遍。</h2><p className="mt-4 max-w-sm text-sm leading-7 text-[#6b786e]">从一个具体问题进入工作台，改变条件，观察结果和执行记录如何变化。</p><fieldset aria-label="选择演示项目" className="mt-6 flex flex-wrap gap-2">{projects.map((item, index) => <button key={item.id} aria-pressed={selected === index} onClick={() => setSelected(index)} className={`rounded-full border px-4 py-2 text-xs transition ${selected === index ? 'border-[#253a32] bg-[#253a32] text-white' : 'border-[#d2dbcc] hover:bg-white'}`}>{item.name}</button>)}</fieldset></div>
        <div className="rounded-2xl border border-[#d7dfd0] bg-white p-5 sm:p-7" aria-live="polite"><p className="text-[10px] font-semibold tracking-widest text-[#7b877d]">{project.name} / 示例任务</p><h3 className="mb-6 mt-3 text-lg font-medium leading-7">{project.question}</h3><ol className="space-y-4">{project.steps.map(([name, detail], index) => <li key={name} className="flex items-start gap-3"><span className="grid size-6 shrink-0 place-items-center rounded-full bg-[#eff3e9] font-mono text-[10px] text-[#5b704a]">{index + 1}</span><div><p className="text-xs font-semibold">{name}</p><p className="mt-1 text-xs leading-5 text-[#79847c]">{detail}</p></div></li>)}</ol><a href={project.experiment} className="mt-7 flex items-center justify-between rounded-xl px-4 py-3 text-xs font-semibold" style={{ background: project.color }}>进入 {project.name} 试一试<ChevronRight className="size-4" /></a></div>
      </div></section>

      <section id="evidence" className="border-t border-[#d7ddd3] bg-white/50"><div className="mx-auto max-w-7xl px-5 py-12 sm:px-8"><div className="mb-7 flex items-center gap-3"><FlaskConical className="size-5 text-[#61794e]" /><h2 className="text-xl font-semibold tracking-tight">实现与证据，放在一起。</h2></div><div className="divide-y divide-[#dde3d8]">{projects.map(item => <div key={item.id} className="grid gap-3 py-5 sm:grid-cols-[130px_1fr_auto]"><h3 className="text-sm font-semibold">{item.name}</h3><p className="text-xs leading-6 text-[#718074]">{item.boundary}</p><div className="flex items-center gap-4 text-xs"><a href={`${evidenceSource}/${item.source}`} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 hover:underline"><Code2 className="size-3.5" />核心实现</a><a href={`${evidenceSource}/${item.test}`} target="_blank" rel="noreferrer" className="hover:underline">回归测试 ↗</a></div></div>)}</div><p className="mt-5 text-xs leading-6 text-[#7b877d]">这些是可运行的工程原型。模型规划是可选能力；离线规则结果、真实模型测评和生产表现分别记录，不混用成功率。</p></div></section>
      <footer className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-5 py-6 text-[10px] text-[#879184] sm:px-8"><p>YINGQI WANG / AGENT LAB</p><p>Research. Execute. Verify.</p></footer>
    </main>
  );
}
