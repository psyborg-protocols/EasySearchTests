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
 * Parses the Excel file ArrayBuffer using SheetJS (XLSX) and returns the data as an array-of-arrays.
 * The first row is assumed to be the header.
 *
 * @param {ArrayBuffer} arrayBuffer - The ArrayBuffer of the Excel file.
 * @param {number} skipRows - Number of rows to skip at the start of the sheet.
 * @param {Array} columns - Optional array of column names to use as headers.
 * @param {string} sheetName - Optional name of the sheet to parse.
 * @param {string} rangeOverride - Optional range to override the default parsing range.
 * @returns {Array[]} - The parsed data (dataframe).
 */
function parseExcelData(arrayBuffer, skipRows = 0, columns = null, sheetName = null, rangeOverride = null) {
  try {
    if (!arrayBuffer || arrayBuffer.byteLength === 0) {
      throw new Error("Empty or invalid ArrayBuffer provided");
    }

    const data = new Uint8Array(arrayBuffer);
    const workbook = XLSX.read(data, {
      type: 'array',
      cellDates: true,
      cellFormula: false,
      cellStyles: false
    });

    // Determine which sheet to use
    const sheetToUse = sheetName && workbook.Sheets[sheetName]
      ? sheetName
      : workbook.SheetNames[0];

    console.debug("[parseExcelData] Using sheet:", sheetToUse);
    const worksheet = workbook.Sheets[sheetToUse];
    if (!worksheet) {
      throw new Error(`Sheet "${sheetToUse}" not found.`);
    }

    // Set up options for SheetJS
    const options = {
      header: columns || 1,
      defval: "",
      blankrows: false
    };

    if (rangeOverride) {
      options.range = rangeOverride;
    } else if (skipRows > 0) {
      options.range = skipRows;
    }

    const parsedData = XLSX.utils.sheet_to_json(worksheet, options);
    console.debug("[parseExcelData] Parsed data:", parsedData);
    return parsedData;
  } catch (error) {
    console.error("Error parsing Excel data:", error);
    throw error;
  }
}


/**
 * Processes all configuration items:
 *   1. Retrieves the file metadata for each directory/filenamePrefix pair.
 *   2. Downloads and parses the Excel file.
 *   3. Returns an array of result objects that include:
 *        - directory
 *        - filenamePrefix
 *        - fileMetadata (raw metadata from Graph API)
 *        - dataframe (parsed Excel data)
 *
 * @returns {Promise<object[]>} - Array of results for each config item.
 */
async function processFiles() {
  try {
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

    /* ────────────────────────────
       buckets for the pricing merge
    ──────────────────────────── */
    const pricingBuckets = [];          // rows from all price sheets
    const pricingMeta    = {};          // { driveItemId: lastModified }

    for (const item of config) {
      try {
        const { directory, filenamePrefix, dataKey } = item;
        const key        = dataKey || filenamePrefix;
        const storageKey = `${key}Data`;
        const isPricing  = key === "Pricing" || /^Prices\s\d+$/i.test(key);

        /* ── 1) always fetch latest metadata ── */
        const mdResp = await fetchLatestFileMetadata(directory, filenamePrefix, token);
        if (!mdResp.value || mdResp.value.length === 0) {
          console.warn(`No matching file found in '${directory}' for prefix '${filenamePrefix}'`);
          continue;
        }
        const md = mdResp.value[0];

        if (isPricing) {
          // ── 2) always re-download the price sheet ──
          const buf = await downloadExcelFile(md['@microsoft.graph.downloadUrl']);
          const raw = parseExcelData(
                       buf,
                       item.skipRows,
                       item.columns,
                       item.sheetName);
        
          /* Keep only the columns the UI needs */
          const KEEP = [
            "Product", "Units per Box",
            "USER FB", "USER HB", "USER LTB",
            "DISTR FB", "DISTR HB", "DISTR LTB"
          ];
        
          raw.forEach(r => {
            if (!r["Product"]) return;          // ignore spacer / total lines
        
            const slim = {};
            KEEP.forEach(k => {
              if (r[k] !== undefined && r[k] !== "") slim[k] = r[k];
            });
            pricingBuckets.push(slim);
          });
        
          // Record last-modified stamp for later caching
          pricingMeta[md.id] = md.lastModifiedDateTime;
          continue;                             // write merged pricing after the loop
        }

        /* ── 3) non-pricing sheets: download only if changed ── */
        const cached = await idbUtil.getDataset(storageKey);
        if (cached?.metadata?.lastModifiedDateTime === md.lastModifiedDateTime) {
          window.dataStore[key] = cached;
          continue;                   // cache up-to-date, skip download
        }

        const buf       = await downloadExcelFile(md['@microsoft.graph.downloadUrl']);
        const dataframe = parseExcelData(buf, item.skipRows, item.columns, item.sheetName);

        let processed = dataframe;
        if (filenamePrefix === "Sales") {
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
        console.error("Error processing file:", err);
      }
    }

    /* ────────────────────────────
       4) after loop: commit merged pricing
    ──────────────────────────── */
    if (pricingBuckets.length) {
      // dedupe on Product (last-in wins)
      const uniq = {};
      pricingBuckets.forEach(r => uniq[r.Product] = r);
      const merged = Object.values(uniq);

      const stored = { dataframe: merged, metadata: pricingMeta };
      window.dataStore["Pricing"] = stored;
      await idbUtil.setDataset("PricingData", stored);
      console.log(`[Pricing] refreshed – ${merged.length} rows merged from all price sheets.`);
    }

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
    console.log(`[getMatchingProducts] Formatted item:`, formattedItem);
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