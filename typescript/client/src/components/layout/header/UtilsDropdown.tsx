import DropdownNavLink from "#components/ui/DropdownNavLink";
import QuickDropdown from "#components/ui/QuickDropdown";
import { type SetState } from "#types/react";
import React from "react";

function UtilsLinks({ onClick }: { onClick: React.MouseEventHandler }) {
	return (
		<>
			<DropdownNavLink onClick={onClick} to="/utils/seeds">
				Seeds Management
			</DropdownNavLink>
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
