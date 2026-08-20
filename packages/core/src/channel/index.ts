// Public channel API surface.

export type {
  ChannelScope,
  ChannelType,
  ChannelRef,
  ChannelMetadata,
  ContextEntry,
  FileContextEntry,
  RawContextEntry,
  ContextTarget,
  ContextMutationAction,
  EventOrigin,
  ThreadAction,
  InboxPolicy,
} from "./internal/store/schema.js";

export {
  GLOBAL_PROJECT_KEY,
  CHANNEL_TYPES,
  THREAD_ACTIONS,
  EVENT_ORIGINS,
  INBOX_POLICIES,
  parseChannelScope,
  parseChannelType,
  parseThreadAction,
  parseEventOrigin,
  parseInboxPolicy,
  normalizeThreadKey,
  buildContextEntries,
  contextEntryKey,
  asContextEntries,
  asStringArray,
} from "./internal/store/schema.js";

export type {
  ChannelEvent,
  ChannelEventKind,
  CreateChannelEvent,
  MessageChannelEvent,
  ThreadChannelEvent,
  ContextChannelEvent,
  ChannelMetadataEvent,
  SpawnedChannelEvent,
  KilledChannelEvent,
  DoneChannelEvent,
  ErrorChannelEvent,
  ProgressChannelEvent,
  UndeliverableChannelEvent,
  InterruptRequestedChannelEvent,
  TurnStartedChannelEvent,
  TurnFinishedChannelEvent,
  InterruptedChannelEvent,
  SupervisorWarningChannelEvent,
  SupervisorWarningReason,
  InterruptReason,
  InterruptMethod,
  InterruptOutcome,
  UndeliverableReason,
  ReadChannelEventsPagination,
  AppendablePartial,
} from "./internal/store/events.js";

export {
  CHANNEL_EVENT_KINDS,
  DEFAULT_CURSOR_PAGE_SIZE,
  parseChannelKind,
  parseChannelKinds,
  isCreateEvent,
  isThreadEvent,
  isContextEvent,
  isChannelMetadataEvent,
  appendEvent,
  readLastSeq,
} from "./internal/store/events.js";

export type {
  WorkerState,
  WorkerLifecycle,
  WorkerActivity,
  WorkerRegistry,
} from "./internal/store/worker-state.js";

export {
  reduceWorkerRegistry,
  isTerminalLifecycle,
} from "./internal/store/worker-state.js";

export {
  DEFAULT_INBOX_POLICY,
  matchesInboxPolicy,
} from "./internal/store/inbox.js";

export type {
  DeliveryMode,
  UndeliverableTarget,
} from "./internal/store/delivery.js";

export {
  DELIVERY_MODES,
  parseDeliveryMode,
  classifyDelivery,
} from "./internal/store/delivery.js";

export type { ChannelEventFilter } from "./internal/store/filter.js";
export type { WatchFilter } from "./internal/store/watch.js";

export {
  MEANINGFUL_EVENT_KINDS,
  matchesEventFilter,
} from "./internal/store/filter.js";

export {
  reduceChannelMetadata,
} from "./internal/store/channel-metadata.js";

export type {
  ThreadState,
  ThreadAliasResolver,
} from "./internal/store/thread-state.js";

export {
  reduceThreads,
  buildThreadAliasResolver,
  collectThreadTimeline,
} from "./internal/store/thread-state.js";

export {
  createChannel,
} from "./api/create.js";

export {
  sendMessage,
} from "./api/send.js";

export {
  readWorkerInbox,
  watchWorkerInbox,
  WorkerInboxError,
} from "./api/inbox.js";
export type {
  ReadWorkerInboxInput,
  WatchWorkerInboxInput,
  WorkerInboxMessage,
  WorkerInboxErrorCode,
} from "./api/inbox.js";

export {
  postThread,
  renameThread,
} from "./api/post-thread.js";

export {
  addChannelContext,
  deleteChannelContext,
  listChannelContext,
  addThreadContext,
  deleteThreadContext,
  listThreadContext,
} from "./api/context.js";

export {
  setChannelTitle,
  clearChannelTitle,
} from "./api/title.js";

export {
  readChannelEvents,
  readChannelMetadata,
  listForumThreads,
  showThread,
} from "./api/read.js";
export type { ReadChannelEventsOptions } from "./api/read.js";

export {
  watchChannelEvents,
} from "./api/watch.js";
export type { WatchChannelOptions } from "./api/watch.js";

export {
  watchChannels,
  channelCursorKey,
} from "./api/watch-channels.js";
export type {
  WatchChannelsInput,
  CrossChannelEvent,
  ChannelCursor,
  ChannelCursorKey,
} from "./api/watch-channels.js";

export {
  listWorkers,
  watchWorkers,
  probeWorkerRuntime,
  reconcileWorkerLiveness,
} from "./api/workers.js";
export type {
  ListWorkersInput,
  WatchWorkersInput,
  WorkerRuntimeObservation,
  ProbeWorkerRuntimeInput,
  ReconcileWorkerLivenessInput,
  ReconcileWorkerLivenessResult,
} from "./api/workers.js";

export { spawnWorker } from "./api/spawn.js";
export {
  requestInterrupt,
  interruptWorker,
} from "./api/interrupt.js";
export type {
  InterruptWorkerInput,
  InterruptWorkerResult,
  InterruptDelivery,
} from "./api/interrupt.js";

export type {
  WorkerStartInput,
  WorkerRuntimeHandle,
  WorkerInterruptInput,
  WorkerInterruptResult,
  WorkerStopInput,
  WorkerStopResult,
  WorkerRuntime,
  SpawnWorkerInput,
} from "./api/runtime.js";

export { resolveChannelRef } from "./api/resolve.js";
export type { ResolveChannelRefOptions } from "./api/resolve.js";

export type {
  ChannelAddressOptions,
  MutationCommonOptions,
  CreateChannelOptions,
  SendMessageOptions,
  PostThreadOptions,
  ContextMutationOptions,
  ThreadContextMutationOptions,
  RenameThreadOptions,
  SetChannelTitleOptions,
  ClearChannelTitleOptions,
} from "./api/types.js";
