import { type CareMemory } from '@/lib/careflow-agent';
import { runCareFlowLangGraph, type CareFlowFailureMode } from '@/lib/careflow-langgraph';

export async function GET() {
  return Response.json({
    framework: 'LangGraph',
    graphVersion: '2.0',
    modelAvailable: Boolean(process.env.OPENAI_API_KEY),
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
    recentIntent: rawMemory.recentIntent,
    updatedAt: rawMemory.updatedAt,
  };
  const failureMode: CareFlowFailureMode = body?.failureMode === 'retrieval-timeout' ? 'retrieval-timeout' : 'none';
  try {
    return Response.json({ result: await runCareFlowLangGraph(query, memory, failureMode) });
  } catch (error) {
    console.error('CareFlow graph failed', error instanceof Error ? error.message : 'unknown graph error');
    return Response.json({ error: 'graph_failed', message: 'CareFlow graph could not complete safely.' }, { status: 502 });
  }
}
