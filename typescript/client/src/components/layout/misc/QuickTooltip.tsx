import { nanoid } from "nanoid";
import React, { type CSSProperties, useState } from "react";
import { OverlayTrigger, Tooltip } from "react-bootstrap";

export default function QuickTooltip({
	children,
	tooltipContent,
	wide,
	style,
	max,
	delay = 40,
}: {
	children: JSX.Element;
	delay?: number;
	max?: boolean;
	style?: CSSProperties;
	tooltipContent: React.ReactChild | undefined;
	wide?: boolean;
}) {
	const [show, setShow] = useState(false);
	const [mousedOver, setMousedOver] = useState(false);

	if (tooltipContent === undefined) {
		return children;
	}

	return (
		<OverlayTrigger
			delay={delay}
			onToggle={(nextShow) => setShow(nextShow)}
			overlay={
				<Tooltip
					className={wide ? "tooltip-wide" : ` ${max ? "tooltip-max" : ""}`}
					id={nanoid()}
					onMouseEnter={() => setMousedOver(true)}
					onMouseLeave={() => setMousedOver(false)}
					style={style}
				>
					{tooltipContent}
				</Tooltip>
			}
			placement="top"
			show={show || mousedOver}
		>
			{children}
		</OverlayTrigger>
	);
}
