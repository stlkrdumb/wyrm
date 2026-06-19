import type { NextConfig } from "next";

const nextConfig: NextConfig = {
	allowedDevOrigins: ['wyrm.byrai.xyz'],
	// Enable stdout for agent logs in production
	serverExternalPackages: [],
	logging: {
		level: 'verbose',
	},
};

export default nextConfig;
