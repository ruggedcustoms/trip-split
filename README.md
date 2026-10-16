# Trip Split

Split trip expenses, run polls and chat with your friends.

- **React + Vite** app, hosted on **Vercel** (Vite preset).
- **API**: one Vercel function, `api/[...path].js`, running the routes in `server/worker.js`.
- **Data**: a **Cloudflare D1** database, reached over Cloudflare's HTTP API (`server/d1-http.js`).
- **Sign-in**: friends type the group password and tap their name. The organizer has a separate password.

## Project layout

| Path | What it is |
|---|---|
| `index.html`, `src/` | The React app (screens in `src/views/`, pop-up forms in `src/sheets/`) |
| `public/` | Icons, web-app manifest and service worker, copied as-is |
| `api/[...path].js` | Vercel function for every `/api/*` request |
| `server/` | API routes and the D1-over-HTTP adapter |
| `schema.sql` | Database tables |
| `wrangler.toml` | Only used for database commands (`npm run db:setup`, backups) |

## Settings (Vercel environment variables)

| Name | Value |
|---|---|
| `CF_ACCOUNT_ID` | Your Cloudflare account ID |
| `D1_DATABASE_ID` | The D1 database ID (`npx wrangler d1 list`) |
| `CF_API_TOKEN` | A Cloudflare API token with **Account → D1 → Edit** |
| `ADMIN_EMAIL` | Identifies the organizer's account; no email is sent |
| `GROUP_PASSWORD` | What friends type to sign in |
| `ADMIN_PASSWORD` | What the organizer types |
| `SESSION_SECRET` | Any long random text |

Add or change one with `npx vercel env add NAME production`, then redeploy. Changing a password signs out everyone who used it.

## Deploy

```
npx vercel deploy --prod
```

Vercel runs `npm run build` (Vite) and serves `dist/`, plus the function in `api/`.

## Run it on your laptop

1. Put the settings above in a file named `.env.local` (one `NAME=value` per line). It's git-ignored.
2. Run:
   ```
   npm install
   npm run dev
   ```
3. Open the address it prints. `/api/*` runs locally against the real database, so changes you make are real.

## First run

1. Open the app and type the **organizer password**. The first time, also type your name.
2. On the **Friends** tab, add each friend's **name**.
3. Send friends the link (**Copy link** on the Friends tab) and the **group password**.
4. Each friend types the group password and taps their name. They stay signed in for a year on that phone.

### Install it like an app

- **Android (Chrome):** open the link → menu **⋮** → **Install app** (or **Add to Home screen**).
- **iPhone (Safari):** open the link → **Share** button → **Add to Home Screen**.

## New database (only when starting from scratch)

```
npx wrangler login
npx wrangler d1 create trip-split
```

Put the new ID in `wrangler.toml` and in `D1_DATABASE_ID`, then create the tables:

```
npm run db:setup
```

## Backups

- In the app, each trip has a **Download CSV** button under Expenses. It opens in Excel or Google Sheets.
- For a full backup of everything, run:
  ```
  npx wrangler d1 export trip-split --remote --output=backup.sql
  ```

## Who can do what

| Action | Who |
|---|---|
| See trips, expenses, polls, chat | Everyone on the Friends list |
| Add friends, create or edit trips | Everyone on the Friends list |
| Delete an expense | **Only the person who added it** |
| Raise or withdraw a dispute | Anyone except the person who added the expense |
| Mark a dispute resolved | Only the person who added the expense |
| Delete a trip | Anyone, once the trip has no expenses |

These rules are checked on the server, so they can't be bypassed from a phone.

## Troubleshooting

| What you see | What to do |
|---|---|
| "Sign-in isn't set up yet" | `GROUP_PASSWORD`, `ADMIN_PASSWORD` or `SESSION_SECRET` is missing in Vercel. |
| "Something went wrong on the server" on every action | Check `CF_API_TOKEN`, `CF_ACCOUNT_ID` and `D1_DATABASE_ID` in Vercel. The function logs (Vercel dashboard → Logs) show the D1 error. |
| A friend's name isn't in the list | Add their name on the Friends tab, then they try again. |
| A friend forgot the password | Send them the group password again. |
