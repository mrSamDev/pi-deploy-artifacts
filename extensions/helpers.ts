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

export function exec(cmd: string, cwd: string): string {
  return execSync(cmd, { cwd, encoding: "utf-8", timeout: 120_000 }).trim();
}

/**
 * Async command executor that streams output line-by-line.
 * Keeps the event loop alive so the TUI can render updates.
 */
export async function execAsync(
  cmd: string,
  cwd: string,
  onLine?: (line: string) => void,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, { cwd, shell: true, timeout: 120_000 });
    let stdout = "";
    let stderr = "";

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
        reject(new Error(stderr.trim() || `Command failed with code ${code}`));
      } else {
        resolve(stdout.trim());
      }
    });

    child.on("error", reject);
  });
}

/** Stable project name derived from cwd path */
export function projectNameFromCwd(cwd: string): string {
  return `pi-artifacts-${cwd.replace(/[^a-zA-Z0-9]/g, "-").replace(/^-+|-+$/g, "").slice(0, 40)}`;
}
