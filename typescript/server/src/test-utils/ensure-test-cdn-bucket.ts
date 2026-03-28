import {
	CreateBucketCommand,
	HeadBucketCommand,
	PutBucketPolicyCommand,
	S3Client,
} from "@aws-sdk/client-s3";
import JSON5 from "json5";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** MinIO buckets for dev/CI (matches docker-compose / bootstrap). */
const MINIO_BUCKETS = ["tachi-public", "tachi-private", "tachi-backups"] as const;

function anonymousGetObjectPolicy(bucket: string): string {
	return JSON.stringify({
		Version: "2012-10-17",
		Statement: [
			{
				Effect: "Allow",
				Principal: { AWS: ["*"] },
				Action: ["s3:GetObject"],
				Resource: [`arn:aws:s3:::${bucket}/*`],
			},
		],
	});
}

/**
 * Ensures MinIO buckets exist and tachi-public allows anonymous reads for seeded CDN assets (CI + local test runs).
 */
export async function ensureTestCdnBucket() {
	const raw = fs.readFileSync(path.join(__dirname, "../../test.conf.json5"), "utf-8");
	const config = JSON5.parse(raw) as {
		CDN_CONFIG: {
			SAVE_LOCATION: {
				ACCESS_KEY_ID: string;
				BUCKET: string;
				ENDPOINT: string;
				REGION?: string;
				SECRET_ACCESS_KEY: string;
			};
		};
	};

	const loc = config.CDN_CONFIG.SAVE_LOCATION;

	if (loc.BUCKET !== "tachi-public") {
		throw new Error(
			`test.conf.json5 CDN_CONFIG.SAVE_LOCATION.BUCKET must be "tachi-public"; got "${loc.BUCKET}".`,
		);
	}

	const client = new S3Client({
		endpoint: loc.ENDPOINT,
		region: loc.REGION ?? "us-east-1",
		credentials: {
			accessKeyId: loc.ACCESS_KEY_ID,
			secretAccessKey: loc.SECRET_ACCESS_KEY,
		},
		forcePathStyle: true,
	});

	async function ensureBucketExists(bucket: string): Promise<void> {
		/* eslint-disable no-await-in-loop -- retry Head/Create until MinIO accepts connections */
		for (let attempt = 0; attempt < 60; attempt++) {
			try {
				await client.send(new HeadBucketCommand({ Bucket: bucket }));
				return;
			} catch {
				// bucket missing or service not ready
			}

			try {
				await client.send(new CreateBucketCommand({ Bucket: bucket }));
				return;
			} catch {
				await new Promise((r) => setTimeout(r, 1000));
			}
		}
		/* eslint-enable no-await-in-loop */

		throw new Error(
			`Could not reach or create S3 bucket "${bucket}" at ${loc.ENDPOINT}. Is MinIO running?`,
		);
	}

	for (const bucket of MINIO_BUCKETS) {
		await ensureBucketExists(bucket);
	}

	await client.send(
		new PutBucketPolicyCommand({
			Bucket: "tachi-public",
			Policy: anonymousGetObjectPolicy("tachi-public"),
		}),
	);
}
