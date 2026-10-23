'use client';

import { useMemo, useState } from 'react';
import { BarChart3, CheckCircle2, Download, Info, ShieldAlert } from 'lucide-react';
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart';
import { type AgentRun, type Strategy } from '@/lib/finpilot-agent';
import { compareFinPilotStrategies, researchComparisonCsv, type ResearchOptions } from '@/lib/finpilot-research';

const chartConfig = {
  'low-volatility': { label: '低波动', color: '#315e50' },
  balanced: { label: '均衡', color: '#316ca3' },
  'quality-growth': { label: '质量成长', color: '#a96732' },
  benchmark: { label: 'SPY（扣费）', color: '#8e96a1' },
} satisfies ChartConfig;
const number = (value: number | null, suffix = '') => value === null ? '—' : `${value.toFixed(2)}${suffix}`;

function downloadFile(contents: string, filename: string, type: string) {
  const url = URL.createObjectURL(new Blob([contents], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function FinPilotResearchPanel({ sourceRun }: { sourceRun: AgentRun }) {
  const initialOptions: ResearchOptions = {
    lookbackDays: 252, transactionCostBps: 10, candidateCount: sourceRun.candidateCount,
    maxPosition: sourceRun.maxPosition, maxDrawdown: sourceRun.maxDrawdown,
  };
  const [options, setOptions] = useState(initialOptions);
  const [focus, setFocus] = useState<Strategy>(sourceRun.strategy);
  const [chartMode, setChartMode] = useState<'net' | 'drawdown'>('net');
  const computed = useMemo(() => {
    try { return { result: compareFinPilotStrategies(sourceRun.task, options), error: null }; }
    catch (error) { return { result: null, error: error instanceof Error ? error.message : '无法计算实验。' }; }
  }, [sourceRun.task, options]);
  const result = computed.result;
  const chart = useMemo(() => {
    if (!result) return [];
    const peaks: Record<string, number> = { benchmark: 100 };
    return result.strategies[0].points.map((point, index) => {
      const row: Record<string, number | string> = { date: point.date };
      const values = [...result.strategies.map((strategy) => [strategy.strategy, strategy.points[index].net] as const), ['benchmark', point.benchmark] as const];
      for (const [key, value] of values) {
        peaks[key] = Math.max(peaks[key] ?? 100, value);
        row[key] = chartMode === 'net' ? value : (value / peaks[key] - 1) * 100;
      }
      return row;
    });
  }, [result, chartMode]);
  const selected = result?.strategies.find((strategy) => strategy.strategy === focus);
  const update = (key: keyof ResearchOptions, value: number) => setOptions((current) => ({ ...current, [key]: value }));

  return (
    <section id="research-lab" className="mx-auto max-w-[1280px] scroll-mt-24 space-y-5 px-4 py-8 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div><p className="text-xs font-semibold tracking-widest text-[#688076]">FINPILOT / RESEARCH LAB</p><h2 className="mt-2 text-2xl font-semibold">把同一个问题，交给三种策略</h2><p className="mt-2 text-sm leading-6 text-[#64756d]">统一约束、逐日复算，检查收益来自哪里，以及成本改变了什么。</p></div>
        <Badge variant="outline" className="border-[#d4b888] bg-[#fff8e9] text-[#795623]">冻结样本 · 回溯诊断</Badge>
      </div>

      <div className="flex items-start gap-3 rounded-xl border border-[#e5d6bb] bg-[#fffaf0] p-4 text-xs leading-6 text-[#765a36]"><Info className="mt-1 size-4 shrink-0" /><p>本实验按 <strong>{sourceRun.cutoffDate}</strong> 的信息选股，再回看这些持仓此前的表现，存在选择前视偏差。适合解释配置差异和成本敏感性，不能用于证明策略可获得相同收益。样本外滚动验证请查看「历史回测」。</p></div>

      <Card className="border-0 ring-1 ring-[#dce4dc]">
        <CardHeader className="border-b border-[#e3e9e4]"><div className="flex items-center justify-between gap-3"><CardTitle>实验条件</CardTitle><button className="text-xs font-semibold text-[#315e50] underline underline-offset-4" onClick={() => setOptions(initialOptions)}>恢复工作台约束</button></div></CardHeader>
        <CardContent>
          <p className="mb-4 rounded-lg bg-[#f4f7f4] p-3 text-xs leading-6 text-[#5a6d63]"><span className="font-semibold text-[#293e33]">工作台任务：</span>{sourceRun.task}</p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <div className="space-y-2 text-xs font-medium"><label htmlFor="finpilot-lab-window">观察窗口</label><select id="finpilot-lab-window" value={options.lookbackDays} onChange={(event) => update('lookbackDays', Number(event.target.value))} className="block h-10 w-full rounded-lg border border-[#cedbd2] bg-white px-3">{[63, 126, 252].map((days) => <option key={days} value={days}>{days} 个交易日</option>)}</select></div>
            <div className="space-y-2 text-xs font-medium"><label htmlFor="finpilot-lab-count">候选数量</label><select id="finpilot-lab-count" value={options.candidateCount} onChange={(event) => update('candidateCount', Number(event.target.value))} className="block h-10 w-full rounded-lg border border-[#cedbd2] bg-white px-3">{[2, 3, 4, 5].map((count) => <option key={count} value={count}>{count} 只</option>)}</select></div>
            <div className="space-y-2 text-xs font-medium"><label htmlFor="finpilot-lab-cap">单股上限</label><select id="finpilot-lab-cap" value={options.maxPosition} onChange={(event) => update('maxPosition', Number(event.target.value))} className="block h-10 w-full rounded-lg border border-[#cedbd2] bg-white px-3">{[...new Set([20, 30, 35, 40, 50, 60, sourceRun.maxPosition])].sort((a, b) => a - b).map((cap) => <option key={cap} value={cap}>{cap}%</option>)}</select></div>
            <div className="space-y-2 text-xs font-medium"><label htmlFor="finpilot-lab-drawdown">回撤预算</label><select id="finpilot-lab-drawdown" value={options.maxDrawdown} onChange={(event) => update('maxDrawdown', Number(event.target.value))} className="block h-10 w-full rounded-lg border border-[#cedbd2] bg-white px-3">{[...new Set([8, 12, 18, 20, 25, 35, sourceRun.maxDrawdown])].sort((a, b) => a - b).map((budget) => <option key={budget} value={budget}>{budget}%</option>)}</select></div>
            <div className="space-y-2 text-xs font-medium"><label htmlFor="finpilot-lab-cost">单边建仓成本</label><select id="finpilot-lab-cost" value={options.transactionCostBps} onChange={(event) => update('transactionCostBps', Number(event.target.value))} className="block h-10 w-full rounded-lg border border-[#cedbd2] bg-white px-3">{[0, 5, 10, 25, 50, 100].map((cost) => <option key={cost} value={cost}>{cost} bps（{cost / 100}%）</option>)}</select></div>
          </div>
          <p className="mt-3 text-[11px] leading-5 text-[#718078]">修改后自动复算。三种策略共用上方参数；回撤预算用于截止日风控检查，不是未来最大亏损保证。</p>
        </CardContent>
      </Card>

      {computed.error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">实验未生成：{computed.error}</p>}
      {result && selected && <>
        <div aria-live="polite" className="flex flex-wrap items-center justify-between gap-2 text-xs text-[#64756d]"><span>{result.periodStart} — {result.periodEnd} · {result.observations} 个日收益观测 · {result.lineage.universe.length} 只固定样本</span><code className="text-[10px]">{result.id}</code></div>
        <div className="grid gap-4 lg:grid-cols-3">
          {result.strategies.map((strategy) => <button key={strategy.strategy} onClick={() => setFocus(strategy.strategy)} aria-pressed={focus === strategy.strategy} className={`rounded-xl border p-5 text-left transition ${focus === strategy.strategy ? 'border-[#315e50] bg-[#eef5f0] ring-1 ring-[#315e50]' : 'border-[#dce4dc] bg-white hover:border-[#8ca89a]'}`}>
            <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold">{strategy.label}</h3><span className={`text-[10px] ${strategy.executable ? 'text-[#315e50]' : 'text-[#9b483b]'}`}>{strategy.executable ? '截止日约束通过' : '截止日风控拦截'}</span></div>
            <p className="mt-4 text-[11px] text-[#607169]">扣费后区间收益</p><p className="mt-1 text-3xl font-semibold tabular-nums">{number(strategy.metrics.totalReturn, '%')}</p>
            <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-xs"><div className="text-[#607169]">相对 SPY <strong className="mt-1 block text-[#263d31]">{number(strategy.metrics.excessReturn, ' pp')}</strong></div><div className="text-[#607169]">最大回撤 <strong className="mt-1 block text-[#263d31]">{number(strategy.metrics.maxDrawdown, '%')}</strong></div><div className="text-[#607169]">年化波动 <strong className="mt-1 block text-[#263d31]">{number(strategy.metrics.annualizedVolatility, '%')}</strong></div><div className="text-[#607169]">现金 <strong className="mt-1 block text-[#263d31]">{number(strategy.cashWeight, '%')}</strong></div></div>
            <p className="mt-4 border-t border-[#d6e1d9] pt-3 text-[11px] text-[#607169]">{strategy.attribution.map((holding) => holding.symbol).join(' / ')}<span className="mt-2 block font-semibold text-[#315e50]">{focus === strategy.strategy ? '正在查看下方明细' : '查看归因与成本明细 →'}</span></p>
          </button>)}
        </div>

        <Card className="border-0 ring-1 ring-[#dce4dc]">
          <CardHeader className="border-b border-[#e3e9e4]"><div className="flex flex-wrap items-center justify-between gap-3"><div><CardTitle>同窗口逐日对照</CardTitle><p className="mt-2 text-xs text-[#718078]">初始净值 100 · 买入后持有 · SPY 按相同费率扣费</p></div><div className="flex rounded-lg bg-[#eef3ee] p-1" aria-label="图表指标">{(['net', 'drawdown'] as const).map((mode) => <button key={mode} aria-pressed={chartMode === mode} onClick={() => setChartMode(mode)} className={`rounded-md px-3 py-2 text-xs ${chartMode === mode ? 'bg-white font-semibold shadow-sm' : 'text-[#607169]'}`}>{mode === 'net' ? '扣费净值' : '回撤轨迹'}</button>)}</div></div></CardHeader>
          <CardContent>
            <ChartContainer config={chartConfig} className="h-72 w-full aspect-auto" initialDimension={{ width: 900, height: 288 }}>
              <LineChart data={chart} margin={{ left: 0, right: 12, top: 12, bottom: 0 }}><CartesianGrid vertical={false} strokeDasharray="3 3" /><XAxis dataKey="date" minTickGap={55} tickFormatter={(date: string) => date.slice(5)} tickLine={false} axisLine={false} /><YAxis domain={chartMode === 'drawdown' ? ['dataMin', 0] : ['auto', 'auto']} tickFormatter={(value: number) => `${value.toFixed(0)}${chartMode === 'drawdown' ? '%' : ''}`} tickLine={false} axisLine={false} /><ChartTooltip content={<ChartTooltipContent />} />{result.strategies.map((strategy) => <Line key={strategy.strategy} dataKey={strategy.strategy} type="linear" stroke={`var(--color-${strategy.strategy})`} strokeWidth={focus === strategy.strategy ? 3 : 1.5} dot={false} isAnimationActive={false} />)}<Line dataKey="benchmark" type="linear" stroke="var(--color-benchmark)" strokeWidth={1.5} strokeDasharray="4 4" dot={false} isAnimationActive={false} /></LineChart>
            </ChartContainer>
            <div className="mt-3 flex flex-wrap gap-4 text-[11px]">{Object.entries(chartConfig).map(([key, value]) => <span key={key} className="flex items-center gap-2"><span className="h-0.5 w-5" style={{ backgroundColor: value.color }} />{value.label}</span>)}</div>
          </CardContent>
        </Card>

        <div className="grid gap-5 lg:grid-cols-2">
          <Card className="border-0 ring-1 ring-[#dce4dc]"><CardHeader className="border-b border-[#e3e9e4]"><CardTitle>{selected.label} / 收益归因</CardTitle><p className="text-xs text-[#718078]">持仓贡献相加，再扣建仓成本，等于组合区间收益。</p></CardHeader><CardContent>
            <div className="overflow-x-auto"><table className="w-full text-left text-xs"><caption className="sr-only">所选策略持仓与收益贡献</caption><thead className="text-[#718078]"><tr>{['持仓', '初始权重', '标的收益', '贡献（pp）'].map((label) => <th key={label} className="whitespace-nowrap border-b border-[#dce4dc] pb-3 font-medium">{label}</th>)}</tr></thead><tbody>{selected.attribution.map((holding) => <tr key={holding.symbol}><th scope="row" className="py-3 font-mono">{holding.symbol}</th><td>{number(holding.weight, '%')}</td><td>{number(holding.returnPercent, '%')}</td><td className="font-semibold">{number(holding.contribution)}</td></tr>)}<tr className="border-t border-[#dce4dc]"><th scope="row" className="py-3 font-medium">现金 / 成本</th><td>{number(selected.cashWeight, '%')}</td><td>0.00%</td><td>{number(-selected.entryCost)}</td></tr><tr className="bg-[#eef5f0]"><th scope="row" colSpan={3} className="p-3 font-semibold">净收益</th><td className="font-semibold">{number(selected.metrics.totalReturn, '%')}</td></tr></tbody></table></div>
            <div className="mt-4 grid grid-cols-3 gap-2 text-xs">{[['Sharpe¹', number(selected.metrics.sharpe)], ['Beta / SPY', number(selected.metrics.beta)], ['跟踪误差', number(selected.metrics.trackingError, '%')]].map(([label, value]) => <div key={label} className="rounded-lg bg-[#f4f7f4] p-3"><p className="text-[10px] text-[#718078]">{label}</p><p className="mt-2 font-semibold">{value}</p></div>)}</div><p className="mt-3 text-[10px] leading-5 text-[#718078]">¹ 零无风险利率，252 日年化；跟踪误差为相对 SPY 日收益差的年化波动。零方差比率显示「—」。</p>
          </CardContent></Card>
          <Card className="border-0 ring-1 ring-[#dce4dc]"><CardHeader className="border-b border-[#e3e9e4]"><CardTitle>{selected.label} / 成本敏感性</CardTitle><p className="text-xs text-[#718078]">固定相同持仓，分别收取一次单边建仓费用。</p></CardHeader><CardContent><div className="overflow-x-auto"><table className="w-full text-left text-xs"><caption className="sr-only">不同交易成本下的收益和回撤</caption><thead className="text-[#718078]"><tr>{['成本', '净收益', '相对 SPY', '最大回撤'].map((label) => <th key={label} className="whitespace-nowrap border-b border-[#dce4dc] pb-3 font-medium">{label}</th>)}</tr></thead><tbody>{selected.sensitivity.map((scenario) => <tr key={scenario.costBps} className={scenario.costBps === options.transactionCostBps ? 'bg-[#eef5f0] font-semibold' : ''}><th scope="row" className="whitespace-nowrap py-3 font-medium">{scenario.costBps} bps{scenario.costBps === options.transactionCostBps ? ' · 当前' : ''}</th><td>{number(scenario.totalReturn, '%')}</td><td>{number(scenario.excessReturn, ' pp')}</td><td>{number(scenario.maxDrawdown, '%')}</td></tr>)}</tbody></table></div><div className="mt-4 rounded-lg bg-[#f4f7f4] p-3 text-xs leading-6 text-[#607169]">当前建仓成本为初始资产的 <strong>{number(selected.entryCost, '%')}</strong>；SPY 为 <strong>{number(selected.benchmarkEntryCost, '%')}</strong>。现金零收益，不计退出成本。单次买入的成本影响较小，不代表高换手策略同样稳健。</div></CardContent></Card>
        </div>

        <Card className="border-0 ring-1 ring-[#dce4dc]"><CardHeader className="border-b border-[#e3e9e4]"><CardTitle>{selected.label} / 证据与约束</CardTitle></CardHeader><CardContent>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">{selected.riskChecks.map((check) => <div key={check.id} className={`rounded-lg p-3 text-xs ${check.passed ? 'bg-[#eef5f0] text-[#315e50]' : 'bg-[#fff0eb] text-[#8c4935]'}`}><p className="flex items-center gap-2 font-semibold">{check.passed ? <CheckCircle2 className="size-3.5" /> : <ShieldAlert className="size-3.5" />}{check.label}</p><p className="mt-2">{check.observed} / {check.limit}</p></div>)}</div>
          <p className="mt-3 text-[11px] leading-5 text-[#718078]">这些检查来自截止日的研究引擎。历史回撤代理是各标的历史回撤的加权值，与上方逐日组合最大回撤不同。实验不会生成订单。</p>
          <div className="mt-4 space-y-2">{selected.evidence.map((evidence) => <details key={evidence.symbol} className="rounded-lg border border-[#dce4dc] p-3"><summary className="cursor-pointer text-xs font-semibold">{evidence.symbol} · 因子综合分 {evidence.composite} · 展开双向证据</summary><div className="mt-3 grid gap-3 sm:grid-cols-2"><div className="text-xs leading-6 text-[#3f6653]"><p className="font-semibold">支持</p>{evidence.support.map((item) => <p key={item}>{item}</p>)}</div><div className="text-xs leading-6 text-[#815e3c]"><p className="font-semibold">反对</p>{evidence.counter.map((item) => <p key={item}>{item}</p>)}</div></div><p className="mt-3 break-all font-mono text-[10px] text-[#718078]">{evidence.sourceIds.join(' · ')}</p></details>)}</div>
        </CardContent></Card>

        <Card className="border-0 ring-1 ring-[#dce4dc]"><CardHeader className="border-b border-[#e3e9e4]"><div className="flex flex-wrap items-center justify-between gap-3"><div><CardTitle className="flex items-center gap-2"><BarChart3 className="size-4" />方法与可复算记录</CardTitle><p className="mt-2 text-xs text-[#718078]">JSON 包含参数、指标、逐日净值、双向证据与数据来源；CSV 提供逐日对照。</p></div><div className="flex gap-2"><Button variant="outline" onClick={() => downloadFile(JSON.stringify(result, null, 2), `${result.id}.json`, 'application/json')}><Download className="size-3.5" />导出 JSON</Button><Button variant="outline" onClick={() => downloadFile('\uFEFF' + researchComparisonCsv(result), `${result.id}.csv`, 'text/csv;charset=utf-8')}><Download className="size-3.5" />导出 CSV</Button></div></div></CardHeader><CardContent>
          <details><summary className="cursor-pointer text-xs font-semibold text-[#315e50]">展开计算假设与源数据</summary><ol className="mt-3 list-decimal space-y-2 pl-5 text-xs leading-6 text-[#64756d]">{result.assumptions.map((assumption) => <li key={assumption}>{assumption}</li>)}</ol><p className="mt-4 text-[11px] leading-6 text-[#718078]">快照生成：{result.lineage.generatedAt} · {result.methodVersion}<br />{result.lineage.priceProvider}<br />{result.lineage.fundamentalProvider}</p><div className="mt-3 flex flex-wrap gap-3 text-[11px]">{result.lineage.sources.map((source) => <a key={source.symbol} href={source.price} target="_blank" rel="noreferrer" className="text-[#315e50] underline underline-offset-4">{source.symbol} 原始行情接口 ↗</a>)}</div><p className="mt-2 text-[10px] text-[#718078]">外部接口可能变化；本次结果只使用仓库内的冻结数据。</p></details>
        </CardContent></Card>
      </>}
    </section>
  );
}
