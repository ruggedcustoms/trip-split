// Vercel function for every /api/* request. Vercel builds the React app with
// Vite and serves it from dist/; the data lives in Cloudflare D1.
import { apiResponse } from "../server/worker.js";
import { d1OverHttp } from "../server/d1-http.js";

const env = () => ({
  DB: d1OverHttp({
    accountId: process.env.CF_ACCOUNT_ID,
    databaseId: process.env.D1_DATABASE_ID,
    apiToken: process.env.CF_API_TOKEN,
  }),
  ADMIN_EMAIL: process.env.ADMIN_EMAIL,
  GROUP_PASSWORD: process.env.GROUP_PASSWORD,
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD,
  SESSION_SECRET: process.env.SESSION_SECRET,
});

const handle = (request) => apiResponse(request, env());
export { handle as GET, handle as POST, handle as PUT, handle as DELETE };
