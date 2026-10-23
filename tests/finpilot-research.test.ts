import assert from 'node:assert/strict';
import test from 'node:test';
import { defaultTasks } from '../lib/finpilot-agent';
import { calculateResearchMetrics, compareFinPilotStrategies, replayResearchPortfolio, researchComparisonCsv, type ResearchOptions } from '../lib/finpilot-research';

const options: ResearchOptions = { lookbackDays: 252, transactionCostBps: 10, candidateCount: 3, maxPosition: 40, maxDrawdown: 18 };
const closeTo = (actual: number, expected: number, tolerance = 1e-9) => assert.ok(Math.abs(actual - expected) < tolerance, `${actual} != ${expected}`);
const prices = (values: number[]) => values.map((close, index) => ({ date: `2024-01-${String(index + 1).padStart(2, '0')}`, close }));

void test('buy-and-hold replay charges the full traded notional once and reconciles contribution', () => {
  const replay = replayResearchPortfolio([{ symbol: 'TEST', weight: 0.6, prices: prices([100, 110, 99]) }], prices([100, 100, 100]), 100);
  assert.deepEqual(replay.points.map((point) => point.gross), [100, 106, 99.4]);
  closeTo(replay.points[1].net, 105.4);
  closeTo(replay.points[2].net, 98.8);
  closeTo(replay.entryCost, 0.6);
  closeTo(replay.cashWeight, 40);
  closeTo(replay.metrics.totalReturn, -1.2);
  closeTo(replay.metrics.maxDrawdown, (105.4 - 98.8) / 105.4 * 100);
  closeTo(replay.attribution[0].contribution - replay.entryCost, replay.metrics.totalReturn);
  closeTo(replay.points[2].benchmark, 100 / 1.01);
  closeTo(replay.benchmarkEntryCost, 100 - 100 / 1.01);
});

void test('actual drifting units differ from implicit daily rebalancing', () => {
  const replay = replayResearchPortfolio([
    { symbol: 'A', weight: 0.4, prices: prices([100, 200, 100]) },
    { symbol: 'B', weight: 0.4, prices: prices([100, 100, 200]) },
  ], prices([100, 105, 100]), 0);
  // 0.4 * 1 + 0.4 * 2 + 0.2 cash = 1.4. Daily constant weights would produce 1.68.
  closeTo(replay.points[2].net, 140);
  closeTo(replay.metrics.totalReturn, 40);
  closeTo(replay.attribution.reduce((sum, holding) => sum + holding.contribution, 0), 40);
});

void test('zero variance ratios are null; cash has zero return and no trading charge', () => {
  const metrics = calculateResearchMetrics([100, 100, 100], [100, 100, 100]);
  assert.equal(metrics.sharpe, null);
  assert.equal(metrics.beta, null);
  assert.equal(metrics.maxDrawdown, 0);
  assert.equal(metrics.trackingError, 0);
  const replay = replayResearchPortfolio([], prices([100, 105, 100]), 50);
  assert.equal(replay.cashWeight, 100);
  assert.equal(replay.entryCost, 0);
  assert.equal(replay.metrics.totalReturn, 0);
  assert.equal(replay.metrics.beta, 0);
});

void test('daily metrics use the initial value as the first drawdown peak and sample-consistent benchmark', () => {
  const metrics = calculateResearchMetrics([100, 90, 99], [100, 90, 99]);
  closeTo(metrics.maxDrawdown, 10);
  closeTo(metrics.totalReturn, -1);
  closeTo(metrics.annualizedReturn, (0.99 ** 126 - 1) * 100);
  closeTo(metrics.beta!, 1);
  closeTo(metrics.excessReturn, 0);
  closeTo(metrics.trackingError, 0);
  closeTo(metrics.annualizedVolatility, 0.1 * Math.sqrt(252) * 100);
});

void test('invalid prices, missing dates, duplicate instruments and unfunded fees fail explicitly', () => {
  assert.throws(() => replayResearchPortfolio([{ symbol: 'A', weight: 0.5, prices: prices([100, 110]) }], prices([100, 101, 102]), 10), /缺少/);
  assert.throws(() => replayResearchPortfolio([{ symbol: 'A', weight: 0.5, prices: prices([100, 0, 102]) }], prices([100, 101, 102]), 10), /有效价格/);
  assert.throws(() => replayResearchPortfolio([{ symbol: 'A', weight: 0.5, prices: [...prices([100, 110]), prices([100])[0]] }], prices([100, 101]), 10), /重复日期/);
  assert.throws(() => replayResearchPortfolio([], [prices([100])[0], prices([100])[0]], 0), /严格递增/);
  assert.throws(() => replayResearchPortfolio([{ symbol: 'A', weight: 1, prices: prices([100, 100]) }], prices([100, 100]), 10), /现金不足/);
  assert.throws(() => replayResearchPortfolio([{ symbol: 'A', weight: 1.1, prices: prices([100, 100]) }], prices([100, 100]), 0), /总权重/);
  assert.throws(() => replayResearchPortfolio([{ symbol: 'A', weight: 0.2, prices: [] }, { symbol: 'A', weight: 0.2, prices: [] }], prices([100, 100]), 0), /标的不能重复/);
  assert.throws(() => replayResearchPortfolio([], prices([100, 100]), Number.NaN), /单边成本/);
  assert.throws(() => replayResearchPortfolio([], prices([100, 100]), -1), /单边成本/);
  assert.throws(() => replayResearchPortfolio([], prices([100, 100]), 101), /单边成本/);
  assert.throws(() => calculateResearchMetrics([100], [100]), /至少两个/);
  assert.throws(() => calculateResearchMetrics([100, 0], [100, 100]), /正数序列/);
});

