// base URL for Azure Functions
const BW_BACKEND_BASE_URL = "https://bwbackend-cahmavhhgjcaa3be.canadaeast-01.azurewebsites.net/api";

// This will be injected by the GitHub Actions build step
const BW_BACKEND_CODE = "__BW_BACKEND_CODE__";

window.BW_CONFIG = {
    BW_BACKEND_BASE_URL,
    BW_BACKEND_CODE
};

const DISALLOWED_PRODUCTS = [
  "", "Credit Card Fees", "Cost of Goods Sold", "Freight", "Health Insurance", "Amazon Fees", "Bank Fees", "Bad Debit", "PmntDiscount_Customer Discounts",
  "Misc", "PmntDiscount_Bank Service Charges", "Testing", "Restock", "Testing-Bio", "Testing-Endo", "Services", "Sales"
];

/**
 * Loads the configuration JSON file from the same directory.
 */
async function loadConfig() {
  try {
    const response = await fetch('./config.json');
    if (!response.ok) {
      throw new Error(`Failed to load config.json: ${response.status} ${response.statusText}`);
    }

    const config = await response.json();
    const currentYear = new Date().getFullYear().toString();

    // Iterate through config and replace [YEAR] with the actual current year
    if (Array.isArray(config)) {
      return config.map(entry => {
        if (entry.directory && typeof entry.directory === 'string') {
          // Replace all instances of [YEAR] with the current year value
          entry.directory = entry.directory.replace(/\[YEAR\]/g, currentYear);
        }
        return entry;
      });
    }

    return config;
  } catch (error) {
    console.error("Error loading config:", error);
    throw error;
  }
}

/**
 * Fetches metadata for the most recently modified file within a given directory
 * that starts with the provided filename prefix.
 */
