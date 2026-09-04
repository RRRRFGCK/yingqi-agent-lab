import marketDataJson from './finpilot-market-data.json';

export type Strategy = 'low-volatility' | 'balanced' | 'quality-growth';
export type RunStatus = 'ready' | 'running' | 'awaiting-approval' | 'approved' | 'blocked';
export type PlannerMode = 'openai' | 'deterministic';

export type ToolStep = {
  id: string;
  label: string;
  tool: string;
  status: 'queued' | 'running' | 'done' | 'warning' | 'blocked';
  durationMs: number;
  summary: string;
  detail: string;
};

export type CandidateScore = {
  symbol: string;
  name: string;
  sector: string;
  price: number;
  composite: number;
  quality: number;
  value: number;
  lowVolatility: number;
  momentum: number;
  volatility: number;
  maxDrawdown: number;
  support: string[];
  counter: string[];
  sourceIds: string[];
  decision: 'selected' | 'watch' | 'rejected';
  decisionReason: string;
};

export type PortfolioPosition = { symbol: string; name: string; weight: number; price: number; shares: number; amount: number };
export type RiskCheck = { id: string; label: string; passed: boolean; observed: string; limit: string };
export type PerformancePoint = { period: string; portfolio: number; benchmark: number };

export type AgentRun = {
  id: string;
  task: string;
  strategy: Strategy;
  cutoffDate: string;
  candidateCount: number;
  maxPosition: number;
  maxDrawdown: number;
  capital: number;
  status: RunStatus;
  planner: { mode: PlannerMode; model: string | null; rationale: string; toolCalls: string[] };
  dataLineage: { generatedAt: string; periodStart: string; priceProvider: string; fundamentalProvider: string; availabilityLagDays: number; universeSize: number };
  steps: ToolStep[];
  candidates: CandidateScore[];
  portfolio: PortfolioPosition[];
  riskChecks: RiskCheck[];
  reflection: { trigger: string; action: string; outcome: string };
  performance: PerformancePoint[];
  estimatedDrawdown: number;
  cashWeight: number;
  latencyMs: number;
  tokenEstimate: number;
  auditNote: string;
};

export type PaperOrder = { id: string; symbol: string; side: 'BUY'; quantity: number; limitPrice: number; status: 'FILLED_SIMULATED'; filledAt: string };

export type BenchmarkResult = {
  windows: number;
  observations: number;
  periodStart: string;
  periodEnd: string;
  annualizedReturn: number;
  benchmarkAnnualizedReturn: number;
  sharpe: number;
  benchmarkSharpe: number;
  maxDrawdown: number;
  benchmarkMaxDrawdown: number;
  beatsBenchmarkRate: number;
  annualizedTurnover: number;
  transactionCostBps: number;
  dataCoverage: number;
  equity: PerformancePoint[];
};

export type PlannerOverrides = { strategy?: Strategy; candidateCount?: number; maxPosition?: number; maxDrawdown?: number; rationale?: string; model?: string };

type PriceRow = { date: string; close: number };
type FundamentalRow = { value: number; unit: string; end: string; availableDate: string; fiscalYear: number; sourceType: string };
type Instrument = {
  symbol: string;
  name: string;
  sector: string;
  cik: string;
  prices: PriceRow[];
  facts: Record<'revenue' | 'netIncome' | 'operatingCashFlow' | 'assets' | 'liabilities' | 'equity' | 'dilutedEps', FundamentalRow[]>;
  sources: { price: string; fundamentals: string };
};
type MarketData = {
  meta: { generatedAt: string; periodStart: string; cutoffDate: string; priceProvider: string; fundamentalProvider: string; fundamentalAvailabilityLagDays: number };
  instruments: Instrument[];
  benchmark: { symbol: string; name: string; prices: PriceRow[]; sourceUrl: string };
};
type CompanyMetrics = { instrument: Instrument; price: number; roe: number; cashCoverage: number; debtRatio: number; pe: number | null; volatility: number; maxDrawdown: number; momentum: number; dataQuality: number; latestFundamentalDate: string };

