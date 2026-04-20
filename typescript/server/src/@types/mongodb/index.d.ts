declare module "mongodb" {
	interface FindOneOptions<T> {
		projectID?: boolean;
	}
}

export {};
