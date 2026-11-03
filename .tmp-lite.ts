import { runLiteScan } from "@/server/pulse-lite/run-lite-scan";
async function main() {
  const t = Date.now(); let waves = 0, n = 0;
  const timer = setInterval(() => console.log(`[${Math.round((Date.now()-t)/1000)}s] waves=${waves} checks=${n}`), 5000);
  const r = await runLiteScan({ inputType: "URL", url: process.argv[2], includePageSpeed: false, onChecks: (b: unknown[]) => { waves++; n += b.length; } } as never);
  clearInterval(timer);
  console.log("done", Math.round((Date.now()-t)/1000), "s", r.checks.length, "checks");
  process.exit(0);
}
main();
