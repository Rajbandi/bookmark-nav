// Shared Hono types: Bindings uses the generated Env; Variables contains the authenticated user.
export type JwtUser = {
	id: number;
	username: string;
};

export type AppEnv = {
	Bindings: Env;
	Variables: {
		user?: JwtUser;
	};
};

export const AUTH_COOKIE = "auth_token";
export const TOKEN_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days
