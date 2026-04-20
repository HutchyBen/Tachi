import QuickTooltip from "#components/layout/misc/QuickTooltip";
import Icon from "#components/util/Icon";
import Muted from "#components/util/Muted";
import { GPT_CLIENT_IMPLEMENTATIONS } from "#lib/game-implementations";
import { type GPTRatingSystem } from "#lib/types";
import { IsNotNullish } from "#util/misc";
import React from "react";
import { type ChartDocument, type V3Game } from "tachi-common";

import MiniTable from "../components/MiniTable";

export default function RatingSystemPart({ chart, game }: { chart: ChartDocument; game: V3Game }) {
	const ratingSystems: Array<GPTRatingSystem<any>> =
		GPT_CLIENT_IMPLEMENTATIONS[game].ratingSystems;

	// don't render anything if this game has no other rating systems defined
	// for this chart
	if (ratingSystems.filter((e) => typeof e.toNumber(chart) === "number").length === 0) {
		return null;
	}

	return (
		<>
			<div className="d-none d-lg-block">
				<QuickTooltip
					tooltipContent={
						<MiniTable colSpan={2} headers={["Ratings"]}>
							{ratingSystems.map((e) => {
								const strV = e.toString(chart);
								const numV = e.toNumber(chart);

								if (
									strV === null ||
									strV === undefined ||
									numV === null ||
									numV === undefined
								) {
									return null;
								}

								return (
									<tr key={e.name}>
										<td>{e.name}</td>
										<td>
											{strV} <Muted>({numV.toFixed(2)})</Muted>
											{e.idvDifference(chart) && (
												<>
													<br />
													<QuickTooltip tooltipContent="Individual Difference - The difficulty of this varies massively between people!">
														<span>
															<Icon type="balance-scale-left" />
														</span>
													</QuickTooltip>
												</>
											)}
										</td>
									</tr>
								);
							})}
						</MiniTable>
					}
				>
					<div>
						<Muted>
							{ratingSystems
								.map((r) => r.toString(chart as any))
								.filter((e) => IsNotNullish(e))
								.join(" / ")}
						</Muted>
					</div>
				</QuickTooltip>
			</div>
			<div className="d-block d-lg-none">
				<Muted>
					{ratingSystems.map((r) => (
						<React.Fragment key={r.name}>
							{r.toString(chart as any)}
							<br />
						</React.Fragment>
					))}
				</Muted>
			</div>
		</>
	);
}
