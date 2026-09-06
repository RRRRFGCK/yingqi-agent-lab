import { type CareMemory } from '@/lib/careflow-agent';
import { runCareFlowLangGraph, type CareFlowFailureMode } from '@/lib/careflow-langgraph';

export async function GET() {
  return Response.json({
    framework: 'LangGraph',
    graphVersion: '3.0',
    modelAvailable: Boolean(process.env.OPENAI_API_KEY) && process.env.CAREFLOW_LIVE_ENABLED === 'true',
    model: process.env.OPENAI_MODEL || 'gpt-5.4-mini',
    checkpoint: 'MemorySaver (process-local)',
  });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as { query?: unknown; memory?: unknown; failureMode?: unknown } | null;
  const query = typeof body?.query === 'string' ? body.query.trim() : '';
  if (query.length < 4 || query.length > 1200) {
    return Response.json({ error: 'invalid_query', message: 'query must contain 4-1200 characters.' }, { status: 400 });
  }
  const rawMemory = body?.memory && typeof body.memory === 'object' ? body.memory as Partial<CareMemory> : {};
  const memory: CareMemory = {
    consented: rawMemory.consented === true,
    city: typeof rawMemory.city === 'string' ? rawMemory.city.slice(0, 20) : undefined,
    preferredTime: ['上午', '下午', '晚间'].includes(String(rawMemory.preferredTime)) ? rawMemory.preferredTime : undefined,
  };
  const allowedFailures: CareFlowFailureMode[] = ['none', 'retrieval-timeout', 'tool-timeout', 'tool-invalid-output'];
  const failureMode: CareFlowFailureMode = allowedFailures.includes(body?.failureMode as CareFlowFailureMode) ? body!.failureMode as CareFlowFailureMode : 'none';
  try {
    // Public demos remain offline by default even if an unrelated API key is present.
    // Enable live HTTP calls only in a protected environment; CLI eval is explicit.
    return Response.json({ result: await runCareFlowLangGraph(query, memory, failureMode, { offline: process.env.CAREFLOW_LIVE_ENABLED !== 'true' }) });
  } catch (error) {
    console.error('CareFlow graph failed', error instanceof Error ? error.message : 'unknown graph error');
    return Response.json({ error: 'graph_failed', message: 'CareFlow graph could not complete safely. No institution was contacted. For a real emergency, contact local emergency services or on-site professionals directly; do not wait for this demo.' }, { status: 502 });
  }
}
