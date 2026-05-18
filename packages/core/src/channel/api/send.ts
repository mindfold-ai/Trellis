import {
  appendEvent,
  readChannelEvents,
  type MessageChannelEvent,
} from "../internal/store/events.js";
import { classifyDelivery } from "../internal/store/delivery.js";
import { reduceWorkerRegistry } from "../internal/store/worker-state.js";
import { resolveChannelRef } from "./resolve.js";
import type { SendMessageOptions } from "./types.js";

export async function sendMessage(
  opts: SendMessageOptions,
): Promise<MessageChannelEvent> {
  const ref = resolveChannelRef({
    channel: opts.channel,
    ...(opts.scope !== undefined ? { scope: opts.scope } : {}),
    ...(opts.projectKey !== undefined ? { projectKey: opts.projectKey } : {}),
    ...(opts.cwd !== undefined ? { cwd: opts.cwd } : {}),
  });
  const event = (await appendEvent(
    opts.channel,
    {
      kind: "message",
      by: opts.by,
      text: opts.text,
      ...(opts.to !== undefined ? { to: opts.to } : {}),
      ...(opts.origin !== undefined ? { origin: opts.origin } : {}),
      ...(opts.meta !== undefined ? { meta: opts.meta } : {}),
    },
    ref.project,
  )) as MessageChannelEvent;

  // Strict delivery modes: classify targets against the durable worker
  // registry and append `undeliverable` for failures. The message event
  // is already durable above, so user intent is never lost.
  const mode = opts.deliveryMode ?? "appendOnly";
  if (mode !== "appendOnly" && opts.to !== undefined) {
    const targets = Array.isArray(opts.to) ? opts.to : [opts.to];
    const events = await readChannelEvents(opts.channel, ref.project);
    const registry = reduceWorkerRegistry(events);
    const failures = classifyDelivery(registry, targets, mode);
    for (const failure of failures) {
      await appendEvent(
        opts.channel,
        {
          kind: "undeliverable",
          by: opts.by,
          targetWorker: failure.targetWorker,
          messageSeq: event.seq,
          reason: failure.reason,
          ...(opts.origin !== undefined ? { origin: opts.origin } : {}),
          ...(opts.meta !== undefined ? { meta: opts.meta } : {}),
        },
        ref.project,
      );
    }
  }

  return event;
}
