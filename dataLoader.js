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
 * Fetches organizational contacts using a delta query for efficiency.
 * @param {string} token - A valid MSAL access token.
 * @returns {Promise<Map<string, object[]>>} A map of contacts organized by company.
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
            
            // Check for the final deltaLink in the response
            if (data['@odata.deltaLink']) {
                metadata.deltaLink = data['@odata.deltaLink'];
                nextLink = null; // Exit loop
            } else {
                nextLink = data['@odata.nextLink']; // Continue to next page of results
            }
        }
        
        console.log(`Successfully fetched ${changes.length} changes for contacts.`);

        if (changes.length > 0) {
            // Apply changes to the cached map
            for (const contact of changes) {
                const company = (contact.companyName || 'Unknown').trim().toLowerCase();
                
                if (contact['@removed']) {
                    // Handle deletions
                    if (cachedContactsMap.has(company)) {
                        const companyContacts = cachedContactsMap.get(company).filter(c => c.id !== contact.id);
                        if (companyContacts.length > 0) {
                            cachedContactsMap.set(company, companyContacts);
                        } else {
                            cachedContactsMap.delete(company);
                        }
                    }
                } else {
                    // Handle additions/updates
                    const newContact = {
                        id: contact.id, // Store ID for updates/deletions
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
                        existingContacts[index] = newContact; // Update
                    } else {
                        existingContacts.push(newContact); // Add
                    }
                }
            }
            console.log("Applied changes to in-memory contact list.");
        }
        
        // Save the updated map and the new deltaLink
        await idbUtil.setDataset("OrgContactsData", Object.fromEntries(cachedContactsMap));
        await idbUtil.setDataset("OrgContactsMetadata", metadata);

        return cachedContactsMap;

    } catch (error) {
        console.error("Error fetching or processing organizational contacts:", error);
        return cachedContactsMap; // Return the old map on error
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

      let buf = bufferCache.get(fileId);
      if (!buf) {
        buf = await downloadExcelFile(md['@microsoft.graph.downloadUrl']);
        bufferCache.set(fileId, buf);
      }

      for (const row of rows) {
        const key = row.dataKey || row.filenamePrefix;
        const storageKey = `${key}Data`;
        const isPricing = key === "Pricing" || /^Prices\s\d+/i.test(key);

        if (!isPricing) {
          const cached = await idbUtil.getDataset(storageKey);
          if (cached?.metadata?.lastModifiedDateTime === lastMod) {
            ds[key] = cached;
            continue;
          }
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

    // Fetch and cache organizational contacts using delta query
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
 * @param {string} email - The primary email of the contact to update.
 * @param {string} newCompanyName - The correct company name from the sales data.
 */
async function updateContactCompany(email, newCompanyName) {
  try {
    // 1. Get an access token for our API using the new helper function from auth.js.
    const accessToken = await getApiAccessToken();

    // 2. Define the payload
    const payload = {
      action: 'updateCompany',
      email: email,
      companyName: newCompanyName
    };

    // 3. Make the secure fetch call with the Authorization header
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
      // Throwing an error here will allow the caller to catch it
      throw new Error(`API Error: ${response.status} - ${errorText}`);
    }

    const result = await response.text();
    console.log('Successfully sent update request:', result);
    return result;

  } catch (error) {
    console.error('Error in updateContactCompany:', error);
    // Re-throw the error so the calling function knows something went wrong
    throw error;
  }
}

/**
 * Gets structured company information from the backend research agent.
 * @param {string} companyName - The name of the company to research.
 * @returns {Promise<object>} A promise that resolves to the JSON object with company details.
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


    // 1. Parse the full response from the backend.
    const { model_data, citations } = await response.json();

    // 2. Initialize the base note.
    let note = "These results are retrieved by Perplexity AI and could contain errors.";

    // 3. Verify the website URL from the model against the citation URLs.
    const modelWebsite = model_data.website;
    const citationUrls = (citations || []).map(citation => citation.url);
    const isUrlVerified = citationUrls.includes(modelWebsite);

    // 4. If the model's website URL is not in the list of verified citation
    //    URLs, add a warning to the beginning of the note.
    if (!isUrlVerified) {
      note = "Unable to verify URL. " + note;
    }

    // 5. Return the model's data with the new, dynamically generated note field.
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
 * @param {string} customerName - The name of the customer to update.
 * @param {object} updatedDetails - The full, updated customer details object.
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

    // 2. (Future Implementation) Write back to the Excel file on SharePoint
    await writeCustomerDetailsToSharePoint(customerName, updatedDetails);
}

/**
 * (Placeholder) Writes updated customer details back to the source Excel file.
 * This requires using the Microsoft Graph API to update a specific row in an Excel file.
 * NOTE: This is a complex operation and is not fully implemented.
 * @param {string} customerName - The name of the customer (for finding the row).
 * @param {object} updatedDetails - The data to write.
 */
async function writeCustomerDetailsToSharePoint(customerName, updatedDetails) {
    console.warn("--- Write-back to SharePoint is NOT yet implemented. ---");
    // To implement this, you would need to:
    // 1. Get the file metadata (driveId, itemId) for the "Customer Contacts" file from dataStore.fileLinks and metadata.
    // 2. Use the Graph API's "find row" or "match row" functionality to locate the row for `customerName`.
    // 3. Use the "update row" API call with the row index and the new data.
    // This is a significant engineering task. For now, we'll log the intent.
    console.log("--> Intent to write back the following data for", customerName, updatedDetails);
    
    // This is where the MS Graph API call would go.
    // For example:
    // const token = await getAccessToken();
    // const endpoint = `https://graph.microsoft.com/v1.0/sites/{site-id}/drives/{drive-id}/items/{item-id}/workbook/worksheets('Sheet1')/tables('Table1')/rows/{row-id}`;
    // await fetch(endpoint, {
    //   method: 'PATCH',
    //   headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    //   body: JSON.stringify({ values: [[ ... values from updatedDetails ... ]] })
    // });

    return Promise.resolve(); // Simulate success
}

window.dataStore = {}; 
window.dataStore.fileLinks = {};
window.dataLoader = {
  loadConfig,
  fetchLatestFileMetadata,
  downloadExcelFile,
  parseExcelData,
  processFiles,
  getCustomerDetails,
  updateContactCompany,
  getCompanyResearch,
  updateCustomerDetails
};
