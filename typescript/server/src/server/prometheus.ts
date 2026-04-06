import type { Express, RequestHandler } from "express";
import type { ImportTypes } from "tachi-common";

import ExpressPromBundle from "express-prom-bundle";
import { collectDefaultMetrics, Counter, Histogram, Registry } from "prom-client";

/** Dedicated listener for `GET /metrics` (see `main.ts`). */
export const METRICS_PORT = 9779;

/** Seconds — aligns with typical Prometheus HTTP latency buckets, with extra resolution under 100ms. */
const HTTP_DURATION_BUCKETS = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];

/** Seconds — score imports can run from sub-second to tens of minutes. */
const SCORE_IMPORT_DURATION_BUCKETS = [0.25, 0.5, 1, 2, 5, 10, 30, 60, 120, 300, 600, 1800];

let scoreImportDurationSeconds: Histogram | null = null;

/**
 * Records wall-clock duration of a completed score import (from `timeStarted` through successful
 * finalization). No-op when metrics are disabled.
 */
export function observeScoreImportDuration(importType: ImportTypes, totalMs: number): void {
	if (!scoreImportDurationSeconds) {
		return;
	}
	scoreImportDurationSeconds.observe({ import_type: importType }, totalMs / 1000);
}

/**
 * Prometheus middlewares: HTTP duration histogram (`http_request_duration_seconds`),
 * request counter (`http_requests_total`), `up`, and Node/process default metrics from
 * `collectDefaultMetrics` (unprefixed: `process_cpu_*`, `process_resident_memory_bytes`,
 * `nodejs_heap_*`, `nodejs_eventloop_lag_*`, `nodejs_version_info`, etc.).
 *
 * No prefix on default metrics so names match stock Grafana dashboards and prom-client docs.
 *
 * Scraping is served only on `metricsApp` at `/metrics` (`autoregister: false` on the main app).
 */
export function createPrometheusMiddlewares(metricsApp: Express): RequestHandler[] {
	const registry = new Registry();

	scoreImportDurationSeconds = new Histogram({
		name: "score_import_duration_seconds",
		help: "Wall-clock duration of completed score imports in seconds (start through DB finalization).",
		labelNames: ["import_type"],
		buckets: SCORE_IMPORT_DURATION_BUCKETS,
		registers: [registry],
	});

	collectDefaultMetrics({ register: registry });

	const bundleOpts: Parameters<typeof ExpressPromBundle>[0] = {
		autoregister: false,
		includeMethod: true,
		includePath: true,
		includeStatusCode: true,
		buckets: HTTP_DURATION_BUCKETS,
		metricsApp,
		metricsPath: "/metrics",
		promRegistry: registry,
	};

	const httpRequestsTotal = new Counter({
		name: "http_requests_total",
		help: "Total number of HTTP requests (labels match http_request_duration_seconds).",
		labelNames: ["status_code", "method", "path"],
		registers: [registry],
	});

	const promBundle = ExpressPromBundle(bundleOpts);

	const requestCountMiddleware: RequestHandler = (req, res, next) => {
		res.on("finish", () => {
			const status = ExpressPromBundle.normalizeStatusCode(res);
			const path = ExpressPromBundle.normalizePath(req, bundleOpts);
			httpRequestsTotal.inc({
				status_code: String(status),
				method: req.method ?? "UNKNOWN",
				path,
			});
		});
		next();
	};

	return [promBundle, requestCountMiddleware];
}
