/**
 * Pokémon Price Bot
 * Lives inside your "Pokemon Cards" Google Sheet. Every morning it:
 *   1. Gets the latest TCGplayer market price for each card (from the free Pokémon TCG API, pokemontcg.io)
 *   2. Writes it to the "TCGplayer Market" column on the Cards tab (and, if you turn it on, "Est. Value Each")
 *   3. Adds a row to the "Price History" tab with your collection's total value
 *   4. Emails you when a card's price moves a lot
 *
 * Setup: paste this file into Extensions > Apps Script, save, then run setup() once.
 */

const CONFIG = {
  SPREADSHEET_ID: '19RFfC5irddS-DtDm_0VWXzQjFNFx-i-x63X-GCnb3Wc',  // your "Pokemon Cards" sheet
  SHEET: 'Cards',
  HISTORY_SHEET: 'Price History',
  FIRST_ROW: 3,                    // row 1 = headers, row 2 = TOTAL
  // Column numbers on the Cards tab (A = 1)
  COL: { name: 1, set: 2, variant: 7, qty: 8, estValue: 9, id: 18, market: 19, change: 20, checked: 21 },
  ALSO_UPDATE_EST_VALUE: false,    // true = also copy the TCGplayer price into "Est. Value Each" (column I)
  ALERT_PERCENT: 10,               // email me when a card moves at least this many percent...
  ALERT_DOLLARS: 3,                // ...and at least this many dollars per card
  RUN_HOUR: 8,                     // daily run time (hour, in the sheet's time zone)
  EMAIL_TO: '',                    // leave blank to use your Google account's email
  API_KEY: '',                     // optional: free key from https://dev.pokemontcg.io (higher limits)
};

const API = 'https://api.pokemontcg.io/v2/cards';
const VARIANT_KEYS = {
  'holofoil': ['holofoil', 'unlimitedHolofoil', '1stEditionHolofoil'],
  'reverse holofoil': ['reverseHolofoil'],
  'normal': ['normal', 'unlimited', '1stEdition'],
};

/** Adds a "Price Bot" menu to the sheet. */
function onOpen() {
  SpreadsheetApp.getUi().createMenu('Price Bot')
    .addItem('Update prices now', 'updatePrices')
    .addItem('Turn on daily updates', 'setup')
    .addItem('Turn off daily updates', 'stopDailyUpdates')
    .addToUi();
}

/** Run once: schedules the daily update and runs the first one. */
function setup() {
  stopDailyUpdates();
  ScriptApp.newTrigger('updatePrices').timeBased().everyDays(1).atHour(CONFIG.RUN_HOUR).create();
  updatePrices();
}

function stopDailyUpdates() {
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'updatePrices')
    .forEach(t => ScriptApp.deleteTrigger(t));
}

