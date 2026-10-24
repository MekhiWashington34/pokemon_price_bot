# Pokémon Price Bot + Card Vault app

A Google Apps Script bot that lives inside my "Pokemon Cards" Google Sheet. Every morning it:

1. Gets the latest TCGplayer market price for each card from the free [Pokémon TCG API](https://pokemontcg.io)
2. Writes the price and the change since the last check into the Cards tab
3. Adds a row to the **Price History** tab with the collection's total value
4. Emails me when a card moves at least 10% and at least $3

It runs on Google's servers, so my computer can be off.

## Install

1. Open the sheet, then **Extensions → Apps Script**.
2. Paste in `Code.gs` and save (Ctrl+S).
3. Pick **setup** in the function dropdown and click **Run**, then allow the permissions Google asks for.

The sheet also gets a **Price Bot** menu with *Update prices now*, *Turn on daily updates* and *Turn off daily updates*.

## Card Vault app

`App.gs` and `Index.html` turn the bot into a web app you can open on your phone:

- **Collection**: total value, value-over-time chart, biggest movers, and every card with its price and change (search and sort)
- **Trade**: pick cards you'd give from your collection, search for cards you'd get, and see if the trade is fair
- **Add cards**: search any card, pick the version, condition and quantity, and add it to the sheet (with its price-bot ID filled in)
- **Refresh prices** runs the price bot on demand

### Install the app

1. In the Apps Script editor, click **+ → Script**, name it `App`, and paste in `App.gs`.
2. Click **+ → HTML**, name it `Index`, and paste in `Index.html`. Save.
3. Click **Deploy → New deployment**. Under *Select type* choose **Web app**. Set *Execute as* to **Me** and *Who has access* to **Only myself**. Click **Deploy** and allow the permissions.
4. Copy the **Web app URL**. Open it on your phone and use **Share → Add to Home Screen** (iPhone) or **⋮ → Add to Home screen** (Android).

After changing the code later, use **Deploy → Manage deployments → Edit → Version: New version** so the same URL gets the update.

## Settings

Everything is in the `CONFIG` block at the top of `Code.gs`:

| Setting | Default | What it does |
|---|---|---|
| `ALERT_PERCENT` | `10` | Minimum % move that triggers an email |
| `ALERT_DOLLARS` | `3` | Minimum $ move per card that triggers an email |
| `RUN_HOUR` | `8` | Hour of the daily run |
| `ALSO_UPDATE_EST_VALUE` | `false` | Also copy prices into "Est. Value Each" |
| `EMAIL_TO` | your Google email | Where alerts go |
| `API_KEY` | none | Optional free key from dev.pokemontcg.io for higher limits |

## How cards are matched

Each row needs a card ID from the Pokémon TCG API in the **Price Bot ID** column (for example `bw8-134` for Lugia EX, Plasma Storm 134). Rows without an ID are skipped.
