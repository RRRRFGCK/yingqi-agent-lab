import marketData from './finpilot-market-data.json';
import { runFinPilotAgent, strategyLabels, type Strategy } from './finpilot-agent';

export type ResearchOptions = {
  lookbackDays: number;
  transactionCostBps: number;
  candidateCount: number;
  maxPosition: number;
  maxDrawdown: number;
};
export type ResearchPrice = { date: string; close: number };
export type ResearchHolding = { symbol: string; weight: number; prices: ResearchPrice[] };
export type ResearchPoint = { date: string; gross: number; net: number; benchmark: number };
export type ResearchMetrics = {
  totalReturn: number;
  annualizedReturn: number;
  annualizedVolatility: number;
  maxDrawdown: number;
  sharpe: number | null;
  excessReturn: number;
  trackingError: number;
  beta: number | null;
};
export type ResearchReplay = {
  points: ResearchPoint[];
  metrics: ResearchMetrics;
  benchmarkMetrics: ResearchMetrics;
  attribution: Array<{ symbol: string; weight: number; returnPercent: number; contribution: number }>;
  cashWeight: number;
  entryCost: number;
  benchmarkEntryCost: number;
};
export type StrategyExperiment = ResearchReplay & {
  strategy: Strategy;
  label: string;
  executable: boolean;
  riskChecks: ReturnType<typeof runFinPilotAgent>['riskChecks'];
  evidence: Array<{ symbol: string; composite: number; support: string[]; counter: string[]; sourceIds: string[] }>;
  sensitivity: Array<{ costBps: number; totalReturn: number; excessReturn: number; maxDrawdown: number }>;
};
export type ResearchComparison = {
  id: string;
  methodVersion: 'finpilot-research-v1';
  task: string;
  options: ResearchOptions;
  cutoffDate: string;
  periodStart: string;
  periodEnd: string;
  observations: number;
  lineage: { generatedAt: string; priceProvider: string; fundamentalProvider: string; universe: string[]; sources: Array<{ symbol: string; price: string; fundamentals?: string }> };
  assumptions: string[];
  strategies: StrategyExperiment[];
};

const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
const variance = (values: number[]) => {
  const average = mean(values);
  return mean(values.map((value) => (value - average) ** 2));
};
const validPrice = (price: number) => Number.isFinite(price) && price > 0;

/** Values are percentage points except Sharpe and beta. Zero-variance ratios are undefined. */
export function calculateResearchMetrics(equity: number[], benchmark: number[]): ResearchMetrics {
  if (equity.length < 2 || equity.length !== benchmark.length || [...equity, ...benchmark].some((value) => !validPrice(value))) {
    throw new Error('净值必须为等长、至少两个点的正数序列。');
  }
  const daily = equity.slice(1).map((value, index) => value / equity[index] - 1);
  const reference = benchmark.slice(1).map((value, index) => value / benchmark[index] - 1);
  const volatility = Math.sqrt(variance(daily));
  const referenceVariance = variance(reference);
  const dailyMean = mean(daily);
  const referenceMean = mean(reference);
  const covariance = mean(daily.map((value, index) => (value - dailyMean) * (reference[index] - referenceMean)));
  let peak = equity[0];
  let drawdown = 0;
  for (const value of equity) {
    peak = Math.max(peak, value);
    drawdown = Math.max(drawdown, (peak - value) / peak);
  }
  const totalReturn = equity.at(-1)! / equity[0] - 1;
  const referenceReturn = benchmark.at(-1)! / benchmark[0] - 1;
  return {
    totalReturn: totalReturn * 100,
    annualizedReturn: ((1 + totalReturn) ** (252 / daily.length) - 1) * 100,
    annualizedVolatility: volatility * Math.sqrt(252) * 100,
    maxDrawdown: drawdown * 100,
    sharpe: volatility < 1e-12 ? null : dailyMean / volatility * Math.sqrt(252),
    excessReturn: (totalReturn - referenceReturn) * 100,
    trackingError: Math.sqrt(variance(daily.map((value, index) => value - reference[index]))) * Math.sqrt(252) * 100,
    beta: referenceVariance < 1e-24 ? null : covariance / referenceVariance,
  };
}

