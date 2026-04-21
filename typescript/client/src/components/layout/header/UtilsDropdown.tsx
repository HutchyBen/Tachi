import DropdownNavLink from "#components/ui/DropdownNavLink";
import QuickDropdown from "#components/ui/QuickDropdown";
import { type SetState } from "#types/react";
import React from "react";
import DropdownItem from "react-bootstrap/DropdownItem";

const SEEDS_URL = import.meta.env.VITE_SEEDS_URL as string | undefined;

function UtilsLinks({ onClick }: { onClick: React.MouseEventHandler }) {
	return (
		<>
			<DropdownItem
				className="rounded focus-visible-ring"
				href={SEEDS_URL}
				onClick={onClick}
				rel="noopener noreferrer"
				target="_blank"
			>
				Seeds Management
			</DropdownItem>
			<DropdownNavLink onClick={onClick} to="/utils/imports">
				Import Management
			</DropdownNavLink>
			<DropdownNavLink onClick={onClick} to="/utils/quests">
				Quest Creator
			</DropdownNavLink>
		</>
	);
}

export default function UtilsDropdown({
	className,
	menuClassName,
	style,
	setState,
}: {
	className?: string;
	menuClassName?: string;
	setState?: SetState<boolean>;
	style?: React.CSSProperties;
}) {
	const handleClick = () => {
		setState?.(false);
	};
	return (
		<QuickDropdown
			caret
			className={`h-14 ${className}`}
			menuClassName={menuClassName}
			menuStyle={style}
			toggle="Developer Utils"
			variant="clear"
		>
			<UtilsLinks onClick={handleClick} />
		</QuickDropdown>
	);
}
