// --- AWS API Endpoint ---
const apiUrl = 'https://0bzlvszjzl.execute-api.us-east-1.amazonaws.com';

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
    return response.json();
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
              // Convert to "MM/DD/YYYY" format (or your preferred locale)
              val = dateObj.toLocaleDateString("en-US", {
                  year: 'numeric',
                  month: 'numeric',
                  day: 'numeric'
              });
          }
      }

      rowObj[colName] = val;
    });
    return rowObj;
  });
}

/**
 * Fetches organizational contacts using a delta query for efficiency.
 */
async function fetchAndProcessOrgContacts(token) {
    let cachedContactsMap = window.dataStore.OrgContacts || new Map();
    const metadata = await idbUtil.getDataset("OrgContactsMetadata") || {};
    let nextLink = metadata.deltaLink;

    if (nextLink) {
        console.log("Found deltaLink. Fetching changes for organizational contacts...");
    } else {
        console.log("No deltaLink found. Performing full sync for organizational contacts...");
        nextLink = 'https://graph.microsoft.com/v1.0/contacts/delta?$select=displayName,companyName,jobTitle,mail';
    }

    try {
        let changes = [];
        while (nextLink) {
            const response = await fetch(nextLink, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!response.ok) throw new Error(`Graph API request failed: ${response.statusText}`);
            const data = await response.json();
            changes = changes.concat(data.value);
            
            if (data['@odata.deltaLink']) {
                metadata.deltaLink = data['@odata.deltaLink'];
                nextLink = null;
            } else {
                nextLink = data['@odata.nextLink'];
            }
        }
        
        console.log(`Successfully fetched ${changes.length} changes for contacts.`);

        if (changes.length > 0) {
            for (const contact of changes) {
                const company = (contact.companyName || 'Unknown').trim().toLowerCase();
                
                if (contact['@removed']) {
                    if (cachedContactsMap.has(company)) {
                        const companyContacts = cachedContactsMap.get(company).filter(c => c.id !== contact.id);
                        if (companyContacts.length > 0) {
                            cachedContactsMap.set(company, companyContacts);
                        } else {
                            cachedContactsMap.delete(company);
                        }
                    }
                } else {
                    const newContact = {
                        id: contact.id, 
                        Name: contact.displayName,
                        Title: contact.jobTitle,
                        Email: contact.mail
                    };
                    if (!cachedContactsMap.has(company)) {
                        cachedContactsMap.set(company, []);
                    }
                    const existingContacts = cachedContactsMap.get(company);
                    const index = existingContacts.findIndex(c => c.id === newContact.id);
                    if (index > -1) {
                        existingContacts[index] = newContact;
                    } else {
                        existingContacts.push(newContact);
                    }
                }
            }
            console.log("Applied changes to in-memory contact list.");
        }
        
        await idbUtil.setDataset("OrgContactsData", Object.fromEntries(cachedContactsMap));
        await idbUtil.setDataset("OrgContactsMetadata", metadata);

        return cachedContactsMap;

  } catch (error) {
    console.error("Error fetching or processing organizational contacts:", error);
    if (metadata.deltaLink) {
        metadata.deltaLink = null;
        await idbUtil.setDataset("OrgContactsMetadata", metadata);
        console.warn("DeltaLink expired; cleared to force full sync.");
    }
    return cachedContactsMap;
  }
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
          const map = normaliseCompanyInfo(frame);
          const stored = { dataframe: map, metadata: md };
          ds[key] = stored;
          await idbUtil.setDataset(storageKey, stored);
          console.log(`[CompanyInfo] ${Object.keys(map).length} companies loaded with core info.`);
          continue;
        }
        
        const cleaned = key === "Sales" ? filterOutValues(fillDownColumn(frame, "Customer"), "Product_Service", DISALLOWED_PRODUCTS) : frame;
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

    ds["OrgContacts"] = await fetchAndProcessOrgContacts(token);
    
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