async function fetchLatestFileMetadata(directory, filenamePrefix, token) {
  const siteId = "brandywinematerialsllc.sharepoint.com,07a1465e-a31a-4437-aca2-0efe61b7f2c6,4b1abd1c-08c6-4574-b350-654376a1e954";
  const driveId = "b!XkahBxqjN0Ssog7-Ybfyxhy9GkvGCHRFs1BlQ3ah6VTHnmI16yPPQofBa949Ai-j";
  const encodedDirectory = encodeURIComponent(directory);
  const encodedPrefix = encodeURIComponent(filenamePrefix);
  const endpoint = `https://graph.microsoft.com/v1.0/sites/${siteId}/drives/${driveId}/root:/${encodedDirectory}:/children?$filter=startswith(name,'${encodedPrefix}')&$orderby=lastModifiedDateTime desc&$top=1`;

  try {
    const response = await fetch(endpoint, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    if (!response.ok) throw new Error(`Failed to fetch metadata: ${response.status} ${response.statusText}`);
    return response.json();
  } catch (error) {
    console.error(`Error fetching metadata for ${directory} with prefix ${filenamePrefix}:`, error);
    throw error;
  }
}

/**
 * Downloads an Excel file from the provided download URL.
 */
async function downloadExcelFile(downloadUrl) {
  try {
    const response = await fetch(downloadUrl);
    if (!response.ok) throw new Error(`Failed to download Excel file: ${response.status} ${response.statusText}`);
    return response.arrayBuffer();
  } catch (error) {
    console.error(`Error downloading Excel file from ${downloadUrl}:`, error);
    throw error;
  }
}

/**
 * Parse an Excel sheet and return an array of row-objects.
 */
function parseExcelData(arrayBuffer, skipRows = 0, columns = null, sheetName = null) {
  try {
    if (!arrayBuffer || arrayBuffer.byteLength === 0) throw new Error("Empty or invalid ArrayBuffer provided");
    const wb = XLSX.read(new Uint8Array(arrayBuffer), { type: "array", cellDates: true, cellFormula: false, cellStyles: false });
    const sheetToUse = sheetName && wb.Sheets[sheetName] ? sheetName : wb.SheetNames[0];
    const ws = wb.Sheets[sheetToUse];
    if (!ws) throw new Error(`Sheet "${sheetToUse}" not found.`);
    const opts = { header: columns || 1, defval: "", blankrows: false, raw: false };
    if (skipRows > 0) opts.range = skipRows;
    const parsed = XLSX.utils.sheet_to_json(ws, opts);
    console.debug(`[parseExcelData] ${sheetToUse}: ${parsed.length} rows parsed.`);
    return parsed;
  } catch (err) {
    console.error("Error parsing Excel data:", err);
    throw err;
  }
}

/**
 * Converts an Excel serial date number to a JS Date object.
 * Excel base date: Dec 30, 1899.
 * 25569 is the number of days between Dec 30, 1899 and Jan 1, 1970 (Unix epoch).
 * 864e5 is milliseconds in a day.
 */
function excelSerialDateToJSDate(serial) {
  // Math.round fixes minor floating point errors common in Excel dates
  return new Date(Math.round((serial - 25569) * 864e5));
}

/**
 * Fetches only the last N rows of an Excel file via Graph API.
 * This avoids downloading/parsing the entire file.
 */
async function fetchLastNRows(driveId, itemId, sheetName, columns, nRows, token) {
  const headers = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };
  const workbookBase = `https://graph.microsoft.com/v1.0/drives/${driveId}/items/${itemId}/workbook`;

  // 1. Get the "UsedRange" address to find total rows (Metadata only, very fast)
  const rangeResp = await fetch(
    `${workbookBase}/worksheets('${encodeURIComponent(sheetName)}')/usedRange?$select=address`,
    { headers }
  );

  if (!rangeResp.ok) throw new Error(`Failed to fetch usedRange for ${sheetName}: ${rangeResp.statusText}`);
  const rangeData = await rangeResp.json();

  const rangeAddress = rangeData.address;
  const match = rangeAddress.match(/!([A-Za-z]+)(\d+):([A-Za-z]+)(\d+)/);

  if (!match) throw new Error("Could not parse Excel range address: " + rangeAddress);

  const totalRows = parseInt(match[4], 10);
  const totalCols = columns.length;

  // 2. Calculate the Start Row
  const startRow = Math.max(2, totalRows - nRows + 1);

  // 3. Calculate the Column Letter
  const getColLetter = (idx) => {
    let letter = '';
    while (idx >= 0) {
      letter = String.fromCharCode((idx % 26) + 65) + letter;
      idx = Math.floor(idx / 26) - 1;
    }
    return letter;
  };
  const endColLetter = getColLetter(totalCols - 1);

  // 4. Fetch the Data Range (Requesting VALUES to get raw data/serial dates)
  const fetchAddress = `A${startRow}:${endColLetter}${totalRows}`;
  console.log(`[Partial Load] Fetching range ${fetchAddress} for ${sheetName} (Last ${nRows} rows)`);

  // Reverted to 'values' to get raw numbers for dates
  const dataResp = await fetch(
    `${workbookBase}/worksheets('${encodeURIComponent(sheetName)}')/range(address='${fetchAddress}')?$select=values`,
    { headers }
  );

  if (!dataResp.ok) throw new Error(`Failed to fetch range: ${dataResp.statusText}`);
  const dataJson = await dataResp.json();
  const rows = dataJson.values;

  // 5. Map Array-of-Arrays to Array-of-Objects using specific Columns
  return rows.map(rowValues => {
    const rowObj = {};
    columns.forEach((colName, index) => {
      let val = rowValues[index];
      if (val === undefined || val === null) val = "";

      // --- DATE FIX: Convert serial numbers to Date Strings ---
      // We assume any column with "Date" or "date" in the name AND a numeric value is an Excel date.
      if (typeof val === 'number' && /date/i.test(colName)) {
        const dateObj = excelSerialDateToJSDate(val);
        if (!isNaN(dateObj.getTime())) {
          // Use UTC methods to prevent timezone shifting (e.g. 1/1 becoming 12/31)
          const month = dateObj.getUTCMonth() + 1;
          const day = dateObj.getUTCDate();
          const year = dateObj.getUTCFullYear();
          val = `${month}/${day}/${year}`;
        }
      }

      rowObj[colName] = val;
    });
    return rowObj;
  });
}



/**
 * Main data processing function.
 */
