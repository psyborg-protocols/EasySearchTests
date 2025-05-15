const DISALLOWED_PRODUCTS = [
  "", "Credit Card Fees", "Cost of Goods Sold", "Freight", "Health Insurance",
  "Misc", "PmntDiscount_Bank Service Charges", "Testing-Bio", "Testing-Endo"
];

/**
 * Loads the configuration JSON file from the same directory.
 * The config file should be an array of objects, each containing:
 *   - directory: The directory path (e.g., "BrandyWine/Datasets")
 *   - filenamePrefix: The file name prefix to filter for (e.g., "Cleaned_Sales_Data")
 */
async function loadConfig() {
  try {
    const response = await fetch('./config.json');
    if (!response.ok) {
      throw new Error(`Failed to load config.json: ${response.status} ${response.statusText}`);
    }
    return response.json();
  } catch (error) {
    console.error("Error loading config:", error);
    throw error;
  }
}

/**
 * Fetches metadata for the most recently modified file within a given directory
 * that starts with the provided filename prefix.
 *
 * @param {string} directory - The directory path in OneDrive.
 * @param {string} filenamePrefix - The prefix to filter filenames.
 * @param {string} token - A valid access token for Microsoft Graph API.
 * @returns {Promise<object>} - The file metadata from Graph API.
 */
async function fetchLatestFileMetadata(directory, filenamePrefix, token) {
  // Replace these with your SharePoint site and drive IDs
  const siteId = "brandywinematerialsllc.sharepoint.com,07a1465e-a31a-4437-aca2-0efe61b7f2c6,4b1abd1c-08c6-4574-b350-654376a1e954";
  const driveId = "b!XkahBxqjN0Ssog7-Ybfyxhy9GkvGCHRFs1BlQ3ah6VTHnmI16yPPQofBa949Ai-j";

  // Encode URL components to handle special characters
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

    if (!response.ok) {
      throw new Error(`Failed to fetch metadata: ${response.status} ${response.statusText}`);
    }

    return response.json();
  } catch (error) {
    console.error(`Error fetching metadata for ${directory} with prefix ${filenamePrefix}:`, error);
    throw error;
  }
}

/**
 * Downloads an Excel file from the provided download URL.
 *
 * @param {string} downloadUrl - The direct download URL for the Excel file.
 * @returns {Promise<ArrayBuffer>} - The ArrayBuffer of the downloaded file.
 */
async function downloadExcelFile(downloadUrl) {
  try {
    const response = await fetch(downloadUrl);
    if (!response.ok) {
      throw new Error(`Failed to download Excel file: ${response.status} ${response.statusText}`);
    }
    return response.arrayBuffer();
  } catch (error) {
    console.error(`Error downloading Excel file from ${downloadUrl}:`, error);
    throw error;
  }
}

/**
 * Parse an Excel sheet and return an array of row-objects.
 *
 * @param {ArrayBuffer} arrayBuffer – raw XLSX file data
 * @param {number}      skipRows    – how many physical rows to skip
 * @param {string[]}    columns     – custom header array (optional)
 * @param {string}      sheetName   – sheet to use (optional)
 * @returns {Object[]}              – parsed rows keyed by your columns
 */
function parseExcelData(arrayBuffer,
  skipRows   = 0,
  columns    = null,
  sheetName  = null) {
try {
if (!arrayBuffer || arrayBuffer.byteLength === 0) {
throw new Error("Empty or invalid ArrayBuffer provided");
}

/* ── 1. read workbook ──────────────────────────────────────────────*/
const wb = XLSX.read(new Uint8Array(arrayBuffer), {
type       : "array",
cellDates  : true,
cellFormula: false,
cellStyles : false
});

/* ── 2. pick sheet ────────────────────────────────────────────────*/
const sheetToUse =
sheetName && wb.Sheets[sheetName] ? sheetName : wb.SheetNames[0];
const ws = wb.Sheets[sheetToUse];
if (!ws) throw new Error(`Sheet "${sheetToUse}" not found.`);

/* ── 3. configure SheetJS options ─────────────────────────────────*/
const opts = {
header   : columns || 1,   // if array → use as virtual header row
defval   : "",
blankrows: false,
raw      : false           // "$166.99" → 166.99  (auto-numeric)
};
if (skipRows > 0) opts.range = skipRows; // numeric index is valid

/* ── 4. parse ─────────────────────────────────────────────────────*/
const parsed = XLSX.utils.sheet_to_json(ws, opts);
console.debug(
`[parseExcelData] ${sheetToUse}: ${parsed.length} rows parsed.`);
return parsed;

} catch (err) {
console.error("Error parsing Excel data:", err);
throw err;
}
}


/**
 * Pulls all workbooks listed in config, honours per-sheet caches,
 * and rebuilds the merged Pricing table only when at least one
 * pricing workbook really changed.
 */
