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
          ds[key] = map;
          await idbUtil.setDataset(storageKey, stored);
          continue;
        }

        if (key === "CustomerContacts") {
          const map = normaliseCustomerContacts(frame);
          const stored = { dataframe: map, metadata: md };
          ds[key] = map;
          await idbUtil.setDataset(storageKey, stored);
          console.log(`[CustomerContacts] ${Object.keys(map).length} companies loaded.`);
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

function normaliseCustomerContacts(frame) {
  const YEARS = ["2019","2020","2021","2022","2023","2024","2025"];
  const map = {};
  for (const row of frame) {
    const company = String(row.Company || "").trim().replace(/\s+/g, " ").toLowerCase();
    if (!company) continue;
    const sales = {};
    YEARS.forEach(y => { sales[y] = row[`${y} Sales`] ?? null; });
    const contacts = [];
    for (let i = 1; i <= 3; i++) {
      const name = row[`Contact Name ${i}`] || "";
      const title = row[`Contact Title ${i}`] || "";
      const email = row[`Email ${i}`] || "";
      if (name || title || email) {
        contacts.push({ Name: name, Title: title, Email: email });
      }
    }
    map[company] = {
      salesByYear: sales,
      location: row.Location || "",
      business: row.Business || "",
      type: row.Type || "",
      remarks: row.Remarks || "",
      website: row.Website || "",
      contacts: contacts
    };
  }
  return map;
}

function getCustomerDetails(company) {
  const key = company.trim().replace(/\s+/g, " ").toLowerCase();
  return (window.dataStore["CustomerContacts"] || {})[key] || null;
}

window.dataStore = {}; 
window.dataStore.fileLinks = {};
window.dataLoader = {
  loadConfig,
  fetchLatestFileMetadata,
  downloadExcelFile,
  parseExcelData,
  processFiles,
  getCustomerDetails
};
