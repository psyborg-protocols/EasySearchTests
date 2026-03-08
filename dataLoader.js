// base URL for Azure Functions
const BW_BACKEND_BASE_URL = "https://bwbackend-cahmavhhgjcaa3be.canadaeast-01.azurewebsites.net/api";

// This will be injected by the GitHub Actions build step
const BW_BACKEND_CODE = "__BW_BACKEND_CODE__";

// Centralized Site ID for SharePoint
const BW_SITE_ID = "brandywinematerialsllc.sharepoint.com,07a1465e-a31a-4437-aca2-0efe61b7f2c6,4b1abd1c-08c6-4574-b350-654376a1e954";

window.BW_CONFIG = {
    BW_BACKEND_BASE_URL,
    BW_BACKEND_CODE,
    BW_SITE_ID
};

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

    const config = await response.json();
    const currentYear = new Date().getFullYear().toString();

    // Iterate through config and replace [YEAR] with the actual current year
    if (Array.isArray(config)) {
      return config.map(entry => {
        if (entry.directory && typeof entry.directory === 'string') {
          // Replace all instances of [YEAR] with the current year value
          entry.directory = entry.directory.replace(/\[YEAR\]/g, currentYear);
        }
        return entry;
      });
    }

    return config;
  } catch (error) {
    console.error("Error loading config:", error);
    throw error;
  }
}

/**
 * Main data processing function. Orchestrates downloading and parsing files and lists.
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
    // Group lists by listId, Excel files by directory/prefix
    const sigOf = r => r.sourceType === 'list' ? `list|${r.listId}` : `${r.directory}|${r.filenamePrefix}`;
    cfg.forEach(r => (byWorkbook.get(sigOf(r)) ?? byWorkbook.set(sigOf(r), []).get(sigOf(r))).push(r));

    const cachedPricing = await idbUtil.getDataset("PricingData") || null;
    const pricingMeta = { ...(cachedPricing?.metadata || {}) };
    const mergedPrices = [];
    let pricingChanged = false;
    const bufferCache = new Map();
    const ds = window.dataStore;

    for (const rows of byWorkbook.values()) {
      const firstRow = rows[0];

      // ==========================================
      // HANDLE SHAREPOINT LISTS
      // ==========================================
      if (firstRow.sourceType === 'list') {
        for (const row of rows) {
          const key = row.dataKey || row.listId;
          const storageKey = `${key}Data`;
          
          try {
            const siteId = row.siteId || window.BW_CONFIG.BW_SITE_ID;
            // 1. Get metadata to check for cache validity
            const listMeta = await window.spUtils.fetchListMetadata(siteId, row.listId, token);
            const lastMod = listMeta.lastModifiedDateTime;

            if (listMeta.webUrl && !window.dataStore.fileLinks[key]) {
              window.dataStore.fileLinks[key] = listMeta.webUrl;
            }

            // 2. Check Cache
            const cached = await idbUtil.getDataset(storageKey);
            if (cached?.metadata?.lastModifiedDateTime === lastMod) {
              console.log(`[processFiles] Cache hit for List: ${key}. Skipping fetch.`);
              ds[key] = cached;
              continue;
            }

            // 3. Fetch fresh data if cache is missing/stale
            console.log(`[processFiles] Fetching fresh data for List: ${key}...`);
            const listData = await window.spUtils.fetchListItems(siteId, row.listId, row.columns, token);
            
            const stored = { dataframe: listData, metadata: listMeta };
            ds[key] = stored;
            await idbUtil.setDataset(storageKey, stored);
            
          } catch (err) {
            console.error(`[processFiles] Failed to process list ${key}:`, err);
          }
        }
        continue; // Skip the Excel logic below for this group
      }

      // ==========================================
      // HANDLE EXCEL FILES
      // ==========================================
      const { directory, filenamePrefix } = firstRow;
      const metaResp = await window.spUtils.fetchLatestFileMetadata(directory, filenamePrefix, token);
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
      const allPartial = rows.every(r => r.partialLoad === true);

      let buf = null;
      if (!allPartial) {
        buf = bufferCache.get(fileId);
        if (!buf) {
          buf = await window.spUtils.downloadExcelFile(md['@microsoft.graph.downloadUrl']);
          bufferCache.set(fileId, buf);
        }
      }

      for (const row of rows) {
        const key = row.dataKey || row.filenamePrefix;
        const storageKey = `${key}Data`;

        // --- PARTIAL FETCH LOGIC ---
        if (row.partialLoad) {
          const cached = await idbUtil.getDataset(storageKey);

          if (cached?.metadata?.lastModifiedDateTime === lastMod) {
            console.log(`[processFiles] Cache hit for ${key}. Skipping fetch.`);
            ds[key] = cached;
            continue;
          }

          const nRowsToFetch = row.nRows || 2000;
          const columnsToMap = row.columns || [];
          const sheetToFetch = row.sheetName || "";

          console.log(`[processFiles] Fetching fresh partial data for ${key} (Last ${nRowsToFetch} rows) from sheet "${sheetToFetch}"...`);

          try {
            if (!sheetToFetch || columnsToMap.length === 0) {
              throw new Error(`Missing sheetName or columns in config for partial load key: ${key}`);
            }

            const partialData = await window.spUtils.fetchLastNRows(
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
            continue;
          }
        }

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
        const frame = window.spUtils.parseExcelData(buf, row.skipRows, row.columns, row.sheetName);

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
          const map = window.contactUtils.normaliseCompanyInfo(frame);
          const stored = { dataframe: map, metadata: md };
          ds[key] = stored;
          await idbUtil.setDataset(storageKey, stored);
          console.log(`[CompanyInfo] ${Object.keys(map).length} companies loaded with core info.`);
          continue;
        }

        let cleaned = frame;
        if (key === "Sales") {
          cleaned = filterOutValues(fillDownColumn(frame, "Customer"), "Product_Service", DISALLOWED_PRODUCTS);
        } else if (key === "Purchases") {
          cleaned = filterOutValues(fillDownColumn(frame, "Vendor"), "Product_Service", DISALLOWED_PRODUCTS);
        }
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

    ds["OrgContacts"] = await window.contactUtils.fetchAndProcessOrgContacts(token);

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

/**
 * Calculates the unit cost based on the most recent purchase history.
 * Falls back to the static DB cost if no history exists.
 */
function getProductUnitCost(partNumber, fallbackCost) {
  const purchasesData = window.dataStore["Purchases"]?.dataframe || [];
  
  // Filter for this product
  const productPurchases = purchasesData.filter(p => 
      String(p["Product_Service"]).trim() === partNumber
  );

  if (productPurchases.length > 0) {
      // Sort by Date Descending (Newest first)
      productPurchases.sort((a, b) => new Date(b.Date) - new Date(a.Date));
      
      let rawCost = productPurchases[0]["Cost"];
      if (typeof rawCost === 'string') {
          rawCost = parseFloat(rawCost.replace(/[^0-9.-]/g, ''));
      }
      return isFinite(rawCost) ? rawCost : 0;
  }

  // Fallback if no purchase history
  let dbCost = parseFloat(String(fallbackCost).replace(/[^0-9.-]/g, ''));
  return isFinite(dbCost) ? dbCost : 0;
}


window.dataStore = window.dataStore || {};
window.dataStore.fileLinks = window.dataStore.fileLinks || {};

window.dataLoader = {
  loadConfig,
  processFiles,
  getProductUnitCost
};