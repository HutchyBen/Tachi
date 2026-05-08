---
name: no-return-await
description: Prefer `return` over `return await` in async functions when the await is redundant. Use when writing or reviewing async TypeScript/JavaScript, simplifying control flow, or fixing redundant awaits on returned promises.
---

# Prefer `return` over `return await`

## Default rule

In an `async function`, **`return await x` and `return x` are equivalent** for callers when `x` is a Promise (or thenable): both return a Promise with the same fulfillment and rejection.

Prefer **`return x`** - the extra `await` adds a microtask and obscures that you are simply forwarding the result.

```typescript
// Prefer
async function load() {
	return fetchData();
}

// Avoid (unless you need await for control flow - see below)
async function load() {
	return await fetchData();
}
```

## When you must `await`

Use **`await`** (including `return await`) only when you need the async function to **suspend on that operation** for control flow:

- **`try` / `catch` / `finally`**: To handle or finalize on **rejection** of the inner promise, you must `await` it inside `try`. A bare `return innerPromise()` does **not** route that rejection through `catch` / `finally` the same way.

```typescript
async function safeLoad() {
	try {
		// `return await` is correct here so `catch` sees rejections from fetchData()
		return await fetchData();
	} catch (e) {
		return defaultData();
	}
}
```

- **`finally`** that must run after the inner work settles (same idea - often needs `await` in the `try`).

If there is **no** `try`/`catch`/`finally` depending on that promise settling inside the function, **do not** use `return await`.

## Review checklist

- [ ] If the last statement is `return await expr` and nothing in the function uses `try`/`catch`/`finally` around that path for that promise → use `return expr`.
- [ ] If `catch` or `finally` must apply to failures of `expr` → keep `await` (often `return await expr` in the `try`).

## Why

- Clearer intent: forwarding a Promise vs. explicitly sequencing.
- Slightly leaner: no unnecessary `await` + re-wrapping.
- Aligns with common ESLint `no-return-await` guidance (with the try/catch exception above).
