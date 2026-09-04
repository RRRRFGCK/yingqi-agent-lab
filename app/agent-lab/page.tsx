'use client';

import {
  Activity,
  ArrowRight,
  BarChart3,
  Bot,
  BrainCircuit,
  Check,
  CircleDot,
  Code2,
  Database,
  FileSearch,
  ServerCog,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
  UsersRound,
  Wrench,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const projects = [
  {
    index: '01',
    name: 'FinPilot',
    subtitle: '证据驱动投研 Agent',
    description: '开放式任务解析、真实历史数据工具、双向证据、Reflection、确定性硬风控与模拟审批。',
    proof: ['7 节点可审计 trace', '10 个 Walk-forward 窗口', '严格 Function Calling 适配器', '真实历史点时数据'],
    coverage: ['Planning / Acting / Reflection', 'Tool calling', 'Human approval', 'Point-in-time evaluation'],
    href: '/finpilot',
    color: 'bg-[#173f32]',
    accent: 'text-[#dff66c]',
  },
  {
    index: '02',
    name: 'CareFlow',
    subtitle: '安全服务流程 Agent',
    description: '以非诊疗服务场景展示 LangGraph 状态编排、Agentic RAG、多角色校验、长短期记忆、故障恢复与人工升级。',
    proof: ['7 节点 LangGraph 状态图', '检索超时自动重试', '可选严格模型计划器', '24 条冻结回归用例'],
    coverage: ['Agentic RAG', 'Multi-agent', 'Memory / State', 'Safety & handoff'],
    href: '/careflow',
    color: 'bg-[#1b4051]',
    accent: 'text-[#c9ff7a]',
  },
  {
    index: '03',
    name: 'AgentBench',
    subtitle: '回归与可观测性评测台',
    description: '同时评测朴素 FAQ 基线与 Agent 工作流，并用故障注入验证任务、工具、引用和安全发布门禁。',
    proof: ['Case-level 失败定位', '4 项独立发布门禁', '3 类故障注入', 'Baseline 对照'],
    coverage: ['Task success', 'Tool validity', 'Groundedness', 'Regression gate'],
    href: '/agentbench',
    color: 'bg-[#4d3d67]',
    accent: 'text-[#e8f978]',
  },
] as const;

const requirements = [
  { label: 'Planning—Acting—Reflection', projects: ['FinPilot', 'CareFlow'], icon: BrainCircuit },
  { label: 'Tool / API 调用', projects: ['FinPilot', 'CareFlow'], icon: Wrench },
  { label: '长短期记忆与多轮状态', projects: ['CareFlow'], icon: Database },
  { label: '多 Agent 协作', projects: ['CareFlow'], icon: UsersRound },
  { label: 'RAG + Agent', projects: ['CareFlow'], icon: FileSearch },
  { label: '成功率 / 稳定性 / 延迟评测', projects: ['AgentBench', 'FinPilot'], icon: Activity },
  { label: '全栈 API / Web / 部署', projects: ['全部 3 个'], icon: ServerCog },
  { label: '高风险场景安全边界', projects: ['CareFlow', 'FinPilot'], icon: ShieldCheck },
] as const;

export default function AgentLabPage() {
  return (
    <main className="min-h-screen bg-[#f3f5f0] text-[#13231c]">
      <header className="sticky top-0 z-40 border-b border-[#d9e2da] bg-[#f3f5f0]/94 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1460px] items-center justify-between gap-4 px-4 py-3.5 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3"><a href="https://github.com/RRRRFGCK/yingqi-agent-lab" target="_blank" rel="noreferrer" className="grid size-9 place-items-center rounded-full border border-[#d1dcd3] bg-white" aria-label="查看 GitHub 源码"><Code2 className="size-4" /></a><div><p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-[#6e7f76]">Yingqi Wang · Applied AI Portfolio</p><h1 className="text-base font-semibold sm:text-lg">Agent Lab</h1></div></div>
          <div className="flex items-center gap-2"><Badge className="bg-[#dff66c] text-[#173f32]">3 个可运行项目</Badge><Badge variant="outline" className="hidden border-[#ced9d1] bg-white text-[#53675c] sm:inline-flex">Open source · MIT</Badge></div>
        </div>
      </header>

      <section className="mx-auto max-w-[1460px] px-4 pb-8 pt-9 sm:px-6 lg:px-8 lg:pt-14">
        <div className="grid items-end gap-8 lg:grid-cols-[minmax(0,1fr)_420px]">
          <div><div className="flex items-center gap-2 text-sm font-semibold text-[#39705d]"><Sparkles className="size-4" /> 从 0 个 Agent 案例补到一条完整工程证据链</div><h2 className="mt-4 max-w-5xl text-4xl font-semibold leading-[1.02] tracking-[-0.05em] sm:text-6xl">一个项目很难证明全栈。<br />所以把能力拆成三块，逐项验收。</h2><p className="mt-5 max-w-3xl text-base leading-7 text-[#5e6f66]">FinPilot 证明规划、工具和风险闭环；CareFlow 证明 RAG、记忆、多 Agent 与安全边界；AgentBench 证明不是只会做 Demo，而是会定义成功、定位失败和阻断回归。</p></div>
          <aside className="rounded-[2rem] bg-[#173f32] p-6 text-white"><div className="flex items-center justify-between"><p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#b8ccc2]">Portfolio evidence standard</p><CircleDot className="size-5 text-[#dff66c]" /></div><p className="mt-4 text-2xl font-semibold">核心功能、失败边界和测试证据放在同一个公开仓库。</p><p className="mt-3 text-sm leading-6 text-[#c7d5ce]">可以诚实写“独立设计并实现可运行原型”；不能写生产落地、真实医疗效果或实盘收益。</p><a href="https://github.com/RRRRFGCK/yingqi-agent-lab" target="_blank" rel="noreferrer" className="mt-5 flex items-center justify-between rounded-2xl bg-white/8 p-4 text-xs font-semibold text-[#dff66c]">查看公开源码与测试 <ArrowRight className="size-4" /></a></aside>
        </div>

        <div className="mt-10 grid gap-5 xl:grid-cols-3">
          {projects.map((project) => <article key={project.name} className={`${project.color} flex min-h-[500px] flex-col rounded-[2rem] p-6 text-white shadow-[0_18px_60px_rgba(26,52,41,.12)]`}><div className="flex items-start justify-between"><span className={`font-mono text-xs font-semibold ${project.accent}`}>PROJECT {project.index}</span><Code2 className={`size-5 ${project.accent}`} /></div><div className="mt-12"><p className={`text-xs font-semibold uppercase tracking-[0.14em] ${project.accent}`}>{project.subtitle}</p><h3 className="mt-2 text-4xl font-semibold tracking-[-0.05em]">{project.name}</h3><p className="mt-4 text-sm leading-6 text-white/72">{project.description}</p></div><div className="mt-7 grid grid-cols-2 gap-2">{project.proof.map((item) => <div key={item} className="rounded-xl bg-white/8 p-3 text-[11px] leading-4 text-white/78">{item}</div>)}</div><div className="mt-6 flex flex-wrap gap-2">{project.coverage.map((item) => <span key={item} className="rounded-full border border-white/14 px-2.5 py-1 text-[10px] text-white/72">{item}</span>)}</div><Button onClick={() => window.location.assign(project.href)} className="mt-auto h-11 rounded-full bg-white text-[#173f32] hover:bg-[#dff66c]">打开可运行项目 <ArrowRight className="size-4" /></Button></article>)}
        </div>

        <section className="mt-8 grid gap-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(320px,.8fr)]">
          <Card className="border-0 bg-white ring-1 ring-[#d9e2da]"><CardHeader className="border-b border-[#e5ebe6]"><div><p className="text-[10px] font-semibold uppercase tracking-[0.13em] text-[#64796d]">Requirement coverage</p><CardTitle className="mt-1">岗位要求 → 可点击证据</CardTitle></div></CardHeader><CardContent className="grid gap-2 sm:grid-cols-2">{requirements.map((requirement) => <div key={requirement.label} className="flex items-center justify-between gap-3 rounded-2xl bg-[#f4f7f3] p-4"><div className="flex items-center gap-3"><span className="grid size-9 place-items-center rounded-xl bg-white text-[#315f4d]"><requirement.icon className="size-4" /></span><div><p className="text-xs font-semibold">{requirement.label}</p><p className="mt-1 text-[10px] text-[#718078]">{requirement.projects.join(' · ')}</p></div></div><Check className="size-4 shrink-0 text-[#3e765e]" /></div>)}</CardContent></Card>

          <Card className="border-0 bg-[#fff8ef] ring-1 ring-[#eadbc9]"><CardHeader className="border-b border-[#eadbc9]"><div className="flex items-center gap-2"><TriangleAlert className="size-4 text-[#895d32]" /><CardTitle className="text-[#6d4a29]">还不能装作已经解决</CardTitle></div></CardHeader><CardContent className="space-y-3 text-xs leading-5 text-[#765f49]">{[
            ['真实模型调用', 'FinPilot 已有严格 Responses API 适配器，但当前部署无密钥，页面明确使用规则降级。'],
            ['正式 Agent 框架', '当前以可读的 TypeScript 状态机实现，尚不能在简历技能栏写“熟练 LangGraph”。'],
            ['生产级持久化', 'CareFlow 长期偏好仅存浏览器；生产版应接入加密数据库、权限与删除审计。'],
            ['外部使用证据', '目前是个人工程作品，下一步需要公开仓库、README、测试与 3–5 位真实试用者反馈。'],
          ].map(([title, body]) => <div key={title} className="rounded-2xl bg-white/70 p-4"><p className="font-semibold text-[#684624]">{title}</p><p className="mt-1">{body}</p></div>)}</CardContent></Card>
        </section>

        <section className="mt-6 rounded-[2rem] bg-white p-6 ring-1 ring-[#d9e2da] sm:p-8">
          <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-sm font-semibold text-[#39705d]">最强的面试叙事不是“我用了很多框架”</p><h2 className="mt-2 text-2xl font-semibold tracking-[-0.035em] sm:text-3xl">而是：我知道哪部分交给模型，哪部分必须由系统兜底。</h2></div><Button onClick={() => window.open('https://github.com/RRRRFGCK/yingqi-agent-lab/blob/main/docs/ARCHITECTURE.md', '_blank', 'noopener,noreferrer')} className="rounded-full bg-[#173f32] text-white hover:bg-[#2a5c48]">查看架构与边界 <ArrowRight className="size-4" /></Button></div>
          <div className="mt-6 grid gap-3 md:grid-cols-4">{[
            { icon: Bot, title: '模型', copy: '理解意图、生成计划与解释。' },
            { icon: Wrench, title: '工具', copy: '执行事实查询与结构化动作。' },
            { icon: ShieldCheck, title: '规则', copy: '掌握安全、权限与发布否决权。' },
            { icon: BarChart3, title: '评测', copy: '用基线、用例和门禁证明改进。' },
          ].map((item) => <div key={item.title} className="rounded-2xl bg-[#f3f6f2] p-4"><item.icon className="size-4 text-[#315f4d]" /><p className="mt-4 text-sm font-semibold">{item.title}</p><p className="mt-1 text-xs leading-5 text-[#66756d]">{item.copy}</p></div>)}</div>
        </section>
      </section>
    </main>
  );
}