/** The main job: fetch prices, update the sheet, log history, send alerts. */
function updatePrices() {
  const ss = SpreadsheetApp.getActiveSpreadsheet() || SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  const sheet = ss.getSheetByName(CONFIG.SHEET);
  const lastRow = sheet.getLastRow();
  if (lastRow < CONFIG.FIRST_ROW) return;
  const n = lastRow - CONFIG.FIRST_ROW + 1;
  const rows = sheet.getRange(CONFIG.FIRST_ROW, 1, n, CONFIG.COL.checked).getValues();

  // 1. Fetch prices for every card that has a Price ID
  const ids = [...new Set(rows.map(r => String(r[CONFIG.COL.id - 1]).trim()).filter(Boolean))];
  const { prices, failed } = fetchPrices_(ids);

  // 2. Work out new prices and changes
  const props = PropertiesService.getScriptProperties();
  const firstRun = props.getProperty('baselineDone') !== 'yes';
  const now = new Date();
  const priceOut = [], estOut = [], checkedOut = [], changeOut = [], movers = [];
  let updated = 0;

  rows.forEach(r => {
    const id = String(r[CONFIG.COL.id - 1]).trim();
    const oldPrice = Number(r[CONFIG.COL.market - 1]) || 0;
    const card = id ? prices[id] : null;
    const newPrice = card ? pickPrice_(card, r[CONFIG.COL.variant - 1]) : null;

    if (newPrice == null) {
      priceOut.push([r[CONFIG.COL.market - 1]]);
      estOut.push([r[CONFIG.COL.estValue - 1]]);
      checkedOut.push([r[CONFIG.COL.checked - 1]]);
      changeOut.push([!id ? r[CONFIG.COL.change - 1]
                    : failed.has(id) ? 'check failed, kept last price'
                    : card ? 'no TCGplayer price' : 'not found']);
      return;
    }
    updated++;
    const diff = newPrice - oldPrice;
    const pct = oldPrice ? diff / oldPrice * 100 : 0;
    priceOut.push([newPrice]);
    estOut.push([CONFIG.ALSO_UPDATE_EST_VALUE ? newPrice : r[CONFIG.COL.estValue - 1]]);
    checkedOut.push([now]);
    changeOut.push([firstRun ? 'tracking started' : formatChange_(diff, pct)]);
    if (!firstRun && oldPrice && Math.abs(pct) >= CONFIG.ALERT_PERCENT && Math.abs(diff) >= CONFIG.ALERT_DOLLARS) {
      movers.push({ name: r[CONFIG.COL.name - 1], set: r[CONFIG.COL.set - 1], oldPrice, newPrice, diff, pct,
                    qty: Number(r[CONFIG.COL.qty - 1]) || 1 });
    }
  });

  sheet.getRange(CONFIG.FIRST_ROW, CONFIG.COL.market, n, 1).setValues(priceOut).setNumberFormat('$#,##0.00');
  if (CONFIG.ALSO_UPDATE_EST_VALUE) sheet.getRange(CONFIG.FIRST_ROW, CONFIG.COL.estValue, n, 1).setValues(estOut);
  sheet.getRange(CONFIG.FIRST_ROW, CONFIG.COL.checked, n, 1).setValues(checkedOut).setNumberFormat('mmm d, h:mm am/pm');
  sheet.getRange(CONFIG.FIRST_ROW, CONFIG.COL.change, n, 1).setValues(changeOut);
  SpreadsheetApp.flush();

  // 3. Log the collection's total value
  const total = rows.reduce((sum, r, i) => sum + (Number(r[CONFIG.COL.qty - 1]) || 0) * (Number(priceOut[i][0]) || 0), 0);
  const history = getHistorySheet_(ss);
  const prev = history.getLastRow() > 1 ? Number(history.getRange(history.getLastRow(), 2).getValue()) : null;
  movers.sort((a, b) => Math.abs(b.diff * b.qty) - Math.abs(a.diff * a.qty));
  history.appendRow([now, total, prev == null ? '' : total - prev, updated, movers.length,
                     movers[0] ? `${movers[0].name} (${formatChange_(movers[0].diff, movers[0].pct)})` : '']);

  // 4. Email
  const to = CONFIG.EMAIL_TO || Session.getEffectiveUser().getEmail();
  if (firstRun) {
    props.setProperty('baselineDone', 'yes');
    MailApp.sendEmail({ to, subject: 'Pokémon Price Bot is running',
      htmlBody: `<p>Your price bot is set up. It found TCGplayer market prices for <b>${updated}</b> cards.</p>
                 <p>Collection value: <b>${money_(total)}</b></p>
                 <p>From now on it checks prices every morning and emails you when a card moves
                 ${CONFIG.ALERT_PERCENT}% or more.</p><p><a href="${ss.getUrl()}">Open your sheet</a></p>` });
  } else if (movers.length) {
    const rowsHtml = movers.slice(0, 25).map(m =>
      `<tr><td>${m.name}<br><small style="color:#666">${m.set}</small></td>
           <td align="right">${money_(m.oldPrice)}</td><td align="right"><b>${money_(m.newPrice)}</b></td>
           <td align="right" style="color:${m.diff > 0 ? '#11803a' : '#c0392b'}">${formatChange_(m.diff, m.pct)}</td></tr>`).join('');
    MailApp.sendEmail({ to,
      subject: `Pokémon prices: ${movers.length} card${movers.length > 1 ? 's' : ''} moved · collection ${money_(total)}`,
      htmlBody: `<p>Collection value: <b>${money_(total)}</b>${prev == null ? '' : ` (${signedMoney_(total - prev)} since last check)`}</p>
                 <table cellpadding="6" style="border-collapse:collapse;font-family:sans-serif">
                 <tr style="background:#f2f4f8"><th align="left">Card</th><th>Was</th><th>Now</th><th>Change</th></tr>${rowsHtml}</table>
                 <p><a href="${ss.getUrl()}">Open your sheet</a></p>` });
  }
}

