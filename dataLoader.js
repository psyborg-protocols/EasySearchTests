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
  // Encode URL components to handle special characters
  const encodedDirectory = encodeURIComponent(directory);
  const encodedPrefix = encodeURIComponent(filenamePrefix);
  
  // This is the endpoint for Business accounts
  const endpoint = `https://graph.microsoft.com/v1.0/me/drive/root:/${encodedDirectory}:/children?$filter=startswith(name,'${encodedPrefix}')&$orderby=lastModifiedDateTime desc&$top=1`;
  
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
 * @returns {Array[]} - The parsed data (dataframe).
 */
function parseExcelData(arrayBuffer, skipRows = 0) {
  try {
    if (!arrayBuffer || arrayBuffer.byteLength === 0) {
      throw new Error("Empty or invalid ArrayBuffer provided");
    }
    
    // Ensure XLSX is loaded
    if (typeof XLSX === 'undefined') {
      throw new Error("XLSX library not loaded");
    }
    
    const data = new Uint8Array(arrayBuffer);
    const workbook = XLSX.read(data, { 
      type: 'array',
      cellDates: true,
      cellFormula: false,
      cellStyles: false
    });
    
    if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
      throw new Error("No sheets found in the workbook");
    }
    
    const firstSheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[firstSheetName];
    
    return XLSX.utils.sheet_to_json(worksheet, { 
      defval: "",
      blankrows: false,
      range: skipRows
    });
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
    console.log("Access token retrieved:", token);

    const config = await loadConfig();
    console.log("Loaded configuration:", config);

    if (!Array.isArray(config) || config.length === 0) {
      console.error("Invalid or empty configuration");
      return;
    }

    for (const item of config) {
      try {
        const { directory, filenamePrefix } = item;
        console.log(`Processing: ${directory}/${filenamePrefix}`);

        const metadataResponse = await fetchLatestFileMetadata(directory, filenamePrefix, token);
        if (!metadataResponse.value || metadataResponse.value.length === 0) {
          console.warn(`No matching file found in '${directory}' for prefix '${filenamePrefix}'`);
          continue;
        }

        const fileMetadata = metadataResponse.value[0];
        console.log("File metadata:", fileMetadata);

        const downloadUrl = fileMetadata['@microsoft.graph.downloadUrl'];
        if (!downloadUrl) {
          console.error(`Download URL not found for ${fileMetadata.name}`);
          continue;
        }

        const excelBuffer = await downloadExcelFile(downloadUrl);
        console.log(`Downloaded Excel file (${fileMetadata.name}) with byteLength:`, excelBuffer.byteLength);

        const dataframe = parseExcelData(excelBuffer);
        console.log(`Parsed dataframe for ${fileMetadata.name} with ${dataframe.length} rows`);

        if (!dataframe || dataframe.length < 2) {
          console.warn(`Invalid or empty dataframe for ${fileMetadata.name}`);
          continue;
        }

        window.dataStore[filenamePrefix] = {
          dataframe,
          metadata: fileMetadata
        };

        // --- STORE IN SESSION STORAGE HERE ---
        if (filenamePrefix === "DB") {
          sessionStorage.setItem("DBData", JSON.stringify(dataframe));
        } else if (filenamePrefix === "orders") {
          sessionStorage.setItem("ordersData", JSON.stringify(dataframe));
        } else if (filenamePrefix === "Pricing") {
          sessionStorage.setItem("PricingData", JSON.stringify(dataframe));

        console.log(`Successfully stored ${fileMetadata.name} in memory.`);
      } catch (error) {
        console.error("Error processing file:", error);
      }
    }
  } catch (error) {
    console.error("Error processing files:", error);
  }
}

// fuzzy search for a customer, will return the list to populate the selection dropdown
async function searchCustomers(query) {
  const ordersData = window.dataStore["orders"]?.dataframe || [];
  if (ordersData.length === 0) return [];

  const fuse = new Fuse(ordersData, {
    keys: ["Customer"],
    threshold: 0.3
  });

  return fuse.search(query).map(result => result.item.Customer);
}

// called after searchCustomers. displays the orders for a single customer
async function getOrderHistory(customerName) {
  const ordersData = window.dataStore["orders"]?.dataframe || [];
  return ordersData.filter(order => order.Customer === customerName);
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