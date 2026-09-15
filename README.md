# The 2026 List

A shared Christmas / December-birthday wish list for the family, replacing the yearly spreadsheet. Everyone opens the same link, picks a name tab, and adds or checks off items — no accounts, no copies to reconcile.

Starts pre-loaded with the 2025 roster (Milo, Colby, Meredith, Ethan, Emma, Alyssa, Colin, Amber, Misc Adults), each with an empty list for 2026. Anyone can add or remove a person's list from the site itself, so this isn't locked to those nine names.

## How it works

- **Front end:** plain HTML/CSS/JS in `public/` — no build step, no framework.
- **Data:** stored with **Netlify Blobs**, a storage feature built into Netlify. There's nothing to sign up for separately — it works automatically once the site is deployed on Netlify.
- **Backend:** one small serverless function in `netlify/functions/list.js` that reads and writes that data.
- **Passcode:** a single shared PIN gates the site. Default is `1225` — **change it before sharing the link** (see below).

Changes save automatically about half a second after you stop typing or toggle something — there's no separate "Save" button, the same way editing a shared spreadsheet works.

## Deploy it (pick one)

### Option A — GitHub (recommended if you want to keep editing the code later)
1. Create a new GitHub repo and push everything in this folder to it.
2. In Netlify: **Add new site → Import an existing project → Deploy with GitHub**, and pick the repo.
3. Build settings are already set via `netlify.toml` (publish directory `public`, functions in `netlify/functions`) — you shouldn't need to change anything.
4. Click Deploy. Netlify will rebuild automatically every time you push to the repo.

### Option B — Drag and drop (fastest, no GitHub needed)
1. Go to [app.netlify.com/drop](https://app.netlify.com/drop).
2. Drag the whole project folder onto the page.
3. That's it — you get a live URL immediately. To make a change later, edit the files and drag the folder again to redeploy.

Either way, after the first deploy:
- **Set your real passcode:** in the Netlify site dashboard, go to **Site configuration → Environment variables**, add `FAMILY_PIN` with whatever code you want, and redeploy (or trigger "Clear cache and deploy" once, since functions pick up env vars at build time). If you skip this, the passcode stays `1225`.
- **Rename the site:** Site configuration → Change site name, to get a friendlier URL than the random one Netlify assigns (e.g. `the2026list.netlify.app`).

## Sharing it with the family

Send the URL and the passcode however you'd normally share the spreadsheet (text, group chat, email). Anyone who opens the link, enters the passcode once, and it's remembered on that device from then on (until someone taps "Lock").

## A note on the passcode

This is a shared-secret gate to keep the list from being casually stumbled on or edited by the wrong person — the same trust level as the old spreadsheet link. It isn't bank-grade security: someone who really wanted to could still hit the underlying data endpoint directly. For a family gift list that's a reasonable trade-off for staying this simple to run, but worth knowing.

## Adjusting things later

- **Add/remove a person's list:** use the "+ Add a list" button or "Remove this list" in the app itself — no code changes needed.
- **Change the starting roster:** edit the `DEFAULT_DATA` list in `netlify/functions/list.js` (this only affects a brand-new, empty data store — once the list has been used, it no longer applies).
- **Change the design:** all styling is in `public/style.css`.
