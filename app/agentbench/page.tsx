'use client';

import { useMemo, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Bug,
  Check,
  CheckCircle2,
  CircleGauge,
  FileWarning,
  FlaskConical,
  GitCompareArrows,
  LoaderCircle,
  Play,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  Wrench,
  X,
  XCircle,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { injectionLabels, runAgentBenchSuite, type FailureInjection } from '@/lib/agentbench';

const intentLabels = {
  appointment: '预约', records: '资料', 'report-prep': '报告', billing: '费用', urgent: '安全', unknown: '澄清',
};

function Score({ label, value, hint, accent = 'green' }: { label: string; value: string; hint: string; accent?: 'green' | 'blue' | 'amber' }) {
  const color = accent === 'blue' ? 'bg-[#eaf1f8] text-[#1d4c65]' : accent === 'amber' ? 'bg-[#fbefdd] text-[#724d25]' : 'bg-[#edf7e8] text-[#1e543f]';
  return <div className={`rounded-2xl p-4 ${color}`}><p className="text-[10px] font-semibold uppercase tracking-[0.12em] opacity-65">{label}</p><p className="mt-2 text-2xl font-semibold tracking-[-0.04em]">{value}</p><p className="mt-1 text-[10px] leading-4 opacity-70">{hint}</p></div>;
}

export default function AgentBenchPage() {
  const [injection, setInjection] = useState<FailureInjection>('none');
  const [running, setRunning] = useState(false);
  const [run, setRun] = useState(() => runAgentBenchSuite('none'));
  const [failedOnly, setFailedOnly] = useState(false);
  const allPassed = run.gates.every((gate) => gate.passed);
  const visibleRows = useMemo(() => failedOnly ? run.rows.filter((row) => !row.agentPassed) : run.rows, [failedOnly, run]);

  const execute = async () => {
    setRunning(true);
    await new Promise((resolve) => setTimeout(resolve, 650));
    setRun(runAgentBenchSuite(injection));
    setRunning(false);
  };

  return (
    <main className="min-h-screen bg-[#f4f6f3] text-[#14231d]">
      <header className="sticky top-0 z-40 border-b border-[#dce3dd] bg-[#f4f6f3]/95 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1450px] items-center justify-between gap-4 px-4 py-3.5 sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-3"><button onClick={() => window.location.assign('/agent-lab')} className="grid size-9 place-items-center rounded-full border border-[#d4ddd6] bg-white" aria-label="返回 Agent Lab"><ArrowLeft className="size-4" /></button><div><p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-[#6f8177]">Yingqi Lab · Project 03</p><h1 className="text-base font-semibold sm:text-lg">AgentBench <span className="hidden font-normal text-[#65776d] sm:inline">回归与可观测性</span></h1></div></div>
          <div className="flex items-center gap-2"><Badge className={allPassed ? 'bg-[#dff66c] text-[#173f32]' : 'bg-[#f2d2c7] text-[#763d31]'}>{allPassed ? 'RELEASE PASS' : 'RELEASE BLOCKED'}</Badge><Badge variant="outline" className="hidden border-[#d1dcd4] bg-white text-[#53675c] sm:inline-flex">24-case frozen suite</Badge></div>
        </div>
      </header>

      <section className="mx-auto max-w-[1450px] px-4 py-7 sm:px-6 lg:px-8">
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1.25fr)_390px]">
          <Card className="border-0 bg-[#173f32] text-white shadow-[0_22px_70px_rgba(21,63,50,.17)]">
            <CardHeader className="gap-3 px-5 pt-6 sm:px-7"><div className="flex items-center gap-2 text-[#dff66c]"><FlaskConical className="size-4" /><span className="text-xs font-semibold uppercase tracking-[0.14em]">Evaluation before vibes</span></div><CardTitle className="max-w-4xl text-2xl font-semibold leading-tight tracking-[-0.04em] text-white sm:text-4xl">把 Agent 从“演示成功一次”，变成“每次改动都知道坏在哪里”。</CardTitle><p className="max-w-3xl text-sm leading-6 text-[#c3d2cb]">同一套冻结任务同时跑朴素 FAQ 基线与 CareFlow Agent；任务成功、工具 schema、引用覆盖和安全升级均有独立门禁。</p></CardHeader>
            <CardContent className="px-5 pb-6 sm:px-7"><div className="grid gap-2 md:grid-cols-2">{(Object.keys(injectionLabels) as FailureInjection[]).map((key) => <button key={key} onClick={() => setInjection(key)} className={`rounded-2xl border p-3 text-left transition ${injection === key ? 'border-[#dff66c] bg-[#dff66c] text-[#173f32]' : 'border-white/12 bg-white/7 text-white hover:bg-white/12'}`}><div className="flex items-center gap-2"><Bug className="size-3.5" /><p className="text-xs font-semibold">{injectionLabels[key].label}</p></div><p className={`mt-1 text-[10px] leading-4 ${injection === key ? 'text-[#365649]' : 'text-[#aabeb5]'}`}>{injectionLabels[key].detail}</p></button>)}</div><div className="mt-4 flex flex-wrap items-center justify-between gap-3"><p className="font-mono text-[10px] text-[#9fb4aa]">run_id: {run.runId}</p><Button onClick={() => void execute()} disabled={running} className="rounded-full bg-[#dff66c] px-5 font-semibold text-[#173f32] hover:bg-white">{running ? <LoaderCircle className="size-4 animate-spin" /> : <Play className="size-4 fill-current" />}{running ? '运行回归中' : '运行回归套件'}</Button></div></CardContent>
          </Card>

          <Card className={`border-0 ${allPassed ? 'bg-[#eaf4e6] ring-[#c9ddc1]' : 'bg-[#fbebe6] ring-[#e9c9bf]'} ring-1`}>
            <CardHeader className="border-b border-black/7"><div className="flex items-center justify-between"><div><p className="text-[10px] font-semibold uppercase tracking-[0.13em] opacity-60">Regression gate</p><CardTitle className="mt-1">{allPassed ? '允许发布' : '阻断发布'}</CardTitle></div>{allPassed ? <ShieldCheck className="size-6 text-[#2d7051]" /> : <ShieldAlert className="size-6 text-[#914c3d]" />}</div></CardHeader>
            <CardContent className="space-y-2">{run.gates.map((gate) => <div key={gate.label} className="flex items-center justify-between gap-3 rounded-xl bg-white/65 p-3"><div className="flex items-center gap-2">{gate.passed ? <CheckCircle2 className="size-4 text-[#347056]" /> : <XCircle className="size-4 text-[#9b4f40]" />}<p className="text-xs font-semibold">{gate.label}</p></div><div className="text-right"><p className="font-mono text-xs font-semibold">{gate.observed}</p><p className="text-[9px] opacity-60">门槛 {gate.threshold}</p></div></div>)}</CardContent>
          </Card>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <Score label="朴素 FAQ 基线" value={`${run.baselineSuccess}%`} hint="单路由 + 单次检索" accent="amber" />
          <Score label="Agent 任务成功" value={`${run.agentSuccess}%`} hint={`${run.cases} 条冻结用例`} />
          <Score label="引用覆盖" value={`${run.groundedRate}%`} hint="来源 ID 可追溯" accent="blue" />
          <Score label="工具有效" value={`${run.toolValidity}%`} hint="required tool 命中" />
          <Score label="安全通过" value={`${run.safetyPassRate}%`} hint="急症必须转人工" accent="amber" />
          <Score label="P95 trace*" value={`${run.p95TraceLatencyMs} ms`} hint="不含网络/模型" accent="blue" />
        </div>

        <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_330px]">
          <Card className="overflow-hidden border-0 bg-white ring-1 ring-[#dbe3dc]">
            <CardHeader className="border-b border-[#e4eae5]"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-[10px] font-semibold uppercase tracking-[0.13em] text-[#6a7c72]">Case-level evidence</p><CardTitle className="mt-1">每条用例单独定位失败</CardTitle></div><button onClick={() => setFailedOnly(!failedOnly)} className={`rounded-full border px-3 py-2 text-xs font-semibold ${failedOnly ? 'border-[#173f32] bg-[#173f32] text-white' : 'border-[#cbd7cf] text-[#53675c]'}`}>{failedOnly ? '仅看失败' : '显示全部'}</button></div></CardHeader>
            <CardContent className="overflow-x-auto p-0"><table className="w-full min-w-[760px] border-collapse text-left"><thead><tr className="bg-[#f5f7f4] text-[10px] uppercase tracking-[0.08em] text-[#718078]"><th className="px-4 py-3">Case</th><th className="px-4 py-3">输入</th><th className="px-4 py-3">目标</th><th className="px-4 py-3">Baseline</th><th className="px-4 py-3">Intent</th><th className="px-4 py-3">Tool</th><th className="px-4 py-3">Ground</th><th className="px-4 py-3">Safety</th></tr></thead><tbody>{visibleRows.map((row) => <tr key={row.id} className="border-t border-[#edf0ed] text-xs"><td className="px-4 py-3 font-mono font-semibold">{row.id}</td><td className="max-w-[320px] px-4 py-3 text-[#596961]">{row.query}</td><td className="px-4 py-3"><span className="rounded-full bg-[#eef3ef] px-2 py-1 text-[10px] font-semibold">{intentLabels[row.expected]}</span></td><td className="px-4 py-3">{row.baselinePassed ? <Check className="size-4 text-[#3b765b]" /> : <X className="size-4 text-[#b06b59]" />}</td>{[row.intentPassed, row.toolPassed, row.grounded, row.safe].map((passed, index) => <td key={index} className="px-4 py-3">{passed ? <CheckCircle2 className="size-4 text-[#3b765b]" /> : <XCircle className="size-4 text-[#ad5d4c]" />}</td>)}</tr>)}</tbody></table>{visibleRows.length === 0 && <div className="p-8 text-center text-sm text-[#6f7d75]">当前运行没有失败用例。</div>}</CardContent>
          </Card>

          <div className="space-y-5">
            <Card className="border-0 bg-white ring-1 ring-[#dbe3dc]"><CardHeader className="border-b border-[#e4eae5]"><div className="flex items-center gap-2"><FileWarning className="size-4 text-[#6b725b]" /><CardTitle>失败分类</CardTitle></div></CardHeader><CardContent>{Object.keys(run.failures).length ? <div className="space-y-2">{Object.entries(run.failures).map(([failure, count]) => <div key={failure} className="flex items-center justify-between rounded-xl bg-[#f6f3ed] p-3"><code className="text-[10px] text-[#715d4e]">{failure}</code><span className="grid size-6 place-items-center rounded-full bg-white text-[10px] font-semibold">{count}</span></div>)}</div> : <p className="rounded-xl bg-[#edf6e8] p-4 text-xs leading-5 text-[#41634f]">0 个失败；所有发布门禁通过。用上方故障注入验证门禁确实会拦截问题。</p>}</CardContent></Card>
            <Card className="border-0 bg-[#1b4051] text-white"><CardHeader className="border-b border-white/10"><div className="flex items-center gap-2"><GitCompareArrows className="size-4 text-[#dff66c]" /><CardTitle className="text-white">为什么单独做评测台</CardTitle></div></CardHeader><CardContent className="space-y-3 text-xs leading-5 text-[#c9d6db]"><p>业务 Demo 证明“能跑”，回归台证明“改坏了能发现”。</p><p>指标拆到路由、工具、引用和安全层，失败后不只剩一个总分。</p><p>真实模型接入后继续增加 Token、调用费用、首字延迟和多轮循环率。</p></CardContent></Card>
            <Button variant="outline" onClick={() => { setInjection('none'); setRun(runAgentBenchSuite('none')); }} className="w-full rounded-full border-[#cbd7cf] bg-white"><RotateCcw className="size-4" />恢复通过基线</Button>
          </div>
        </div>

        <section className="mt-6 rounded-[2rem] border border-[#dbe3dc] bg-white p-5 sm:p-7">
          <div className="grid gap-5 lg:grid-cols-[1fr_1fr_1fr_auto] lg:items-center">{[
            { icon: CircleGauge, title: '任务级', copy: '目标是否完成，而不是回答像不像。' },
            { icon: Wrench, title: '节点级', copy: '路由、工具 schema、引用逐项定位。' },
            { icon: ShieldCheck, title: '发布级', copy: '关键安全指标不允许用平均分掩盖。' },
          ].map((item) => <div key={item.title} className="rounded-2xl bg-[#f4f7f4] p-4"><item.icon className="size-4 text-[#396b56]" /><p className="mt-4 text-sm font-semibold">{item.title}</p><p className="mt-1 text-xs leading-5 text-[#66756d]">{item.copy}</p></div>)}<Button onClick={() => window.location.assign('/careflow')} className="rounded-full bg-[#173f32] text-white hover:bg-[#2b5b48]">回到 CareFlow <ArrowRight className="size-4" /></Button></div>
        </section>
        <p className="mt-4 text-[10px] leading-4 text-[#718078]">* 本页指标由仓库中的冻结用例和确定性工作流实时计算；不是生产流量统计。P95 trace 为节点耗时模型，不含真实网络与模型推理。</p>
      </section>
    </main>
  );
}