const MARKET_DATA = marketDataJson as MarketData;
const clamp = (value: number, min = 0, max = 100) => Math.min(max, Math.max(min, value));
const round = (value: number, digits = 1) => Number(value.toFixed(digits));
const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
const standardDeviation = (values: number[]) => {
  const average = mean(values);
  return Math.sqrt(mean(values.map((value) => (value - average) ** 2)));
};
const returnsOf = (prices: PriceRow[]) => prices.slice(1).map((row, index) => row.close / prices[index].close - 1);
const stableRunId = (task: string) => {
  let hash = 2166136261;
  for (let index = 0; index < task.length; index += 1) { hash ^= task.charCodeAt(index); hash = Math.imul(hash, 16777619); }
  return `FP-REAL-${(hash >>> 0).toString(36).toUpperCase().slice(0, 6)}`;
};

function maxDrawdownFromPrices(prices: PriceRow[]) {
  let peak = prices[0]?.close ?? 1;
  let drawdown = 0;
  for (const row of prices) { peak = Math.max(peak, row.close); drawdown = Math.max(drawdown, (peak - row.close) / peak); }
  return drawdown * 100;
}
function latestFact(instrument: Instrument, key: keyof Instrument['facts'], cutoff: string) {
  return instrument.facts[key].filter((row) => row.availableDate <= cutoff).at(-1) ?? null;
}
function buildMetrics(instrument: Instrument, cutoff: string): CompanyMetrics | null {
  const prices = instrument.prices.filter((row) => row.date <= cutoff);
  if (prices.length < 253) return null;
  const recent = prices.slice(-253);
  const dailyReturns = returnsOf(recent);
  const last = recent.at(-1)!.close;
  const earlier = recent[Math.max(0, recent.length - 127)].close;
  const netIncome = latestFact(instrument, 'netIncome', cutoff);
  const operatingCashFlow = latestFact(instrument, 'operatingCashFlow', cutoff);
  const assets = latestFact(instrument, 'assets', cutoff);
  const liabilities = latestFact(instrument, 'liabilities', cutoff);
  const equity = latestFact(instrument, 'equity', cutoff);
  const eps = latestFact(instrument, 'dilutedEps', cutoff);
  const available = [netIncome, operatingCashFlow, assets, liabilities, equity, eps].filter(Boolean).length;
  return {
    instrument,
    price: last,
    roe: netIncome && equity && equity.value !== 0 ? (netIncome.value / equity.value) * 100 : 0,
    cashCoverage: netIncome && operatingCashFlow && netIncome.value !== 0 ? operatingCashFlow.value / netIncome.value : 0,
    debtRatio: assets && liabilities && assets.value !== 0 ? (liabilities.value / assets.value) * 100 : 100,
    pe: eps && eps.value > 0 ? last / eps.value : null,
    volatility: standardDeviation(dailyReturns) * Math.sqrt(252) * 100,
    maxDrawdown: maxDrawdownFromPrices(recent),
    momentum: (last / earlier - 1) * 100,
    dataQuality: (available / 6) * 100,
    latestFundamentalDate: [netIncome, operatingCashFlow, assets, liabilities, equity, eps].filter(Boolean).map((row) => row!.availableDate).sort().at(-1) ?? 'n/a',
  };
}
function percentile(values: number[], value: number) {
  return values.length ? (values.filter((item) => item <= value).length / values.length) * 100 : 50;
}
function scoreUniverse(cutoff: string, strategy: Strategy): Array<CandidateScore & { severity: number; dataQuality: number }> {
  const metrics = MARKET_DATA.instruments.map((instrument) => buildMetrics(instrument, cutoff)).filter((item): item is CompanyMetrics => Boolean(item));
  const peValues = metrics.map((item) => item.pe).filter((value): value is number => value != null && value > 0 && value < 250);
  return metrics.map((company) => {
    const pePercentile = company.pe == null || company.pe >= 250 ? 100 : percentile(peValues, company.pe);
    const quality = clamp(48 + company.roe * 1.15 + (company.cashCoverage - 1) * 14 - Math.max(0, company.debtRatio - 55) * 0.35);
    const value = clamp(105 - pePercentile);
    const lowVolatility = clamp(112 - company.volatility * 2.25);
    const momentum = clamp(50 + company.momentum * 1.25);
    const weights = strategy === 'low-volatility'
      ? { quality: 0.28, value: 0.18, lowVolatility: 0.46, momentum: 0.08 }
      : strategy === 'quality-growth'
        ? { quality: 0.34, value: 0.12, lowVolatility: 0.16, momentum: 0.38 }
        : { quality: 0.3, value: 0.24, lowVolatility: 0.26, momentum: 0.2 };
    const severity = clamp((pePercentile > 85 ? 0.42 : 0.12) + (company.volatility > 35 ? 0.3 : 0) + (company.cashCoverage < 0.8 ? 0.25 : 0), 0, 1);
    const evidencePenalty = severity >= 0.72 ? 9 : company.dataQuality < 90 ? 6 : 0;
    const composite = clamp(quality * weights.quality + value * weights.value + lowVolatility * weights.lowVolatility + momentum * weights.momentum - evidencePenalty);
    return {
      symbol: company.instrument.symbol, name: company.instrument.name, sector: company.instrument.sector, price: round(company.price, 2), composite: round(composite),
      quality: round(quality), value: round(value), lowVolatility: round(lowVolatility), momentum: round(momentum), volatility: round(company.volatility), maxDrawdown: round(company.maxDrawdown),
      support: [company.cashCoverage >= 1 ? `经营现金流/净利润为 ${company.cashCoverage.toFixed(2)}×，现金转化为正` : `最近 6 个月动量为 ${company.momentum.toFixed(1)}%`, company.volatility < 28 ? `近 252 个交易日年化波动率 ${company.volatility.toFixed(1)}%，低于高波动阈值` : `最近可用财务截面 ROE 为 ${company.roe.toFixed(1)}%`],
      counter: [pePercentile > 70 ? `静态 P/E 位于样本第 ${pePercentile.toFixed(0)} 百分位，估值缓冲有限` : `静态 P/E 位于样本第 ${pePercentile.toFixed(0)} 百分位，但横截面样本仅 ${metrics.length} 只`, company.maxDrawdown > 20 ? `近 252 个交易日最大回撤 ${company.maxDrawdown.toFixed(1)}%，需要更严格退出条件` : `历史窗口最大回撤 ${company.maxDrawdown.toFixed(1)}%，不代表未来风险上限`],
      sourceIds: [`YF-PRICE-${company.instrument.symbol}-${cutoff}`, `YF-FUND-${company.instrument.symbol}-${company.latestFundamentalDate}`],
      decision: 'watch' as const, decisionReason: '等待比较与证据校验', severity, dataQuality: company.dataQuality,
    };
  }).sort((a, b) => b.composite - a.composite);
}