/** Single purchase, then drifting buy-and-hold weights. Fees come from cash, never from a hidden daily rebalance. */
export function replayResearchPortfolio(holdings: ResearchHolding[], benchmark: ResearchPrice[], transactionCostBps: number): ResearchReplay {
  if (!Number.isFinite(transactionCostBps) || transactionCostBps < 0 || transactionCostBps > 100) throw new Error('单边成本须在 0–100 bps 之间。');
  if (benchmark.length < 2 || benchmark.some((point, index) => !validPrice(point.close) || (index > 0 && point.date <= benchmark[index - 1].date))) {
    throw new Error('基准日期须严格递增，且至少有两个有效价格。');
  }
  if (new Set(holdings.map((holding) => holding.symbol)).size !== holdings.length) throw new Error('持仓标的不能重复。');
  if (holdings.some((holding) => !Number.isFinite(holding.weight) || holding.weight < 0)) throw new Error('持仓权重须为非负有限数。');
  const invested = holdings.reduce((sum, holding) => sum + holding.weight, 0);
  if (invested > 1 + 1e-12) throw new Error('持仓总权重不能超过 100%。');
  const entryCost = invested * transactionCostBps / 100;
  const benchmarkEntryCost = transactionCostBps / 100;
  if (entryCost > (1 - invested) * 100 + 1e-10) throw new Error('现金不足以支付建仓成本。');
  const series = holdings.map((holding) => {
    const priceMap = new Map(holding.prices.map((point) => [point.date, point.close]));
    if (priceMap.size !== holding.prices.length) throw new Error(`${holding.symbol} 包含重复日期。`);
    const prices = benchmark.map((point) => priceMap.get(point.date));
    if (prices.some((price) => price == null || !validPrice(price))) throw new Error(`${holding.symbol} 缺少对齐交易日的有效价格，停止计算。`);
    return { ...holding, prices: prices as number[] };
  });
  const points = benchmark.map((point, index) => {
    const gross = 100 * (1 - invested) + series.reduce((sum, holding) => sum + 100 * holding.weight * holding.prices[index] / holding.prices[0], 0);
    // The first point is pre-trade NAV. Record the one-time entry fee in the first holding-day return.
    const net = index === 0 ? 100 : gross - entryCost;
    // SPY is cost-adjusted by buying 1/(1+fee) units, so its entry cost is fully cash funded.
    const benchmarkValue = index === 0 ? 100 : 100 * point.close / benchmark[0].close / (1 + transactionCostBps / 10000);
    return { date: point.date, gross: index === 0 ? 100 : gross, net, benchmark: benchmarkValue };
  });
  const net = points.map((point) => point.net);
  const reference = points.map((point) => point.benchmark);
  return {
    points,
    metrics: calculateResearchMetrics(net, reference),
    benchmarkMetrics: calculateResearchMetrics(reference, reference),
    attribution: series.map((holding) => {
      const returnPercent = (holding.prices.at(-1)! / holding.prices[0] - 1) * 100;
      return { symbol: holding.symbol, weight: holding.weight * 100, returnPercent, contribution: holding.weight * returnPercent };
    }),
    cashWeight: (1 - invested) * 100,
    entryCost,
    benchmarkEntryCost: benchmarkEntryCost / (1 + transactionCostBps / 10000),
  };
}

const strategies: Strategy[] = ['low-volatility', 'balanced', 'quality-growth'];

