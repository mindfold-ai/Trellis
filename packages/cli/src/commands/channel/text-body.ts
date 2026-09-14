import fs from "node:fs";
import {
  isRetiredDataPath,
  resolveTrellisDataRoot,
} from "../../utils/retired-data.js";

export interface ChannelTextBodyOptions {
  text?: string;
  stdin?: boolean;
  textFile?: string;
}

interface ResolveChannelTextBodyOptions {
  required: boolean;
  missingMessage: string;
  emptyMessage: string;
}

export async function resolveChannelTextBody(
  opts: ChannelTextBodyOptions,
  resolveOpts: ResolveChannelTextBodyOptions,
): Promise<string | undefined> {
  const raw = await readChannelTextBody(opts);
  if (raw === undefined) {
    if (resolveOpts.required) throw new Error(resolveOpts.missingMessage);
    return undefined;
  }

  const text = raw.trimEnd();
  if (!text) throw new Error(resolveOpts.emptyMessage);
  return text;
}

async function readChannelTextBody(
  opts: ChannelTextBodyOptions,
): Promise<string | undefined> {
  if (opts.text !== undefined && opts.text !== "") return opts.text;
  if (opts.textFile) {
    if (
      isRetiredDataPath(opts.textFile, resolveTrellisDataRoot(process.cwd())) ||
      isRetiredDataPath(
        fs.realpathSync(opts.textFile),
        resolveTrellisDataRoot(process.cwd()),
      )
    ) {
      throw new Error(
        "Retired identity/history is not context; use task/spec context instead.",
      );
    }
    return fs.readFileSync(opts.textFile, "utf-8");
  }
  if (opts.stdin) return await readStdin();
  return undefined;
}

async function readStdin(): Promise<string> {
  return await new Promise<string>((resolve, reject) => {
    let buf = "";
    const onData = (chunk: Buffer): void => {
      buf += chunk.toString("utf-8");
    };
    const cleanup = (): void => {
      process.stdin.off("data", onData);
      process.stdin.off("end", onEnd);
      process.stdin.off("error", onError);
    };
    const onEnd = (): void => {
      cleanup();
      resolve(buf);
    };
    const onError = (err: Error): void => {
      cleanup();
      reject(err);
    };

    process.stdin.on("data", onData);
    process.stdin.once("end", onEnd);
    process.stdin.once("error", onError);
  });
}
