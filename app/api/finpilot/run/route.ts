import { runFinPilotAgent, type PlannerOverrides, type Strategy } from '@/lib/finpilot-agent';

type PlannerCall = {
  strategy: Strategy;
  candidateCount: number;
  maxPosition: number;
  maxDrawdown: number;
  reflectionRequired: boolean;
  rationale: string;
};

const MODEL = process.env.OPENAI_MODEL || 'gpt-5.4-mini';

function isPlannerCall(value: unknown): value is PlannerCall {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<PlannerCall>;
  return ['low-volatility', 'balanced', 'quality-growth'].includes(item.strategy || '')
    && Number.isFinite(item.candidateCount) && Number(item.candidateCount) >= 2 && Number(item.candidateCount) <= 5
    && Number.isFinite(item.maxPosition) && Number(item.maxPosition) >= 20 && Number(item.maxPosition) <= 60
    && Number.isFinite(item.maxDrawdown) && Number(item.maxDrawdown) >= 8 && Number(item.maxDrawdown) <= 35
    && typeof item.reflectionRequired === 'boolean'
    && typeof item.rationale === 'string' && item.rationale.length >= 8;
}

export async function GET() {
  return Response.json({ available: Boolean(process.env.OPENAI_API_KEY), model: MODEL, provider: 'OpenAI Responses API' });
}

export async function POST(request: Request) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return Response.json({ error: 'model_unavailable', message: 'OPENAI_API_KEY is not configured; use the deterministic fallback.' }, { status: 503 });

  const body = await request.json().catch(() => null) as { task?: unknown; strategy?: unknown } | null;
  const task = typeof body?.task === 'string' ? body.task.trim() : '';
  if (task.length < 10 || task.length > 1500) return Response.json({ error: 'invalid_task', message: 'task must contain 10-1500 characters.' }, { status: 400 });
  const preferred = ['low-volatility', 'balanced', 'quality-growth'].includes(String(body?.strategy)) ? String(body?.strategy) : null;

  const startedAt = Date.now();
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      store: false,
      parallel_tool_calls: false,
      instructions: [
        'You are the planning layer of an educational historical investment-research demo.',
        'Convert the user request to a conservative structured research plan.',
        'Never claim future returns, never request real trading, and never loosen an explicit numeric risk limit.',
        'Use the create_research_plan function exactly once. Keep the rationale concise and in Chinese.',
      ].join(' '),
      input: `用户任务：${task}\n界面预选策略：${preferred || '未指定'}\n数据硬边界：仅使用 2024-12-31 及以前的冻结历史数据。`,
      tools: [{
        type: 'function',
        name: 'create_research_plan',
        description: 'Create the constrained plan that the deterministic data, analytics, reflection and risk tools will execute.',
        strict: true,
        parameters: {
          type: 'object',
          properties: {
            strategy: { type: 'string', enum: ['low-volatility', 'balanced', 'quality-growth'] },
            candidateCount: { type: 'integer', minimum: 2, maximum: 5 },
            maxPosition: { type: 'number', minimum: 20, maximum: 60 },
            maxDrawdown: { type: 'number', minimum: 8, maximum: 35 },
            reflectionRequired: { type: 'boolean', description: 'Whether conflicting supporting and opposing evidence must trigger a review pass.' },
            rationale: { type: 'string', minLength: 8, maxLength: 240 },
          },
          required: ['strategy', 'candidateCount', 'maxPosition', 'maxDrawdown', 'reflectionRequired', 'rationale'],
          additionalProperties: false,
        },
      }],
      tool_choice: { type: 'function', name: 'create_research_plan' },
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    console.error('OpenAI planner failed', response.status, detail.slice(0, 500));
    return Response.json({ error: 'planner_failed', message: `OpenAI planner returned ${response.status}.` }, { status: 502 });
  }

  const payload = await response.json() as { id?: string; output?: Array<{ type?: string; name?: string; arguments?: string }> };
  const functionCall = payload.output?.find((item) => item.type === 'function_call' && item.name === 'create_research_plan');
  const parsed = functionCall?.arguments ? JSON.parse(functionCall.arguments) as unknown : null;
  if (!isPlannerCall(parsed)) return Response.json({ error: 'invalid_tool_call', message: 'The planner response did not match the strict schema.' }, { status: 502 });

  const overrides: PlannerOverrides = {
    strategy: parsed.strategy,
    candidateCount: parsed.candidateCount,
    maxPosition: parsed.maxPosition,
    maxDrawdown: parsed.maxDrawdown,
    rationale: parsed.rationale,
    model: MODEL,
  };
  const result = runFinPilotAgent(task, parsed.strategy, `FP-AI-${Date.now().toString(36).toUpperCase()}`, overrides);
  result.latencyMs += Date.now() - startedAt;
  return Response.json({ result, plannerResponseId: payload.id ?? null });
}
