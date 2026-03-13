import { log } from "#lib/logger/log.js";
import { Env, ServerConfig } from "#lib/setup/config";
import bunyan from "bunyan";
import nodemailer, { type SentMessageInfo, type Transporter } from "nodemailer";

let transporter: Transporter | undefined;

if (ServerConfig.EMAIL_CONFIG) {
	log.info(`Connecting to email server...`, { bootInfo: true });
	const conf = ServerConfig.EMAIL_CONFIG;

	try {
		transporter = nodemailer.createTransport({
			newline: "unix",

			logger: conf.TRANSPORT_OPS?.debug
				? bunyan.createLogger({ name: "Email Logger" })
				: undefined,
			...(conf.TRANSPORT_OPS ?? {}),
		});

		transporter.verify((err) => {
			if (err) {
				log.fatal(`Could not connect to email server.`, { err });
				throw err;
			} else {
				log.info(`Successfully connected to email server.`, { bootInfo: true });
			}
		});
	} catch (err) {
		log.fatal(`Failed to create email client.`, { err });
		throw err;
	}
} else {
	log.warn(`No EMAIL_CONFIG present in conf, emails will not be sent from the server.`, {
		bootInfo: true,
	});
}

export function SendEmail(
	to: string,
	subject: string,
	htmlContent: string,
	textContent: string,
): Promise<SentMessageInfo> | undefined {
	if (Env.NODE_ENV === "test") {
		log.debug(`Stubbed out SendEmail as env was test.`);
		return;
	}

	if (!transporter || !ServerConfig.EMAIL_CONFIG) {
		log.debug(`Stubbed out SendEmail as no EMAIL_CONFIG was set.`);
		return;
	}

	log.verbose(`Sending email to ${to}.`);

	return transporter
		.sendMail({
			from: ServerConfig.EMAIL_CONFIG.FROM,
			to,
			subject,
			html: htmlContent,
			text: textContent,
			dkim: ServerConfig.EMAIL_CONFIG.DKIM,
			headers: transporter.options.headers,
		})
		.catch((err: unknown) => {
			log.info(`Failed to send email to ${to}.`, {
				err,
				subject,
				textContent,
				htmlContent,
			});
		});
}
