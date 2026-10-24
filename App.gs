/**
 * BubTCG web app: the server side.
 * Serves Index.html and gives it data from the "Pokemon Cards" sheet.
 * Deploy: Deploy > New deployment > Web app (Execute as: Me, Who has access: Only myself).
 */

function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('BubTCG')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.DEFAULT);
}

function vault_() {
  return SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
}

/** Everything the app needs: your cards plus value history. */
function getCollection() {
  const ss = vault_();
  const sheet = ss.getSheetByName(CONFIG.SHEET);
  const last = sheet.getLastRow();
  const n = Math.max(0, last - CONFIG.FIRST_ROW + 1);
  const rows = n ? sheet.getRange(CONFIG.FIRST_ROW, 1, n, CONFIG.COL.checked).getValues() : [];

  const cards = [];
  rows.forEach((r, i) => {
    if (!String(r[0]).trim()) return;
    cards.push({
      row: CONFIG.FIRST_ROW + i,
      name: String(r[0]).trim(),
      set: String(r[1]),
      number: String(r[2]),
      rarity: String(r[3]),
      condition: String(r[4]),
      variant: String(r[6]),
      qty: Number(r[7]) || 0,
      est: Number(r[8]) || 0,
      psa10: Number(r[12]) || 0,
      id: String(r[CONFIG.COL.id - 1]).trim(),
      market: Number(r[CONFIG.COL.market - 1]) || 0,
      change: String(r[CONFIG.COL.change - 1] || ''),
      checked: r[CONFIG.COL.checked - 1] instanceof Date ? r[CONFIG.COL.checked - 1].toISOString() : '',
    });
  });

  const history = [];
  const hs = ss.getSheetByName(CONFIG.HISTORY_SHEET);
  if (hs && hs.getLastRow() > 1) {
    hs.getRange(2, 1, hs.getLastRow() - 1, 2).getValues().forEach(h => {
      if (h[0] instanceof Date && Number(h[1])) history.push([h[0].toISOString(), Number(h[1])]);
    });
  }
  return { cards, history, sheetUrl: ss.getUrl(), loadedAt: new Date().toISOString() };
}

/** Search the Pokémon TCG API. Accepts things like "lugia", "charizard ex 151", "mew 232". */
function searchCards(text) {
  text = String(text || '').trim();
  if (text.length < 2) return [];
  const words = text.split(/\s+/);
  const numberWord = words.find(w => /^[a-z]*\d+[a-z]*(\/\d+)?$/i.test(w) && /\d/.test(w));
  const nameWords = words.filter(w => w !== numberWord).map(w => w.replace(/["*]/g, ''));
  const parts = [];
  if (nameWords.length) parts.push(`name:"${nameWords.join(' ')}*"`);
  if (numberWord) parts.push(`number:${numberWord.split('/')[0].replace(/^0+(?=\d)/, '')}`);
  const url = `${API}?pageSize=30&orderBy=-set.releaseDate&select=id,name,number,rarity,set,images,tcgplayer&q=${encodeURIComponent(parts.join(' '))}`;
  const headers = CONFIG.API_KEY ? { 'X-Api-Key': CONFIG.API_KEY } : {};

  for (let attempt = 1; attempt <= 4; attempt++) {
    const res = UrlFetchApp.fetch(url, { headers, muteHttpExceptions: true });
    if (res.getResponseCode() === 200) {
      return JSON.parse(res.getContentText()).data.map(c => ({
        id: c.id,
        name: c.name,
        number: c.number,
        rarity: c.rarity || '',
        set: c.set ? c.set.name : '',
        image: c.images ? c.images.small : '',
        prices: Object.fromEntries(Object.entries((c.tcgplayer && c.tcgplayer.prices) || {})
          .map(([k, v]) => [k, v.market || v.mid || null]).filter(([, v]) => v)),
      }));
    }
    Utilities.sleep(1500 * attempt);
  }
  throw new Error('The card search is busy right now. Try again in a minute.');
}

const VARIANT_LABELS = {
  holofoil: 'Holofoil', reverseHolofoil: 'Reverse Holofoil', normal: 'Normal',
  '1stEditionHolofoil': '1st Edition Holofoil', unlimitedHolofoil: 'Holofoil', '1stEdition': '1st Edition',
};

/** Adds a card to the Cards tab (or adds to its quantity if you already have it). */
function addCard(card) {
  const sheet = vault_().getSheetByName(CONFIG.SHEET);
  const qty = Math.max(1, Number(card.qty) || 1);
  const variant = VARIANT_LABELS[card.variantKey] || card.variantKey || '';
  const price = Number(card.price) || 0;
  const last = Math.max(sheet.getLastRow(), CONFIG.FIRST_ROW);
  const block = sheet.getRange(CONFIG.FIRST_ROW, 1, last - CONFIG.FIRST_ROW + 1, CONFIG.COL.id).getValues();

  // Already in the collection with the same variant? Bump the quantity.
  for (let i = 0; i < block.length; i++) {
    if (String(block[i][CONFIG.COL.id - 1]).trim() === card.id && String(block[i][CONFIG.COL.variant - 1]) === variant) {
      const row = CONFIG.FIRST_ROW + i;
      const newQty = (Number(block[i][CONFIG.COL.qty - 1]) || 0) + qty;
      sheet.getRange(row, CONFIG.COL.qty).setValue(newQty);
      return { row, qty: newQty, merged: true };
    }
  }

  let row = CONFIG.FIRST_ROW + block.findIndex(r => !String(r[0]).trim());
  if (row < CONFIG.FIRST_ROW) row = last + 1;
  sheet.getRange(row, 1, 1, 8).setValues([[card.name, card.set, "'" + card.number, card.rarity || '',
                                            card.condition || 'Near Mint', '', variant, qty]]);
  if (price) sheet.getRange(row, CONFIG.COL.estValue).setValue(price);
  sheet.getRange(row, 11, 1, 2).setValues([['No', 'Added in BubTCG']]);
  sheet.getRange(row, CONFIG.COL.id, 1, 2).setValues([[card.id, price || '']]);
  return { row, qty, merged: false };
}

/** "Refresh prices" button in the app. */
function refreshPrices() {
  updatePrices();
  return getCollection();
}
