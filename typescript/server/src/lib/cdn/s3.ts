import type { Readable } from "node:stream";

import { log } from "#lib/log/log";
import { ServerConfig } from "#lib/setup/config";
import {
	DeleteObjectCommand,
	DeleteObjectsCommand,
	GetObjectCommand,
	ListObjectsV2Command,
	PutObjectCommand,
	S3Client,
} from "@aws-sdk/client-s3";
import { buffer as streamToBuffer } from "node:stream/consumers";

const saveLoc = ServerConfig.CDN_CONFIG.SAVE_LOCATION;

log.info({ bootInfo: true }, `Using S3 bucket as CDN location: ${saveLoc.BUCKET}.`);

const s3 = new S3Client({
	endpoint: saveLoc.ENDPOINT,
	region: saveLoc.REGION ?? "us-east-1",
	credentials: {
		accessKeyId: saveLoc.ACCESS_KEY_ID,
		secretAccessKey: saveLoc.SECRET_ACCESS_KEY,
	},
	forcePathStyle: true,
});

/** Object key as stored in the bucket (includes optional KEY_PREFIX). */
export function cdnObjectKey(fileLoc: string): string {
	return (saveLoc.KEY_PREFIX ?? "") + fileLoc;
}

/**
 * Pushes a file to the configured S3 Bucket. Overwrites if already exists.
 */
export function PushToS3(path: string, content: string | Buffer) {
	log.debug(`Saving content on S3 at ${path}.`);

	return s3.send(
		new PutObjectCommand({
			Bucket: saveLoc.BUCKET,
			Key: cdnObjectKey(path),
			Body: content,
		}),
	);
}

/**
 * Reads a file from the configured S3 bucket.
 */
export async function GetObjectFromS3(path: string): Promise<Buffer> {
	const response = await s3.send(
		new GetObjectCommand({
			Bucket: saveLoc.BUCKET,
			Key: cdnObjectKey(path),
		}),
	);

	if (!response.Body) {
		throw new Error(`S3 GetObject returned no body for ${path}.`);
	}

	return streamToBuffer(response.Body as Readable);
}

/**
 * Deletes the provided file from the configured S3 bucket.
 */
export function DeleteFromS3(path: string) {
	return s3.send(
		new DeleteObjectCommand({
			Bucket: saveLoc.BUCKET,
			Key: cdnObjectKey(path),
		}),
	);
}

/**
 * Deletes every object under SAVE_LOCATION.KEY_PREFIX (or the whole bucket if unset).
 * Used by tests to reset CDN state.
 */
export async function DeleteAllCdnObjects() {
	const prefix = saveLoc.KEY_PREFIX ?? "";

	/* eslint-disable no-await-in-loop -- list/delete in batches until the prefix is empty */
	try {
		while (true) {
			const list = await s3.send(
				new ListObjectsV2Command({
					Bucket: saveLoc.BUCKET,
					Prefix: prefix,
					MaxKeys: 1000,
				}),
			);

			const keys = (list.Contents ?? [])
				.map((o) => o.Key)
				.filter((k): k is string => k !== undefined);

			if (keys.length === 0) {
				return;
			}

			await s3.send(
				new DeleteObjectsCommand({
					Bucket: saveLoc.BUCKET,
					Delete: {
						Objects: keys.map((Key) => ({ Key })),
					},
				}),
			);
		}
	} finally {
		/* eslint-enable no-await-in-loop */
	}
}
