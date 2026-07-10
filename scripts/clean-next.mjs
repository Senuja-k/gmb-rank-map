import { rm } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const target = path.resolve(root, ".next");

if (path.dirname(target) !== root || path.basename(target) !== ".next") {
  throw new Error(`Refusing to clean unexpected build path: ${target}`);
}

function hasRunningDevServer() {
  if (process.platform !== "win32") return false;

  try {
    const escapedRoot = root.replaceAll("'", "''");
    const command = [
      `$root = '${escapedRoot}';`,
      "Get-CimInstance Win32_Process -Filter \"name = 'node.exe'\" |",
      "Where-Object {",
      "  $_.CommandLine -like \"*$root*\" -and",
      "  ($_.CommandLine -like \"*run dev*\" -or $_.CommandLine -like \"*next*dev*\")",
      "} |",
      "Select-Object -First 1 -ExpandProperty ProcessId",
    ].join(" ");

    return Boolean(
      execFileSync("powershell.exe", ["-NoProfile", "-Command", command], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }).trim()
    );
  } catch {
    return false;
  }
}

if (hasRunningDevServer()) {
  throw new Error("Stop the running dev server before building. On Windows, `next dev` keeps files in .next locked.");
}

const timeout = setTimeout(() => {
  console.error(`Timed out cleaning ${target}. Stop any process watching .next, then run the build again.`);
  process.exit(1);
}, 15000);

try {
  await rm(target, {
    recursive: true,
    force: true,
    maxRetries: 5,
    retryDelay: 500,
  });
} catch (error) {
  throw new Error(
    `Could not clean ${target}. Stop the dev server or any process watching .next, then run the build again. ${error.message}`
  );
} finally {
  clearTimeout(timeout);
}
