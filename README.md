# Very Simple Generala

A tiny score sheet (an "anotador") for playing generala with friends and real dice. Each player gets a column, each category a row, and the app adds up the points and says whose turn it is.

It is made for phones first. No build step and no dependencies: plain HTML, CSS and JavaScript.

## Features

- A score sheet with one column per player (1 to 8) and the 11 rows of generala: 1 to 6, Escalera, Full, Póker, Generala and Doble generala.
- Tap a box to score it. A sheet opens from the bottom of the screen with only the scores that box can take:
  - **1 to 6**: how many dice show that face (1 to 5), so «Al 4» with 3 dice scores 12.
  - **Escalera, Full, Póker**: armada (20, 30, 40) or servida (5 more).
  - **Generala**: 50. With **Generala servida gana** on, also **¡Gana!** for a generala servida.
  - **Doble generala**: 100, only after the player has scored a generala.
  - **✕ Tachar** scores 0 in any row. **Borrar** empties a box again.
- Shows whose turn it is (the player with the fewest boxes filled) and the round, and marks that player's empty boxes in gold.
- Adds up each player's total and marks the leader in gold.
- Ends the game when every box is filled (or after a generala servida, when that rule is on) and shows the winner, or a tie.
- **↩ Deshacer** takes back the last score. It asks first.
- **Jugadores**: type each player's name, add players or remove them. The order of the list is the order of play. To rename a player from the sheet, tap the name at the top of the column.
- A name too long for its column (a phone, many players) shows as initials: «Facundo Ezequiel» as FE, «Jugador 5» as J5, «Bartolomé» as Ba.
- **Reglas**: match the rules at your table. **Servida suma 5** is on by default, **Generala servida gana** is off.
- **Nuevo juego** clears the points and keeps the players.
- Keeps the game after a page reload (saved in the browser's `localStorage`).
- Keeps open tabs in sync.
- Keeps the screen on during a game, where the browser supports it.
- Works offline after the first visit, and installs to the Home Screen with its own icon.

The interface text is in Spanish (Argentina).

## Rules

The points follow the most common rules in Argentina:

| Row            | Points                              |
| -------------- | ----------------------------------- |
| 1 to 6         | The face times the dice that show it |
| Escalera       | 20, or 25 servida                   |
| Full           | 30, or 35 servido                   |
| Póker          | 40, or 45 servido                   |
| Generala       | 50. With **Generala servida gana** on, a generala servida wins the game |
| Doble generala | 100, only after a generala          |

"Servida" means on the first roll of the turn. House rules vary: two of them are switches in **Reglas**, and the points are in `CATEGORIES` and `SERVIDA_BONUS` at the top of `app.js`.

## Files

| File                   | Purpose                                                                 |
| ---------------------- | ----------------------------------------------------------------------- |
| `index.html`           | Page markup and meta tags.                                              |
| `styles.css`           | All styles. Phone layout first, two columns from 900 px wide.           |
| `app.js`               | Scoring, turns, players, wake lock, tab sync and service worker registration. |
| `analytics.js`         | Google Analytics: off until `GA_MEASUREMENT_ID` is set.                 |
| `sw.js`                | Service worker: network first, with the cache as the offline fallback.  |
| `manifest.webmanifest` | Home Screen app name, colors and icons.                                 |
| `icons/`               | `icon.svg` (source and favicon) and the PNG sizes made from it.         |
| `.nojekyll`            | Tells GitHub Pages to serve the files as they are, without Jekyll.      |
| `CNAME`                | The custom domain of the GitHub Pages site (`generala.gtfunes.com`).    |
| `.github/`             | `check.mjs` and the GitHub Action that runs it on each push (see [Deploy](#deploy)). |

## Run locally

```bash
python3 -m http.server 5173
```

Then open <http://localhost:5173>.

- The service worker (offline support) is off on `localhost`, so it never caches other local dev servers. To test it, open <http://generala.localhost:5173> instead.
- The security `<meta>` tags in `index.html` apply on the local server too.

## Deploy

The live site is <https://generala.gtfunes.com>, served by GitHub Pages from the `main` branch. There is no build step: each push to `main` publishes the site in about a minute.

The setup, done once:

1. **Settings → Pages**: source **Deploy from a branch**, branch `main`, folder `/ (root)`.
2. Custom domain `generala.gtfunes.com`. GitHub keeps it in the `CNAME` file, so do not delete that file.
3. At the DNS provider of `gtfunes.com`: a `CNAME` record with the name `generala` and the value `gtfunes.github.io`.
4. When GitHub has issued the certificate, turn on **Enforce HTTPS** in **Settings → Pages**.
5. Verify `gtfunes.com` in your profile **Settings → Pages**, so no other GitHub account can use the domain.

- Pages serves every tracked file, so `README.md` and `LICENSE` also get public URLs. There is nothing secret in the repository.
- Pages caches each file for 10 minutes (`max-age=600`), so a phone can show the old version for up to 10 minutes after a deploy.
- Each push to `main` also runs a check (`.github/workflows/check.yml`): the scripts parse, the JSON files are valid, nothing inline would be blocked by the CSP, and every file that `index.html` and the `ASSETS` list in `sw.js` name exists. A failed check does not stop the deploy, but GitHub emails you. Run it locally with `node .github/check.mjs`.
- `https://gtfunes.github.io/very-simple-generala/` redirects to the custom domain.
- To serve the site without a custom domain, delete `CNAME` and clear the domain in **Settings → Pages**. All paths are relative, so the site works under `/very-simple-generala/` too.

## Analytics

Google Analytics 4 is wired in, but it stays off until the site has a measurement ID:

1. In Google Analytics, add a web data stream for `generala.gtfunes.com` and copy its measurement ID (`G-…`).
2. Paste it into `GA_MEASUREMENT_ID` at the top of `analytics.js`, then push to `main`.

- It never runs on `localhost`, `*.localhost` or LAN addresses, so local tests are not counted.
- `gtag.js` (about 180 KB, ten times the app) loads only after the page has loaded, so it never slows the game or the offline cache down.
- Besides the page views, it sends two events: `game_start` (the first score, with the number of players) and `game_end` (with the number of players and whether a generala servida ended it). The events never include the names people type.
- The ads features are off: ad cookies are denied by default (consent mode), and Google signals and ad personalization are disabled. To turn Google signals on, add the extra Google domains to the Content Security Policy first.
- Google Analytics sets its own cookies (`_ga`). The site has no cookie banner, so it does not ask visitors for consent. Visitors in the EU or the UK would need one.
- `analytics.js` is the same file in the bingo, generala and truco repositories. Only the ID line differs.

## Security

The site is static: no backend and no accounts. The only third-party script is Google Analytics, and only once it has an ID (see [Analytics](#analytics)). Player names and saved state go into the page as text, never as HTML.

GitHub Pages cannot send custom headers, so `index.html` sets these with `<meta>` tags:

- A strict Content Security Policy: only files from the site itself and the Google Analytics domains, no inline scripts or styles.
- `referrer: no-referrer`.
- `robots: noindex, nofollow`, so search engines skip the site. Delete it if you want the site indexed.

The protections that exist only as headers are missing: `frame-ancestors` and `X-Frame-Options` (framing by other sites), `X-Content-Type-Options`, `Cross-Origin-Opener-Policy` and a Permissions Policy. The risk is low: the app has no accounts and no data worth stealing. GitHub Pages serves the site over HTTPS once **Enforce HTTPS** is on.

## Notes

- With more than 6 players on a phone, the sheet scrolls sideways and the row names stay in place.
- For a full-screen app feel, open the site on the phone and use **Add to Home Screen**.
- If you add a file the app needs, add it to `ASSETS` in `sw.js`, so it works offline.
- To regenerate the PNG icons after you edit `icons/icon.svg`, install `librsvg` (`brew install librsvg`) and run:

```bash
for s in 180 192 512; do rsvg-convert -w $s -h $s icons/icon.svg -o icons/icon-$s.png; done
```

## License

[MIT](LICENSE)
