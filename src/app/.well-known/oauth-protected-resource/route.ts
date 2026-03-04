import { protectedResourceHandler, metadataCorsOptionsRequestHandler } from "mcp-handler";

const APP_URL = process.env.APP_URL || "https://www.get-switchboard.com";

const GET = protectedResourceHandler({
  authServerUrls: [APP_URL],
  resourceUrl: APP_URL,
});

const OPTIONS = metadataCorsOptionsRequestHandler();

export { GET, OPTIONS };