function normaliseCompanyInfo(frame) {
    const map = {};
    for (const row of frame) {
        const company = String(row.Company || "").trim().replace(/\s+/g, " ").toLowerCase();
        if (!company) continue;

        // We only map the fields we care about, ignoring sales, contacts, etc.
        map[company] = {
            location: row.Location || "",
            business: row.Business || "",
            type: row.Type || "",
            remarks: row.Remarks || "",
            website: row.Website || ""
        };
    }
    return map;
}

function getCustomerDetails(company) {
    const key = company.trim().replace(/\s+/g, " ").toLowerCase();
    // Read from the new, leaner data store key
    return (window.dataStore.CompanyInfo?.dataframe || {})[key] || null;
}


/**
 * Calls the AWS Lambda endpoint to update a contact's company name.
 */
async function updateContactCompany(email, newCompanyName) {
  try {
    const accessToken = await getApiAccessToken();

    const payload = {
      action: 'updateCompany',
      email: email,
      companyName: newCompanyName
    };

    const contactUrl = `${apiUrl}/updateContact`;
    
    const response = await fetch(contactUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API Error: ${response.status} - ${errorText}`);
    }

    const result = await response.text();
    console.log('Successfully sent update request:', result);
    return result;

  } catch (error) {
    console.error('Error in updateContactCompany:', error);
    throw error;
  }
}

/**
 * Gets structured company information from the backend research agent.
 */
async function getCompanyResearch(companyName) {
  const llmProxyUrl = `${apiUrl}/llm-proxy`;

  try {
    const accessToken = await getLLMAccessToken(); // from auth.js

    const payload = {
      action: 'llmProxy',
      companyName: companyName
    };

    const response = await fetch(llmProxyUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Company research failed: ${errorText}`);
    }

    const { model_data, citations } = await response.json();

    let note = "These results are retrieved by Perplexity AI and could contain errors.";

    const modelWebsite = model_data.website;
    const citationUrls = (citations || []).map(citation => citation.url);
    const isUrlVerified = citationUrls.includes(modelWebsite);

    if (!isUrlVerified) {
      note = "Unable to verify URL. " + note;
    }

    return {
      ...model_data,
      note: note
    };


  } catch (error) {
    console.error('Error getting company research:', error);
    throw error;
  }
}

/**
 * Updates a customer's details in the in-memory dataStore and attempts a write-back.
 */
async function updateCustomerDetails(customerName, updatedDetails) {
    const key = customerName.trim().replace(/\s+/g, " ").toLowerCase();
    
    // 1. Update in-memory dataStore
    if (window.dataStore.CompanyInfo && window.dataStore.CompanyInfo.dataframe) {
        window.dataStore.CompanyInfo.dataframe[key] = updatedDetails;
        console.log(`[updateCustomerDetails] In-memory datastore updated for "${customerName}".`);
    } else {
        console.error("[updateCustomerDetails] CompanyInfo dataframe not found in dataStore.");
        return; // Can't proceed
    }

    // 2. Write back to the Excel file on SharePoint
    await writeCustomerDetailsToSharePoint(customerName, updatedDetails);
}

/**
 * Writes updated customer details back to the source Excel file on SharePoint.
 */
