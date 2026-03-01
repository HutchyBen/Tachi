import React, { useState } from "react";

export default function HoverText({ hover, children }: { children: string; hover: string }) {
	const [hovering, setHovering] = useState(false);

	return (
		<span onMouseEnter={() => setHovering(true)} onMouseLeave={() => setHovering(false)}>
			{hovering ? hover : children}
		</span>
	);
}
