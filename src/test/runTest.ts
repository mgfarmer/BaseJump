import * as path from "path";
import * as os from "os";
import { runTests } from "@vscode/test-electron";

async function main() {
  try {
    const extensionDevelopmentPath = path.resolve(__dirname, "../../");
    const extensionTestsPath = path.resolve(__dirname, "./suite/index");

    await runTests({
      vscodeExecutablePath:
        "C:\\Users\\kevin\\AppData\\Local\\Programs\\Microsoft VS Code\\Code.exe",
      extensionDevelopmentPath,
      extensionTestsPath,
      launchArgs: [
        "--no-sandbox",
        "--disable-updates",
        "--user-data-dir",
        path.join(os.tmpdir(), "basejump-test-userdata"),
      ],
    });
  } catch (err) {
    console.error("Failed to run tests:", err);
    process.exit(1);
  }
}

main();