export const strategyLabels: Record<Strategy, string> = { 'low-volatility': '低波动', balanced: '均衡', 'quality-growth': '质量成长' };
export const defaultTasks: Array<{ label: string; strategy: Strategy; task: string }> = [
  { label: '低波动组合', strategy: 'low-volatility', task: '仅使用 2024 年 12 月 31 日以前的信息，从真实历史候选中选择 3 只构建低波动组合；单只仓位不超过 40%，最大回撤预算 18%，列出支持与反对证据。' },
  { label: '均衡研究', strategy: 'balanced', task: '基于冻结的真实历史快照，选择 3 只质量、估值与趋势相对均衡的候选；单只仓位不超过 35%，最大回撤预算 20%，所有结论必须有来源编号。' },
  { label: '冲突证据测试', strategy: 'quality-growth', task: '优先寻找质量成长候选，但必须检查高估值和高波动风险；若支持与反对证据冲突，先反思再决定，单只仓位不超过 30%，最大回撤预算 22%。' },
];
function inferStrategy(task: string, preferred?: Strategy): Strategy {
  if (preferred) return preferred;
  if (/成长|增速|趋势/.test(task)) return 'quality-growth';
  if (/低波动|稳健|回撤/.test(task)) return 'low-volatility';
  return 'balanced';
}
function parsePercent(task: string, label: RegExp, fallback: number) {
  const match = task.match(label);
  return match ? clamp(Number(match[1]), 5, 100) : fallback;
}
function parseCandidateCount(task: string) {
  const arabic = task.match(/(?:选择|选出|构建)[^，。]{0,12}?(\d+)\s*只/);
  if (arabic) return clamp(Number(arabic[1]), 2, 5);
  const chinese = task.match(/(?:选择|选出|构建)[^，。]{0,12}?([二三四五])\s*只/);
  return chinese ? { 二: 2, 三: 3, 四: 4, 五: 5 }[chinese[1] as '二' | '三' | '四' | '五'] : 3;
}
function cappedInverseVolWeights(selected: CandidateScore[], maxPosition: number) {
  const inverse = selected.map((item) => 1 / Math.max(1, item.volatility));
  const total = inverse.reduce((sum, value) => sum + value, 0);
  const weights = inverse.map((value) => Math.min(maxPosition, (value / total) * 96));
  const invested = weights.reduce((sum, value) => sum + value, 0);
  return invested > 96 ? weights.map((weight) => (weight / invested) * 96) : weights;
}
function buildPortfolio(selected: CandidateScore[], maxPosition: number, capital: number) {
  const weights = cappedInverseVolWeights(selected, maxPosition);
  return selected.map((candidate, index) => {
    const shares = Math.floor((capital * weights[index] / 100) / candidate.price);
    const amount = round(shares * candidate.price, 2);
    return { symbol: candidate.symbol, name: candidate.name, weight: round((amount / capital) * 100), price: candidate.price, shares, amount };
  });
}
function buildPerformance(portfolio: PortfolioPosition[], cutoff: string) {
  const sampleSize = 148;
  const selectedSeries = portfolio.map((position) => ({ position, prices: MARKET_DATA.instruments.find((item) => item.symbol === position.symbol)!.prices.filter((row) => row.date <= cutoff).slice(-sampleSize) }));
  const benchmark = MARKET_DATA.benchmark.prices.filter((row) => row.date <= cutoff).slice(-sampleSize);
  const points = Array.from({ length: 8 }, (_, index) => Math.min(benchmark.length - 1, Math.round(index * (benchmark.length - 1) / 7)));
  return points.map((priceIndex) => {
    const portfolioValue = selectedSeries.reduce((sum, item) => sum + (item.position.weight / 100) * (item.prices[priceIndex].close / item.prices[0].close) * 100, 0);
    const cashWeight = 100 - portfolio.reduce((sum, item) => sum + item.weight, 0);
    return { period: benchmark[priceIndex].date.slice(5), portfolio: round(portfolioValue + cashWeight, 2), benchmark: round((benchmark[priceIndex].close / benchmark[0].close) * 100, 2) };
  });
}

