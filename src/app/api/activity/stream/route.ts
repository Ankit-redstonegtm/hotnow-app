import { EventType } from "@ag-ui/core";
import { EventEncoder } from "@ag-ui/encoder";
import { requireUser, UnauthorizedError } from "@/lib/auth-helpers";
import { getActivity } from "@/lib/activity/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

// Read-only AG-UI state feed. Reconnect restores authoritative DB state; it
// never starts a model run or repeats an external action.
export async function GET(req: Request) {
  try {
    const { sb, user } = await requireUser();
    const initial = await getActivity(sb, user.id);
    const encoder = new EventEncoder({ accept: "text/event-stream" }), bytes = new TextEncoder();
    let stop = () => {};
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        let closed = false, timer: ReturnType<typeof setTimeout>, previous = "", tick = 0;
        const started = Date.now();
        stop = () => { if (closed) return; closed = true; clearTimeout(timer); req.signal.removeEventListener("abort", stop); try { controller.close(); } catch {} };
        req.signal.addEventListener("abort", stop, { once: true });
        const emit = (value: string) => { if (!closed) controller.enqueue(bytes.encode(value)); };
        emit("retry: 3000\n\n");
        async function publish(snapshot?: typeof initial) {
          try {
            if (closed) return;
            // Bound stream lifetime and recheck session on every reconnect. This
            // also permits deployments with a 60-second request limit.
            if (Date.now() - started > 45_000) { stop(); return; }
            if (tick > 0 && tick % 5 === 0) {
              const { data: { user: current } } = await sb.auth.getUser();
              if (current?.id !== user.id) { stop(); return; }
            }
            const state = snapshot || await getActivity(sb, user.id);
            const version = JSON.stringify({ items: state.items, active: state.active, mode: state.mode, queueAvailable: state.queueAvailable });
            if (version !== previous) {
              emit(encoder.encode({ type: EventType.STATE_SNAPSHOT, snapshot: state, timestamp: Date.now() }));
              previous = version;
            } else emit(": heartbeat\n\n");
            tick++;
          } catch {
            emit(encoder.encode({ type: EventType.CUSTOM, name: "connection_status", value: { status: "reconnecting" } }));
            stop(); return;
          }
          if (!closed) timer = setTimeout(() => void publish(), 3000);
        }
        if (req.signal.aborted) stop(); else void publish(initial);
      },
      cancel() { stop(); },
    });
    return new Response(stream, { headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "private, no-store, no-transform",
      "Connection": "keep-alive", "X-Accel-Buffering": "no" } });
  } catch (error) {
    return Response.json({ error: error instanceof UnauthorizedError ? "Sign in to view activity" : "Live activity is temporarily unavailable" }, { status: error instanceof UnauthorizedError ? 401 : 503 });
  }
}
