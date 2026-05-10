import { monitorEventLoopDelay } from 'node:perf_hooks';

let started = false;

export function startEventLoopMonitor() {
  if (started) {
    return;
  }

  const enabled = process.env.ENABLE_EVENT_LOOP_MONITOR !== 'false';
  if (!enabled) {
    return;
  }

  started = true;

  const resolutionMs = Number(process.env.EVENT_LOOP_RESOLUTION_MS || 20);
  const intervalMs = Number(process.env.EVENT_LOOP_REPORT_INTERVAL_MS || 30000);
  const warnThresholdMs = Number(process.env.EVENT_LOOP_WARN_THRESHOLD_MS || 250);

  const histogram = monitorEventLoopDelay({ resolution: resolutionMs });
  histogram.enable();

  const timer = setInterval(() => {
    const p95Ms = Number(histogram.percentile(95) / 1e6).toFixed(1);
    const maxMs = Number(histogram.max / 1e6).toFixed(1);

    if (Number(p95Ms) >= warnThresholdMs) {
      console.warn(`[RUNTIME] Event loop lag high: p95=${p95Ms}ms max=${maxMs}ms`);
    } else {
      console.log(`[RUNTIME] Event loop lag: p95=${p95Ms}ms max=${maxMs}ms`);
    }

    histogram.reset();
  }, intervalMs);

  timer.unref();
  console.log('[RUNTIME] Event loop monitor started.');
}