void test('same task and conditions produce identical experiments on a shared frozen calendar', () => {
  const result = compareFinPilotStrategies(defaultTasks[0].task, options);
  assert.deepEqual(result, compareFinPilotStrategies(defaultTasks[0].task, options));
  assert.equal(result.observations, 252);
  assert.equal(result.strategies.length, 3);
  assert.equal(result.periodEnd, result.cutoffDate);
  assert.ok(result.assumptions.some((assumption) => assumption.includes('前视偏差')));
  assert.equal(new Set(result.strategies.map((strategy) => strategy.strategy)).size, 3);
  for (const strategy of result.strategies) {
    assert.equal(strategy.attribution.length, options.candidateCount);
    assert.ok(strategy.attribution.every((holding) => holding.weight <= options.maxPosition));
    assert.deepEqual(strategy.points.map((point) => point.date), result.strategies[0].points.map((point) => point.date));
    assert.deepEqual(strategy.points.map((point) => point.benchmark), result.strategies[0].points.map((point) => point.benchmark));
    assert.equal(strategy.points.length, 253);
    closeTo(strategy.attribution.reduce((sum, holding) => sum + holding.contribution, 0) - strategy.entryCost, strategy.metrics.totalReturn);
    assert.ok(strategy.points.every((point) => point.date <= result.cutoffDate));
    assert.ok(strategy.evidence.every((evidence) => evidence.support.length && evidence.counter.length && evidence.sourceIds.length));
  }
});

void test('cost sensitivity changes results without selecting a different portfolio', () => {
  const free = compareFinPilotStrategies(defaultTasks[0].task, { ...options, transactionCostBps: 0 });
  const costly = compareFinPilotStrategies(defaultTasks[0].task, { ...options, transactionCostBps: 100 });
  assert.notEqual(free.id, costly.id);
  free.strategies.forEach((strategy, index) => {
    assert.deepEqual(strategy.attribution, costly.strategies[index].attribution);
    assert.ok(strategy.metrics.totalReturn > costly.strategies[index].metrics.totalReturn);
    strategy.sensitivity.forEach((scenario, sensitivityIndex) => {
      if (sensitivityIndex) assert.ok(scenario.totalReturn < strategy.sensitivity[sensitivityIndex - 1].totalReturn);
    });
    closeTo(strategy.sensitivity.find((scenario) => scenario.costBps === 100)!.totalReturn, costly.strategies[index].metrics.totalReturn);
  });
});

void test('strict risk budgets remain blocked and shared constraints affect all strategies', () => {
  const result = compareFinPilotStrategies(defaultTasks[0].task, { ...options, maxDrawdown: 8, candidateCount: 2, maxPosition: 30, lookbackDays: 63 });
  assert.equal(result.observations, 63);
  for (const strategy of result.strategies) {
    assert.equal(strategy.attribution.length, 2);
    assert.ok(strategy.attribution.every((holding) => holding.weight <= 30));
    assert.ok(strategy.cashWeight >= 40);
    assert.equal(strategy.executable, strategy.riskChecks.every((check) => check.passed));
    assert.equal(strategy.riskChecks.find((check) => check.id === 'drawdown-budget')!.limit, '≤ 8%');
  }
  const blocked = compareFinPilotStrategies(defaultTasks[0].task, { ...options, maxDrawdown: 8 });
  assert.ok(blocked.strategies.some((strategy) => !strategy.executable));
});

void test('exports preserve daily samples and invalid experiment settings cannot silently clamp', () => {
  const result = compareFinPilotStrategies(defaultTasks[0].task, { ...options, lookbackDays: 63 });
  const csv = researchComparisonCsv(result);
  const rows = csv.split('\r\n');
  assert.equal(rows.length, 1 + 3 * 64);
  assert.match(rows[0], /gross_nav.*net_nav.*spy_net_nav/);
  assert.ok(rows.at(-1)!.includes(result.periodEnd));
  assert.deepEqual(JSON.parse(JSON.stringify(result)), result);
  for (const invalid of [{ lookbackDays: 10 }, { candidateCount: 2.5 }, { maxPosition: Number.NaN }, { maxDrawdown: 99 }]) {
    assert.throws(() => compareFinPilotStrategies(defaultTasks[0].task, { ...options, ...invalid }));
  }
  assert.throws(() => compareFinPilotStrategies('   ', options), /研究任务/);
});