async function processFiles() {
  try {
    /* ── 0. auth & config ─────────────────────────────── */
    const token = await getAccessToken();
    if (!token) { console.error("No MSAL token"); return; }

    const cfg = await loadConfig();
    if (!Array.isArray(cfg) || !cfg.length) {
      console.error("Config file empty or invalid"); return;
    }

    /* ── 1. group config rows that point to the same workbook ─ */
    const byWorkbook = new Map();              // signature → rows[]
    const sigOf = r => `${r.directory}|${r.filenamePrefix}`;
    cfg.forEach(r => (byWorkbook.get(sigOf(r)) ?? byWorkbook.set(sigOf(r), []).get(sigOf(r))).push(r));

    /* ── 2. read the last merged Pricing table (if any) ─────── */
    const cachedPricing = await idbUtil.getDataset("PricingData") || null;
    const pricingMeta = { ...(cachedPricing?.metadata || {}) };   // {fileId: lastModified}
    const mergedPrices = [];              // will hold updated rows
    let   pricingChanged = false;         // trip if ANY workbook updates
    const bufferCache    = new Map();     // fileId → ArrayBuffer
    const ds             = window.dataStore = {};   // local shortcut

    /* ── 3. iterate unique workbooks ─────────────────────────── */
    for (const rows of byWorkbook.values()) {
      const { directory, filenamePrefix } = rows[0];

      // 3-a  lightweight metadata look-up
      const metaResp = await fetchLatestFileMetadata(directory, filenamePrefix, token);
      const md = metaResp.value?.[0];
      if (!md) continue;                            // nothing matched

      const fileId = md.id;
      const lastMod = md.lastModifiedDateTime;

      // 3-b  quick test: is this a Pricing workbook, and is it unchanged?
      const isPricingBook = rows.some(r => {
        const k = r.dataKey || r.filenamePrefix;
        return k === "Pricing" || /^Prices\s\d+/i.test(k);
      });
      if (isPricingBook && cachedPricing && pricingMeta[fileId] === lastMod) {
        // already included in cached merged table → nothing to do
        continue;
      }

      // 3-c  lazy download (only once per file in this run)
      let buf = bufferCache.get(fileId);
      if (!buf) {
        buf = await downloadExcelFile(md['@microsoft.graph.downloadUrl']);
        bufferCache.set(fileId, buf);
      }

      /* 3-d  handle each tab the caller asked for */
      for (const row of rows) {
        const key        = row.dataKey || row.filenamePrefix;
        const storageKey = `${key}Data`;
        const isPricing  = key === "Pricing" || /^Prices\s\d+/i.test(key);

        // non-pricing sheets: honour their own cache
        if (!isPricing) {
          const cached = await idbUtil.getDataset(storageKey);
          if (cached?.metadata?.lastModifiedDateTime === lastMod) {
            ds[key] = cached;                        // reuse
            continue;
          }
        }

        // parse requested worksheet
        const frame = parseExcelData(buf, row.skipRows, row.columns, row.sheetName);

        if (isPricing) {
          pricingChanged = true;
          mergedPrices.push(...slimPriceRows(frame));   // collect for global merge
          pricingMeta[fileId] = lastMod;                // update meta map
          continue;                                     // no per-tab cache needed
        }

        if (key === "PriceRaise") {
          const map = {};
          frame.forEach(r => {
            if (r.Product) map[String(r.Product).trim()] = {
              COO: r.COO || "N/A",
              July9thIncrease: r.July9thIncrease || "N/A"
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
          ds[key] = map;
          await idbUtil.setDataset(storageKey, stored);
          continue;
        }

        // generic sheet (Sales, DB, …)
        const cleaned = key === "Sales"
                        ? filterOutValues(fillDownColumn(frame, "Customer"),
                                          "Product_Service", DISALLOWED_PRODUCTS)
                        : frame;

        const stored = { dataframe: cleaned, metadata: md };
        ds[key] = stored;
        await idbUtil.setDataset(storageKey, stored);
      }
    }

    /* ── 4. assemble or reuse merged Pricing table ───────────── */
    if (pricingChanged) {
      const merged = Object.values(mergedPrices.reduce((acc, r) => {
        acc[r.Product] = r; return acc;              // de-dupe by Product
      }, {}));
      const stored = { dataframe: merged, metadata: pricingMeta };
      ds["Pricing"] = stored;
      await idbUtil.setDataset("PricingData", stored);
      console.log(`[Pricing] refreshed – ${merged.length} rows merged.`);
    } else if (cachedPricing) {
      ds["Pricing"] = cachedPricing;                 // still valid
      console.log("[Pricing] cache valid – no parsing needed.");
    }

    /* ── 5. done ─────────────────────────────────────────────── */
    document.dispatchEvent(new Event("reports-ready"));

  } catch (err) {
    console.error("processFiles() failed:", err);
  }
}

/* helper: convert raw sheet rows → trimmed pricing rows */
function slimPriceRows(frame) {
  const KEEP = [
    "Product", "Units per Box",
    "USER FB", "USER HB", "USER LTB",
    "DISTR FB", "DISTR HB", "DISTR LTB"
  ];
  return frame.flatMap(r => {
    if (!r.Product) return [];
    const slim = {};
    KEEP.forEach(k => {
      if (r[k] !== undefined && r[k] !== "") {
        slim[k] = (k === "Product" || k === "Units per Box")
                  ? r[k]
                  : toNumber(r[k]);
      }
    });
    return [slim];
  });
}



/**
 * Normalizes the replacements mapping from the "Equivalents (BT Master 2025)" sheet.
 * For each row, it aggregates:
 *   - The BM part (if it exists) as the first element.
 *   - The equivalent parts from other columns (as an array of 0, one, or more parts).
 * Then, it maps every found part (BM or equivalent) to the full array of replacements.
 *
 * @param {Array<Object>} data - The parsed sheet data.
 * @returns {Object} - A mapping where keys are parts and values are arrays of valid replacements.
 */
function normalizeEquivalents(data) {
  const mapping = {};
  for (const row of data) {
    const bmPart = String(row["BM Part #"] || "").trim(); // BM Part
    let equivalents = [];
    // Process the equivalent columns
    for (const col of ["Nordson EFD Part #", "Medmix Sulzer Part #"]) {
      const raw = String(row[col] || "");
      const parts = raw.split(",").map(val => val.trim()).filter(Boolean);
      equivalents = equivalents.concat(parts);
    }
    // Build the replacement array (BM part always first if available)
    let replacements = [];
    if (bmPart) {
      replacements.push(bmPart);
    }
    replacements = replacements.concat(equivalents);
    // Only map rows that have at least one replacement
    if (replacements.length > 0) {
      // For every part in the replacement list, map it to the full replacement array
      for (const part of replacements) {
        mapping[part] = replacements;
      }
    }
  }
  return mapping;
}


// fuzzy search for a customer, will return the list to populate the selection dropdown
async function searchCustomers(query) {
  const SalesData = window.dataStore["Sales"]?.dataframe || [];
  if (SalesData.length === 0) return [];

  const fuse = new Fuse(SalesData, {
    keys: ["Customer"],
    threshold: 0.3
  });

  return fuse.search(query).map(result => result.item.Customer);
}

// called after searchCustomers. displays the orders for a single customer
async function getOrderHistory(customerName) {
  const SalesData = window.dataStore["Sales"]?.dataframe || [];
  return SalesData.filter(sale => sale.Customer === customerName);
}

// fuzzy search for products - this will be used to populate the productTable
async function getMatchingProducts(query) {
  const inventoryData = window.dataStore["DB"]?.dataframe || [];
  
  if (inventoryData.length === 0) {
    console.warn("[getMatchingProducts] Warning: Inventory data not loaded yet.");
    return [];
  }

  console.log(`[getMatchingProducts] Inventory data available. Total items: ${inventoryData.length}`);

  const fuse = new Fuse(inventoryData, {
    keys: ["PartNumber", "Description"],
    threshold: 0.4
  });

  const results = fuse.search(query);

  console.log(`[getMatchingProducts] Search results count: ${results.length}`);

  return results.map(result => {
    const item = result.item;
    const qtyAvailable = parseFloat(item["QtyOnHand"]) - parseFloat(item["QtyCommitted"]);
    const formattedItem = {
      PartNumber: item["PartNumber"],
      Description: item["Description"],
      QtyAvailable: qtyAvailable,
      UnitCost: parseFloat(item["UnitCost"]).toFixed(2)
    };
    return formattedItem;
  });
}

/**
 * Fills down missing values in a specified column by copying the last non-empty value.
 * This is useful for handling merged cells that appear as empty in subsequent rows.
 *
 * @param {Array<Object>} data - The array of data objects (rows) parsed from the Excel file.
 * @param {string} column - The column name where missing values should be filled down.
 * @returns {Array<Object>} A new array of data objects with the column filled down.
 */
function fillDownColumn(data, column) {
  let lastValue = "";
  // Return a new array while processing each row
  return data.map(row => {
    // Check if the current row has a non-empty value for the column
    if (row[column] && row[column].toString().trim() !== "") {
      lastValue = row[column];
    } else {
      // Create a new row object to avoid mutating the original, if needed
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
  if (typeof val === "string") {
    val = val.replace(/[$,]/g, "").trim();
  }
  const num = Number(val);
  return isFinite(num) ? num : null;  // null is better than NaN or undefined later
}

// Global storage for parsed data
window.dataStore = {}; 
// Export the functions for external use.
window.dataLoader = {
  loadConfig,
  fetchLatestFileMetadata,
  downloadExcelFile,
  parseExcelData,
  processFiles
};