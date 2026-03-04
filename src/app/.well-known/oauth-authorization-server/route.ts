const APP_URL = process.env.APP_URL || "https://www.get-switchboard.com";

const metadata = {
  issuer: APP_URL,
  token_endpoint: `${APP_URL}/dashboard`,
  grant_types_supported: [],
  response_types_supported: [],
  code_challenge_methods_supported: ["S256"],
};

export function GET() {
  return new Response(JSON.stringify(metadata), {
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

export function OPTIONS() {
  return new Response(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}
