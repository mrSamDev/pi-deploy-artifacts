import { execSync, spawn } from "node:child_process";

export function slugify(title: string): string {
  return (
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 60) || "artifact"
  );
}

export function remoteToPagesUrl(remote: string): string {
  const match = remote.match(/(?:github\.com[:/])([^\s]+?)(?:\.git)?$/);
  if (!match) return "https://pages.github.com/ (unknown remote)";
  const [, path] = match;
  const [user, repo] = path.split("/");
  if (repo === `${user}.github.io`) {
    return `https://${user}.github.io/`;
  }
  return `https://${user}.github.io/${repo}/`;
}

export function which(cmd: string): boolean {
  try {
    execSync(`which ${cmd}`, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

/**
 * Async command executor that streams output line-by-line.
 * Keeps the event loop alive so the TUI can render updates.
 */
export async function execAsync(
  cmd: string,
  cwd: string,
  onLine?: (line: string) => void,
  signal?: AbortSignal,
): Promise<string> {
  // Fail fast if already aborted — don't even spawn.
  if (signal?.aborted) {
    throw new Error("Operation aborted");
  }

  return new Promise((resolve, reject) => {
    // Passing signal to spawn makes Node kill the child (SIGTERM) on abort.
    const child = spawn(cmd, { cwd, shell: true, timeout: 120_000, signal });
    let stdout = "";
    let stderr = "";
    let settled = false;

    const settle = (fn: () => void) => {
      if (!settled) {
        settled = true;
        fn();
      }
    };

    const emitLines = (text: string) => {
      for (const line of text.split("\n")) {
        const trimmed = line.trim();
        if (trimmed) onLine?.(trimmed);
      }
    };

    child.stdout?.on("data", (data) => {
      const text = data.toString();
      stdout += text;
      emitLines(text);
    });

    child.stderr?.on("data", (data) => {
      const text = data.toString();
      stderr += text;
      emitLines(text);
    });

    child.on("close", (code) => {
      if (code !== 0) {
        settle(() => reject(new Error(stderr.trim() || `Command failed with code ${code}`)));
      } else {
        settle(() => resolve(stdout.trim()));
      }
    });

    child.on("error", (err) => {
      settle(() => reject(err));
    });

    // Explicit abort listener for a clean error message. Node's spawn signal
    // option also kills the child, but the AbortError it emits can race with
    // the close event — this ensures "aborted" wins.
    signal?.addEventListener(
      "abort",
      () => settle(() => reject(new Error("Operation aborted"))),
      { once: true },
    );
  });
}

/** Stable project name derived from cwd path.
 * Lowercased because Cloudflare Pages, Vercel, and Netlify all require
 * lowercase project/site names. */
export function projectNameFromCwd(cwd: string): string {
  return `pi-artifacts-${cwd.replace(/[^a-zA-Z0-9]/g, "-").replace(/^-+|-+$/g, "").slice(0, 40)}`.toLowerCase();
}

const PROJECT_NAME_RE = /^[a-zA-Z0-9][a-zA-Z0-9-]{0,62}$/;

/**
 * Validate a projectName loaded from persistent state before interpolating
 * it into a shell command. State files can be hand-edited, so we must not
 * trust stored values at the shell boundary.
 */
export function isValidProjectName(name: unknown): name is string {
  return typeof name === "string" && PROJECT_NAME_RE.test(name);
}
