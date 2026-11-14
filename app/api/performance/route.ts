import { parsePerformanceMetric } from '@/lib/performance-metrics';

export async function POST(request: Request) {
  if (process.env.PERFORMANCE_LOGGING !== '1') return new Response(null, { status: 204 });
  if (request.headers.get('origin') !== new URL(request.url).origin) {
    return new Response(null, { status: 403 });
  }
  // Read a bounded stream; Content-Length is not trusted and may be absent.
  const reader = request.body?.getReader();
  if (!reader) return new Response(null, { status: 400 });
  let text = '';
  let size = 0;
  const decoder = new TextDecoder();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 1024) {
        await reader.cancel();
        return new Response(null, { status: 413 });
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    const metric = parsePerformanceMetric(JSON.parse(text));
    if (!metric) return new Response(null, { status: 400 });
    console.info(JSON.stringify(metric));
    return new Response(null, { status: 204 });
  } catch { return new Response(null, { status: 400 }); }
  finally { reader.releaseLock(); }
}