async function processFiles() {
  try {
    const token = await getAccessToken();
    if (!token) { console.error("No MSAL token"); return; }

    const cfg = await loadConfig();
    if (!Array.isArray(cfg) || !cfg.length) {
      console.error("Config file empty or invalid"); return;
    }

    const byWorkbook = new Map();
    const sigOf = r => `${r.directory}|${r.filenamePrefix}`;
    cfg.forEach(r => (byWorkbook.get(sigOf(r)) ?? byWorkbook.set(sigOf(r), []).get(sigOf(r))).push(r));

    const cachedPricing = await idbUtil.getDataset("PricingData") || null;
    const pricingMeta = { ...(cachedPricing?.metadata || {}) };
    const mergedPrices = [];
    let pricingChanged = false;
    const bufferCache = new Map();
    const ds = window.dataStore;

    for (const rows of byWorkbook.values()) {
      const { directory, filenamePrefix } = rows[0];
      const metaResp = await fetchLatestFileMetadata(directory, filenamePrefix, token);
      const md = metaResp.value?.[0];
      if (!md) continue;

      const webUrl = md.webUrl;
      rows.forEach(r => {
        const key = r.dataKey || r.filenamePrefix;
        if (!window.dataStore.fileLinks[key]) {
          window.dataStore.fileLinks[key] = webUrl;
        }
      });

      const fileId = md.id;
      const lastMod = md.lastModifiedDateTime;

      const isPricingBook = rows.some(r => {
        const k = r.dataKey || r.filenamePrefix;
        return k === "Pricing" || /^Prices\s\d+/i.test(k);
      });
      if (isPricingBook && cachedPricing && pricingMeta[fileId]?.lastModifiedDateTime === lastMod) {
        continue;
      }

      // Check if we need to download the full buffer.
      // If ALL rows in this workbook are flagged as "partialLoad", we skip full download.
      const allPartial = rows.every(r => r.partialLoad === true);

      let buf = null;
      if (!allPartial) {
        buf = bufferCache.get(fileId);
        if (!buf) {
          // Only download if we haven't already and we actually need it for some sheets
          buf = await downloadExcelFile(md['@microsoft.graph.downloadUrl']);
          bufferCache.set(fileId, buf);
        }
      }

      for (const row of rows) {
        const key = row.dataKey || row.filenamePrefix;
        const storageKey = `${key}Data`;

        // --- START NEW LOGIC: PARTIAL FETCH FROM CONFIG ---
        if (row.partialLoad) {
          const cached = await idbUtil.getDataset(storageKey);

          // Check cache validity
          if (cached?.metadata?.lastModifiedDateTime === lastMod) {
            console.log(`[processFiles] Cache hit for ${key}. Skipping fetch.`);
            ds[key] = cached;
            continue;
          }

          // Defaults: 2000 rows if not specified
          const nRowsToFetch = row.nRows || 2000;
          const columnsToMap = row.columns || [];
          const sheetToFetch = row.sheetName || "";

          console.log(`[processFiles] Fetching fresh partial data for ${key} (Last ${nRowsToFetch} rows) from sheet "${sheetToFetch}"...`);

          try {
            if (!sheetToFetch || columnsToMap.length === 0) {
              throw new Error(`Missing sheetName or columns in config for partial load key: ${key}`);
            }

            const partialData = await fetchLastNRows(
              md.parentReference.driveId,
              md.id,
              sheetToFetch,
              columnsToMap,
              nRowsToFetch,
              token
            );

            const stored = { dataframe: partialData, metadata: md };
            ds[key] = stored;
            await idbUtil.setDataset(storageKey, stored);

            continue; // Skip standard parsing logic
          } catch (err) {
            console.error(`[processFiles] Partial fetch failed for ${key}`, err);
            // We do NOT fallback to full download because we likely didn't download the buffer above
            continue;
          }
        }
        // --- END NEW LOGIC ---

        const isPricing = key === "Pricing" || /^Prices\s\d+/i.test(key);

        if (!isPricing) {
          const cached = await idbUtil.getDataset(storageKey);
          if (cached?.metadata?.lastModifiedDateTime === lastMod) {
            ds[key] = cached;
            continue;
          }
        }

        // Standard Full Parsing
        if (!buf) {
          console.warn(`[processFiles] Unexpected missing buffer for ${key}. Skipping.`);
          continue;
        }
        const frame = parseExcelData(buf, row.skipRows, row.columns, row.sheetName);

        if (isPricing) {
          pricingChanged = true;
          mergedPrices.push(...slimPriceRows(frame));
          pricingMeta[fileId] = { lastModifiedDateTime: lastMod, webUrl: md.webUrl };
          continue;
        }

        if (key === "PriceRaise") {
          const map = {};
          frame.forEach(r => {
            if (r.Product) map[String(r.Product).trim()] = {
              COO: r.COO || "N/A",
              July9thIncrease: r.July9thIncrease || "N/A",
              AddedCost: r.AddedCost || "N/A"
            };
          });
          const stored = { dataframe: map, metadata: md };
          ds["PriceRaise"] = stored;
          await idbUtil.setDataset(storageKey, stored);
          console.log(`[PriceRaise] ${Object.keys(map).length} rows loaded.`);
          continue;
        }

        if (key === "Equivalents") {
          const map = normalizeEquivalents(frame);
          const stored = { dataframe: map, metadata: md };
          ds[key] = stored;
          await idbUtil.setDataset(storageKey, stored);
          continue;
        }

        if (key === "CompanyInfo") {
          const map = window.contactUtils.normaliseCompanyInfo(frame);
          const stored = { dataframe: map, metadata: md };
          ds[key] = stored;
          await idbUtil.setDataset(storageKey, stored);
          console.log(`[CompanyInfo] ${Object.keys(map).length} companies loaded with core info.`);
          continue;
        }

        // Clean Sales and Purchases using the same logic (fill down entity, filter bad products)
        let cleaned = frame;
        if (key === "Sales") {
          cleaned = filterOutValues(fillDownColumn(frame, "Customer"), "Product_Service", DISALLOWED_PRODUCTS);
        } else if (key === "Purchases") {
          cleaned = filterOutValues(fillDownColumn(frame, "Vendor"), "Product_Service", DISALLOWED_PRODUCTS);
        }
        const stored = { dataframe: cleaned, metadata: md };
        ds[key] = stored;
        await idbUtil.setDataset(storageKey, stored);
      }
    }

    if (pricingChanged) {
      const merged = Object.values(mergedPrices.reduce((acc, r) => {
        acc[r.Product] = r; return acc;
      }, {}));
      const stored = { dataframe: merged, metadata: pricingMeta };
      ds["Pricing"] = stored;
      await idbUtil.setDataset("PricingData", stored);
      console.log(`[Pricing] refreshed – ${merged.length} rows merged.`);
    } else if (cachedPricing) {
      ds["Pricing"] = cachedPricing;
      console.log("[Pricing] cache valid – no parsing needed.");
    }

    ds["OrgContacts"] = await window.contactUtils.fetchAndProcessOrgContacts(token);

    document.dispatchEvent(new Event("reports-ready"));

  } catch (err) {
    console.error("processFiles() failed:", err);
  }
}

