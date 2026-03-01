import { type SetState } from "#types/react";
import React from "react";

export default function BigSearch({
	className,
	search,
	setSearch,
	placeholder,
}: {
	className?: string;
	placeholder: string;
	search: string;
	setSearch: SetState<string>;
}) {
	return (
		<div className="input-group">
			<input
				className={`form-control ${className}`}
				onChange={(e) => {
					setSearch(e.target.value);
				}}
				placeholder={placeholder}
				type="text"
				value={search}
			/>
			<span className="input-group-text">
				<i className="fas fa-search"></i>
			</span>
		</div>
	);
}