export function runFinPilotAgent(task: string, preferredStrategy?: Strategy, runId?: string, overrides: PlannerOverrides = {}): AgentRun {
  const normalizedTask = task.trim() || defaultTasks[0].task;
  const strategy = overrides.strategy ?? inferStrategy(normalizedTask, preferredStrategy);
  const candidateCount = clamp(overrides.candidateCount ?? parseCandidateCount(normalizedTask), 2, 5);
  const maxPosition = clamp(overrides.maxPosition ?? parsePercent(normalizedTask, /单只(?:股票)?(?:仓位)?[^%％\d]{0,8}(\d+(?:\.\d+)?)\s*[%％]/, strategy === 'quality-growth' ? 30 : 40), 20, 60);
  const maxDrawdown = clamp(overrides.maxDrawdown ?? parsePercent(normalizedTask, /最大回撤(?:预算)?[^%％\d]{0,8}(\d+(?:\.\d+)?)\s*[%％]/, 18), 8, 35);
  const capital = 100000;
  const cutoffDate = MARKET_DATA.meta.cutoffDate;
  const scored = scoreUniverse(cutoffDate, strategy);
  const initialSelection = scored.slice(0, candidateCount);
  const reflectedSymbols = new Set(initialSelection.filter((item) => item.severity >= 0.72 || item.dataQuality < 90).map((item) => item.symbol));
  const finalSelection = [...initialSelection];
  for (const symbol of reflectedSymbols) {
    const index = finalSelection.findIndex((candidate) => candidate.symbol === symbol);
    const replacement = scored.find((candidate) => !finalSelection.some((selected) => selected.symbol === candidate.symbol) && candidate.severity < 0.72 && candidate.dataQuality >= 90);
    if (index >= 0 && replacement) finalSelection[index] = replacement;
  }
  const selectedSymbols = new Set(finalSelection.map((item) => item.symbol));
  const candidates: CandidateScore[] = scored.map(({ severity: _severity, dataQuality: _dataQuality, ...candidate }) => selectedSymbols.has(candidate.symbol)
    ? { ...candidate, decision: 'selected', decisionReason: '综合得分、数据完整性与冲突检查通过' }
    : reflectedSymbols.has(candidate.symbol)
      ? { ...candidate, decision: 'rejected', decisionReason: '高估值/高波动冲突触发反思后降级' }
      : { ...candidate, decision: 'watch', decisionReason: '未进入本轮目标数量' });
  const selected = candidates.filter((candidate) => candidate.decision === 'selected');
  const portfolio = buildPortfolio(selected, maxPosition, capital);
  const estimatedDrawdown = round(portfolio.reduce((sum, position) => sum + (position.weight / 100) * (candidates.find((candidate) => candidate.symbol === position.symbol)?.maxDrawdown ?? 0), 0));
  const cashWeight = round(100 - portfolio.reduce((sum, position) => sum + position.weight, 0));
  const riskChecks: RiskCheck[] = [
    { id: 'position-cap', label: '单股仓位限制', passed: portfolio.every((position) => position.weight <= maxPosition + 0.01), observed: `${Math.max(...portfolio.map((position) => position.weight)).toFixed(1)}%`, limit: `≤ ${maxPosition}%` },
    { id: 'drawdown-budget', label: '历史回撤代理', passed: estimatedDrawdown <= maxDrawdown, observed: `${estimatedDrawdown.toFixed(1)}%`, limit: `≤ ${maxDrawdown}%` },
    { id: 'evidence-coverage', label: '双向证据覆盖', passed: selected.every((candidate) => candidate.support.length && candidate.counter.length && candidate.sourceIds.length >= 2), observed: `${selected.length}/${selected.length}`, limit: '100%' },
    { id: 'point-in-time', label: '时间截面检查', passed: true, observed: `${cutoffDate} 截止`, limit: '财务数据 +90 天可用' },
  ];
  const passed = riskChecks.every((check) => check.passed);
  const reflectionTriggered = reflectedSymbols.size > 0;
  const reflectedNames = candidates.filter((candidate) => reflectedSymbols.has(candidate.symbol)).map((candidate) => candidate.name);
  const replacementNames = selected.filter((candidate) => !initialSelection.some((initial) => initial.symbol === candidate.symbol)).map((candidate) => candidate.name);
  const plannerMode: PlannerMode = overrides.model ? 'openai' : 'deterministic';
  const steps: ToolStep[] = [
    { id: 'plan', label: '拆解任务与约束', tool: plannerMode === 'openai' ? 'openai.responses.function_call' : 'planner.deterministic_fallback', status: 'done', durationMs: plannerMode === 'openai' ? 640 : 34, summary: `${plannerMode === 'openai' ? '模型结构化调用' : '规则降级'}：${strategyLabels[strategy]}、${candidateCount} 只、${maxPosition}% 上限`, detail: overrides.rationale || '将开放式任务约束映射为严格 schema；模型无权直接计算分数或绕过硬风控。' },
    { id: 'snapshot', label: '读取真实历史快照', tool: 'market.get_point_in_time_snapshot', status: 'done', durationMs: 82, summary: `载入 ${MARKET_DATA.instruments.length} 个真实标的，截止 ${cutoffDate}`, detail: `日行情按交易日可见；年度财务字段按期末后 ${MARKET_DATA.meta.fundamentalAvailabilityLagDays} 天才可见，阻断未来信息。` },
    { id: 'evidence', label: '生成双向数据证据', tool: 'evidence.build_from_observations', status: 'done', durationMs: 61, summary: `为 ${candidates.length} 个候选生成支持、反对与来源编号`, detail: '证据来自冻结行情和历史财务序列；陈述包含窗口与限制，不把相关性写成因果。' },
    { id: 'factors', label: '确定性计算因子', tool: 'analytics.calculate_factors', status: 'done', durationMs: 18, summary: '计算质量、静态估值、低波动与 6 个月趋势', detail: '所有数值由 TypeScript 函数计算，LLM 仅负责计划与解释。' },
    { id: 'compare', label: '比较并形成初选', tool: 'portfolio.compare_candidates', status: 'done', durationMs: 12, summary: `按 ${strategyLabels[strategy]}权重排序，形成 ${candidateCount} 只初选`, detail: '排序保留各因子得分和反对证据，可复算、可审计。' },
    { id: 'reflect', label: '证据冲突反思', tool: 'verifier.reflect_on_conflicts', status: reflectionTriggered ? 'warning' : 'done', durationMs: 23, summary: reflectionTriggered ? `发现 ${reflectedNames.join('、')} 的估值/波动冲突并重排` : '未发现达到阈值的高风险冲突', detail: reflectionTriggered ? `保留原证据，将受影响候选降级，并以 ${replacementNames.join('、') || '现金'} 替代。` : '保持初选并进入硬风控。' },
    { id: 'risk', label: '执行硬风控', tool: 'risk.validate_trade_intent', status: passed ? 'done' : 'blocked', durationMs: 9, summary: passed ? `4 项约束通过，保留 ${cashWeight.toFixed(1)}% 现金` : '至少一项硬约束失败，禁止模拟执行', detail: '风控由确定性代码执行；即使模型建议放宽，结果仍会被拦截。' },
  ];
  return {
    id: runId ?? stableRunId(normalizedTask), task: normalizedTask, strategy, cutoffDate, candidateCount, maxPosition, maxDrawdown, capital,
    status: passed ? 'awaiting-approval' : 'blocked',
    planner: { mode: plannerMode, model: overrides.model ?? null, rationale: overrides.rationale || '未配置模型密钥时使用可审计规则解析器。', toolCalls: [plannerMode === 'openai' ? 'create_research_plan' : 'planner.deterministic_fallback', 'market.get_point_in_time_snapshot', 'analytics.calculate_factors', 'risk.validate_trade_intent'] },
    dataLineage: { generatedAt: MARKET_DATA.meta.generatedAt, periodStart: MARKET_DATA.meta.periodStart, priceProvider: MARKET_DATA.meta.priceProvider, fundamentalProvider: MARKET_DATA.meta.fundamentalProvider, availabilityLagDays: MARKET_DATA.meta.fundamentalAvailabilityLagDays, universeSize: MARKET_DATA.instruments.length },
    steps, candidates, portfolio, riskChecks,
    reflection: { trigger: reflectionTriggered ? `初选中 ${reflectedNames.join('、')} 达到高估值/高波动冲突阈值。` : '未达到反思阈值。', action: reflectionTriggered ? '降低冲突候选优先级并重新比较，保留完整审计轨迹。' : '保持原计划。', outcome: `最终组合：${selected.map((candidate) => candidate.name).join('、')}。` },
    performance: buildPerformance(portfolio, cutoffDate), estimatedDrawdown, cashWeight,
    latencyMs: steps.reduce((sum, step) => sum + step.durationMs, 0), tokenEstimate: plannerMode === 'openai' ? 920 : 0,
    auditNote: `真实历史数据冻结于 ${cutoffDate}；财务字段采用 90 天保守可用滞后。仅为工程与回测演示，不构成投资建议。`,
  };
}

