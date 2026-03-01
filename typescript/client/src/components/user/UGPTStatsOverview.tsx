import ClassBadge from "#components/game/ClassBadge";
import QuickTooltip from "#components/layout/misc/QuickTooltip";
import MiniTable from "#components/tables/components/MiniTable";
import Divider from "#components/util/Divider";
import {
	FormatGPTProfileRating,
	FormatGPTProfileRatingName,
	FormatGPTScoreRatingName,
	UppercaseFirst,
} from "#util/misc";
import { StrSOV } from "#util/sorts";
import React from "react";
import {
	type Classes,
	GetGamePTConfig,
	type GPTString,
	type ProfileRatingAlgorithms,
	type UserGameStats,
} from "tachi-common";

export default function UGPTRatingsTable({ ugs }: { ugs: UserGameStats }) {
	const gptConfig = GetGamePTConfig(ugs.game, ugs.playtype);

	const ratings = Object.entries(ugs.ratings) as [ProfileRatingAlgorithms[GPTString], number][];

	return (
		<MiniTable className="table-sm text-center" colSpan={2} headers={["Player Stats"]}>
			<>
				{(Object.keys(gptConfig.classes) as Classes[GPTString][])
					.sort(StrSOV((x) => x[0]))
					.filter((k) => ugs.classes[k] !== undefined)
					.map((k) => (
						<tr key={k}>
							<td>{UppercaseFirst(k)}</td>
							<td>
								<ClassBadge
									classSet={k}
									classValue={ugs.classes[k]!}
									game={ugs.game}
									key={`${k}:${ugs.classes[k]}`}
									playtype={ugs.playtype}
									showSetOnHover={false}
								/>
							</td>
						</tr>
					))}
				{ratings.map(([k, v]) => (
					<tr key={k}>
						<td>
							<QuickTooltip
								tooltipContent={
									<div>
										{gptConfig.profileRatingAlgs[k].description}
										{(gptConfig.profileRatingAlgs[k].associatedScoreAlgs ?? [])
											.length > 0 && (
											<>
												<Divider />
											</>
										)}
										{gptConfig.profileRatingAlgs[k].associatedScoreAlgs?.map(
											(alg) => (
												<div key={alg}>
													(
													{FormatGPTScoreRatingName(
														ugs.game,
														ugs.playtype,
														alg,
													)}
													: {gptConfig.scoreRatingAlgs[alg].description})
												</div>
											),
										)}
									</div>
								}
								wide
							>
								<div
									style={{
										textDecoration: "underline",
										textDecorationStyle: "dotted",
									}}
								>
									{FormatGPTProfileRatingName(ugs.game, ugs.playtype, k)}
								</div>
							</QuickTooltip>
						</td>
						<td>{FormatGPTProfileRating(ugs.game, ugs.playtype, k as any, v)}</td>
					</tr>
				))}
			</>
		</MiniTable>
	);
}
