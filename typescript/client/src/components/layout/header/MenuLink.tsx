import React from "react";
import { type NavLinkProps } from "react-bootstrap";
import Nav from "react-bootstrap/Nav";
import { NavLink } from "react-router-dom";

export default function MenuLink({
	name,
	to,
	...props
}: { name: string; to: string } & NavLinkProps) {
	return (
		<Nav.Item>
			<Nav.Link as={NavLink} to={to} {...props}>
				{name}
			</Nav.Link>
		</Nav.Item>
	);
}
