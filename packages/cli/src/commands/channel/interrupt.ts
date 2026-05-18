import {
  requestInterrupt,
  type ChannelScope,
} from "@mindfoldhq/trellis-core/channel";

import { parseChannelScope } from "./store/schema.js";
import { resolveChannelTextBody } from "./text-body.js";

export interface InterruptOptions {
  as: string;
  to: string;
  text?: string;
  stdin?: boolean;
  textFile?: string;
  scope?: string;
}

export async function channelInterrupt(
  channelName: string,
  opts: InterruptOptions,
): Promise<void> {
  const message = await resolveChannelTextBody(opts, {
    required: true,
    missingMessage:
      "No interrupt message provided (use <text> arg, --stdin, or --text-file)",
    emptyMessage: "Empty interrupt message",
  });
  const scope: ChannelScope | undefined = parseChannelScope(opts.scope);

  const event = await requestInterrupt({
    channel: channelName,
    by: opts.as,
    workerId: opts.to,
    message,
    reason: "user",
    ...(scope !== undefined ? { scope } : {}),
    origin: "cli",
  });
  console.log(JSON.stringify(event));
}
