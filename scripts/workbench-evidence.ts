import { mkdir, writeFile } from 'node:fs/promises';
import { runExecutionBench, type ExecutionProfile } from '../lib/agentbench-execution';
import { compareFinPilotStrategies } from '../lib/finpilot-research';
import { defaultTasks } from '../lib/finpilot-agent';

// No model keys, API calls or model-quality claims. Timings are machine-specific.
const reports = [];
for (const profile of ['normal', 'transient', 'containment', 'mixed'] as ExecutionProfile[]) {
  const report = await runExecutionBench({ profile, repetitions: 1 });
  reports.push(report);
  console.log(`${profile}: ${report.summary.matched}/${report.summary.cases} expectations matched; ${report.summary.taskPassed} tasks passed; ${report.summary.contained} faults contained`);
}
const research = compareFinPilotStrategies(defaultTasks[0].task, {
  lookbackDays: 252, transactionCostBps: 10, candidateCount: 3, maxPosition: 40, maxDrawdown: 18,
});
await mkdir(new URL('../evidence/', import.meta.url), { recursive: true });
await writeFile(new URL('../evidence/workbench-regression.json', import.meta.url), JSON.stringify({
  schemaVersion: 1, generatedAt: new Date().toISOString(),
  scope: 'Offline synthetic workflow regression and frozen-data retrospective portfolio diagnostics. Not a live-model benchmark or out-of-sample investment result.',
  execution: reports,
  research,
}, null, 2) + '\n');
if (reports.some(report => report.gates.some(gate => !gate.passed))) process.exitCode = 1;
