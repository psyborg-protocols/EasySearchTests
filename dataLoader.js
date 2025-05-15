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
 * Main loader – pulls every workbook listed in config, obeys cache,
 * and downloads each workbook only once per page-refresh.
 */
async function processFiles() {
  try {
    /* ───────── 0. auth & config ──────────────────────────── */
    const token = await getAccessToken();
    if (!token) {
      console.error("Failed to retrieve access token");
      return;
    }

    const config = await loadConfig();
    if (!Array.isArray(config) || config.length === 0) {
      console.error("Invalid or empty configuration");
      return;
    }

    /* ───────── helpers for this run ──────────────────────── */
    const bufferCache = new Map();              // driveItem.id → ArrayBuffer
    const grouped     = new Map();              // dir|prefix   → [config rows]

    // group identical workbooks so metadata + download happen once
    for (const c of config) {
      const sig = `${c.directory}|${c.filenamePrefix}`;
      if (!grouped.has(sig)) grouped.set(sig, []);
      grouped.get(sig).push(c);
    }

    /* ───────── buckets for merged price sheets ───────────── */
    const pricingBuckets = [];                  // rows from all price sheets
    const pricingMeta    = {};                  // { driveItemId: lastModified }

    /* ───────── 1. loop over unique workbooks ─────────────── */
    for (const bucket of grouped.values()) {
      const { directory, filenamePrefix } = bucket[0];

      /* 1-a  fetch latest metadata once */
      const mdResp = await fetchLatestFileMetadata(directory, filenamePrefix, token);
      if (!mdResp.value || mdResp.value.length === 0) {
        console.warn(`No matching file found in '${directory}' for prefix '${filenamePrefix}'`);
        continue;
      }
      const md = mdResp.value[0];

      /* 1-b  download (or reuse) workbook */
      let buf = bufferCache.get(md.id);
      if (!buf) {
        buf = await downloadExcelFile(md['@microsoft.graph.downloadUrl']);
        bufferCache.set(md.id, buf);
      }

      /* 1-c  iterate the sibling config rows (different sheetNames, etc.) */
      for (const item of bucket) {
        try {
          const { dataKey, skipRows, columns, sheetName } = item;
          const key        = dataKey || item.filenamePrefix;
          const storageKey = `${key}Data`;
          const isPricing  = key === "Pricing" || /^Prices\s\d+$/i.test(key);

          /* 2. unified cache guard – runs for *all* sheet types */
          const cached = await idbUtil.getDataset(storageKey);
          if (cached?.metadata?.lastModifiedDateTime === md.lastModifiedDateTime) {
            window.dataStore[key] = cached;
            if (isPricing) pricingBuckets.push(...cached.dataframe);
            continue;                             // up-to-date
          }

          /* 3. parse the requested sheet/tab */
          const dataframe = parseExcelData(buf, skipRows, columns, sheetName);

          /* 3-a  pricing workbook  ----------------------------------- */
          if (isPricing) {
            const KEEP = [
              "Product", "Units per Box",
              "USER FB", "USER HB", "USER LTB",
              "DISTR FB", "DISTR HB", "DISTR LTB"
            ];

            dataframe.forEach(r => {
              if (!r["Product"]) return;          // skip spacer rows

              const slim = {};
              KEEP.forEach(k => {
                if (r[k] !== undefined && r[k] !== "") {
                  slim[k] = (k === "Product" || k === "Units per Box")
                           ? r[k]
                           : toNumber(r[k]);      // price cells → numbers
                }
              });
              pricingBuckets.push(slim);
            });

            pricingMeta[md.id] = md.lastModifiedDateTime;
            continue;                             // store merged after loop
          }

          /* 3-b  price-raise sheet  ---------------------------------- */
          if (key === "PriceRaise") {
            const map = {};
            dataframe.forEach(r => {
              if (!r.Product) return;
              map[String(r.Product).trim()] = {
                COO            : r.COO || "N/A",
                July9thIncrease: r.July9thIncrease || "N/A"
              };
            });

            const stored = { dataframe: map, metadata: md };
            window.dataStore["PriceRaise"] = stored;
            await idbUtil.setDataset("PriceRaiseData", stored);
            console.log(`[PriceRaise] ${Object.keys(map).length} rows loaded.`);
            continue;
          }

          /* 3-c  other sheets (Sales, DB, Equivalents, …) ------------- */
          let processed = dataframe;
          if (item.filenamePrefix === "Sales") {
            processed = fillDownColumn(dataframe, "Customer");
            processed = filterOutValues(processed, "Product_Service", DISALLOWED_PRODUCTS);
          }

          if (key === "Equivalents") {
            const map = normalizeEquivalents(processed);
            const stored = { dataframe: map, metadata: md };
            window.dataStore["Equivalents"] = map;
            await idbUtil.setDataset(storageKey, stored);
            continue;
          }

          const stored = { dataframe: processed, metadata: md };
          window.dataStore[key] = stored;
          await idbUtil.setDataset(storageKey, stored);
          console.log(`Stored ${md.name} in IndexedDB under key ${storageKey}.`);

        } catch (err) {
          console.error("Error processing sheet:", err);
        }
      }
    }

    /* ───────── 4. commit merged price sheets ─────────────────────── */
    if (pricingBuckets.length) {
      const uniq = {};
      pricingBuckets.forEach(r => uniq[r.Product] = r);   // dedupe by Product
      const merged = Object.values(uniq);

      const stored = { dataframe: merged, metadata: pricingMeta };
      window.dataStore["Pricing"] = stored;
      await idbUtil.setDataset("PricingData", stored);
      console.log(`[Pricing] refreshed – ${merged.length} rows merged from all price sheets.`);
    }

    /* ───────── 5. signal ready ───────────────────────────────────── */
    window.reportsReady = true;
    document.dispatchEvent(new Event('reports-ready'));

  } catch (err) {
    console.error("Error processing files:", err);
  }
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