/* helper: convert raw sheet rows → trimmed pricing rows */
function slimPriceRows(frame) {
  const KEEP = ["Product", "Units per Box", "USER FB", "USER HB", "USER LTB", "DISTR FB", "DISTR HB", "DISTR LTB"];
  return frame.flatMap(r => {
    if (!r.Product) return [];
    const slim = {};
    KEEP.forEach(k => {
      if (r[k] !== undefined && r[k] !== "") {
        slim[k] = (k === "Product" || k === "Units per Box") ? r[k] : toNumber(r[k]);
      }
    });
    return [slim];
  });
}

function normalizeEquivalents(data) {
  const mapping = {};
  for (const row of data) {
    const bmPart = String(row["BM Part #"] || "").trim();
    let equivalents = [];
    for (const col of ["Nordson EFD Part #", "Medmix Sulzer Part #"]) {
      const raw = String(row[col] || "");
      const parts = raw.split(",").map(val => val.trim()).filter(Boolean);
      equivalents = equivalents.concat(parts);
    }
    let replacements = [];
    if (bmPart) replacements.push(bmPart);
    replacements = replacements.concat(equivalents);
    if (replacements.length > 0) {
      for (const part of replacements) {
        mapping[part] = replacements;
      }
    }
  }
  return mapping;
}

async function searchCustomers(query) {
  const SalesData = window.dataStore["Sales"]?.dataframe || [];
  if (SalesData.length === 0) return [];
  const fuse = new Fuse(SalesData, { keys: ["Customer"], threshold: 0.3 });
  return fuse.search(query).map(result => result.item.Customer);
}

async function getOrderHistory(customerName) {
  const SalesData = window.dataStore["Sales"]?.dataframe || [];
  return SalesData.filter(sale => sale.Customer === customerName);
}

async function getMatchingProducts(query) {
  const inventoryData = window.dataStore["DB"]?.dataframe || [];
  if (inventoryData.length === 0) {
    console.warn("[getMatchingProducts] Warning: Inventory data not loaded yet.");
    return [];
  }
  const fuse = new Fuse(inventoryData, { keys: ["PartNumber", "Description"], threshold: 0.4 });
  const results = fuse.search(query);
  return results.map(result => {
    const item = result.item;
    const qtyAvailable = parseFloat(item["QtyOnHand"]) - parseFloat(item["QtyCommitted"]);
    return {
      PartNumber: item["PartNumber"],
      Description: item["Description"],
      QtyAvailable: qtyAvailable,
      UnitCost: parseFloat(item["UnitCost"]).toFixed(2)
    };
  });
}

