/**
 * Shared test setup for parity tests.
 *
 * Environment variables:
 *   TACHI_SERVER      - Base URL of the running server, e.g. http://localhost:8080
 *   TACHI_AUTH_TOKEN  - Optional API token sent as `Authorization: Bearer <token>`
 */
import { createParityClient, type ParityClient } from "../src/index";

const BASE_URL = process.env["TACHI_SERVER"];
const AUTH_TOKEN = process.env["TACHI_AUTH_TOKEN"];

if (!BASE_URL) {
	throw new Error("TACHI_SERVER environment variable is required.");
}

export const api: ParityClient = createParityClient({
	baseUrl: BASE_URL,
	headers: AUTH_TOKEN ? { Authorization: `Bearer ${AUTH_TOKEN}` } : undefined,
});
