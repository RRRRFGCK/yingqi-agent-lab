'use client';

import { useMemo, useState } from 'react';
import {
  ArrowLeft,
  Bug,
  Check,
  CheckCircle2,
  FileWarning,
  LoaderCircle,
  Play,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  X,
  XCircle,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { injectionLabels, runAgentBenchSuite, type FailureInjection } from '@/lib/agentbench';
import { AgentBenchExecutionPanel } from '@/components/agentbench-execution-panel';

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
    <main className="min-h-screen bg-[#f7f8fa] text-[#14231d]">
      <header className="sticky top-0 z-40 border-b border-[#dce3dd] bg-[#f7f8fa]/95 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1450px] items-center justify-between gap-4 px-4 py-3.5 sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-3"><button onClick={() => window.location.assign('/agent-lab')} className="grid size-9 place-items-center rounded-md border border-[#d4ddd6] bg-white" aria-label="返回工具首页"><ArrowLeft className="size-4" /></button><div><p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-[#6f8177]">评测工具</p><h1 className="text-base font-semibold sm:text-lg">AgentBench <span className="hidden font-normal text-[#65776d] sm:inline">执行回归工作台</span></h1></div></div>
          <Badge variant="outline" className="border-[#d1dcd4] bg-white text-[#53675c]">LangGraph · Offline</Badge>
        </div>
      </header>

      <section className="mx-auto max-w-[1450px] px-4 py-7 sm:px-6 lg:px-8">
        <AgentBenchExecutionPanel />
        <details className="mt-8 rounded-2xl border border-[#dce3dd] bg-[#eff2ef] p-4 sm:p-5">
        <summary className="cursor-pointer text-sm font-semibold">旧版评分层演示 · 24 条用例</summary>
        <p className="mb-4 mt-3 text-xs leading-6 text-[#65776d]">下面保留原有评分门禁教学。这里仅修改评分标志，未执行 LangGraph；请使用上方工作台检查实际工具故障与恢复。</p>
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1.25fr)_390px]">
          <Card className="border-0 bg-[#242a33] text-white ">
            <CardHeader><CardTitle className="text-white">评分故障模拟</CardTitle></CardHeader>
            <CardContent className="px-5 pb-6 sm:px-7"><div className="grid gap-2 md:grid-cols-2">{(Object.keys(injectionLabels) as FailureInjection[]).map((key) => <button key={key} onClick={() => setInjection(key)} className={`rounded-2xl border p-3 text-left transition ${injection === key ? 'border-[#dbe7f7] bg-[#dbe7f7] text-[#242a33]' : 'border-white/12 bg-white/7 text-white hover:bg-white/12'}`}><div className="flex items-center gap-2"><Bug className="size-3.5" /><p className="text-xs font-semibold">{injectionLabels[key].label}</p></div><p className={`mt-1 text-[10px] leading-4 ${injection === key ? 'text-[#365649]' : 'text-[#aabeb5]'}`}>{injectionLabels[key].detail}</p></button>)}</div><div className="mt-4 flex flex-wrap items-center justify-between gap-3"><p className="font-mono text-[10px] text-[#9fb4aa]">run_id: {run.runId}</p><Button onClick={() => void execute()} disabled={running} className="rounded-md bg-[#dbe7f7] px-5 font-semibold text-[#242a33] hover:bg-white">{running ? <LoaderCircle className="size-4 animate-spin" /> : <Play className="size-4 fill-current" />}{running ? '运行回归中' : '运行回归套件'}</Button></div></CardContent>
          </Card>

          <Card className={`border-0 ${allPassed ? 'bg-[#eaf4e6] ring-[#c9ddc1]' : 'bg-[#fbebe6] ring-[#e9c9bf]'} ring-1`}>
            <CardHeader className="border-b border-black/7"><div className="flex items-center justify-between"><div><CardTitle className="mt-1">{allPassed ? '检查通过' : '检查失败'}</CardTitle></div>{allPassed ? <ShieldCheck className="size-6 text-[#2d7051]" /> : <ShieldAlert className="size-6 text-[#914c3d]" />}</div></CardHeader>
            <CardContent className="space-y-2">{run.gates.map((gate) => <div key={gate.label} className="flex items-center justify-between gap-3 rounded-xl bg-white/65 p-3"><div className="flex items-center gap-2">{gate.passed ? <CheckCircle2 className="size-4 text-[#347056]" /> : <XCircle className="size-4 text-[#9b4f40]" />}<p className="text-xs font-semibold">{gate.label}</p></div><div className="text-right"><p className="font-mono text-xs font-semibold">{gate.observed}</p><p className="text-[9px] opacity-60">门槛 {gate.threshold}</p></div></div>)}</CardContent>
          </Card>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <Score label="朴素 FAQ 基线" value={`${run.baselineSuccess}%`} hint="单路由 + 单次检索" accent="amber" />
          <Score label="Agent 任务成功" value={`${run.agentSuccess}%`} hint={`${run.cases} 条冻结用例`} />
          <Score label="引用覆盖" value={`${run.groundedRate}%`} hint="来源 ID 可追溯" accent="blue" />
          <Score label="工具有效" value={`${run.toolValidity}%`} hint="required tool 命中" />
          <Score label="安全通过" value={`${run.safetyPassRate}%`} hint="急症必须转人工" accent="amber" />
        </div>

        <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_330px]">
          <Card className="overflow-hidden border-0 bg-white ring-1 ring-[#dbe3dc]">
            <CardHeader className="border-b border-[#e4eae5]"><div className="flex flex-wrap items-center justify-between gap-3"><div><CardTitle className="mt-1">用例结果</CardTitle></div><button onClick={() => setFailedOnly(!failedOnly)} className={`rounded-md border px-3 py-2 text-xs font-semibold ${failedOnly ? 'border-[#242a33] bg-[#242a33] text-white' : 'border-[#cbd7cf] text-[#53675c]'}`}>{failedOnly ? '仅看失败' : '显示全部'}</button></div></CardHeader>
            <CardContent className="overflow-x-auto p-0"><table className="w-full min-w-[760px] border-collapse text-left"><thead><tr className="bg-[#f5f7f4] text-[10px] uppercase tracking-[0.08em] text-[#718078]"><th className="px-4 py-3">Case</th><th className="px-4 py-3">输入</th><th className="px-4 py-3">目标</th><th className="px-4 py-3">Baseline</th><th className="px-4 py-3">Intent</th><th className="px-4 py-3">Tool</th><th className="px-4 py-3">Ground</th><th className="px-4 py-3">Safety</th></tr></thead><tbody>{visibleRows.map((row) => <tr key={row.id} className="border-t border-[#edf0ed] text-xs"><td className="px-4 py-3 font-mono font-semibold">{row.id}</td><td className="max-w-[320px] px-4 py-3 text-[#596961]">{row.query}</td><td className="px-4 py-3"><span className="rounded-md bg-[#eef3ef] px-2 py-1 text-[10px] font-semibold">{intentLabels[row.expected]}</span></td><td className="px-4 py-3">{row.baselinePassed ? <Check className="size-4 text-[#3b765b]" /> : <X className="size-4 text-[#b06b59]" />}</td>{[row.intentPassed, row.toolPassed, row.grounded, row.safe].map((passed, index) => <td key={index} className="px-4 py-3">{passed ? <CheckCircle2 className="size-4 text-[#3b765b]" /> : <XCircle className="size-4 text-[#ad5d4c]" />}</td>)}</tr>)}</tbody></table>{visibleRows.length === 0 && <div className="p-8 text-center text-sm text-[#6f7d75]">当前运行没有失败用例。</div>}</CardContent>
          </Card>

          <div className="space-y-5">
            <Card className="border-0 bg-white ring-1 ring-[#dbe3dc]"><CardHeader className="border-b border-[#e4eae5]"><div className="flex items-center gap-2"><FileWarning className="size-4 text-[#6b725b]" /><CardTitle>失败分类</CardTitle></div></CardHeader><CardContent>{Object.keys(run.failures).length ? <div className="space-y-2">{Object.entries(run.failures).map(([failure, count]) => <div key={failure} className="flex items-center justify-between rounded-xl bg-[#f6f3ed] p-3"><code className="text-[10px] text-[#715d4e]">{failure}</code><span className="grid size-6 place-items-center rounded-md bg-white text-[10px] font-semibold">{count}</span></div>)}</div> : <p className="rounded-xl bg-[#edf6e8] p-4 text-xs leading-5 text-[#41634f]">0 个失败</p>}</CardContent></Card>
            <Button variant="outline" onClick={() => { setInjection('none'); setRun(runAgentBenchSuite('none')); }} className="w-full rounded-md border-[#cbd7cf] bg-white"><RotateCcw className="size-4" />恢复通过基线</Button>
          </div>
        </div>

        </details>
        <div className="mt-6 flex justify-end"><Button variant="outline" onClick={() => window.location.assign('/careflow')}>返回 CareFlow</Button></div>
      </section>
    </main>
  );
}