/**
 * Gets cards from the Pokémon TCG API in batches, retrying when the API is busy.
 * If one batch keeps failing, it's skipped (those cards keep their last price) and the rest still update.
 */
function fetchPrices_(ids) {
  const out = {};
  const failed = new Set();
  const headers = CONFIG.API_KEY ? { 'X-Api-Key': CONFIG.API_KEY } : {};
  let lastCode = 0;
  for (let i = 0; i < ids.length; i += 40) {
    const batch = ids.slice(i, i + 40);
    const q = batch.map(id => `id:${id}`).join(' OR ');
    const url = `${API}?pageSize=250&select=id,tcgplayer&q=${encodeURIComponent(q)}`;
    let ok = false;
    for (let attempt = 1; attempt <= 4 && !ok; attempt++) {
      try {
        const res = UrlFetchApp.fetch(url, { headers, muteHttpExceptions: true });
        lastCode = res.getResponseCode();
        if (lastCode === 200) {
          JSON.parse(res.getContentText()).data.forEach(c => out[c.id] = c);
          ok = true;
        }
      } catch (e) {
        lastCode = String(e.message || e);
      }
      if (!ok && attempt < 4) Utilities.sleep(2500 * attempt);
    }
    if (!ok) {
      batch.forEach(id => failed.add(id));
      console.warn(`Skipped ${batch.length} cards: Pokémon TCG API failed (${lastCode}).`);
    }
    Utilities.sleep(1500);
  }
  if (ids.length && failed.size === ids.length) {
    throw new Error(`Pokémon TCG API failed (${lastCode}). Try again in a few minutes.`);
  }
  return { prices: out, failed };
}

function pickPrice_(card, variant) {
  const p = card.tcgplayer && card.tcgplayer.prices;
  if (!p) return null;
  const keys = (VARIANT_KEYS[String(variant).trim().toLowerCase()] || []).concat(Object.keys(p));
  for (const k of keys) {
    const v = p[k] && (p[k].market || p[k].mid);
    if (v) return Math.round(v * 100) / 100;
  }
  return null;
}

function getHistorySheet_(ss) {
  let sh = ss.getSheetByName(CONFIG.HISTORY_SHEET);
  if (!sh) {
    sh = ss.insertSheet(CONFIG.HISTORY_SHEET);
    sh.appendRow(['Date', 'TCGplayer Value ($)', 'Change ($)', 'Cards Priced', 'Big Movers', 'Biggest Mover']);
    sh.getRange('A1:F1').setFontWeight('bold');
    sh.getRange('A:A').setNumberFormat('mmm d, yyyy h:mm am/pm');
    sh.getRange('B:C').setNumberFormat('$#,##0.00;-$#,##0.00');
    sh.setFrozenRows(1);
    sh.setColumnWidths(1, 6, 150);
  }
  return sh;
}

function formatChange_(diff, pct) {
  if (!diff) return 'no change';
  return `${signedMoney_(diff)} (${pct > 0 ? '+' : ''}${pct.toFixed(1)}%)`;
}
function money_(v) { return '$' + Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function signedMoney_(v) { return (v >= 0 ? '+' : '-') + money_(Math.abs(v)); }
