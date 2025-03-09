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
function parseExcelData(arrayBuffer) {
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
      header: 1,
      defval: "",
      blankrows: false
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
 *        - destination (UI element to send the data to)
 *
 * @returns {Promise<object[]>} - Array of results for each config item.
 */
async function processFiles() {
  try {
    // Check if getAccessToken is available
    if (typeof getAccessToken !== 'function') {
      throw new Error("Authentication module not properly loaded - getAccessToken function not found");
    }
    
    const token = await getAccessToken(); // Provided by auth.js
    if (!token) {
      throw new Error("Failed to retrieve access token");
    }
    
    const config = await loadConfig();
    if (!Array.isArray(config) || config.length === 0) {
      throw new Error("Invalid or empty configuration");
    }
    
    const results = [];

    for (const item of config) {
      try {
        const { directory, filenamePrefix, destination } = item;
        
        if (!directory || !filenamePrefix || !destination) {
          console.warn("Invalid config item, missing required properties:", item);
          continue;
        }
        
        console.log(`Processing: ${directory}/${filenamePrefix} -> ${destination}`);
        
        const metadataResponse = await fetchLatestFileMetadata(directory, filenamePrefix, token);
        
        if (!metadataResponse.value || metadataResponse.value.length === 0) {
          console.warn(`No matching file found in '${directory}' with prefix '${filenamePrefix}'`);
          continue;
        }
        
        const fileMetadata = metadataResponse.value[0];
        const downloadUrl = fileMetadata['@microsoft.graph.downloadUrl'];
        
        if (!downloadUrl) {
          console.error(`Download URL not found for file ${fileMetadata.name}`);
          continue;
        }
        
        const excelBuffer = await downloadExcelFile(downloadUrl);
        const dataframe = parseExcelData(excelBuffer);
        
        if (!dataframe || !Array.isArray(dataframe) || dataframe.length < 2) {
          console.warn(`Empty or invalid dataframe for ${fileMetadata.name}`);
          continue;
        }
        
        results.push({
          directory,
          filenamePrefix,
          fileMetadata,
          dataframe,
          destination
        });
        
        console.log(`Successfully processed ${fileMetadata.name}`);
      } catch (itemError) {
        console.error(`Error processing config item:`, item, itemError);
        // Continue to next item instead of failing everything
      }
    }
    
    if (results.length === 0) {
      console.warn("No files were successfully processed");
    }
    
    return results;
  } catch (error) {
    console.error("Error processing files:", error);
    throw error;
  }
}

// Export the functions for external use.
window.dataLoader = {
  loadConfig,
  fetchLatestFileMetadata,
  downloadExcelFile,
  parseExcelData,
  processFiles
};