async function writeCustomerDetailsToSharePoint(customerName, updatedDetails) {
    console.log(`[Write-Back] Initiating update for "${customerName}"...`);
    try {
        const config = (await loadConfig()).find(c => c.dataKey === 'CompanyInfo');
        if (!config) throw new Error("CompanyInfo configuration not found.");

        const metadata = window.dataStore.CompanyInfo?.metadata;
        if (!metadata || !metadata.parentReference?.driveId || !metadata.id) {
            throw new Error("File metadata for CompanyInfo is missing.");
        }
        const { driveId } = metadata.parentReference;
        const itemId = metadata.id;
        const { sheetName, columns, skipRows } = config;

        const token = await getAccessToken();
        const authHeader = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };

        const rangeUrl = `https://graph.microsoft.com/v1.0/drives/${driveId}/items/${itemId}/workbook/worksheets('${sheetName}')/usedRange(valuesOnly=true)`;
        const rangeResponse = await fetch(rangeUrl, { headers: authHeader });
        if (!rangeResponse.ok) throw new Error(`Failed to get worksheet data: ${await rangeResponse.text()}`);
        const rangeData = await rangeResponse.json();
        const allRows = rangeData.values || [];

        if (allRows.length === 0) {
            throw new Error(`Worksheet "${sheetName}" appears to be empty.`);
        }

        const companyColumnIndex = columns.indexOf("Company");
        if (companyColumnIndex === -1) {
            throw new Error("'Company' column not defined in config.json.");
        }

        let rowIndex = -1;
        for (let i = skipRows; i < allRows.length; i++) {
            if (allRows[i][companyColumnIndex]?.toString().trim().toLowerCase() === customerName.trim().toLowerCase()) {
                rowIndex = i;
                break;
            }
        }
        
        const columnMap = columns.reduce((acc, col, i) => ({ ...acc, [col]: i }), {});
        const numColumns = columns.length;
        const endColumn = XLSX.utils.encode_col(numColumns - 1);
        let targetExcelRow;
        let originalValues;

        if (rowIndex !== -1) { 
            targetExcelRow = rowIndex + 1;
            originalValues = allRows[rowIndex];
            console.log(`[Write-Back] Found "${customerName}" at Excel row ${targetExcelRow}. Merging changes.`);
        } else { 
            targetExcelRow = allRows.length + 1;
            originalValues = [];
            console.log(`[Write-Back] Customer "${customerName}" not found. Adding as new Excel row ${targetExcelRow}.`);
        }
        
        const newValues = new Array(numColumns).fill("");
        for (let i = 0; i < numColumns; i++) {
            const colName = columns[i];
            const originalValue = originalValues[i] || "";

            switch (colName) {
                case "Company":
                    newValues[i] = customerName;
                    break;
                case "Location":
                    newValues[i] = updatedDetails.location ?? originalValue;
                    break;
                case "Business":
                    newValues[i] = updatedDetails.business ?? originalValue;
                    break;
                case "Type":
                    newValues[i] = updatedDetails.type ?? originalValue;
                    break;
                case "Remarks":
                    newValues[i] = updatedDetails.remarks ?? originalValue;
                    break;
                case "Website":
                    newValues[i] = updatedDetails.website ?? originalValue;
                    break;
                default:
                    newValues[i] = originalValue;
                    break;
            }
        }

        const updateAddress = `A${targetExcelRow}:${endColumn}${targetExcelRow}`;
        const updateUrl = `https://graph.microsoft.com/v1.0/drives/${driveId}/items/${itemId}/workbook/worksheets('${sheetName}')/range(address='${updateAddress}')`;
        const updateResponse = await fetch(updateUrl, {
            method: 'PATCH',
            headers: authHeader,
            body: JSON.stringify({ values: [newValues] })
        });

        if (!updateResponse.ok) {
            const errorBody = await updateResponse.text();
            console.error("[Write-Back] API Error Body:", errorBody);
            throw new Error(`API Error during sheet update: ${errorBody}`);
        }

        console.log(`[Write-Back] Successfully updated sheet for "${customerName}" at range ${updateAddress}.`);
        return await updateResponse.json();

    } catch (error) {
        console.error("[Write-Back] Failed to write customer details to SharePoint:", error);
        throw error;
    }
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
    const config = configList.find(c => c.dataKey === dataKey || c.filenamePrefix === dataKey);
    
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
    if (colIndex === -1) throw new Error(`Column "${searchColName}" not found in config for ${dataKey}`);
    
    const colLetter = getColumnLetter(colIndex); // e.g., "A"
    
    const token = await getAccessToken();
    const headers = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };

    console.log(`[Deep Search] Step 1: Determining bounds for ${dataKey} (Sheet: ${sheetName})...`);

    // 1. Get UsedRange to define boundaries (Fixes "Resource not found for 'find'" on unbounded ranges)
    const usedRangeUrl = `https://graph.microsoft.com/v1.0/drives/${driveId}/items/${itemId}/workbook/worksheets('${encodeURIComponent(sheetName)}')/usedRange?$select=address`;
    
    const usedRangeResp = await fetch(usedRangeUrl, { headers });
    if (!usedRangeResp.ok) throw new Error(`Failed to get used range: ${usedRangeResp.statusText}`);
    const usedRangeData = await usedRangeResp.json();
    
    // Address format: Sheet1!A1:Z1000
    const match = usedRangeData.address.match(/!([A-Za-z]+)(\d+):([A-Za-z]+)(\d+)/);
    if (!match) throw new Error(`Could not parse usedRange address: ${usedRangeData.address}`);
    
    // Construct bounded column range: e.g. A2:A5000 (assuming row 1 is header, but find handles it anyway)
    const startRow = match[2]; 
    const endRow = match[4];
    const searchAddress = `${colLetter}${startRow}:${colLetter}${endRow}`;

    console.log(`[Deep Search] Step 2: Searching range ${searchAddress} for "${searchValue}"...`);

    // 2. Call Find on the specific BOUNDED range
    const findUrl = `https://graph.microsoft.com/v1.0/drives/${driveId}/items/${itemId}/workbook/worksheets('${encodeURIComponent(sheetName)}')/range(address='${searchAddress}')/find`;
    
    const findPayload = {
      text: searchValue,
      matchCase: false,
      completeMatch: true 
    };

    const findResp = await fetch(findUrl, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(findPayload)
    });

    if (findResp.status === 404) {
      console.log(`[Deep Search] Value "${searchValue}" not found.`);
      return null;
    }
    
    if (!findResp.ok) {
      const errText = await findResp.text();
      // Handle Graph API specific "ItemNotFound" error inside JSON
      if (errText.includes("ItemNotFound")) return null;
      throw new Error(`Graph Find Error: ${findResp.status} ${errText}`);
    }

    const findResult = await findResp.json();
    const resultAddress = findResult.address; // e.g. Sheet1!A5432
    
    // Extract Row Number
    const rowMatch = resultAddress.match(/!([A-Za-z]+)(\d+)/);
    if (!rowMatch) throw new Error(`Could not parse result address: ${resultAddress}`);
    const rowIndex = rowMatch[2];
    
    console.log(`[Deep Search] Step 3: Fetching full row ${rowIndex}...`);

    // 3. Fetch that specific row
    const lastColLetter = getColumnLetter(columns.length - 1);
    const rowRangeAddress = `A${rowIndex}:${lastColLetter}${rowIndex}`;
    
    const rowUrl = `https://graph.microsoft.com/v1.0/drives/${driveId}/items/${itemId}/workbook/worksheets('${encodeURIComponent(sheetName)}')/range(address='${rowRangeAddress}')?$select=values`;
    
    const rowResp = await fetch(rowUrl, { headers });
    if (!rowResp.ok) throw new Error("Failed to fetch row data");
    
    const rowJson = await rowResp.json();
    const rowValues = rowJson.values[0]; 

    // 4. Map to object
    const rowObj = {};
    columns.forEach((colName, index) => {
      let val = rowValues[index];
      if (val === undefined || val === null) val = "";

      if (typeof val === 'number' && /date/i.test(colName)) {
          const dateObj = excelSerialDateToJSDate(val);
          if (!isNaN(dateObj.getTime())) {
              val = dateObj.toLocaleDateString("en-US", { year: 'numeric', month: 'numeric', day: 'numeric' });
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
  getCustomerDetails,
  updateContactCompany,
  getCompanyResearch,
  updateCustomerDetails,
  findRecordInRemoteSheet
};