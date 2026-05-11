import { FormatTime, MillisToSince } from "#util/time";
import React from "react";
import { type integer } from "tachi-common";

/** Same truncation pattern as TitleCell metadata lines. */
const truncLineCls = "d-block w-100 text-truncate";

export default function TimestampCell({
	service,
	tableFixedLayoutCompat,
	time,
}: {
	service?: string | null;
	tableFixedLayoutCompat?: boolean;
	time: integer | null;
}) {
	const widthStyle = tableFixedLayoutCompat
		? undefined
		: { maxWidth: "200px", minWidth: "140px", overflow: "hidden" as const };

	return (
		<td
			className={tableFixedLayoutCompat ? "folder-timeline-timestamp" : undefined}
			style={widthStyle}
		>
			{time ? (
				<>
					{MillisToSince(time)}

					<br />
					<small className="text-body-secondary">{FormatTime(time)}</small>
				</>
			) : (
				<span
					className={
						tableFixedLayoutCompat ? "text-body-secondary fst-italic" : undefined
					}
				>
					No Data.
				</span>
			)}
			{service && (
				<>
					<br />
					<small
						className={`${truncLineCls} text-body-secondary`}
						style={{ fontSize: "0.75rem", minWidth: 0 }}
						title={`Played On: ${service}`}
					>
						Played On: {service}
					</small>
				</>
			)}
		</td>
	);
}
