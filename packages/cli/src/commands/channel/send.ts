import {
  parseDeliveryMode,
  sendMessage as coreSendMessage,
  type ChannelScope,
} from "@mindfoldhq/trellis-core/channel";

import { parseChannelScope, parseCsv } from "./store/schema.js";
import { resolveChannelTextBody } from "./text-body.js";

export interface SendOptions {
  as: string;
  text?: string;
  stdin?: boolean;
  textFile?: string;
  scope?: string;
  to?: string; // CSV
  deliveryMode?: string;
}

export async function channelSend(
  channelName: string,
  opts: SendOptions,
): Promise<void> {
  const text = await resolveChannelTextBody(opts, {
    required: true,
    missingMessage:
      "No text provided (use <text> arg, --stdin, or --text-file)",
    emptyMessage: "Empty message",
  });
  const to = parseCsv(opts.to);
  const scope: ChannelScope | undefined = parseChannelScope(opts.scope);
  const deliveryMode = parseDeliveryMode(opts.deliveryMode);

  const event = await coreSendMessage({
    channel: channelName,
    by: opts.as,
    text: text as string,
    ...(scope !== undefined ? { scope } : {}),
    ...(to !== undefined ? { to: to.length === 1 ? to[0] : to } : {}),
    ...(deliveryMode !== undefined ? { deliveryMode } : {}),
    origin: "cli",
  });
  console.log(JSON.stringify(event));
}
