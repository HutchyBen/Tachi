import pino from "pino";

export type KtLogger = pino.Logger;

// Use JSON log lines when LOG_JSON=1 (dev/prod); otherwise pretty format for localdev.
// Deliberately process.env here instead of importing ENV to avoid a circular dep.
const useJson = process.env.LOG_JSON === "1" || process.env.LOG_JSON === "true";

export const log = pino({
	level: process.env.LOG_LEVEL ?? "info",
	...(useJson
		? {}
		: {
				transport: {
					options: { colorize: true },
					target: "pino-pretty",
				},
			}),
});

export function AppendLogCtx(context: string, parent: KtLogger = log): KtLogger {
	return parent.child({ context });
}

export function ChangeRootLogLevel(level: string): void {
	log.level = level;
}

export function GetLogLevel(): string {
	return log.level;
}
