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

    console.debug("[parseExcelData] Starting to parse Excel data.");
    const data = new Uint8Array(arrayBuffer);
    const workbook = XLSX.read(data, {
      type: 'array',
      cellDates: true,
      cellFormula: false,
      cellStyles: false
    });

    console.debug("[parseExcelData] Workbook loaded. SheetNames:", workbook.SheetNames);

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
      console.debug("[parseExcelData] Using range override:", rangeOverride);
    } else if (skipRows > 0) {
      options.range = skipRows;
      console.debug("[parseExcelData] Skipping first", skipRows, "rows.");
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

    for (const item of config) {
      try {
        const { directory, filenamePrefix } = item;
        const storageKey = (filenamePrefix === "DB") ? "DBData"
                : (filenamePrefix === "Sales") ? "SalesData"
                : (filenamePrefix === "Pricing") ? "PricingData"
                : (filenamePrefix === "Quote Maker and Calculator") ? "EquivalentsData"
                : null;
        if (!storageKey) continue;

        // Fetch latest metadata from SharePoint
        const metadataResponse = await fetchLatestFileMetadata(directory, filenamePrefix, token);
        if (!metadataResponse.value || metadataResponse.value.length === 0) {
          console.warn(`No matching file found in '${directory}' for prefix '${filenamePrefix}'`);
          continue;
        }
        const latestMetadata = metadataResponse.value[0];

        // Check the cache
        const cachedData = await idbUtil.getDataset(storageKey);
        if (cachedData &&
            cachedData.metadata &&
            cachedData.metadata.lastModifiedDateTime === latestMetadata.lastModifiedDateTime) {
          console.log(`Cache for ${filenamePrefix} is up-to-date. Using cached data.`);
          window.dataStore[filenamePrefix] = cachedData;
          continue; // Skip re-downloading
        }

        // Download and process the file if cache is missing or outdated
        const downloadUrl = latestMetadata['@microsoft.graph.downloadUrl'];
        if (!downloadUrl) {
          console.error(`Download URL not found for ${latestMetadata.name}`);
          continue;
        }
        const excelBuffer = await downloadExcelFile(downloadUrl);
        const dataframe = parseExcelData(excelBuffer, item.skipRows, item.columns, item.sheetName, item.range);
        if (!dataframe || dataframe.length < 2) {
          console.warn(`Invalid or empty dataframe for ${latestMetadata.name}`);
          continue;
        }

        let processedData = dataframe;
        if (filenamePrefix === "Sales") {
          processedData = fillDownColumn(dataframe, "Customer");
          processedData = filterOutValues(processedData, "Product_Service", DISALLOWED_PRODUCTS);
        }

        if (filenamePrefix === "Quote Maker and Calculator") {
          const equivalentsMap = normalizeGenericMatches(dataframe);        
          // Build the object containing both data and metadata
          const storedData = { dataframe: equivalentsMap, metadata: latestMetadata };
        
          // Save to window.dataStore
          window.dataStore["Equivalents"] = equivalentsMap;
        
          // Cache it in IndexedDB
          await idbUtil.setDataset(storageKey, storedData);
          console.log("[Equivalents] Loaded, normalized, and cached brand → generic mapping.");
          continue;  // Now we break out after caching
        }

        // Build the object containing both data and metadata
        const storedData = { dataframe: processedData, metadata: latestMetadata };
        window.dataStore[filenamePrefix] = storedData;
        await idbUtil.setDataset(storageKey, storedData);
        console.log(`Successfully stored ${latestMetadata.name} in IndexedDB under key ${storageKey}.`);

      } catch (error) {
        console.error("Error processing file:", error);
      }
    }
  } catch (error) {
    console.error("Error processing files:", error);
  }
}

/// Normalizes the generic matches from the "Quote Maker and Calculator" sheet
function normalizeGenericMatches(data) {
  const map = {};
  for (const row of data) {
    const generic = row["BT Part #"]?.trim();
    if (!generic) continue;

    for (const col of ["Nordson EFD Part #", "Medmix Sulzer Part #"]) {
      const values = (row[col] || "").split(",").map(val => val.trim()).filter(Boolean);
      for (const branded of values) {
        map[branded] = generic;
      }
    }
  }
  return map;
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
  console.log(`[getMatchingProducts] Query initiated: "${query}"`);

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
  results.forEach((result, index) => {
    console.log(`[getMatchingProducts] Result #${index + 1}:`, result.item);
  });

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