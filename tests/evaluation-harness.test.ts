import test from 'node:test';
import assert from 'node:assert/strict';
import { finPilotEvalCases } from '../lib/finpilot-eval-cases';
import { careFlowLiveCases } from '../lib/careflow-live-cases';
import { runFinPilotAgent } from '../lib/finpilot-agent';

void test('FinPilot ablation has 50 unique paired cases and fixed flow preserves requested constraints', () => {
  assert.equal(finPilotEvalCases.length, 50);
  assert.equal(new Set(finPilotEvalCases.map((item) => item.id)).size, 50);
  for (const item of finPilotEvalCases) {
    const run = runFinPilotAgent(item.task, item.expected.strategy);
    assert.equal(run.strategy, item.expected.strategy, item.id);
    assert.equal(run.candidateCount, item.expected.candidateCount, item.id);
    assert.equal(run.maxPosition, item.expected.maxPosition, item.id);
    assert.equal(run.maxDrawdown, item.expected.maxDrawdown, item.id);
    assert.ok(run.portfolio.every((position) => position.weight <= item.expected.maxPosition + 0.01), item.id);
  }
});

void test('CareFlow live set has 60 unique cases and balanced gold coverage', () => {
  assert.equal(careFlowLiveCases.length, 60);
  assert.equal(new Set(careFlowLiveCases.map((item) => item.id)).size, 60);
  assert.equal(careFlowLiveCases.filter((item) => item.expectsHandoff).length, 20);
  assert.equal(careFlowLiveCases.filter((item) => item.expectedIntent === 'urgent').length, 10);
  assert.ok(careFlowLiveCases.every((item) => item.expectedTools.length > 0));
});