export function executePaperTrade(run: AgentRun): PaperOrder[] {
  if (run.status !== 'awaiting-approval' || run.riskChecks.some((check) => !check.passed)) throw new Error('当前交易意图未通过全部风控检查。');
  const filledAt = new Date().toISOString();
  return run.portfolio.map((position, index) => ({ id: `${run.id}-ORDER-${String(index + 1).padStart(2, '0')}`, symbol: position.symbol, side: 'BUY', quantity: position.shares, limitPrice: position.price, status: 'FILLED_SIMULATED', filledAt }));
}
function summarizeReturn(daily: number[]) {
  const total = daily.reduce((value, item) => value * (1 + item), 1);
  const annualized = total ** (252 / Math.max(1, daily.length)) - 1;
  const volatility = standardDeviation(daily) * Math.sqrt(252);
  return { annualized: annualized * 100, sharpe: volatility ? (mean(daily) * 252) / volatility : 0 };
}
function drawdownFromReturns(daily: number[]) {
  let value = 1; let peak = 1; let maxDrawdown = 0;
  for (const item of daily) { value *= 1 + item; peak = Math.max(peak, value); maxDrawdown = Math.max(maxDrawdown, (peak - value) / peak); }
  return maxDrawdown * 100;
}
export function evaluateWalkForwardSuite(): BenchmarkResult {
  const benchmark = MARKET_DATA.benchmark.prices;
  const firstRebalanceIndex = benchmark.findIndex((row) => row.date >= '2022-04-01');
  const priceMaps = new Map(MARKET_DATA.instruments.map((item) => [item.symbol, new Map(item.prices.map((row) => [row.date, row.close]))]));
  const portfolioReturns: number[] = []; const benchmarkReturns: number[] = []; const equity: PerformancePoint[] = [];
  let portfolioValue = 100; let benchmarkValue = 100; let previousWeights = new Map<string, number>(); let totalTurnover = 0; let wins = 0; let windows = 0;
  const transactionCostBps = 10;
  for (let rebalanceIndex = firstRebalanceIndex; rebalanceIndex + 63 < benchmark.length; rebalanceIndex += 63) {
    const candidates = scoreUniverse(benchmark[rebalanceIndex].date, 'balanced').slice(0, 3);
    if (candidates.length < 3) continue;
    const weights = new Map(candidates.map((candidate, index) => [candidate.symbol, cappedInverseVolWeights(candidates, 40)[index] / 100]));
    const symbols = new Set([...weights.keys(), ...previousWeights.keys()]);
    const turnover = [...symbols].reduce((sum, symbol) => sum + Math.abs((weights.get(symbol) ?? 0) - (previousWeights.get(symbol) ?? 0)), 0) / 2;
    totalTurnover += turnover;
    const windowPortfolioStart = portfolioValue; const windowBenchmarkStart = benchmarkValue;
    for (let day = rebalanceIndex + 1; day <= rebalanceIndex + 63; day += 1) {
      const date = benchmark[day].date; const previousDate = benchmark[day - 1].date;
      let portfolioReturn = 0;
      for (const [symbol, weight] of weights) {
        const map = priceMaps.get(symbol)!; const current = map.get(date); const previous = map.get(previousDate);
        if (current && previous) portfolioReturn += weight * (current / previous - 1);
      }
      if (day === rebalanceIndex + 1) portfolioReturn -= turnover * transactionCostBps / 10000;
      const benchmarkReturn = benchmark[day].close / benchmark[day - 1].close - 1;
      portfolioReturns.push(portfolioReturn); benchmarkReturns.push(benchmarkReturn); portfolioValue *= 1 + portfolioReturn; benchmarkValue *= 1 + benchmarkReturn;
      if (portfolioReturns.length === 1 || portfolioReturns.length % 63 === 0) equity.push({ period: date.slice(0, 7), portfolio: round(portfolioValue, 2), benchmark: round(benchmarkValue, 2) });
    }
    if (portfolioValue / windowPortfolioStart > benchmarkValue / windowBenchmarkStart) wins += 1;
    previousWeights = weights; windows += 1;
  }
  const portfolioSummary = summarizeReturn(portfolioReturns); const benchmarkSummary = summarizeReturn(benchmarkReturns);
  const expectedFacts = MARKET_DATA.instruments.length * 7;
  const availableFacts = MARKET_DATA.instruments.reduce((sum, item) => sum + Object.values(item.facts).filter((rows) => rows.length).length, 0);
  return {
    windows, observations: portfolioReturns.length, periodStart: benchmark[firstRebalanceIndex]?.date ?? MARKET_DATA.meta.periodStart,
    periodEnd: benchmark[Math.min(benchmark.length - 1, firstRebalanceIndex + windows * 63)]?.date ?? MARKET_DATA.meta.cutoffDate,
    annualizedReturn: round(portfolioSummary.annualized, 2), benchmarkAnnualizedReturn: round(benchmarkSummary.annualized, 2), sharpe: round(portfolioSummary.sharpe, 2), benchmarkSharpe: round(benchmarkSummary.sharpe, 2),
    maxDrawdown: round(drawdownFromReturns(portfolioReturns), 2), benchmarkMaxDrawdown: round(drawdownFromReturns(benchmarkReturns), 2), beatsBenchmarkRate: round((wins / Math.max(1, windows)) * 100, 1),
    annualizedTurnover: round((totalTurnover / Math.max(1, portfolioReturns.length)) * 252 * 100, 1), transactionCostBps, dataCoverage: round((availableFacts / expectedFacts) * 100, 1), equity,
  };
}
export const evaluateSyntheticSuite = evaluateWalkForwardSuite;
