import { registerClient, subscribeChannel, sendHeartbeat } from "@/lib/sseManager";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const uid = searchParams.get("uid") || null;
  const channels = searchParams.getAll("channel");

  const encoder = new TextEncoder();
  let streamCleanup = null;
  const stream = new ReadableStream({
    start(controller) {
      let active = true;
      let unregister = () => {};
      let heartbeat;

      const write = (frame) => {
        if (active) controller.enqueue(encoder.encode(frame));
      };

      controller.enqueue(encoder.encode(`retry: 15000\n\n`));
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ connected: true, uid })}\n\n`));

      const clientId = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

      unregister = registerClient({ id: clientId, uid, write });
      for (const c of channels) {
        try { subscribeChannel(clientId, c); } catch {}
      }
      // Admin dashboard pages listen on admin:meta for sync/meta events.
      // Auto-subscribe so ?channel= is optional and reconnects keep working.
      try { subscribeChannel(clientId, "admin:meta"); } catch {}

      heartbeat = setInterval(() => {
        try { sendHeartbeat(clientId); } catch {}
      }, 25000);

      const cleanup = () => {
        if (!active) return;
        active = false;
        clearInterval(heartbeat);
        unregister();
        try { controller.close(); } catch {}
      };

      request.signal.addEventListener("abort", cleanup, { once: true });
      streamCleanup = cleanup;
    },
    cancel() {
      streamCleanup?.();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
