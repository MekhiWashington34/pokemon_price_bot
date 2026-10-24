# Pokémon Price Bot

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