export function compareFinPilotStrategies(task: string, options: ResearchOptions): ResearchComparison {
  if (![63, 126, 252].includes(options.lookbackDays)) throw new Error('观察窗口仅支持 63、126、252 个交易日。');
  if (!Number.isInteger(options.candidateCount) || options.candidateCount < 2 || options.candidateCount > 5) throw new Error('候选数量须为 2–5 只。');
  if (!Number.isFinite(options.maxPosition) || options.maxPosition < 20 || options.maxPosition > 60) throw new Error('单股仓位上限须为 20–60%。');
  if (!Number.isFinite(options.maxDrawdown) || options.maxDrawdown < 8 || options.maxDrawdown > 35) throw new Error('回撤预算须为 8–35%。');
  const normalizedTask = task.trim();
  if (!normalizedTask) throw new Error('请输入研究任务。');
  const prices = marketData.benchmark.prices.filter((row) => row.date <= marketData.meta.cutoffDate).slice(-(options.lookbackDays + 1));
  if (prices.length !== options.lookbackDays + 1) throw new Error('冻结行情不足以覆盖完整观察窗口。');
  const results = strategies.map((strategy): StrategyExperiment => {
    const run = runFinPilotAgent(normalizedTask, strategy, `RESEARCH-${strategy}`, options);
    const holdings = run.portfolio.map((position) => ({
      symbol: position.symbol,
      // Use unrounded capital allocation, not the engine's display-rounded percentage.
      weight: position.amount / run.capital,
      prices: marketData.instruments.find((instrument) => instrument.symbol === position.symbol)!.prices,
    }));
    const replay = replayResearchPortfolio(holdings, prices, options.transactionCostBps);
    return {
      ...replay, strategy, label: strategyLabels[strategy], executable: run.riskChecks.every((check) => check.passed), riskChecks: run.riskChecks,
      evidence: run.candidates.filter((candidate) => candidate.decision === 'selected').map(({ symbol, composite, support, counter, sourceIds }) => ({ symbol, composite, support, counter, sourceIds })),
      sensitivity: [...new Set([0, 10, 25, 50, 100, options.transactionCostBps])].sort((a, b) => a - b).map((costBps) => {
        const scenario = replayResearchPortfolio(holdings, prices, costBps);
        return { costBps, totalReturn: scenario.metrics.totalReturn, excessReturn: scenario.metrics.excessReturn, maxDrawdown: scenario.metrics.maxDrawdown };
      }),
    };
  });
  const methodVersion = 'finpilot-research-v1';
  let hash = 2166136261;
  for (const character of JSON.stringify([methodVersion, normalizedTask, options.lookbackDays, options.transactionCostBps, options.candidateCount, options.maxPosition, options.maxDrawdown, marketData.meta.generatedAt])) {
    hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  }
  return {
    id: `FP-LAB-${(hash >>> 0).toString(16).toUpperCase()}`, methodVersion, task: normalizedTask, options: { ...options },
    cutoffDate: marketData.meta.cutoffDate, periodStart: prices[0].date, periodEnd: prices.at(-1)!.date, observations: prices.length - 1,
    lineage: {
      generatedAt: marketData.meta.generatedAt, priceProvider: marketData.meta.priceProvider, fundamentalProvider: marketData.meta.fundamentalProvider,
      universe: marketData.instruments.map((instrument) => instrument.symbol),
      sources: [...marketData.instruments.map((instrument) => ({ symbol: instrument.symbol, ...instrument.sources })), { symbol: marketData.benchmark.symbol, price: marketData.benchmark.sourceUrl }],
    },
    assumptions: [
      '回溯诊断：按 2024-12-31 的信息选股，再观察这些持仓在此前窗口的表现；存在选择前视偏差，不能作为样本外或可实现收益。',
      '三种策略共享任务、候选数量、仓位上限、回撤预算及相同交易日，只改变因子权重。未调用模型或实时行情。',
      '按截止日持仓金额比例在窗口起点构造分数份额，买入后持有、不再平衡；现金零收益。',
      '成本是单次买入成交额 × 单边 bps，由组合现金支付，并计入首个持有日收益；无卖出成本、税费和滑点。SPY 按相同 bps 从本金扣费后全额买入。',
      '日收益采用 252 日年化、总体标准差、零无风险利率；零波动 Sharpe 和零基准方差 Beta 显示为空。超额为两者累计收益之差，并非 Alpha。',
      '缺失或重复行情日期直接停止计算。八只股票构成固定样本，存在幸存者偏差；财务可用时间为期末后 90 天近似。',
    ],
    strategies: results,
  };
}

/** Daily observations and fee settings make the exact exported comparison independently inspectable. */
export function researchComparisonCsv(result: ResearchComparison): string {
  const rows: Array<Array<string | number>> = [['experiment_id', 'method', 'analysis_type', 'cutoff', 'strategy', 'lookback_days', 'candidate_count', 'max_position_pct', 'max_drawdown_budget_pct', 'cost_bps', 'date', 'gross_nav', 'net_nav', 'spy_net_nav']];
  for (const strategy of result.strategies) for (const point of strategy.points) {
    rows.push([result.id, result.methodVersion, 'retrospective_cutoff_selection', result.cutoffDate, strategy.strategy, result.options.lookbackDays, result.options.candidateCount, result.options.maxPosition, result.options.maxDrawdown, result.options.transactionCostBps, point.date, point.gross, point.net, point.benchmark]);
  }
  return rows.map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(',')).join('\r\n');
}