function fillDownColumn(data, column) {
  let lastValue = "";
  return data.map(row => {
    if (row[column] && row[column].toString().trim() !== "") {
      lastValue = row[column];
    } else {
      row = { ...row, [column]: lastValue };
    }
    return row;
  });
}

function filterOutValues(data, column, disallowedValues) {
  return data.filter(row => {
    const value = row[column];
    if (value == null || String(value).trim() === "") return false;
    return !disallowedValues.includes(String(value).trim());
  });
}

function toNumber(val) {
  if (typeof val === "string") val = val.replace(/[$,]/g, "").trim();
  const num = Number(val);
  return isFinite(num) ? num : null;
}

/**
 * Calculates the unit cost based on the most recent purchase history.
 * Falls back to the static DB cost if no history exists.
 */
function getProductUnitCost(partNumber, fallbackCost) {
  const purchasesData = window.dataStore["Purchases"]?.dataframe || [];
  
  // Filter for this product
  const productPurchases = purchasesData.filter(p => 
      String(p["Product_Service"]).trim() === partNumber
  );

  if (productPurchases.length > 0) {
      // Sort by Date Descending (Newest first)
      productPurchases.sort((a, b) => new Date(b.Date) - new Date(a.Date));
      
      // Clean and parse the cost from the most recent record
      let rawCost = productPurchases[0]["Cost"];
      if (typeof rawCost === 'string') {
          rawCost = parseFloat(rawCost.replace(/[^0-9.-]/g, ''));
      }
      return isFinite(rawCost) ? rawCost : 0;
  }

  // Fallback if no purchase history
  let dbCost = parseFloat(String(fallbackCost).replace(/[^0-9.-]/g, ''));
  return isFinite(dbCost) ? dbCost : 0;
}

/**
 * Calculates Excel column letter from index (0 -> A, 1 -> B, etc.)
 */
function getColumnLetter(colIndex) {
  let letter = '';
  let idx = colIndex;
  while (idx >= 0) {
    letter = String.fromCharCode((idx % 26) + 65) + letter;
    idx = Math.floor(idx / 26) - 1;
  }
  return letter;
}

/**
 * DEEP SEARCH: Finds a specific value in a remote Excel sheet and returns the full row.
 * Used for finding old Orders/Samples not in the "Recent" cache.
 */
