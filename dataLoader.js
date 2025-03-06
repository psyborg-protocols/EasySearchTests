/**
 * Loads the configuration JSON file from the same directory.
 * The config file should be an array of objects, each containing:
 *   - directory: The directory path (e.g., "BrandyWine/Datasets")
 *   - filenamePrefix: The file name prefix to filter for (e.g., "Cleaned_Sales_Data")
 */
async function loadConfig() {
  const response = await fetch('./config.json');
  if (!response.ok) {
    throw new Error('Failed to load config.json');
  }
  return response.json();
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
  // TODO: this is the endpoint for Business accounts: const endpoint = `https://graph.microsoft.com/v1.0/me/drive/root:/${directory}:/children?$filter=startswith(name,'${filenamePrefix}')&$orderby=lastModifiedDateTime desc&$top=1`;
  const endpoint = `https://graph.microsoft.com/v1.0/me/drive/root/children?$filter=startswith(name,'${filenamePrefix}')&$orderby=lastModifiedDateTime desc&$top=1`;
  const response = await fetch(endpoint, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch metadata for ${directory} with prefix ${filenamePrefix}`);
  }
  return response.json();
}

/**
 * Downloads an Excel file from the provided download URL.
 *
 * @param {string} downloadUrl - The direct download URL for the Excel file.
 * @returns {Promise<ArrayBuffer>} - The ArrayBuffer of the downloaded file.
 */
async function downloadExcelFile(downloadUrl) {
  const response = await fetch(downloadUrl);
  if (!response.ok) {
    throw new Error(`Failed to download Excel file from ${downloadUrl}`);
  }
  return response.arrayBuffer();
}

/**
 * Parses the Excel file ArrayBuffer using SheetJS (XLSX) and returns the data as an array-of-arrays.
 * The first row is assumed to be the header.
 *
 * @param {ArrayBuffer} arrayBuffer - The ArrayBuffer of the Excel file.
 * @returns {Array[]} - The parsed data (dataframe).
 */
function parseExcelData(arrayBuffer) {
  const data = new Uint8Array(arrayBuffer);
  const workbook = XLSX.read(data, { type: 'array' });
  const firstSheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[firstSheetName];
  return XLSX.utils.sheet_to_json(worksheet, { header: 1 });
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
    const token = await getAccessToken(); // Provided by auth.js
    const config = await loadConfig();
    const results = [];

    for (const item of config) {
      const { directory, filenamePrefix } = item;
      const metadataResponse = await fetchLatestFileMetadata(directory, filenamePrefix, token);
      
      if (metadataResponse.value && metadataResponse.value.length > 0) {
        const fileMetadata = metadataResponse.value[0];
        const downloadUrl = fileMetadata['@microsoft.graph.downloadUrl'];
        
        if (!downloadUrl) {
          console.error(`Download URL not found for file ${fileMetadata.name}`);
          continue;
        }
        
        const excelBuffer = await downloadExcelFile(downloadUrl);
        const dataframe = parseExcelData(excelBuffer);
        
        results.push({
          directory,
          filenamePrefix,
          fileMetadata,
          dataframe
        });
      } else {
        console.warn(`No matching file found in '${directory}' with prefix '${filenamePrefix}'`);
      }
    }
    
    return results;
  } catch (error) {
    console.error("Error processing files:", error);
    throw error;
  }
}

// Export the functions for external use.
window.ExcelFileModule = {
  loadConfig,
  fetchLatestFileMetadata,
  downloadExcelFile,
  parseExcelData,
  processFiles
};
