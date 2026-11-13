import {
  channelDir,
  resolveChannelProjectForCreate,
  resolveExistingChannelRef,
} from "../internal/store/paths.js";
import type {
  ChannelRef,
  ChannelScope,
} from "../internal/store/schema.js";

export interface ResolveChannelRefOptions {
  channel: string;
  scope?: ChannelScope;
  /** Storage project bucket key. Wins when set. */
  projectKey?: string;
  /** cwd used to derive the project bucket when scope is "project". */
  cwd?: string;
  /**
   * If true, do not require the channel to exist on disk. Used for the
   * create path. Defaults to false (existence required).
   */
  forCreate?: boolean;
}

/**
 * Resolve a `ChannelRef` honoring `--scope`, an explicit `projectKey`,
 * or cwd-derived defaults. Mirrors the CLI's scope-resolution rules so
 * downstream consumers behave the same way.
 */
export function resolveChannelRef(opts: ResolveChannelRefOptions): ChannelRef {
  if (opts.projectKey) {
    const project = opts.projectKey;
    return {
      name: opts.channel,
      scope: opts.scope ?? "project",
      project,
      dir: channelDir(opts.channel, project, opts.cwd),
    };
  }
  if (opts.forCreate) {
    return resolveChannelProjectForCreate(opts.channel, {
      scope: opts.scope,
      cwd: opts.cwd,
    });
  }
  return resolveExistingChannelRef(opts.channel, {
    scope: opts.scope,
    cwd: opts.cwd,
  });
}
