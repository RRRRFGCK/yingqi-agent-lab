'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  BarChart3,
  Bot,
  BrainCircuit,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  Code2,
  Database,
  FileSearch,
  History,
  Info,
  Layers3,
  LoaderCircle,
  LockKeyhole,
  Play,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  TestTube2,
  Video,
  Wrench,
  XCircle,
} from 'lucide-react';
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart';
import { Textarea } from '@/components/ui/textarea';
import {
  defaultTasks,
  evaluateWalkForwardSuite,
  executePaperTrade,
  runFinPilotAgent,
  strategyLabels,
  type AgentRun,
  type BenchmarkResult,
  type PaperOrder,
  type Strategy,
} from '@/lib/finpilot-agent';

type View = 'cockpit' | 'evaluation' | 'architecture';
type WebMCPContext = {
  registerTool: (
    tool: {
      name: string;
      title?: string;
      description: string;
      inputSchema: Record<string, unknown>;
      annotations?: { readOnlyHint?: boolean; untrustedContentHint?: boolean };
      execute: (input: unknown) => unknown;
    },
    options?: { signal?: AbortSignal },
  ) => void | Promise<void>;
};

const chartConfig = {
  portfolio: { label: 'FinPilot 组合', color: '#173f32' },
  benchmark: { label: '等权基线', color: '#95a49d' },
} satisfies ChartConfig;

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const toolIcons: Record<string, typeof Bot> = {
  plan: Bot,
  snapshot: Database,
  evidence: FileSearch,
  factors: BarChart3,
  compare: ArrowRight,
  reflect: BrainCircuit,
  risk: ShieldCheck,
};

const strategyCopy: Record<Strategy, string> = {
  'low-volatility': '优先控制波动与回撤',
  balanced: '平衡质量、估值与趋势',
  'quality-growth': '偏向质量与成长，但惩罚高风险证据',
};

function MetricCard({ label, value, hint, tone = 'green' }: { label: string; value: string; hint: string; tone?: 'green' | 'blue' | 'amber' }) {
  const toneClass = tone === 'blue' ? 'bg-[#eef3f8] text-[#183f52]' : tone === 'amber' ? 'bg-[#fbf5eb] text-[#6b4c2e]' : 'bg-[#f0f6ec] text-[#173f32]';
  return (
    <div className={`rounded-2xl p-4 ${toneClass}`}>
      <p className="text-[10px] font-semibold uppercase tracking-[0.13em] opacity-65">{label}</p>
      <p className="mt-2 text-2xl font-semibold tracking-[-0.04em]">{value}</p>
      <p className="mt-1 text-[11px] leading-4 opacity-65">{hint}</p>
    </div>
  );
}

