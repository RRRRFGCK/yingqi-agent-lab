import { executionBenchRequestSchema, runExecutionBench } from '@/lib/agentbench-execution';

export const runtime = 'nodejs';
export const maxDuration = 30;
const MAX_BODY_BYTES = 1024;
let activeRuns = 0;

// A per-process guard bounds local demo work; this is not a distributed rate limiter.
export async function POST(request: Request) {
  if (activeRuns >= 2) return Response.json({ error: 'bench_busy', message: '当前评测繁忙，请稍后重试。' }, { status: 429, headers: { 'Retry-After': '5' } });
  let input: unknown;
  const reader = request.body?.getReader();
  if (!reader) return Response.json({ error: 'invalid_request' }, { status: 400 });
  try {
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_BODY_BYTES) {
        await reader.cancel();
        return Response.json({ error: 'request_too_large' }, { status: 413 });
      }
      chunks.push(value);
    }
    const body = new Uint8Array(bytes);
    let offset = 0;
    for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
    input = JSON.parse(new TextDecoder().decode(body));
  } catch {
    return Response.json({ error: 'invalid_json' }, { status: 400 });
  } finally {
    reader.releaseLock();
  }
  const parsed = executionBenchRequestSchema.safeParse(input);
  if (!parsed.success) return Response.json({ error: 'invalid_request', message: '仅支持固定 profile 和 1–3 次重复；不接受自定义输入或模型参数。' }, { status: 400 });
  if (activeRuns >= 2) return Response.json({ error: 'bench_busy' }, { status: 429, headers: { 'Retry-After': '5' } });
  activeRuns++;
  try {
    const result = await runExecutionBench(parsed.data, request.signal);
    return Response.json({ result }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return Response.json({ error: 'bench_failed', message: '评测未完成，请重试；没有调用模型或外部服务。' }, { status: 503 });
  } finally {
    activeRuns--;
  }
}