async function findRecordInRemoteSheet(dataKey, searchColName, searchValue) {
  try {
    const configList = await loadConfig();
    const config = configList.find(
      (c) => c.dataKey === dataKey || c.filenamePrefix === dataKey
    );

    if (!config) throw new Error(`Configuration not found for dataKey: ${dataKey}`);

    // Get file metadata from store
    const storedData = window.dataStore[dataKey];
    if (!storedData || !storedData.metadata) {
      // If store is empty, try to fetch metadata manually or fail gracefully
      throw new Error(`Metadata missing for ${dataKey}. Ensure app is fully loaded.`);
    }

    const driveId = storedData.metadata.parentReference.driveId;
    const itemId = storedData.metadata.id;
    const sheetName = config.sheetName;
    const columns = config.columns;

    // Determine which column letter to search in (e.g., "Order No." might be Column A)
    const colIndex = columns.indexOf(searchColName);
    if (colIndex === -1) {
      throw new Error(`Column "${searchColName}" not found in config for ${dataKey}`);
    }

    const colLetter = getColumnLetter(colIndex); // e.g., "A"

    const token = await getAccessToken();
    const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

    console.log(
      `[Deep Search] Step 1: Determining bounds for ${dataKey} (Sheet: ${sheetName})...`
    );

    // 1. Get UsedRange to define boundaries
    const usedRangeUrl =
      `https://graph.microsoft.com/v1.0/drives/${driveId}/items/${itemId}` +
      `/workbook/worksheets('${encodeURIComponent(sheetName)}')/usedRange?$select=address`;

    const usedRangeResp = await fetch(usedRangeUrl, { headers });
    if (!usedRangeResp.ok) {
      throw new Error(`Failed to get used range: ${usedRangeResp.statusText}`);
    }
    const usedRangeData = await usedRangeResp.json();

    // Address format: Sheet1!A1:Z1000
    const match = usedRangeData.address.match(/!([A-Za-z]+)(\d+):([A-Za-z]+)(\d+)/);
    if (!match) {
      throw new Error(`Could not parse usedRange address: ${usedRangeData.address}`);
    }

    const usedStartRow = parseInt(match[2], 10);
    const usedEndRow = parseInt(match[4], 10);

    // Assume first row is header -> start searching from the next row
    const dataStartRow = Math.max(usedStartRow + 1, 2);
    if (dataStartRow > usedEndRow) {
      console.warn(
        `[Deep Search] No data rows in usedRange for ${dataKey}. (${usedRangeData.address})`
      );
      return null;
    }

    const searchAddress = `${colLetter}${dataStartRow}:${colLetter}${usedEndRow}`;
    console.log(
      `[Deep Search] Step 2: Fetching column range ${searchAddress} to search for "${searchValue}"...`
    );

    // 2. Fetch the column range values
    const colRangeUrl =
      `https://graph.microsoft.com/v1.0/drives/${driveId}/items/${itemId}` +
      `/workbook/worksheets('${encodeURIComponent(sheetName)}')/range(address='${searchAddress}')?$select=values`;

    const colResp = await fetch(colRangeUrl, { headers });
    if (!colResp.ok) {
      throw new Error(`Failed to fetch column range ${searchAddress}: ${colResp.statusText}`);
    }

    const colJson = await colResp.json();
    const colValues = colJson.values || []; // array of [ [value], [value], ... ]

    // 3. Search locally in JS
    const normalizedTarget = String(searchValue).trim().toLowerCase();
    let foundRowIndex = null; // actual Excel row index (1-based)

    for (let i = 0; i < colValues.length; i++) {
      const cellVal = colValues[i][0];
      if (cellVal === undefined || cellVal === null) continue;

      const normalizedCell = String(cellVal).trim().toLowerCase();
      if (normalizedCell === normalizedTarget) {
        // i = 0 corresponds to dataStartRow
        foundRowIndex = dataStartRow + i;
        break;
      }
    }

    if (foundRowIndex == null) {
      console.log(
        `[Deep Search] Value "${searchValue}" not found in range ${searchAddress}.`
      );
      return null;
    }

    console.log(
      `[Deep Search] Step 3: Fetching full row ${foundRowIndex} for "${searchValue}"...`
    );

    // 4. Fetch that specific row
    const lastColLetter = getColumnLetter(columns.length - 1);
    const rowRangeAddress = `A${foundRowIndex}:${lastColLetter}${foundRowIndex}`;

    const rowUrl =
      `https://graph.microsoft.com/v1.0/drives/${driveId}/items/${itemId}` +
      `/workbook/worksheets('${encodeURIComponent(sheetName)}')/range(address='${rowRangeAddress}')?$select=values`;

    const rowResp = await fetch(rowUrl, { headers });
    if (!rowResp.ok) throw new Error("Failed to fetch row data");

    const rowJson = await rowResp.json();
    const rowValues = rowJson.values[0];

    // 5. Map to object (preserving your date-serial conversion logic)
    const rowObj = {};
    columns.forEach((colName, index) => {
      let val = rowValues[index];
      if (val === undefined || val === null) val = "";

      if (typeof val === "number" && /date/i.test(colName)) {
        const dateObj = excelSerialDateToJSDate(val);
        if (!isNaN(dateObj.getTime())) {
          val = dateObj.toLocaleDateString("en-US", {
            year: "numeric",
            month: "numeric",
            day: "numeric",
          });
        }
      }
      rowObj[colName] = val;
    });

    return rowObj;
  } catch (error) {
    console.error("Deep Search failed:", error);
    throw error;
  }
}


window.dataStore = window.dataStore || {};
window.dataStore.fileLinks = window.dataStore.fileLinks || {};

window.dataLoader = {
  loadConfig,
  fetchLatestFileMetadata,
  downloadExcelFile,
  parseExcelData,
  processFiles,
  getProductUnitCost,
  findRecordInRemoteSheet,  
  // --- Backward Compatibility Shims ---
  // We export these through dataLoader so existing UI calls (e.g., in uiRenderer.js) don't break.
  getCustomerDetails: window.contactUtils.getCustomerDetails,
  updateContactCompany: window.contactUtils.updateContactCompany,
  getCompanyResearch: window.contactUtils.getCompanyResearch,
  updateCustomerDetails: window.contactUtils.updateCustomerDetails,
  mergeOrganizationContacts: window.contactUtils.mergeOrganizationContacts,
  fetchAndProcessOrgContacts: window.contactUtils.fetchAndProcessOrgContacts
};