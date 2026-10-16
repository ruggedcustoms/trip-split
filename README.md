# Trip Split — deploy guide

Trip Split runs on your own free Cloudflare account:

- **Cloudflare Workers** hosts the app.
- **Cloudflare D1** stores trips, expenses, disputes, polls and chat.
- **Sign-in** is a group password: friends type it and tap their name. The organizer has a separate password.

You need a laptop, about 30 minutes, and an internet connection. Steps 1–7 are done once. Step 8 is how you update the app later.

---

## 1. Install Node.js

1. Go to **https://nodejs.org** and download the **LTS** version.
2. Install it with the default options.
3. Open a terminal:
   - **Windows:** press the Windows key, type `PowerShell`, open it.
   - **Mac:** press Cmd + Space, type `Terminal`, open it.
4. Check it worked:
   ```
   node --version
   ```
   You should see something like `v22.x.x`.

## 2. Open the project folder

1. Unzip `trip-split.zip` somewhere easy, like your Desktop.
2. In the terminal, go into the folder:
   ```
   cd Desktop/trip-split
   ```
   (On Windows, if that fails, try `cd $HOME\Desktop\trip-split`.)
3. Install the Cloudflare tool (Wrangler):
   ```
   npm install
   ```

## 3. Create a Cloudflare account and log in

1. Sign up for free at **https://dash.cloudflare.com/sign-up** if you don't have an account.
2. In the terminal:
   ```
   npx wrangler login
   ```
   A browser window opens. Click **Allow**, then come back to the terminal.

## 4. Create the database

1. Run:
   ```
   npx wrangler d1 create trip-split
   ```
2. It prints a block that includes a line like:
   ```
   database_id = "1a2b3c4d-...."
   ```
   Copy that ID. (If Wrangler asks whether to add it to your config for you, say yes, then check `wrangler.toml` that it's there.)
3. Open `wrangler.toml` in any text editor (Notepad, TextEdit or VS Code) and replace `CHANGE-ME-database-id` with your ID.
4. While the file is open, replace `CHANGE-ME@example.com` next to `ADMIN_EMAIL` with **your own email**. It's only used to recognize the organizer's account. Save the file.
5. Create the tables:
   ```
   npm run db:setup
   ```
   Type `y` if it asks to confirm.

## 5. Put the app online

```
npx wrangler deploy
```

At the end it prints your app's address, like:

```
https://trip-split.YOUR-NAME.workers.dev
```

Save this link. Don't open it yet; the passwords aren't set, so it will show an error.

## 6. Set the passwords

Passwords are stored as Cloudflare secrets, never in the project files. Run each command and type the value when asked:

```
npx wrangler secret put GROUP_PASSWORD
npx wrangler secret put ADMIN_PASSWORD
npx wrangler secret put SESSION_SECRET
```

- `GROUP_PASSWORD`: what your friends type to sign in.
- `ADMIN_PASSWORD`: what you, the organizer, type. Keep it to yourself.
- `SESSION_SECRET`: any long random text. You never type it again.

Secrets take effect immediately; no redeploy needed. Changing a password signs out everyone who used it.

## 7. First run

1. Open your app link.
2. Type the **organizer password**, then your name, and tap **Get started**.
3. Go to the **Friends** tab and add each friend's **name**.
4. Send your friends the link (the **Copy link** button on the Friends tab) and the **group password**.
5. Each friend opens it, types the group password and taps their name. They stay signed in for a year on that phone.

### Install it like an app

- **Android (Chrome):** open the link → menu **⋮** → **Install app** (or **Add to Home screen**).
- **iPhone (Safari):** open the link → **Share** button → **Add to Home Screen**.

It opens full screen with its own icon.

## 8. Updating the app later

When you get new versions of the files (for example, from Claude), replace them in the folder and run:

```
npx wrangler deploy
```

Your data is not touched by updates.

---

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

## Test on your laptop first (optional)

1. Create a file named `.dev.vars` in the project folder containing:
   ```
   DEV_EMAIL=you@example.com
   ```
   (use the same email as `ADMIN_EMAIL`).
2. Run:
   ```
   npm run db:setup-local
   npm run dev
   ```
3. Open **http://localhost:8787**. Sign-in is skipped locally. Press Ctrl + C in the terminal to stop.

## Troubleshooting

| What you see | What to do |
|---|---|
| "Sign-in isn't set up yet" | Fill in `ACCESS_TEAM_DOMAIN` and `ACCESS_AUD` in `wrangler.toml` (step 6), then `npx wrangler deploy`. |
| "You're not signed in" right after signing in | The AUD tag or team domain doesn't match. Copy them again from the Access application, deploy again. |
| A friend sees "You're not in this group yet" | Add their exact email on the Friends tab. |
| A friend never gets the code | Check their spam folder. Make sure the Access policy includes **Everyone** (step 6). |
| `npx wrangler deploy` says database not found | The `database_id` in `wrangler.toml` doesn't match. Run `npx wrangler d1 list` to see the right one. |
