import { type JustChildren } from "#types/react";
import React from "react";
import { Link } from "react-router-dom";

export default function GentleLink({
	to,
	children,
}: {
	className?: string;
	to: string;
} & JustChildren) {
	return (
		<Link className="text-decoration-none" to={to}>
			{children}
		</Link>
	);
}
