import { runCareFlowAgent, type CareMemory } from '@/lib/careflow-agent';

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as { query?: unknown; memory?: unknown } | null;
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
  return Response.json({ result: runCareFlowAgent(query, memory, `CF-API-${Date.now().toString(36).toUpperCase()}`) });
}
