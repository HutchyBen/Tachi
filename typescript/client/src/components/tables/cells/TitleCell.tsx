import GentleLink from "#components/util/GentleLink";
import Muted from "#components/util/Muted";
import { ToCDNURL } from "#util/api";
import { CreateChartLink } from "#util/data";
import React from "react";
import { type GameGroup, type MONGO_ChartDocument, type MONGO_SongDocument } from "tachi-common";

export default function TitleCell({
	game,
	song,
	chart,
	noArtist,
	comment,
	showSearchTerms,
	showAltTitles,
}: {
	// chart is optional as we overload this titlecell to render pretty song tables
	// in some places
	chart?: MONGO_ChartDocument;
	comment?: string | null;
	game: GameGroup;
	noArtist?: boolean;
	showAltTitles?: boolean;
	showSearchTerms?: boolean;
	song: MONGO_SongDocument;
}) {
	let backgroundImage = undefined;
	let center = false;

	if (game === "popn" && chart) {
		backgroundImage = `url(${ToCDNURL(
			`/misc/popn/banners/${(chart as any).data.inGameID}.png`,
		)})`;
	} else if (game === "itg" && chart) {
		const itgChart = chart as MONGO_ChartDocument<"itg:Stamina">;
		const banner = itgChart.data.bannerLocationOverride ?? itgChart.data.originalPack;

		if (banner) {
			backgroundImage = `url(${ToCDNURL(
				`/misc/itg/banners/${encodeURIComponent(banner)}.png`,
			)})`;
			center = true;
		}
	}

	return (
		<td
			className="fading-image-td-left"
			style={{
				textAlign: "left",
				minWidth: "140px",
				maxWidth: "300px",
				["--image-url" as string]: backgroundImage,
				backgroundPosition: center ? "center" : undefined,
			}}
		>
			{game === "popn" && (
				<>
					{(song as MONGO_SongDocument<"popn">).data.genre === song.title ||
					(song as MONGO_SongDocument<"popn">).data.genre === null ? (
						<Muted>Unknown Genre</Muted>
					) : (
						(song as MONGO_SongDocument<"popn">).data.genre
					)}
					<br />
				</>
			)}
			<GentleLink to={chart ? CreateChartLink(chart, game) : ""}>
				{song.title}

				{!noArtist && (
					<>
						<br />
						<small>{song.artist}</small>
					</>
				)}
				{"subtitle" in song.data && song.data.subtitle && (
					<>
						<br />
						<Muted>{song.data.subtitle}</Muted>
					</>
				)}

				{showAltTitles && song.altTitles.length !== 0 && (
					<>
						<br />
						<Muted>AKA {song.altTitles.join(", ")}</Muted>
					</>
				)}
				{showSearchTerms && song.searchTerms.length !== 0 && (
					<>
						<br />
						<Muted>Search Terms: {song.searchTerms.join(", ")}</Muted>
					</>
				)}
				{chart && !chart.isPrimary && (
					<>
						<br />
						<small className="text-body-secondary">({chart.versions.join("/")})</small>
					</>
				)}
			</GentleLink>
			{comment && (
				<>
					<br />
					<small>"{comment}"</small>
				</>
			)}
		</td>
	);
}
