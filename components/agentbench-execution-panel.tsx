'use client';

import { useMemo, useState } from 'react';
import { Activity, CheckCircle2, CircleMinus, Download, FlaskConical, GitCompareArrows, LoaderCircle, Play, ShieldCheck, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { ExecutionBenchReport, ExecutionBenchRow, ExecutionProfile } from '@/lib/agentbench-execution';

const profiles: Array<{ id: ExecutionProfile; title: string; detail: string }> = [
  { id: 'normal', title: '正常回归', detail: '12 条固定行为契约，验证路由、参数、授权与输出。' },
  { id: 'transient', title: '瞬时故障恢复', detail: '实际触发检索或工具失败，检查重试后是否满足原始任务。' },
  { id: 'containment', title: '永久故障阻断', detail: '2 条任务检索耗尽或输出不合法；期望拒绝返回结果。' },
  { id: 'mixed', title: '混合压力回归', detail: '2 条永久故障 + 10 条瞬时故障，分别统计恢复与阻断。' },
];
const faultLabels: Record<ExecutionBenchRow['failureMode'], string> = {
  none: '无故障', 'retrieval-timeout': '检索首次失败', 'retrieval-unavailable': '检索持续失败',
  'tool-timeout': '工具首次失败', 'tool-invalid-output': '工具输出非法',
};
const outcomeLabels = { returned: '任务断言通过', contained: '按预期阻断', failed: '未满足预期' };
const panel = 'rounded-2xl border border-[#dde4e2] bg-white';

function ResultMark({ passed }: { passed: boolean }) {
  return passed ? <CheckCircle2 className="size-4 shrink-0 text-emerald-700" aria-label="通过" /> : <XCircle className="size-4 shrink-0 text-red-700" aria-label="失败" />;
}

function Metric({ value, label, detail }: { value: string; label: string; detail: string }) {
  return <div className={`${panel} p-4`}><p className="text-xs text-slate-500">{label}</p><p className="mt-2 text-2xl font-semibold tabular-nums text-slate-900">{value}</p><p className="mt-2 text-[11px] leading-5 text-slate-500">{detail}</p></div>;
}

function downloadReport(report: ExecutionBenchReport, baseline: ExecutionBenchReport | null) {
  const payload = { exportedAt: new Date().toISOString(), report, baseline, notes: ['离线规则规划与本地工具；未调用模型或医院 API。', '故障阻断不等于任务成功；失败路径没有可导出的部分 trace。', '耗时为本机本次观测，包含图调度与重试等待；不是服务 SLA。'] };
  const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `${report.runId}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function AgentBenchExecutionPanel() {
  const [profile, setProfile] = useState<ExecutionProfile>('normal');
  const [repetitions, setRepetitions] = useState(1);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');
  const [report, setReport] = useState<ExecutionBenchReport | null>(null);
  const [baseline, setBaseline] = useState<ExecutionBenchReport | null>(null);
  const [selectedKey, setSelectedKey] = useState('X01:1');
  const [filter, setFilter] = useState('all');
  const [detailTab, setDetailTab] = useState<'assertions' | 'trace' | 'output'>('assertions');
  const selected = report?.rows.find((row) => row.key === selectedKey) ?? report?.rows[0];
  const compatibleBaseline = baseline?.suiteVersion === report?.suiteVersion ? baseline : null;
  const previousRows = useMemo(() => new Map(compatibleBaseline?.rows.map((row) => [row.key, row]) ?? []), [compatibleBaseline]);
  const visibleRows = report?.rows.filter((row) => filter === 'all' || (filter === 'failed' && !row.expectationMatched) || (filter === 'contained' && row.outcome === 'contained') || (filter === 'recovered' && (row.recoveredFailures ?? 0) > 0)) ?? [];
  const comparableRows = report?.rows.filter((row) => previousRows.get(row.key)?.failureMode === row.failureMode) ?? [];
  const regressions = comparableRows.filter((row) => previousRows.get(row.key)?.expectationMatched && !row.expectationMatched).length;

  const execute = async () => {
    setRunning(true);
    setError('');
    try {
      const response = await fetch('/api/agentbench/run', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ profile, repetitions }), signal: AbortSignal.timeout(28_000) });
      if (!response.ok) throw new Error(response.status === 429 ? '评测服务繁忙，稍后重试。' : '本次评测未完成，保留上次结果。请稍后重试。');
      const payload = await response.json() as { result: ExecutionBenchReport };
      if (payload.result?.schemaVersion !== 1 || !Array.isArray(payload.result.rows)) throw new Error('服务返回的报告格式无法识别。');
      setReport(payload.result);
      setSelectedKey(payload.result.rows[0]?.key ?? 'X01:1');
      setFilter('all');
    } catch (caught) {
      setError(caught instanceof Error && caught.name === 'TimeoutError' ? '本次运行超时，保留上次结果；可减少重复次数后重试。' : caught instanceof Error ? caught.message : '运行失败，请重试。');
    } finally {
      setRunning(false);
    }
  };

  return <div id="execution-workbench" className="scroll-mt-24 space-y-5">
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div><p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#667c72]">Execution workbench / v1</p><h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">用执行证据验证 Agent</h2><p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">把请求送进 CareFlow LangGraph，逐项核对工具参数、结果、来源与重试。固定 12 条合成用例覆盖 6 类意图；每条都对照预先编写的期望值。</p></div>
      <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600">离线执行 · 0 次模型调用</span>
    </div>

    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_350px]">
      <section className="rounded-2xl bg-[#242a33] p-5 text-white sm:p-6" aria-label="运行配置">
        <div className="flex items-center gap-2"><FlaskConical className="size-4 text-[#a5c9bd]" /><h3 className="font-semibold">选择执行场景</h3></div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">{profiles.map((option) => <button key={option.id} disabled={running} aria-pressed={profile === option.id} onClick={() => setProfile(option.id)} className={`rounded-xl border p-3 text-left transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:opacity-60 ${profile === option.id ? 'border-[#bcd7cb] bg-[#e3efe8] text-[#193a2b]' : 'border-white/15 bg-white/5 hover:bg-white/10'}`}><p className="text-sm font-semibold">{option.title}</p><p className={`mt-1.5 text-xs leading-5 ${profile === option.id ? 'text-[#496457]' : 'text-slate-300'}`}>{option.detail}</p></button>)}</div>
        <div className="mt-5 flex flex-wrap items-end justify-between gap-4">
          <label className="text-xs text-slate-300">重复次数<select value={repetitions} disabled={running} onChange={(event) => setRepetitions(Number(event.target.value))} className="ml-3 rounded-md border border-white/20 bg-[#343d48] px-3 py-2 text-white"><option value={1}>1 次 / 12 条</option><option value={2}>2 次 / 24 条</option><option value={3}>3 次 / 36 条</option></select></label>
          <Button onClick={() => void execute()} disabled={running} className="h-10 rounded-lg bg-[#e3efe8] px-4 text-[#193a2b] hover:bg-white">{running ? <LoaderCircle className="size-4 animate-spin" /> : <Play className="size-4" />}{running ? '图执行与断言检查中…' : '运行执行评测'}</Button>
        </div>
        <p className="mt-4 text-[11px] leading-5 text-slate-400">每次最多 36 次本地图执行。故障来自实际检索节点或工具执行器；所有号源、资料与转接均为本地演示数据。</p>
      </section>
      <section className={`${panel} p-5`} aria-label="行为门禁">
        <div className="flex items-center justify-between gap-3"><h3 className="font-semibold">行为门禁</h3><ShieldCheck className="size-5 text-[#53715f]" /></div>
        {report ? <><p className="mt-2 text-xs text-slate-500">{profiles.find((option) => option.id === report.profile)?.title} · 本次已完成 {report.summary.cases} 条</p><div className="mt-4 space-y-3">{report.gates.map((gate) => <div key={gate.id} className="rounded-xl bg-slate-50 p-3"><div className="flex items-center justify-between gap-2"><div className="flex items-center gap-2">{gate.covered ? <ResultMark passed={gate.passed} /> : <CircleMinus className="size-4 shrink-0 text-slate-400" aria-label="未覆盖" />}<span className={`text-xs font-semibold ${gate.covered ? '' : 'text-slate-500'}`}>{gate.label}</span></div><span className={`font-mono text-xs ${gate.covered ? '' : 'text-slate-500'}`}>{gate.covered ? gate.observed : '未覆盖'}</span></div><p className="mt-1.5 text-[11px] leading-4 text-slate-500">{gate.covered ? gate.threshold : '本次配置没有该类用例，不能判定该门禁通过。'}</p></div>)}</div></> : <div className="mt-6 space-y-4 text-sm leading-6 text-slate-500"><p>尚未执行。运行后将显示真实观测结果与每项断言。</p><p>永久故障被拦截代表控制生效，业务任务仍未完成。两者分别计数。</p></div>}
      </section>
    </div>

    <div aria-live="polite" aria-atomic="true">{error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</p>}{running && <p className="text-xs text-slate-600">正在实际执行所选配置；检索重试可能需要数秒。{report ? '下方暂时保留上次完整报告。' : ''}</p>}</div>
    {!report && <div className={`${panel} grid gap-4 p-5 sm:grid-cols-3`}><div><p className="text-sm font-semibold">01 / 固定预期</p><p className="mt-2 text-xs leading-6 text-slate-500">验证具体状态、工具顺序、日期参数和回答片段；不只读取执行器自报的通过标志。</p></div><div><p className="text-sm font-semibold">02 / 检查恢复</p><p className="mt-2 text-xs leading-6 text-slate-500">首次超时触发真实重试，持续失败停止返回结果，记录各自可观测证据。</p></div><div><p className="text-sm font-semibold">03 / 留下证据</p><p className="mt-2 text-xs leading-6 text-slate-500">保留基线、逐条查看 trace 并导出 JSON，方便复查回归和结果来源。</p></div></div>}

    {report && <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Metric label="任务断言通过" value={`${report.summary.taskPassed}/${report.summary.cases}`} detail={`应执行成功 ${report.summary.taskEligible} 条；包括正确澄清或转人工。`} />
        <Metric label="永久故障阻断" value={String(report.summary.contained)} detail="拒绝返回业务结果；不计入任务断言通过数。" />
        <Metric label="已恢复瞬时故障" value={String(report.summary.recovered)} detail="来自图恢复计数与工具尝试记录。" />
        <Metric label="未满足预期" value={String(report.summary.unexpected)} detail={`${report.summary.assertionsPassed}/${report.summary.assertions} 项断言通过。`} />
        <Metric label="观测 P95" value={`${report.summary.p95Ms} ms`} detail={`P50 ${report.summary.p50Ms} ms；总运行 ${report.summary.totalMs} ms。`} />
      </div>

      <section className={`${panel} p-4 sm:p-5`} aria-label="运行比较和导出">
        <div className="flex flex-wrap items-center justify-between gap-4"><div><div className="flex items-center gap-2"><GitCompareArrows className="size-4" /><h3 className="text-sm font-semibold">运行比较</h3></div><p className="mt-2 break-all font-mono text-[10px] text-slate-500">{report.suiteVersion} · {report.runId}</p></div><div className="flex flex-wrap gap-2"><Button variant="outline" disabled={running} onClick={() => setBaseline(report)}>{baseline?.runId === report.runId ? '已设为基线' : '将本次设为基线'}</Button><Button variant="outline" onClick={() => downloadReport(report, compatibleBaseline)}><Download className="size-4" />导出报告 JSON</Button></div></div>
        {compatibleBaseline ? <div className="mt-4 rounded-xl bg-slate-50 p-3 text-xs leading-6 text-slate-600"><p>基线：{profiles.find((option) => option.id === compatibleBaseline.profile)?.title} / {compatibleBaseline.summary.cases} 条。当前与基线同用例、同故障配置的可比较项 {comparableRows.length} 条，新增回归 {regressions} 条。</p><p>基线 P95 {compatibleBaseline.summary.p95Ms} ms → 当前 {report.summary.p95Ms} ms。耗时包含本地图调度与重试等待，配置或样本量不同时不能据此判定性能回归。</p><Button variant="link" className="px-0 text-xs" onClick={() => setBaseline(null)}>清除基线</Button></div> : <p className="mt-3 text-xs leading-5 text-slate-500">先运行正常回归并设为基线，再运行故障场景。比较仅在当前页面内保存，刷新会清空；套件版本不同的报告不会直接比较。</p>}
      </section>

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(360px,0.8fr)]">
        <section className={`${panel} overflow-hidden`} aria-label="执行用例结果">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-4"><h3 className="text-sm font-semibold">逐用例结果</h3><label className="text-xs text-slate-500">筛选<select className="ml-2 rounded-lg border border-slate-200 px-2 py-1.5 text-slate-700" value={filter} onChange={(event) => setFilter(event.target.value)}><option value="all">全部</option><option value="failed">未满足预期</option><option value="contained">永久故障阻断</option><option value="recovered">已恢复</option></select></label></div>
          <div className="overflow-x-auto"><table className="w-full min-w-[560px] text-left text-xs"><thead className="bg-slate-50 text-[10px] text-slate-500"><tr><th className="p-3 font-medium">用例 / 执行配置</th><th className="p-3 font-medium">结果</th><th className="p-3 font-medium">耗时</th><th className="p-3 font-medium">恢复</th></tr></thead><tbody>{visibleRows.map((row) => { const previous = previousRows.get(row.key); const changed = previous && (previous.failureMode !== row.failureMode || previous.outcome !== row.outcome); return <tr key={row.key} className={`border-t border-slate-100 ${row.key === selected?.key ? 'bg-[#edf5ef]' : ''}`}><td className="p-3"><button onClick={() => setSelectedKey(row.key)} aria-pressed={row.key === selected?.key} className="text-left font-semibold underline-offset-4 hover:underline focus-visible:underline"><span className="font-mono text-[10px] text-slate-500">{row.caseId}{report.repetitions > 1 ? ` / #${row.iteration}` : ''}</span><span className="ml-2">{row.label}</span></button><p className="mt-1 text-[10px] text-slate-500">{faultLabels[row.failureMode]}{changed ? ' · 相对基线有变化' : ''}</p></td><td className="p-3"><span className={`whitespace-nowrap rounded-md px-2 py-1 text-[10px] ${row.outcome === 'failed' ? 'bg-red-50 text-red-800' : row.outcome === 'contained' ? 'bg-amber-50 text-amber-800' : 'bg-emerald-50 text-emerald-800'}`}>{outcomeLabels[row.outcome]}</span></td><td className="p-3 font-mono tabular-nums">{row.durationMs} ms</td><td className="p-3 font-mono">{row.recoveredFailures ?? '—'}</td></tr>; })}</tbody></table></div>
          {visibleRows.length === 0 && <p className="p-8 text-center text-sm text-slate-500">没有符合筛选条件的用例。</p>}
        </section>

        {selected && <section className={`${panel} overflow-hidden`} aria-label="用例诊断">
          <div className="border-b border-slate-100 p-4"><div className="flex items-center gap-2"><Activity className="size-4 text-slate-500" /><h3 className="text-sm font-semibold">{selected.caseId} · {selected.label}</h3></div><p className="mt-3 rounded-lg bg-slate-50 p-3 text-xs leading-6 text-slate-600">{selected.query}</p><div className="mt-3 flex gap-2" role="tablist" aria-label="诊断视图">{(['assertions', 'trace', 'output'] as const).map((tab) => <button key={tab} role="tab" aria-selected={detailTab === tab} aria-controls="bench-diagnostic-panel" onClick={() => setDetailTab(tab)} className={`rounded-md px-3 py-1.5 text-xs ${detailTab === tab ? 'bg-[#242a33] text-white' : 'bg-slate-100 text-slate-600'}`}>{tab === 'assertions' ? '断言' : tab === 'trace' ? '执行轨迹' : '结果与工具'}</button>)}</div></div>
          <div id="bench-diagnostic-panel" role="tabpanel" className="max-h-[640px] overflow-auto p-4">
            {detailTab === 'assertions' && <div className="space-y-3">{selected.assertions.map((assertion) => <div key={assertion.id} className="rounded-lg border border-slate-100 p-3"><div className="flex gap-2"><ResultMark passed={assertion.passed} /><p className="text-xs font-medium leading-5">{assertion.label}</p></div><dl className="mt-2 grid grid-cols-[32px_minmax(0,1fr)] gap-x-2 gap-y-1 text-[10px] leading-5"><dt className="text-slate-400">预期</dt><dd className="break-words font-mono text-slate-600">{assertion.expected}</dd><dt className="text-slate-400">实际</dt><dd className="break-words font-mono text-slate-600">{assertion.observed}</dd></dl></div>)}</div>}
            {detailTab === 'trace' && (selected.result ? <ol className="space-y-4">{selected.result.trace.map((step, index) => <li key={`${step.id}-${index}`} className="border-l-2 border-[#cadace] pl-3"><div className="flex items-start justify-between gap-2"><p className="text-xs font-semibold">{index + 1}. {step.label}</p><span className="whitespace-nowrap font-mono text-[10px] text-slate-500">{step.durationMs} ms</span></div><p className="mt-1 font-mono text-[10px] text-slate-400">{step.id} · {step.status}</p><p className="mt-2 text-xs leading-6 text-slate-600">{step.detail}</p></li>)}</ol> : <div className="rounded-xl bg-amber-50 p-4 text-xs leading-6 text-amber-900"><p className="font-semibold">执行已拒绝：{selected.errorCode}</p><p className="mt-2">当前图在异常时不返回部分 trace、工具结果或重试计数。因此本报告只展示捕获的错误分类与外部观测耗时，不推断未返回的执行细节。</p></div>)}
            {detailTab === 'output' && (selected.result ? <div className="space-y-4"><p className="whitespace-pre-wrap rounded-xl bg-slate-50 p-3 text-xs leading-6 text-slate-700">{selected.result.answer}</p>{selected.result.toolCalls.map((call) => { const outcome = selected.result?.orchestration?.toolOutcomes?.find((item) => item.tool === call.tool); return <div key={call.id} className="rounded-lg border border-slate-200 p-3"><p className="break-all font-mono text-[11px] font-semibold">{call.tool}</p><p className="mt-1 text-[10px] text-slate-500">尝试 {outcome?.attempts ?? '—'} 次 · {outcome?.durationMs ?? '—'} ms · local-demo</p><pre className="mt-2 overflow-x-auto text-[10px] leading-5 text-slate-600">{JSON.stringify(call.input, null, 2)}</pre><p className="mt-2 text-xs leading-6 text-slate-600">{call.output}</p></div>; })}<div><p className="text-xs font-semibold">引用的本地规则</p>{selected.result.citations.map((citation) => <p key={citation.id} className="mt-2 text-[11px] leading-5 text-slate-500">{citation.id} · {citation.title}</p>)}</div></div> : <p className="rounded-xl bg-amber-50 p-4 text-xs leading-6 text-amber-900">{selected.outcome === 'contained' ? '故障被按预期拦截。' : '执行发生非预期失败。'}没有返回业务结果；这条任务没有完成。</p>)}
          </div>
        </section>}
      </div>
      <p className="text-[11px] leading-6 text-slate-500">这些结果验证固定服务流程的执行契约，不代表医学正确率、开放域推理能力或独立多 Agent 协作能力。计时样本来自本次服务进程；P95 使用 nearest-rank，重复用例不是独立统计样本。</p>
    </>}
  </div>;
}