export default function FinPilotPage() {
  const initial = useMemo(() => runFinPilotAgent(defaultTasks[0].task, defaultTasks[0].strategy, 'FP-DEMO-001'), []);
  const [task, setTask] = useState(defaultTasks[0].task);
  const [strategy, setStrategy] = useState<Strategy>(defaultTasks[0].strategy);
  const [run, setRun] = useState<AgentRun>(initial);
  const [view, setView] = useState<View>('cockpit');
  const [isRunning, setIsRunning] = useState(false);
  const [visibleSteps, setVisibleSteps] = useState(initial.steps.length);
  const [selectedSymbol, setSelectedSymbol] = useState(initial.candidates.find((item) => item.decision === 'selected')?.symbol ?? initial.candidates[0].symbol);
  const [expandedStep, setExpandedStep] = useState<string | null>('reflect');
  const [confirmApproval, setConfirmApproval] = useState(false);
  const [orders, setOrders] = useState<PaperOrder[]>([]);
  const [benchmark, setBenchmark] = useState<BenchmarkResult>(() => evaluateWalkForwardSuite());
  const [benchmarkRunning, setBenchmarkRunning] = useState(false);
  const [plannerNotice, setPlannerNotice] = useState('规则解析器已就绪；配置服务端密钥后自动切换到 OpenAI Planner。');
  const runRef = useRef(run);

  useEffect(() => {
    runRef.current = run;
  }, [run]);

  useEffect(() => {
    const requestedView = new URLSearchParams(window.location.search).get('view');
    if (requestedView !== 'evaluation' && requestedView !== 'architecture' && requestedView !== 'cockpit') return;
    const frame = window.requestAnimationFrame(() => setView(requestedView));
    return () => window.cancelAnimationFrame(frame);
  }, []);

  const performRun = useCallback(async (nextTask: string, nextStrategy?: Strategy, animate = true) => {
    let result: AgentRun;
    try {
      const response = await fetch('/api/finpilot/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task: nextTask, strategy: nextStrategy }),
      });
      if (!response.ok) throw new Error(`planner ${response.status}`);
      const payload = await response.json() as { result: AgentRun };
      result = payload.result;
      setPlannerNotice(`OpenAI ${result.planner.model} 已通过严格 schema 生成研究计划。`);
    } catch {
      result = runFinPilotAgent(nextTask, nextStrategy, `FP-${Date.now().toString(36).toUpperCase()}`);
      setPlannerNotice('当前部署未配置 OPENAI_API_KEY，已明确降级为规则解析；历史数据、计算与风控仍为真实可复现链路。');
    }
    setTask(result.task);
    setStrategy(result.strategy);
    setRun(result);
    setOrders([]);
    setConfirmApproval(false);
    setSelectedSymbol(result.candidates.find((item) => item.decision === 'selected')?.symbol ?? result.candidates[0].symbol);
    setExpandedStep(null);
    setView('cockpit');
    if (!animate) {
      setVisibleSteps(result.steps.length);
      runRef.current = result;
      return result;
    }
    setIsRunning(true);
    setVisibleSteps(0);
    for (let index = 0; index < result.steps.length; index += 1) {
      await delay(index === 0 ? 180 : 310);
      setVisibleSteps(index + 1);
    }
    setExpandedStep(result.steps.some((step) => step.id === 'reflect' && step.status === 'warning') ? 'reflect' : 'risk');
    setIsRunning(false);
    runRef.current = result;
    try {
      window.localStorage.setItem('finpilot-last-run', JSON.stringify({ id: result.id, task: result.task, strategy: result.strategy }));
    } catch {
      // The demo remains usable when browser storage is unavailable.
    }
    return result;
  }, []);

  const approveRun = useCallback((targetRun?: AgentRun) => {
    const current = targetRun ?? runRef.current;
    const nextOrders = executePaperTrade(current);
    const approvedRun = { ...current, status: 'approved' as const };
    setOrders(nextOrders);
    setRun(approvedRun);
    setConfirmApproval(false);
    runRef.current = approvedRun;
    try {
      const prior = JSON.parse(window.localStorage.getItem('finpilot-paper-orders') ?? '[]') as PaperOrder[];
      window.localStorage.setItem('finpilot-paper-orders', JSON.stringify([...prior.slice(-12), ...nextOrders]));
    } catch {
      // Audit persistence is device-local and optional in this first version.
    }
    return nextOrders;
  }, []);

  useEffect(() => {
    const context = (document as Document & { modelContext?: WebMCPContext }).modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    const reportError = () => undefined;
    const registrations = [
      context.registerTool(
        {
          name: 'run_finpilot_research',
          title: '运行 FinPilot 研究任务',
          description: '使用冻结的真实历史快照运行一次可审计的投研、证据校验与风控流程，并在页面展示结果。不会使用或交易真实资金。',
          inputSchema: {
            type: 'object',
            properties: {
              task: { type: 'string', minLength: 10, description: '包含候选数量和风险约束的中文研究任务。' },
              strategy: { type: 'string', enum: ['low-volatility', 'balanced', 'quality-growth'] },
            },
            required: ['task'],
            additionalProperties: false,
          },
          annotations: { readOnlyHint: false, untrustedContentHint: false },
          async execute(input) {
            if (!input || typeof input !== 'object' || typeof (input as { task?: unknown }).task !== 'string' || (input as { task: string }).task.trim().length < 10) throw new Error('task 必须是至少 10 个字符的字符串。');
            const requestedStrategy = (input as { strategy?: Strategy }).strategy;
            if (requestedStrategy && !Object.keys(strategyLabels).includes(requestedStrategy)) throw new Error('strategy 不受支持。');
            const result = await performRun((input as { task: string }).task, requestedStrategy, false);
            return {
              runId: result.id,
              status: result.status,
              selected: result.portfolio.map((position) => ({ symbol: position.symbol, weight: position.weight })),
              riskPassed: result.riskChecks.every((check) => check.passed),
            };
          },
        },
        { signal: lifecycle.signal },
      ),
      context.registerTool(
        {
          name: 'approve_finpilot_paper_trade',
          title: '批准 FinPilot 模拟交易',
          description: '批准当前已通过硬风控的交易意图并生成本地模拟成交记录。不会连接券商或真实资金。',
          inputSchema: { type: 'object', properties: {}, additionalProperties: false },
          annotations: { readOnlyHint: false, untrustedContentHint: false },
          execute() {
            const nextOrders = approveRun(runRef.current);
            return { status: 'FILLED_SIMULATED', orderIds: nextOrders.map((order) => order.id), count: nextOrders.length };
          },
        },
        { signal: lifecycle.signal },
      ),
    ];
    for (const registration of registrations) void Promise.resolve(registration).catch(reportError);
    return () => lifecycle.abort();
  }, [approveRun, performRun]);

  const selectedCandidate = run.candidates.find((candidate) => candidate.symbol === selectedSymbol) ?? run.candidates[0];
  const completed = !isRunning && visibleSteps === run.steps.length;
  const selectedCandidates = run.candidates.filter((candidate) => candidate.decision === 'selected');

  const applyPreset = (index: number) => {
    setTask(defaultTasks[index].task);
    setStrategy(defaultTasks[index].strategy);
  };

  const rerunBenchmark = async () => {
    setBenchmarkRunning(true);
    await delay(650);
    setBenchmark(evaluateWalkForwardSuite());
    setBenchmarkRunning(false);
  };

  return (
    <main className="min-h-screen bg-[#f5f7f2] text-[#12231c]">
      <header className="sticky top-0 z-40 border-b border-[#dce4dc] bg-[#f5f7f2]/94 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1500px] items-center justify-between gap-4 px-4 py-3.5 sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <button onClick={() => window.location.assign('/')} className="grid size-9 shrink-0 place-items-center rounded-full border border-[#d5dfd8] bg-white text-[#315547] transition hover:border-[#173f32]" aria-label="返回求职主页"><ArrowLeft className="size-4" /></button>
            <div className="min-w-0"><p className="truncate text-[9px] font-semibold uppercase tracking-[0.18em] text-[#668075] sm:text-[10px]">Yingqi Lab · Project 01</p><h1 className="truncate text-base font-semibold tracking-[-0.025em] sm:text-lg">FinPilot <span className="hidden font-normal text-[#648075] sm:inline">证据驱动投研 Agent</span></h1></div>
          </div>
          <nav className="hidden items-center rounded-full border border-[#d5dfd8] bg-white p-1 md:flex" aria-label="FinPilot 页面导航">
            {([['cockpit', 'Agent 工作台'], ['evaluation', '系统评测'], ['architecture', '架构与边界']] as Array<[View, string]>).map(([key, label]) => <button key={key} onClick={() => setView(key)} className={`rounded-full px-3 py-2 text-xs font-semibold transition ${view === key ? 'bg-[#173f32] text-white' : 'text-[#607169] hover:bg-[#eef3ee]'}`}>{label}</button>)}
          </nav>
          <div className="flex shrink-0 items-center gap-2"><button onClick={() => window.location.assign('/agent-lab')} className="hidden rounded-full border border-[#cedad2] bg-white px-3 py-2 text-xs font-semibold text-[#48675b] lg:block">Agent Lab</button><Badge className="bg-[#dff66c] text-[#173f32] hover:bg-[#dff66c]">模拟盘</Badge><Badge variant="outline" className="hidden border-[#cedad2] bg-white text-[#48675b] xl:inline-flex">{run.planner.mode === 'openai' ? `OpenAI ${run.planner.model}` : '规则降级'}</Badge></div>
        </div>
        <div className="flex gap-1 overflow-x-auto border-t border-[#e4eae5] px-4 py-2 md:hidden">
          {([['cockpit', 'Agent 工作台'], ['evaluation', '系统评测'], ['architecture', '架构与边界']] as Array<[View, string]>).map(([key, label]) => <button key={key} onClick={() => setView(key)} className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold ${view === key ? 'bg-[#173f32] text-white' : 'bg-white text-[#607169]'}`}>{label}</button>)}
        </div>
      </header>

      {view === 'cockpit' && (
        <section className="mx-auto max-w-[1500px] px-4 py-6 sm:px-6 lg:px-8">
          <div className="mb-5 grid gap-5 xl:grid-cols-[minmax(0,1.42fr)_minmax(320px,.58fr)]">
            <Card className="border-0 bg-[#173f32] text-white ring-0 shadow-[0_20px_60px_rgba(21,63,50,.16)]">
              <CardHeader className="gap-3 px-5 pt-5 lg:px-6">
                <div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-2 text-[#dff66c]"><Sparkles className="size-4" /><span className="text-xs font-semibold uppercase tracking-[0.14em]">研究任务</span></div><span className="text-xs text-[#b9cbc3]">历史截面：{run.cutoffDate}</span></div>
                <CardTitle className="max-w-3xl text-2xl font-semibold leading-tight tracking-[-0.035em] text-white lg:text-[2rem]">Agent 提出交易意图，硬风控决定它能否进入模拟盘。</CardTitle>
              </CardHeader>
              <CardContent className="px-5 pb-5 lg:px-6">
                <div className="mb-3 flex flex-wrap gap-2">{defaultTasks.map((preset, index) => <button key={preset.label} onClick={() => applyPreset(index)} className={`rounded-full border px-3 py-1.5 text-[11px] font-semibold transition ${task === preset.task ? 'border-[#dff66c] bg-[#dff66c] text-[#173f32]' : 'border-white/15 bg-white/7 text-[#c6d5ce] hover:bg-white/12'}`}>{preset.label}</button>)}</div>
                <Textarea value={task} onChange={(event) => setTask(event.target.value)} aria-label="输入投研任务" className="min-h-24 resize-none border-white/15 bg-white/8 p-4 text-[15px] leading-6 text-white placeholder:text-white/45 focus-visible:border-[#dff66c] focus-visible:ring-[#dff66c]/20" />
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                  <div><p className="text-xs font-semibold text-white">{strategyLabels[strategy]}模式</p><p className="mt-1 text-[11px] text-[#aabeb5]">{strategyCopy[strategy]} · 数值由确定性工具计算</p><p className="mt-1 max-w-xl text-[10px] leading-4 text-[#8fa79d]">{plannerNotice}</p></div>
                  <Button disabled={isRunning || task.trim().length < 10} onClick={() => void performRun(task, strategy)} className="h-10 rounded-full bg-[#dff66c] px-5 font-semibold text-[#173f32] hover:bg-white">{isRunning ? <LoaderCircle className="size-4 animate-spin" /> : <Play className="size-4 fill-current" />}{isRunning ? 'Agent 运行中' : '运行 Agent'}</Button>
                </div>
              </CardContent>
            </Card>

            <Card className="border-0 bg-[#eef3f8] ring-1 ring-[#d9e3e8]">
              <CardHeader className="border-b border-[#d9e3e8]"><div className="flex items-center justify-between gap-3"><CardTitle className="text-sm font-semibold text-[#173f32]">本次约束解析</CardTitle><ShieldCheck className="size-4 text-[#2d6755]" /></div></CardHeader>
              <CardContent className="grid grid-cols-2 gap-3">
                {[
                  ['模拟资金', `$${run.capital.toLocaleString()}`],
                  ['目标数量', `${run.candidateCount} 只`],
                  ['单股上限', `${run.maxPosition}%`],
                  ['最大回撤', `${run.maxDrawdown}%`],
                ].map(([label, value]) => <div key={label} className="rounded-xl border border-[#d9e3e8] bg-white p-3"><p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#71847c]">{label}</p><p className="mt-2 text-lg font-semibold tracking-[-0.03em] text-[#183f32]">{value}</p></div>)}
                <div className="col-span-2 flex items-start gap-2 rounded-xl bg-[#183f52] p-3 text-xs leading-5 text-[#d9e6eb]"><LockKeyhole className="mt-0.5 size-3.5 shrink-0 text-[#dff66c]" />Agent 无权覆盖这些限制；模拟执行前还需要一次明确批准。</div>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-5 xl:grid-cols-[330px_minmax(0,1fr)_370px]">
            <Card className="border-0 ring-1 ring-[#dce4dc]">
              <CardHeader className="border-b border-[#e3e9e4]"><div className="flex items-center justify-between"><CardTitle>执行轨迹</CardTitle><span className="flex items-center gap-1 text-[11px] text-[#6b7c73]"><Clock3 className="size-3" />{completed ? `${run.latencyMs} ms` : '运行中'}</span></div></CardHeader>
              <CardContent className="space-y-1">
                {run.steps.map((step, index) => {
                  const Icon = toolIcons[step.id] ?? Wrench;
                  const isVisible = index < visibleSteps;
                  const isActive = isRunning && index === visibleSteps;
                  const isExpanded = expandedStep === step.id && isVisible;
                  return (
                    <button key={step.id} disabled={!isVisible} onClick={() => setExpandedStep(isExpanded ? null : step.id)} className={`w-full rounded-xl p-3 text-left transition ${isExpanded ? 'bg-[#eef5e7]' : isVisible ? 'hover:bg-[#f4f7f4]' : 'opacity-40'}`}>
                      <div className="flex gap-3">
                        <div className={`grid size-8 shrink-0 place-items-center rounded-full ${step.status === 'warning' && isVisible ? 'bg-[#f7e3b8] text-[#775424]' : step.status === 'blocked' && isVisible ? 'bg-[#f6d9d5] text-[#8e3e35]' : isVisible ? 'bg-[#173f32] text-[#dff66c]' : isActive ? 'bg-[#dff66c] text-[#173f32]' : 'bg-[#edf1ee] text-[#84948c]'}`}>{isActive ? <LoaderCircle className="size-4 animate-spin" /> : isVisible && step.status === 'done' ? <CheckCircle2 className="size-4" /> : <Icon className="size-4" />}</div>
                        <div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-2"><p className="text-sm font-semibold">{index + 1}. {step.label}</p>{isVisible && <ChevronDown className={`size-3.5 text-[#829088] transition ${isExpanded ? 'rotate-180' : ''}`} />}</div><p className="mt-1 truncate font-mono text-[10px] text-[#7b8982]">{step.tool}</p></div>
                      </div>
                      {isExpanded && <div className="ml-11 mt-3 border-l-2 border-[#cbd8cf] pl-3"><p className="text-xs font-semibold leading-5 text-[#315a49]">{step.summary}</p><p className="mt-1 text-[11px] leading-5 text-[#718078]">{step.detail}</p></div>}
                    </button>
                  );
                })}
              </CardContent>
            </Card>

            <div className="space-y-5">
              <Card className="border-0 ring-1 ring-[#dce4dc]">
                <CardHeader className="border-b border-[#e3e9e4]"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#688076]">Candidate evidence</p><CardTitle className="mt-1">候选、分数与双向证据</CardTitle></div><Badge variant="outline" className="border-[#d5dfd8] text-[#557066]">{completed ? `${selectedCandidates.length} 个进入组合` : '等待工具结果'}</Badge></div></CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex gap-2 overflow-x-auto pb-1">{run.candidates.map((candidate) => <button key={candidate.symbol} disabled={!completed} onClick={() => setSelectedSymbol(candidate.symbol)} className={`min-w-[122px] rounded-xl border p-3 text-left transition ${selectedSymbol === candidate.symbol ? 'border-[#173f32] bg-[#173f32] text-white' : candidate.decision === 'rejected' ? 'border-[#ebd7d2] bg-[#fcf7f5]' : 'border-[#dce4dc] bg-white hover:border-[#8aa096]'}`}><div className="flex items-center justify-between gap-2"><span className="font-mono text-[10px] opacity-60">{candidate.symbol}</span><span className={`size-2 rounded-full ${candidate.decision === 'selected' ? 'bg-[#dff66c]' : candidate.decision === 'rejected' ? 'bg-[#d8796d]' : 'bg-[#aab8b1]'}`} /></div><p className="mt-2 text-sm font-semibold">{candidate.name}</p><p className="mt-1 text-xl font-semibold tracking-[-0.04em]">{candidate.composite}</p></button>)}</div>
                  {completed ? (
                    <>
                      <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xl font-semibold tracking-[-0.03em]">{selectedCandidate.name}</p><p className="mt-1 text-xs text-[#718078]">{selectedCandidate.sector} · 截止日复权价 ${selectedCandidate.price.toFixed(2)}</p></div><Badge className={selectedCandidate.decision === 'selected' ? 'bg-[#dff66c] text-[#173f32]' : selectedCandidate.decision === 'rejected' ? 'bg-[#f6d9d5] text-[#7b3730]' : 'bg-[#edf1ee] text-[#5c6b64]'}>{selectedCandidate.decision === 'selected' ? '已选入' : selectedCandidate.decision === 'rejected' ? '反思后移除' : '观察池'}</Badge></div>
                      <div className="grid grid-cols-4 gap-2">{[
                        ['质量', selectedCandidate.quality], ['估值', selectedCandidate.value], ['低波动', selectedCandidate.lowVolatility], ['趋势', selectedCandidate.momentum],
                      ].map(([label, value]) => <div key={String(label)} className="rounded-xl bg-[#f4f7f4] p-2.5 text-center"><p className="text-[9px] text-[#718078]">{label}</p><p className="mt-1 text-base font-semibold">{value}</p></div>)}</div>
                      <div className="grid gap-3 lg:grid-cols-2">
                        <div className="rounded-xl border border-[#d9e7d2] bg-[#f4f9ef] p-4"><p className="flex items-center gap-2 text-xs font-semibold text-[#315c4b]"><CheckCircle2 className="size-3.5" />支持证据</p><ul className="mt-2 space-y-2 text-xs leading-5 text-[#385c4e]">{selectedCandidate.support.map((item) => <li key={item}>• {item}</li>)}</ul></div>
                        <div className="rounded-xl border border-[#eadfd3] bg-[#fbf6ef] p-4"><p className="flex items-center gap-2 text-xs font-semibold text-[#7a5635]"><AlertTriangle className="size-3.5" />反对证据</p><ul className="mt-2 space-y-2 text-xs leading-5 text-[#715b46]">{selectedCandidate.counter.map((item) => <li key={item}>• {item}</li>)}</ul></div>
                      </div>
                      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#dce4dc] px-4 py-3"><div><p className="text-xs font-semibold">决策：{selectedCandidate.decisionReason}</p><p className="mt-1 font-mono text-[9px] text-[#7c8b84]">{selectedCandidate.sourceIds.join(' · ')}</p></div><FileSearch className="size-4 text-[#57766a]" /></div>
                    </>
                  ) : <div className="grid min-h-72 place-items-center rounded-xl border border-dashed border-[#d7e0d9] bg-[#f8faf8]"><div className="text-center"><LoaderCircle className="mx-auto size-6 animate-spin text-[#507466]" /><p className="mt-3 text-sm font-semibold">正在生成可追溯证据</p><p className="mt-1 text-xs text-[#7b8982]">不会提前展示未验证结论</p></div></div>}
                </CardContent>
              </Card>

              {completed && <Card className="border-0 ring-1 ring-[#dce4dc]"><CardHeader className="border-b border-[#e3e9e4]"><div className="flex items-center justify-between"><div><p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#688076]">Reflection</p><CardTitle className="mt-1">为什么改写了初选</CardTitle></div><RotateCcw className="size-4 text-[#486f5e]" /></div></CardHeader><CardContent className="grid gap-3 text-xs leading-5 md:grid-cols-3"><div className="rounded-xl bg-[#fbf5eb] p-3"><p className="font-semibold text-[#6f4d2e]">触发</p><p className="mt-1 text-[#7a654e]">{run.reflection.trigger}</p></div><div className="rounded-xl bg-[#eef3f8] p-3"><p className="font-semibold text-[#244f60]">动作</p><p className="mt-1 text-[#536c77]">{run.reflection.action}</p></div><div className="rounded-xl bg-[#f0f6ec] p-3"><p className="font-semibold text-[#315c4b]">结果</p><p className="mt-1 text-[#567064]">{run.reflection.outcome}</p></div></CardContent></Card>}
            </div>

            <div className="space-y-5">
              <Card className="border-0 bg-[#132b23] text-white ring-0">
                <CardHeader className="border-b border-white/10"><div className="flex items-center justify-between gap-3"><div><p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#a7beb5]">Trade intent</p><CardTitle className="mt-1 text-white">{run.status === 'approved' ? '模拟成交完成' : run.status === 'blocked' ? '已被风控拦截' : completed ? '等待人工批准' : '等待 Agent 完成'}</CardTitle></div><CircleDollarSign className="size-5 text-[#dff66c]" /></div></CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-3 gap-2"><div className="rounded-xl bg-white/7 p-3"><p className="text-[9px] text-[#9db1a8]">已投资</p><p className="mt-1 text-lg font-semibold text-[#dff66c]">{(100 - run.cashWeight).toFixed(1)}%</p></div><div className="rounded-xl bg-white/7 p-3"><p className="text-[9px] text-[#9db1a8]">现金</p><p className="mt-1 text-lg font-semibold">{run.cashWeight.toFixed(1)}%</p></div><div className="rounded-xl bg-white/7 p-3"><p className="text-[9px] text-[#9db1a8]">预估回撤</p><p className="mt-1 text-lg font-semibold">{run.estimatedDrawdown.toFixed(1)}%</p></div></div>
                  <div className="space-y-2">{run.portfolio.map((position) => <div key={position.symbol} className="flex items-center justify-between rounded-xl border border-white/10 p-3"><div><p className="text-sm font-semibold">{position.name}</p><p className="mt-1 font-mono text-[9px] text-[#91a79d]">{position.symbol} · {position.shares} 股</p></div><div className="text-right"><p className="text-sm font-semibold text-[#dff66c]">{position.weight.toFixed(1)}%</p><p className="mt-1 text-[9px] text-[#91a79d]">${position.amount.toLocaleString()}</p></div></div>)}</div>
                  <div><p className="text-xs font-semibold text-[#c9d8d1]">硬约束检查</p><div className="mt-2 space-y-2">{run.riskChecks.map((check) => <div key={check.id} className="flex items-center justify-between gap-2 text-[11px] text-[#b8cbc2]"><span className="flex items-center gap-2">{check.passed ? <CheckCircle2 className="size-3.5 text-[#dff66c]" /> : <XCircle className="size-3.5 text-[#ff9a8d]" />}{check.label}</span><span className="font-mono">{check.observed}</span></div>)}</div></div>
                  {orders.length > 0 ? <div className="rounded-xl border border-[#dff66c]/30 bg-[#dff66c]/10 p-3"><p className="flex items-center gap-2 text-xs font-semibold text-[#e8f2b8]"><CheckCircle2 className="size-4" />{orders.length} 笔模拟订单已记录</p><p className="mt-2 whitespace-pre-line break-all font-mono text-[9px] leading-4 text-[#b7c8bf]">{orders.map((order) => order.id).join('\n')}</p></div> : confirmApproval ? <div className="rounded-xl border border-[#f0c983]/35 bg-[#f0c983]/10 p-3"><p className="text-xs font-semibold text-[#f3d8a8]">确认写入本机模拟成交记录？</p><p className="mt-1 text-[10px] leading-4 text-[#b7c8bf]">不会调用券商接口，不会使用真实资金。</p></div> : <div className="rounded-xl border border-white/10 bg-white/5 p-3 text-[10px] leading-4 text-[#b7c8bf]">{run.auditNote}</div>}
                  {run.status !== 'approved' && <div className="grid grid-cols-2 gap-2">{confirmApproval && <Button variant="outline" onClick={() => setConfirmApproval(false)} className="h-10 rounded-full border-white/15 bg-transparent text-white hover:bg-white/10">取消</Button>}<Button disabled={!completed || run.status === 'blocked'} onClick={() => confirmApproval ? approveRun(run) : setConfirmApproval(true)} className={`h-10 rounded-full bg-[#dff66c] font-semibold text-[#173f32] hover:bg-white ${confirmApproval ? '' : 'col-span-2'}`}>{confirmApproval ? '确认模拟成交' : '批准模拟交易'}</Button></div>}
                </CardContent>
              </Card>

              <Card className="border-0 ring-1 ring-[#dce4dc]"><CardHeader className="border-b border-[#e3e9e4]"><div className="flex items-center justify-between"><div><p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#688076]">Audit</p><CardTitle className="mt-1">模型与数据血缘</CardTitle></div><History className="size-4 text-[#527164]" /></div></CardHeader><CardContent className="grid grid-cols-2 gap-3"><div className="rounded-xl bg-[#f4f7f4] p-3"><p className="text-[10px] text-[#728079]">Run ID</p><p className="mt-1 truncate font-mono text-xs font-semibold">{run.id}</p></div><div className="rounded-xl bg-[#f4f7f4] p-3"><p className="text-[10px] text-[#728079]">Planner</p><p className="mt-1 text-sm font-semibold">{run.planner.mode === 'openai' ? run.planner.model : 'Deterministic'}</p></div><div className="rounded-xl bg-[#f4f7f4] p-3"><p className="text-[10px] text-[#728079]">真实标的</p><p className="mt-1 text-sm font-semibold">{run.dataLineage.universeSize} + SPY</p></div><div className="rounded-xl bg-[#f4f7f4] p-3"><p className="text-[10px] text-[#728079]">耗时</p><p className="mt-1 text-sm font-semibold">{run.latencyMs} ms</p></div><div className="col-span-2 rounded-xl border border-[#dce4dc] bg-white p-3 text-[10px] leading-4 text-[#66776f]">快照生成：{run.dataLineage.generatedAt.slice(0, 10)} · 财务可用滞后：{run.dataLineage.availabilityLagDays} 天</div></CardContent></Card>
            </div>
          </div>

          {completed && <Card className="mt-5 border-0 ring-1 ring-[#dce4dc]"><CardHeader className="border-b border-[#e3e9e4]"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#688076]">Frozen replay</p><CardTitle className="mt-1">历史样本上的组合回放</CardTitle></div><p className="text-[11px] text-[#718078]">仅用于验证数据与执行链路，不代表未来收益</p></div></CardHeader><CardContent><ChartContainer config={chartConfig} className="h-56 w-full aspect-auto" initialDimension={{ width: 900, height: 224 }}><AreaChart data={run.performance} margin={{ left: -20, right: 12, top: 8, bottom: 0 }}><defs><linearGradient id="portfolioFill" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="var(--color-portfolio)" stopOpacity={0.25} /><stop offset="95%" stopColor="var(--color-portfolio)" stopOpacity={0.02} /></linearGradient></defs><CartesianGrid vertical={false} strokeDasharray="3 3" /><XAxis dataKey="period" tickLine={false} axisLine={false} /><YAxis domain={['dataMin - 1', 'dataMax + 1']} tickLine={false} axisLine={false} /><ChartTooltip content={<ChartTooltipContent />} /><Area dataKey="benchmark" type="monotone" fill="transparent" stroke="var(--color-benchmark)" strokeDasharray="5 5" strokeWidth={1.5} /><Area dataKey="portfolio" type="monotone" fill="url(#portfolioFill)" stroke="var(--color-portfolio)" strokeWidth={2.5} /></AreaChart></ChartContainer></CardContent></Card>}
        </section>
      )}

      {view === 'evaluation' && (
        <section className="mx-auto max-w-[1280px] px-4 py-8 sm:px-6 lg:px-8">
          <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#507264]">Point-in-time walk-forward v0.3</p><h2 className="mt-2 text-3xl font-semibold tracking-[-0.045em]">每一轮只看当时可用的数据，再走 63 个交易日。</h2><p className="mt-3 max-w-3xl text-sm leading-6 text-[#64756d]">真实日行情从 2019 年开始冻结；年度财务数据统一延后 90 天才允许进入因子。每季重平衡，含 10 bps 换手成本，与 SPY 同期比较。</p></div><Button onClick={() => void rerunBenchmark()} disabled={benchmarkRunning} variant="outline" className="h-10 rounded-full border-[#bfcfc6] bg-white px-4">{benchmarkRunning ? <LoaderCircle className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}{benchmarkRunning ? '正在回测' : '重新运行 Walk-forward'}</Button></div>
          <div className="mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-5"><MetricCard label="年化收益" value={`${benchmark.annualizedReturn}%`} hint={`SPY ${benchmark.benchmarkAnnualizedReturn}%`} /><MetricCard label="Sharpe" value={`${benchmark.sharpe}`} hint={`SPY ${benchmark.benchmarkSharpe}`} tone="blue" /><MetricCard label="最大回撤" value={`${benchmark.maxDrawdown}%`} hint={`SPY ${benchmark.benchmarkMaxDrawdown}%`} tone="amber" /><MetricCard label="窗口胜率" value={`${benchmark.beatsBenchmarkRate}%`} hint={`${benchmark.windows} 个滚动窗口`} /><MetricCard label="年化换手" value={`${benchmark.annualizedTurnover}%`} hint={`${benchmark.transactionCostBps} bps 成本`} tone="blue" /></div>
          <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(320px,.85fr)]">
            <Card className="border-0 ring-1 ring-[#dce4dc]"><CardHeader className="border-b border-[#e3e9e4]"><div className="flex items-center justify-between"><div><p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#688076]">Out-of-sample equity</p><CardTitle className="mt-1">滚动窗口累计净值</CardTitle></div><TestTube2 className="size-4 text-[#4d7161]" /></div></CardHeader><CardContent><ChartContainer config={chartConfig} className="h-64 w-full aspect-auto" initialDimension={{ width: 760, height: 256 }}><AreaChart data={benchmark.equity} margin={{ left: -15, right: 12, top: 8, bottom: 0 }}><defs><linearGradient id="walkForwardFill" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="var(--color-portfolio)" stopOpacity={0.25} /><stop offset="95%" stopColor="var(--color-portfolio)" stopOpacity={0.02} /></linearGradient></defs><CartesianGrid vertical={false} strokeDasharray="3 3" /><XAxis dataKey="period" tickLine={false} axisLine={false} /><YAxis tickLine={false} axisLine={false} /><ChartTooltip content={<ChartTooltipContent />} /><Area dataKey="benchmark" type="monotone" fill="transparent" stroke="var(--color-benchmark)" strokeDasharray="5 5" strokeWidth={1.5} isAnimationActive={false} /><Area dataKey="portfolio" type="monotone" fill="url(#walkForwardFill)" stroke="var(--color-portfolio)" strokeWidth={2.5} isAnimationActive={false} /></AreaChart></ChartContainer><div className="mt-4 grid grid-cols-3 gap-2 text-center text-[10px] text-[#66776f]"><div className="rounded-xl bg-[#f4f7f4] p-3">{benchmark.periodStart}<br />起始</div><div className="rounded-xl bg-[#f4f7f4] p-3">{benchmark.observations}<br />日收益观测</div><div className="rounded-xl bg-[#f4f7f4] p-3">{benchmark.periodEnd}<br />结束</div></div></CardContent></Card>
            <Card className="border-0 bg-[#173f32] text-white ring-0"><CardHeader className="border-b border-white/10"><div className="flex items-center justify-between"><div><p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#a9beb5]">What this proves</p><CardTitle className="mt-1 text-white">评测边界写清楚</CardTitle></div><Info className="size-4 text-[#dff66c]" /></div></CardHeader><CardContent className="space-y-3 text-xs leading-5 text-[#c1d0c9]"><p className="rounded-xl bg-white/7 p-3"><span className="font-semibold text-white">证明：</span>历史数据适配、截止日过滤、滚动再平衡、交易成本和风险计算可重复。</p><p className="rounded-xl bg-white/7 p-3"><span className="font-semibold text-white">关键假设：</span>年度财务数据在财年结束 90 天后可用；这是保守近似，不等于精确公告时刻。</p><p className="rounded-xl bg-white/7 p-3"><span className="font-semibold text-white">不证明：</span>未来收益、实盘可成交性、真实滑点或模型具有投资能力。</p><div className="flex items-center justify-between pt-1"><span>财务字段覆盖</span><span className="font-mono text-[#dff66c]">{benchmark.dataCoverage}%</span></div></CardContent></Card>
          </div>
        </section>
      )}

      {view === 'architecture' && (
        <section className="mx-auto max-w-[1280px] px-4 py-8 sm:px-6 lg:px-8">
          <div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#507264]">System design</p><h2 className="mt-2 text-3xl font-semibold tracking-[-0.045em]">模型负责计划，工具负责事实，风控拥有否决权。</h2><p className="mt-3 max-w-3xl text-sm leading-6 text-[#64756d]">OpenAI Responses API 通过严格 Function Calling 生成计划；真实历史适配器和 TypeScript 计算层提供数值。没有服务端密钥时，界面明确退回规则 Planner，而不是伪装成模型调用。</p></div>
          <Card className="mt-7 border-0 bg-[#173f32] text-white ring-0"><CardContent className="py-6"><div className="grid items-stretch gap-3 lg:grid-cols-[1fr_auto_1fr_auto_1fr_auto_1fr]">{[
            { icon: Bot, title: 'Planner', copy: '解析任务、数量和风险预算' }, { icon: Wrench, title: 'Tool layer', copy: '数据、证据、计算与比较' }, { icon: BrainCircuit, title: 'Verifier', copy: '检查冲突、缺失与无依据结论' }, { icon: ShieldCheck, title: 'Risk guard', copy: '确定性约束与执行闸门' },
          ].map((node, index) => <div key={node.title} className="contents"><div className="rounded-2xl border border-white/12 bg-white/7 p-4"><node.icon className="size-5 text-[#dff66c]" /><p className="mt-5 font-semibold">{node.title}</p><p className="mt-2 text-xs leading-5 text-[#b9cbc3]">{node.copy}</p></div>{index < 3 && <div className="hidden items-center justify-center lg:flex"><ArrowRight className="size-4 text-[#759187]" /></div>}</div>)}</div></CardContent></Card>
          <div className="mt-5 grid gap-5 lg:grid-cols-3">
            <Card className="border-0 ring-1 ring-[#dce4dc]"><CardHeader><div className="flex items-center gap-2"><Database className="size-4 text-[#416a59]" /><CardTitle>当前真实实现</CardTitle></div></CardHeader><CardContent className="space-y-2 text-xs leading-5 text-[#607169]">{['Responses API 严格 Function Calling', '规则 Planner 显式降级', '8 只股票 + SPY 的真实历史快照', '财务字段 90 天保守可用滞后', 'Walk-forward + 10 bps 成本模型', 'Reflection、硬风控与模拟成交'].map((item) => <p key={item} className="flex items-center gap-2"><Check className="size-3.5 text-[#4d765f]" />{item}</p>)}</CardContent></Card>
            <Card className="border-0 ring-1 ring-[#dce4dc]"><CardHeader><div className="flex items-center gap-2"><Layers3 className="size-4 text-[#416a59]" /><CardTitle>工程可复现</CardTitle></div></CardHeader><CardContent className="space-y-2 text-xs leading-5 text-[#607169]">{['一条命令刷新数据快照', '每个候选保留来源编号', '计算层不依赖 LLM', '独立脱敏代码包已准备', '90 秒产品演示视频', '可扩展 EDGAR / Paper Broker adapter'].map((item) => <p key={item} className="flex items-center gap-2"><ChevronRight className="size-3.5 text-[#74877e]" />{item}</p>)}</CardContent></Card>
            <Card className="border-0 bg-[#fbf5eb] ring-1 ring-[#eadfcf]"><CardHeader><div className="flex items-center gap-2"><ShieldAlert className="size-4 text-[#835f37]" /><CardTitle className="text-[#65492d]">明确不做</CardTitle></div></CardHeader><CardContent className="space-y-2 text-xs leading-5 text-[#745f49]">{['不宣称预测股票涨跌', '不把合成评测写成实盘收益', '不允许 LLM 直接调用真钱接口', '不保存券商密钥到浏览器', '不允许 Agent 覆盖硬风控', '未经长期模拟验证不自动交易'].map((item) => <p key={item} className="flex items-center gap-2"><XCircle className="size-3.5 text-[#9a6d45]" />{item}</p>)}</CardContent></Card>
          </div>
          <div className="mt-5 rounded-2xl border border-[#dce4dc] bg-white p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-sm font-semibold">面向 Agent 的网页工具</p><p className="mt-1 text-xs text-[#6d7d75]">页面会在支持 WebMCP 的浏览器中注册两个结构化动作。</p></div><Badge variant="outline" className="border-[#cdd9d1]">Progressive enhancement</Badge></div><div className="mt-4 grid gap-3 md:grid-cols-2"><div className="rounded-xl bg-[#f4f7f4] p-4"><p className="flex items-center gap-2 font-mono text-xs font-semibold"><Code2 className="size-3.5" />run_finpilot_research</p><p className="mt-2 text-xs leading-5 text-[#65766d]">启动研究、证据校验和风控流程，并把结果同步到可见工作台。</p></div><div className="rounded-xl bg-[#f4f7f4] p-4"><p className="flex items-center gap-2 font-mono text-xs font-semibold"><Code2 className="size-3.5" />approve_finpilot_paper_trade</p><p className="mt-2 text-xs leading-5 text-[#65766d]">只批准已经通过硬风控的本地模拟单，不产生真实金融交易。</p></div></div></div>
          <div className="mt-5 grid gap-3 sm:grid-cols-3"><button onClick={() => window.location.assign('/agent-lab')} className="flex items-center justify-between rounded-2xl border border-[#dce4dc] bg-white p-5 text-left transition hover:border-[#7f9b8e]"><div><p className="text-sm font-semibold">查看 Agent 项目组合</p><p className="mt-1 text-xs text-[#6d7d75]">FinPilot · CareFlow · AgentBench</p></div><Layers3 className="size-5 text-[#365e4e]" /></button><button onClick={() => window.location.assign('/agentbench')} className="flex items-center justify-between rounded-2xl border border-[#dce4dc] bg-white p-5 text-left transition hover:border-[#7f9b8e]"><div><p className="text-sm font-semibold">打开回归评测台</p><p className="mt-1 text-xs text-[#6d7d75]">任务、工具、引用与安全门禁</p></div><TestTube2 className="size-5 text-[#365e4e]" /></button><button onClick={() => window.location.assign('/finpilot/finpilot-demo.mp4')} className="flex items-center justify-between rounded-2xl border border-[#dce4dc] bg-white p-5 text-left transition hover:border-[#7f9b8e]"><div><p className="text-sm font-semibold">播放 90 秒演示</p><p className="mt-1 text-xs text-[#6d7d75]">从任务输入、工具轨迹到 Walk-forward 评测</p></div><Video className="size-5 text-[#365e4e]" /></button></div>
        </section>
      )}

      <footer className="border-t border-[#dce4dc] bg-white/70"><div className="mx-auto flex max-w-[1500px] flex-wrap items-center justify-between gap-3 px-4 py-5 text-[11px] text-[#697972] sm:px-6 lg:px-8"><p>FinPilot v0.3 · 真实历史点时数据 · 可复现 Agent 工程演示</p><p className="flex items-center gap-1.5"><AlertTriangle className="size-3.5" />历史回测与模拟交易不构成投资建议</p></div></footer>
    </main>
  );
}
