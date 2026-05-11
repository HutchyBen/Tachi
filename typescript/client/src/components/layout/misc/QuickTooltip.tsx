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
	tooltipClassName,
	keepOpenWhenHoveringTooltip = true,
}: {
	children: JSX.Element;
	delay?: number | { hide?: number; show?: number };
	max?: boolean;
	style?: CSSProperties;
	tooltipClassName?: string;
	/** When false, the tooltip hides as soon as the pointer leaves the trigger (overlay is not hoverable). */
	keepOpenWhenHoveringTooltip?: boolean;
	tooltipContent: React.ReactChild | undefined;
	wide?: boolean;
}) {
	const [popperArmed, setPopperArmed] = useState(false);
	const [show, setShow] = useState(false);
	const [mousedOver, setMousedOver] = useState(false);

	if (tooltipContent === undefined || tooltipContent === null) {
		return children;
	}

	const overlayDelay: number | { hide: number; show: number } =
		typeof delay === "number"
			? delay
			: {
					hide: delay.hide ?? 0,
					show: delay.show ?? 0,
				};

	const overlayClass =
		[tooltipClassName, wide ? "tooltip-wide" : null, max ? "tooltip-max" : null]
			.filter(Boolean)
			.join(" ") || undefined;

	// Plain text: native title — no Popper instance per row (huge win on large tables).
	const useNativeTitle =
		(typeof tooltipContent === "string" || typeof tooltipContent === "number") &&
		!wide &&
		!max &&
		!style &&
		!tooltipClassName;

	if (useNativeTitle) {
		const t = String(tooltipContent);
		const prevTitle = children.props.title;
		return React.cloneElement(children, {
			title: typeof prevTitle === "string" && prevTitle !== "" ? `${prevTitle}\n${t}` : t,
		});
	}

	const armPopper = () => {
		if (!popperArmed) {
			setPopperArmed(true);
			setShow(true);
		}
	};

	if (!popperArmed) {
		return React.cloneElement(children, {
			onMouseEnter: (e: React.MouseEvent) => {
				armPopper();
				children.props.onMouseEnter?.(e);
			},
			onFocus: (e: React.FocusEvent) => {
				armPopper();
				children.props.onFocus?.(e);
			},
		});
	}

	return (
		<OverlayTrigger
			delay={overlayDelay}
			onToggle={(nextShow) => setShow(nextShow)}
			overlay={
				<Tooltip
					className={overlayClass}
					id={nanoid()}
					onMouseEnter={
						keepOpenWhenHoveringTooltip
							? () => setMousedOver(true)
							: undefined
					}
					onMouseLeave={
						keepOpenWhenHoveringTooltip
							? () => setMousedOver(false)
							: undefined
					}
					style={style}
				>
					{tooltipContent}
				</Tooltip>
			}
			placement="top"
			show={keepOpenWhenHoveringTooltip ? show || mousedOver : show}
		>
			{children}
		</OverlayTrigger>
	);
}
