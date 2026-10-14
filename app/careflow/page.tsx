'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Bot,
  CheckCircle2,
  ChevronDown,
  CircleUserRound,
  Eraser,
  FileSearch,
  LoaderCircle,
  LockKeyhole,
  Play,
  ShieldCheck,
  Sparkles,
  Stethoscope,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import {
  careFlowPresets,
  evaluateCareFlowSuite,
  runCareFlowAgent,
  type CareFlowRun,
  type CareMemory,
} from '@/lib/careflow-agent';
import type { CareFlowFailureMode } from '@/lib/careflow-langgraph';

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const agentIcons = {
  Coordinator: Bot,
  'Evidence Agent': FileSearch,
  'Safety Agent': ShieldCheck,
};

const intentLabels = {
  appointment: '预约协助',
  records: '资料找回',
  'report-prep': '报告沟通准备',
  billing: '费用流程',
  urgent: '安全升级',
  unknown: '需要澄清',
};

export default function CareFlowPage() {
  const firstRun = useMemo(() => runCareFlowAgent(careFlowPresets[0], { consented: false }, 'CF-DEMO-001'), []);
  const evaluation = useMemo(() => evaluateCareFlowSuite(), []);
  const [query, setQuery] = useState<string>(careFlowPresets[0]);
  const [memory, setMemory] = useState<CareMemory>({ consented: false });
  const [errorMessage, setErrorMessage] = useState('');
  const [run, setRun] = useState<CareFlowRun>(firstRun);
  const [failureMode, setFailureMode] = useState<CareFlowFailureMode>('none');
  const [running, setRunning] = useState(false);
  const [visibleSteps, setVisibleSteps] = useState(firstRun.trace.length);
  const [expandedStep, setExpandedStep] = useState('verify');
  const runRef = useRef(run);
  const consentRef = useRef(false);

  useEffect(() => {
    runRef.current = run;
  }, [run]);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem('careflow-consented-memory');
      if (!saved) return;
      const parsed = JSON.parse(saved) as CareMemory;
      if (parsed.consented) {
        consentRef.current = true;
        const frame = window.requestAnimationFrame(() => setMemory(parsed));
        return () => window.cancelAnimationFrame(frame);
      }
    } catch {
      // The demo remains usable without browser storage.
    }
  }, []);

  const execute = useCallback(async (nextQuery: string, animate = true) => {
    setRunning(true);
    setErrorMessage('');
    let result: CareFlowRun;
    try {
      const response = await fetch('/api/careflow/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: nextQuery, memory, failureMode }),
      });
      if (!response.ok) throw new Error(`careflow ${response.status}`);
      const payload = await response.json() as { result: CareFlowRun };
      result = payload.result;
    } catch {
      setErrorMessage('本次任务未通过执行或校验，已停止；下方保留的是上次结果，不是本次成功输出。请检查输入或关闭故障演练后重试。');
      setRunning(false);
      return null;
    }
    if (!consentRef.current) {
      result.memory = { consented: false };
      result.memoryDelta = '未授权或已撤销；不保留本轮服务偏好。';
    }
    setRun(result);
    setMemory(result.memory);
    runRef.current = result;
    if (result.memory.consented) {
      try { window.localStorage.setItem('careflow-consented-memory', JSON.stringify(result.memory)); } catch { /* optional persistence */ }
    }
    if (!animate) {
      setVisibleSteps(result.trace.length);
      setRunning(false);
      return result;
    }
    setVisibleSteps(0);
    for (let index = 0; index < result.trace.length; index += 1) {
      await delay(index === 0 ? 150 : 240);
      setVisibleSteps(index + 1);
    }
    setExpandedStep(result.intent === 'urgent' ? 'finish' : 'verify');
    setRunning(false);
    return result;
  }, [failureMode, memory]);

  useEffect(() => {
    const context = (document as Document & { modelContext?: { registerTool?: (tool: unknown, options?: { signal?: AbortSignal }) => void | Promise<void> } }).modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    void Promise.resolve(context.registerTool({
      name: 'run_careflow_service_task',
      title: '运行 CareFlow 服务任务',
      description: '运行安全可溯源的医疗服务流程演示。只处理预约、材料、记录与费用流程，不提供医学建议。',
      inputSchema: {
        type: 'object',
        properties: { query: { type: 'string', minLength: 4, maxLength: 1200 } },
        required: ['query'],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, untrustedContentHint: true },
      async execute(input: unknown) {
        if (!input || typeof input !== 'object' || typeof (input as { query?: unknown }).query !== 'string') throw new Error('query is required');
        const result = await execute((input as { query: string }).query, false);
        if (!result) throw new Error('CareFlow execution failed safely; no success result was produced.');
        return { runId: result.id, status: result.status, intent: result.intent, toolCalls: result.toolCalls.map((item) => item.tool), safe: result.safety.passed };
      },
    }, { signal: lifecycle.signal })).catch(() => undefined);
    return () => lifecycle.abort();
  }, [execute]);

  const toggleConsent = () => {
    const consented = !memory.consented;
    consentRef.current = consented;
    const next = consented ? { ...memory, consented } : { consented: false };
    setMemory(next);
    if (!consented) {
      try { window.localStorage.removeItem('careflow-consented-memory'); } catch { /* optional persistence */ }
    }
  };

  const clearMemory = () => {
    consentRef.current = false;
    setMemory({ consented: false });
    try { window.localStorage.removeItem('careflow-consented-memory'); } catch { /* optional persistence */ }
  };

  return (
    <main className="min-h-screen bg-[#f7f8fa] text-[#15201c]">
      <header className="sticky top-0 z-40 border-b border-[#ddd8cb] bg-[#f7f8fa]/94 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1480px] items-center justify-between gap-4 px-4 py-3.5 sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <button onClick={() => window.location.assign('/agent-lab')} className="grid size-9 shrink-0 place-items-center rounded-md border border-[#d8d2c4] bg-white" aria-label="返回 工具首页"><ArrowLeft className="size-4" /></button>
            <div><p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-[#6b766f]">服务工具</p><h1 className="text-base font-semibold tracking-[-0.025em] sm:text-lg">CareFlow <span className="hidden font-normal text-[#6d766f] sm:inline">服务请求</span></h1></div>
          </div>
          <div className="flex items-center gap-2"><Badge className="bg-[#dbe7f7] text-[#242a33] hover:bg-[#dbe7f7]">CareFlow v3</Badge><Badge variant="outline" className="hidden border-[#d3cec1] bg-white text-[#53645d] sm:inline-flex">LangGraph</Badge></div>
        </div>
      </header>

      <section className="mx-auto max-w-[1480px] px-4 py-7 sm:px-6 lg:px-8">
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.34fr)_360px]">
          <Card className="overflow-hidden border-0 bg-[#242a33] text-white ">
            <CardHeader className="gap-3 px-5 pt-6 sm:px-7">
              <CardTitle className="max-w-4xl text-2xl font-semibold leading-tight tracking-[-0.04em] text-white sm:text-xl">服务请求</CardTitle>
            </CardHeader>
            <CardContent className="px-5 pb-6 sm:px-7">
              <div className="mb-3 flex gap-2 overflow-x-auto pb-1">{careFlowPresets.map((preset, index) => <button key={preset} onClick={() => setQuery(preset)} className={`shrink-0 rounded-md border px-3 py-1.5 text-[11px] font-semibold ${query === preset ? 'border-[#dbe7f7] bg-[#dbe7f7] text-[#242a33]' : 'border-white/15 bg-white/7 text-[#c7d3cd]'}`}>案例 {index + 1}</button>)}</div>
              <Textarea value={query} onChange={(event) => setQuery(event.target.value)} className="min-h-24 resize-none border-white/15 bg-white/8 p-4 text-[15px] leading-6 text-white placeholder:text-white/40 focus-visible:border-[#dbe7f7] focus-visible:ring-[#dbe7f7]/20" aria-label="输入服务任务" />
              <div className="mt-3 flex flex-wrap items-center gap-2"><span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#9fb2a9]">故障演练</span>{([
                ['none', '正常链路'], ['retrieval-timeout', '检索超时 → 自动重试'], ['tool-timeout', '工具瞬时失败 → 重试'], ['tool-invalid-output', '损坏工具结果 → 拒绝'],
              ] as const).map(([value, label]) => <button key={value} onClick={() => setFailureMode(value)} className={`rounded-md border px-3 py-1.5 text-[10px] font-semibold ${failureMode === value ? 'border-[#dbe7f7] bg-[#dbe7f7] text-[#242a33]' : 'border-white/15 text-[#c7d3cd]'}`}>{label}</button>)}</div>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3"><p className="max-w-xl text-sm leading-5 text-[#9fb2a9]">合成数据 · 不提交真实预约或工单 · 不提供医疗建议</p><Button disabled={running || query.trim().length < 4} onClick={() => void execute(query)} className="h-10 rounded-md bg-[#dbe7f7] px-5 font-semibold text-[#242a33] hover:bg-white">{running ? <LoaderCircle className="size-4 animate-spin" /> : <Play className="size-4 fill-current" />}{running ? '运行中' : '运行任务'}</Button></div>
              {errorMessage && <p role="alert" className="mt-4 rounded-xl bg-red-950 p-4 text-sm leading-6 text-white">{errorMessage}</p>}
              <p className="mt-3 text-xs leading-5 text-[#d5ded9]">紧急情况请直接联系急救或现场人员，本工具不会代为联系。</p>
            </CardContent>
          </Card>

          <Card className="border-0 bg-white ring-1 ring-[#ded9cd]">
            <CardHeader className="border-b border-[#e5e0d5]"><div className="flex items-center justify-between"><div><CardTitle className="mt-1">本机偏好</CardTitle></div><CircleUserRound className="size-5 text-[#3a6755]" /></div></CardHeader>
            <CardContent>
              <button aria-label={memory.consented ? '关闭长期记忆' : '开启长期记忆'} aria-pressed={memory.consented} onClick={toggleConsent} className={`flex w-full items-center justify-between rounded-2xl p-4 text-left ${memory.consented ? 'bg-[#ecf7e4]' : 'bg-[#f3f1eb]'}`}><div><p className="text-sm font-semibold">允许保存服务偏好</p><p className="mt-1 text-[11px] text-[#6b766f]">只保存在当前浏览器，可随时清空</p></div><span className={`relative h-6 w-11 rounded-md transition ${memory.consented ? 'bg-[#285f49]' : 'bg-[#b6b8b2]'}`}><span className={`absolute top-1 size-4 rounded-md bg-white transition ${memory.consented ? 'left-6' : 'left-1'}`} /></span></button>
              <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-xl border border-[#e0ddd4] p-3"><p className="text-[10px] text-[#7e8782]">城市</p><p className="mt-1 font-semibold">{memory.city || '未记录'}</p></div>
                <div className="rounded-xl border border-[#e0ddd4] p-3"><p className="text-[10px] text-[#7e8782]">偏好时段</p><p className="mt-1 font-semibold">{memory.preferredTime || '未记录'}</p></div>
                <div className="col-span-2 rounded-xl border border-[#e0ddd4] p-3"><p className="text-[10px] text-[#7e8782]">最近任务</p><p className="mt-1 font-semibold">{memory.recentIntent ? intentLabels[memory.recentIntent] : '未记录'}</p></div>
              </div>
              <button onClick={clearMemory} className="mt-3 flex w-full items-center justify-center gap-2 rounded-md border border-[#d8d2c5] py-2.5 text-xs font-semibold text-[#5c6963]"><Eraser className="size-3.5" />清空本机记忆</button>
            </CardContent>
          </Card>
        </div>

        <div className="mt-5 grid gap-5 xl:grid-cols-[320px_minmax(0,1fr)_370px]">
          <Card className="border-0 bg-white ring-1 ring-[#ded9cd]">
            <CardHeader className="border-b border-[#e8e3d9]"><div className="flex items-center justify-between"><CardTitle>执行记录</CardTitle><span className="font-mono text-[10px] text-[#748078]">{run.orchestration ? run.orchestration.wallClockMs + ' ms' : '示例，非实测'}</span></div></CardHeader>
            <CardContent className="space-y-1">
              {run.trace.map((step, index) => {
                const Icon = agentIcons[step.agent];
                const visible = index < visibleSteps;
                const expanded = expandedStep === step.id && visible;
                return <button key={step.id} disabled={!visible} onClick={() => setExpandedStep(expanded ? '' : step.id)} className={`w-full rounded-xl p-3 text-left transition ${expanded ? 'bg-[#edf6e8]' : visible ? 'hover:bg-[#f6f5f1]' : 'opacity-35'}`}><div className="flex gap-3"><span className={`grid size-8 shrink-0 place-items-center rounded-md ${step.status === 'warning' ? 'bg-[#f5e5c6] text-[#7b592d]' : 'bg-[#242a33] text-[#dbe7f7]'}`}>{visible ? <Icon className="size-4" /> : <LoaderCircle className="size-4" />}</span><div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-2"><p className="text-xs font-semibold">{step.label}</p><ChevronDown className={`size-3.5 text-[#87908a] ${expanded ? 'rotate-180' : ''}`} /></div><p className="mt-1 text-[10px] text-[#78837d]">{step.agent === 'Coordinator' ? '流程' : step.agent === 'Evidence Agent' ? '检索' : '校验'}</p></div></div>{expanded && <p className="ml-11 mt-2 border-l-2 border-[#ced9d0] pl-3 text-[11px] leading-5 text-[#65716b]">{step.detail}</p>}</button>;
              })}
            </CardContent>
          </Card>

          <Card className="border-0 bg-white ring-1 ring-[#ded9cd]">
            <CardHeader className="border-b border-[#e8e3d9]"><div className="flex flex-wrap items-center justify-between gap-3"><div><CardTitle className="mt-1">{intentLabels[run.intent]}</CardTitle></div><Badge className={run.status === 'handoff' ? 'bg-[#f3dfc0] text-[#714c20]' : 'bg-[#e5f4df] text-[#2a6248]'}>{run.status === 'handoff' ? '待人工处理（草稿）' : run.status === 'needs-clarification' ? '等待补充' : '完成'}</Badge></div></CardHeader>
            <CardContent>
              <p className="whitespace-pre-line text-base leading-7 text-[#405249]">{run.answer}</p>
              <div className="mt-5 rounded-2xl bg-[#f7f8fa] p-4"><p className="text-[10px] font-semibold uppercase tracking-[0.13em] text-[#66766e]">下一步</p><div className="mt-3 space-y-2">{run.nextActions.map((action, index) => <p key={action} className="flex items-center gap-2 text-xs text-[#56665e]"><span className="grid size-5 place-items-center rounded-md bg-white text-[9px] font-semibold text-[#285f49]">{index + 1}</span>{action}</p>)}</div></div>
              <div className="mt-5"><p className="text-[10px] font-semibold uppercase tracking-[0.13em] text-[#66766e]">来源与更新时间</p><div className="mt-2 space-y-2">{run.citations.length ? run.citations.map((citation) => <div key={citation.id} className="rounded-xl border border-[#e3dfd5] p-3"><div className="flex items-center justify-between gap-3"><p className="text-xs font-semibold">{citation.title}</p><span className="font-mono text-[9px] text-[#7d8881]">{citation.id}</span></div><p className="mt-1 text-[11px] leading-5 text-[#6b7770]">{citation.excerpt}</p></div>) : <p className="rounded-xl bg-[#f5f3ee] p-3 text-xs text-[#6e7973]">本轮没有足够来源，因此只返回澄清问题。</p>}</div></div>
            </CardContent>
          </Card>

          <div className="space-y-5">
            <Card className="border-0 bg-white ring-1 ring-[#ded9cd]">
              <CardHeader className="border-b border-[#e8e3d9]"><CardTitle>运行信息</CardTitle></CardHeader>
              <CardContent className="space-y-4 text-sm">
                <p>计划来源：<strong>{run.orchestration?.modelMode === 'openai' ? run.orchestration.model : run.orchestration?.modelMode === 'test-fixture' ? '离线测试输入' : run.orchestration ? (run.orchestration.modelAttempted ? '模型调用后采用规则计划' : '规则计划（未调用模型）') : '初始示例，尚未运行'}</strong></p>
                <p className="leading-6 text-[#596a60]">{run.orchestration?.plannerReason || '点击运行后显示服务端记录。'}</p>
                <div><p className="font-semibold">计划工具</p><p className="mt-1 break-words font-mono">{run.orchestration?.plannedTools?.join(' → ') || '无'}</p></div>
                <div><p className="font-semibold">实际工具</p><p className="mt-1 break-words font-mono">{run.orchestration?.executedTools?.join(' → ') || '无'}</p></div>
                <p>Token：{run.orchestration?.usage?.totalTokens ?? '未调用或未返回'} · 恢复：{run.orchestration?.recoveredFailures ?? 0} 次</p>
                <p className="text-[#596a60]">本地演示工具；没有连接医院 API。检查点仅在进程内。</p>
                <Button variant="outline" disabled={!run.orchestration || !!errorMessage || running} onClick={() => {
                  const url = URL.createObjectURL(new Blob([JSON.stringify(run, null, 2)], { type: 'application/json' }));
                  const anchor = document.createElement('a'); anchor.href = url; anchor.download = run.id + '.json'; anchor.click(); URL.revokeObjectURL(url);
                }}>下载本次运行记录</Button>
              </CardContent>
            </Card>
            <Card className="border-0 bg-[#303b4b] text-white"><CardHeader className="border-b border-white/10"><div className="flex items-center justify-between"><CardTitle className="text-white">安全闸门</CardTitle><ShieldCheck className="size-5 text-[#dbe7f7]" /></div></CardHeader><CardContent><p className="text-sm font-semibold text-[#dbe7f7]">{run.safety.passed ? 'PASS' : 'BLOCK'}</p><p className="mt-2 text-xs leading-5 text-[#c4d3d9]">{run.safety.reason}</p><div className="mt-4 flex items-center gap-2 rounded-xl bg-white/8 p-3 text-[11px] text-[#d5e0e4]"><LockKeyhole className="size-3.5 text-[#dbe7f7]" />独立校验节点不可被计划器省略。</div></CardContent></Card>
            <Card className="border-0 bg-white ring-1 ring-[#ded9cd]"><CardHeader className="border-b border-[#e8e3d9]"><CardTitle>工具调用</CardTitle></CardHeader><CardContent className="space-y-2">{run.toolCalls.map((call) => <div key={call.id} className="rounded-xl bg-[#f5f4ef] p-3"><div className="flex items-center justify-between gap-2"><p className="truncate font-mono text-[10px] font-semibold text-[#315b4a]">{call.tool}</p>{call.status === 'ok' ? <CheckCircle2 className="size-3.5 shrink-0 text-[#3c795d]" /> : <AlertTriangle className="size-3.5 shrink-0 text-[#aa7640]" />}</div><p className="mt-1 text-[10px] leading-4 text-[#768078]">{call.output}</p></div>)}</CardContent></Card>
          </div>
        </div>

        <div className="mt-6 flex justify-end"><Button variant="outline" onClick={() => window.location.assign('/agentbench')}>打开评测</Button></div>
      </section>

      <footer className="border-t border-[#ddd8cb] bg-white/60"><div className="mx-auto flex max-w-[1480px] flex-wrap items-center justify-between gap-3 px-5 py-5 text-[11px] text-[#69746e]"><p>CareFlow · 本地演示工具</p><p className="flex items-center gap-1.5"><Stethoscope className="size-3.5" />服务流程工程演示，不提供医疗建议</p></div></footer>
    </main>
  );
}
