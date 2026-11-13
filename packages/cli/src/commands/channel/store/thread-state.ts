export {
  reduceThreads,
  buildThreadAliasResolver,
  collectThreadTimeline,
} from "@mindfoldhq/trellis-core/channel";

export type {
  ThreadState,
  ThreadAliasResolver,
} from "@mindfoldhq/trellis-core/channel";

import type { ThreadState } from "@mindfoldhq/trellis-core/channel";

export function formatThreadBoard(states: ThreadState[]): string[] {
  if (states.length === 0) return ["(no threads)"];
  return [
    "THREAD  STATUS  TITLE",
    ...states.map((state) => {
      const labels =
        state.labels.length > 0 ? ` labels=${state.labels.join(",")}` : "";
      return `${state.thread} [${state.status}] ${state.title ?? ""}${labels}`;
    }),
  ];
}
