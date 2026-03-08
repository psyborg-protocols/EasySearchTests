// ---------------------------------------------
// utils/spUtils.js
// Handles Microsoft Graph API interactions for SharePoint (Files, Excel, Lists).
// ---------------------------------------------

/**
 * Fetches metadata for the most recently modified file within a given directory
 * that starts with the provided filename prefix.
 */
async function fetchLatestFileMetadata(directory, filenamePrefix, token) {
    // Falls back to BW_CONFIG injected by dataLoader, otherwise defaults
    const siteId = (window.BW_CONFIG && window.BW_CONFIG.BW_SITE_ID) 
        ? window.BW_CONFIG.BW_SITE_ID 
        : "brandywinematerialsllc.sharepoint.com,07a1465e-a31a-4437-aca2-0efe61b7f2c6,4b1abd1c-08c6-4574-b350-654376a1e954";
        
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
   */
  function excelSerialDateToJSDate(serial) {
    // Math.round fixes minor floating point errors common in Excel dates
    return new Date(Math.round((serial - 25569) * 864e5));
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
   * Fetches only the last N rows of an Excel file via Graph API.
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
    const endColLetter = getColumnLetter(totalCols - 1);
  
    // 3. Fetch the Data Range (Requesting VALUES to get raw data/serial dates)
    const fetchAddress = `A${startRow}:${endColLetter}${totalRows}`;
    console.log(`[Partial Load] Fetching range ${fetchAddress} for ${sheetName} (Last ${nRows} rows)`);
  
    const dataResp = await fetch(
      `${workbookBase}/worksheets('${encodeURIComponent(sheetName)}')/range(address='${fetchAddress}')?$select=values`,
      { headers }
    );
  
    if (!dataResp.ok) throw new Error(`Failed to fetch range: ${dataResp.statusText}`);
    const dataJson = await dataResp.json();
    const rows = dataJson.values;
  
    // 4. Map Array-of-Arrays to Array-of-Objects using specific Columns
    return rows.map(rowValues => {
      const rowObj = {};
      columns.forEach((colName, index) => {
        let val = rowValues[index];
        if (val === undefined || val === null) val = "";
  
        // --- DATE FIX: Convert serial numbers to Date Strings ---
        if (typeof val === 'number' && /date/i.test(colName)) {
          const dateObj = excelSerialDateToJSDate(val);
          if (!isNaN(dateObj.getTime())) {
            // Use UTC methods to prevent timezone shifting
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
   * DEEP SEARCH: Finds a specific value in a remote Excel sheet and returns the full row.
   * Used for finding old Orders/Samples not in the "Recent" cache.
   */
  async function findRecordInRemoteSheet(dataKey, searchColName, searchValue) {
    try {
      // Defer to dataLoader for config reading
      const configList = await window.dataLoader.loadConfig();
      const config = configList.find(
        (c) => c.dataKey === dataKey || c.filenamePrefix === dataKey
      );
  
      if (!config) throw new Error(`Configuration not found for dataKey: ${dataKey}`);
  
      // Get file metadata from store
      const storedData = window.dataStore[dataKey];
      if (!storedData || !storedData.metadata) {
        throw new Error(`Metadata missing for ${dataKey}. Ensure app is fully loaded.`);
      }
  
      const driveId = storedData.metadata.parentReference.driveId;
      const itemId = storedData.metadata.id;
      const sheetName = config.sheetName;
      const columns = config.columns;
  
      const colIndex = columns.indexOf(searchColName);
      if (colIndex === -1) {
        throw new Error(`Column "${searchColName}" not found in config for ${dataKey}`);
      }
  
      const colLetter = getColumnLetter(colIndex);
      const token = await getAccessToken(); // Global from auth.js
      const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  
      console.log(`[Deep Search] Determining bounds for ${dataKey} (Sheet: ${sheetName})...`);
  
      // 1. Get UsedRange to define boundaries
      const usedRangeUrl = `https://graph.microsoft.com/v1.0/drives/${driveId}/items/${itemId}/workbook/worksheets('${encodeURIComponent(sheetName)}')/usedRange?$select=address`;
      const usedRangeResp = await fetch(usedRangeUrl, { headers });
      if (!usedRangeResp.ok) throw new Error(`Failed to get used range: ${usedRangeResp.statusText}`);
      
      const usedRangeData = await usedRangeResp.json();
      const match = usedRangeData.address.match(/!([A-Za-z]+)(\d+):([A-Za-z]+)(\d+)/);
      if (!match) throw new Error(`Could not parse usedRange address: ${usedRangeData.address}`);
  
      const usedStartRow = parseInt(match[2], 10);
      const usedEndRow = parseInt(match[4], 10);
      const dataStartRow = Math.max(usedStartRow + 1, 2);
  
      if (dataStartRow > usedEndRow) return null;
  
      const searchAddress = `${colLetter}${dataStartRow}:${colLetter}${usedEndRow}`;
      console.log(`[Deep Search] Fetching column range ${searchAddress} to search for "${searchValue}"...`);
  
      // 2. Fetch the column range values
      const colRangeUrl = `https://graph.microsoft.com/v1.0/drives/${driveId}/items/${itemId}/workbook/worksheets('${encodeURIComponent(sheetName)}')/range(address='${searchAddress}')?$select=values`;
      const colResp = await fetch(colRangeUrl, { headers });
      if (!colResp.ok) throw new Error(`Failed to fetch column range ${searchAddress}: ${colResp.statusText}`);
  
      const colJson = await colResp.json();
      const colValues = colJson.values || [];
  
      // 3. Search locally in JS
      const normalizedTarget = String(searchValue).trim().toLowerCase();
      let foundRowIndex = null;
  
      for (let i = 0; i < colValues.length; i++) {
        const cellVal = colValues[i][0];
        if (cellVal === undefined || cellVal === null) continue;
  
        const normalizedCell = String(cellVal).trim().toLowerCase();
        if (normalizedCell === normalizedTarget) {
          foundRowIndex = dataStartRow + i;
          break;
        }
      }
  
      if (foundRowIndex == null) return null;
  
      console.log(`[Deep Search] Fetching full row ${foundRowIndex} for "${searchValue}"...`);
  
      // 4. Fetch that specific row
      const lastColLetter = getColumnLetter(columns.length - 1);
      const rowRangeAddress = `A${foundRowIndex}:${lastColLetter}${foundRowIndex}`;
      const rowUrl = `https://graph.microsoft.com/v1.0/drives/${driveId}/items/${itemId}/workbook/worksheets('${encodeURIComponent(sheetName)}')/range(address='${rowRangeAddress}')?$select=values`;
  
      const rowResp = await fetch(rowUrl, { headers });
      if (!rowResp.ok) throw new Error("Failed to fetch row data");
  
      const rowJson = await rowResp.json();
      const rowValues = rowJson.values[0];
  
      // 5. Map to object
      const rowObj = {};
      columns.forEach((colName, index) => {
        let val = rowValues[index];
        if (val === undefined || val === null) val = "";
  
        if (typeof val === "number" && /date/i.test(colName)) {
          const dateObj = excelSerialDateToJSDate(val);
          if (!isNaN(dateObj.getTime())) {
            val = dateObj.toLocaleDateString("en-US", { year: "numeric", month: "numeric", day: "numeric" });
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

  // ==========================================
  // SHAREPOINT LIST FUNCTIONS
  // ==========================================
  
  /**
   * Fetches metadata for a SharePoint List (used for caching logic)
   */
  async function fetchListMetadata(siteId, listId, token) {
    const endpoint = `https://graph.microsoft.com/v1.0/sites/${siteId}/lists/${listId}?$select=lastModifiedDateTime,webUrl`;
    const response = await fetch(endpoint, {
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
    });
    if (!response.ok) throw new Error(`Failed to fetch list metadata: ${response.statusText}`);
    return response.json();
  }
  
  /**
   * Fetches all items from a SharePoint List, handling pagination
   */
  async function fetchListItems(siteId, listId, columns, token) {
    let items = [];
    let nextUrl = `https://graph.microsoft.com/v1.0/sites/${siteId}/lists/${listId}/items?$expand=fields`;
  
    while (nextUrl) {
      const response = await fetch(nextUrl, {
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
      });
      
      if (!response.ok) throw new Error(`Failed to fetch list items: ${response.statusText}`);
      const data = await response.json();
  
      const mapped = data.value.map(item => {
        const rowObj = {};
        const fields = item.fields || {};
        
        // If specific columns are requested, map only those. Otherwise, grab everything.
        if (columns && columns.length > 0) {
          columns.forEach(col => {
            rowObj[col] = fields[col] !== undefined ? fields[col] : "";
          });
        } else {
          Object.assign(rowObj, fields);
        }
        return rowObj;
      });
  
      items = items.concat(mapped);
      nextUrl = data['@odata.nextLink'] || null; // Handle pagination
    }
    
    console.debug(`[fetchListItems] Fetched ${items.length} items from list ${listId}`);
    return items;
  }
  
  /**
   * Generic Graph API Request
   */
  async function graphRequest(url, method = "GET", body = null, token) {
    const headers = {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/json',
    };
    if (body != null) headers['Content-Type'] = 'application/json';

    const res = await fetch(url, {
      method,
      headers,
      body: body != null ? JSON.stringify(body) : undefined
    });

    if (res.status === 410) {
      throw new Error("DELTA_EXPIRED");
    }
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`[Graph] ${res.status} ${res.statusText} :: ${text}`);
    }
    
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  }

  /**
   * Fetches delta changes for a SharePoint list.
   */
  async function fetchListDelta(siteId, listId, currentDeltaLink, token) {
    let nextUrl = currentDeltaLink || `https://graph.microsoft.com/v1.0/sites/${siteId}/lists/${listId}/items/delta?expand=fields`;
    let changes = [];
    let newDeltaLink = null;
    let hasMore = true;

    while (hasMore) {
      const data = await graphRequest(nextUrl, "GET", null, token);
      if (!data) break;
      
      changes.push(...(data.value || []));

      if (data['@odata.deltaLink']) {
        newDeltaLink = data['@odata.deltaLink'];
        hasMore = false;
      } else if (data['@odata.nextLink']) {
        nextUrl = data['@odata.nextLink'];
      } else {
        hasMore = false;
      }
    }

    return { changes, deltaLink: newDeltaLink };
  }

  /**
   * Executes a Graph API batch request.
   */
  async function executeGraphBatch(requests, token) {
    const response = await fetch("https://graph.microsoft.com/v1.0/$batch", {
      method: "POST",
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ requests })
    });
    if (!response.ok) {
      throw new Error(`Batch request failed: ${response.statusText}`);
    }
    return await response.json();
  }

  // Attach to window
  window.spUtils = {
    fetchLatestFileMetadata,
    downloadExcelFile,
    parseExcelData,
    excelSerialDateToJSDate,
    getColumnLetter,
    fetchLastNRows,
    findRecordInRemoteSheet,
    fetchListMetadata,
    fetchListItems,
    graphRequest,
    fetchListDelta,
    executeGraphBatch
  };