import ImportFileInfo from "#components/imports/ImportFileInfo";
import useSetSubheader from "#components/layout/header/useSetSubheader";
import { TachiConfig } from "#lib/config";
import { p } from "prudence";
import React, { useState } from "react";
import {
	type BatchManual,
	FormatGameGroup,
	FormatPrError,
	GetGameGroupConfig,
	GetGamePTConfig,
} from "tachi-common";
import { PR_BATCH_MANUAL } from "tachi-common/lib/schemas";

export default function BatchManualPage() {
	useSetSubheader(["Dashboard", "Import Scores", "Batch Manual"]);

	return (
		<ImportFileInfo
			acceptMime="application/json"
			importType="file/batch-manual"
			name="Batch Manual"
			parseFunction={(text: string) => {
				const data: BatchManual = JSON.parse(text);

				const gameConfig = GetGameGroupConfig(data.meta.game);

				if (!gameConfig) {
					throw new Error(
						`Invalid game ${data.meta.game}. Expected any of ${TachiConfig.GAMES}.`,
					);
				}

				const gptConfig = GetGamePTConfig(data.meta.game, data.meta.playtype);

				if (!gptConfig) {
					throw new Error(
						`Invalid Playtype ${data.meta.playtype}. Expected any of ${gameConfig.playtypes}.`,
					);
				}

				const err = p(data, PR_BATCH_MANUAL(data.meta.game, data.meta.playtype));

				if (err) {
					throw new Error(FormatPrError(err, "Invalid BATCH-MANUAL: "));
				}

				return {
					valid: true,
					info: {
						Game: FormatGameGroup(data.meta.game, data.meta.playtype),
						Scores: data.scores.length,
					},
				};
			}}
		/>
	);
}
