// app.js
const APP_VERSION = "1.0.3";

document.addEventListener('DOMContentLoaded', async function () {
  // Version check
  const currentVersion = localStorage.getItem("APP_VERSION");
  if (currentVersion !== APP_VERSION) {
    console.log(`[Version Check] Detected app update: ${currentVersion} → ${APP_VERSION}`);

    // Purge all IndexedDB datasets
    await idbUtil.clearDatasets();
    localStorage.setItem("APP_VERSION", APP_VERSION);

    // Reload the page to start fresh with new assets and clean cache
    location.reload();
    return;  // prevent rest of DOMContentLoaded from running
  }

  initializeAuth();

  // If we already have a valid token, fetch fresh data immediately
  try {
    const token = await getAccessToken();      
    if (token) {
      console.log("[DOMContentLoaded] Existing session, fetching fresh datasets...");
      await dataLoader.processFiles(); 
      console.log("[DOMContentLoaded] Fresh data loaded.");
    }
  } catch (authErr) {
    console.warn("[DOMContentLoaded] No valid session yet:", authErr);
  }

  try {
    // Retrieve cached datasets from IndexedDB
    const cachedDB = await idbUtil.getDataset("DBData");
    const cachedSales = await idbUtil.getDataset("SalesData");
    const cachedPricing = await idbUtil.getDataset("PricingData");
    const cachedEquivs = await idbUtil.getDataset("EquivalentsData");
    const cachedPriceRaise = await idbUtil.getDataset("PriceRaiseData");
    const cachedContacts = await idbUtil.getDataset("CustomerContactsData");
    const cachedOrgContacts = await idbUtil.getDataset("OrgContactsData");

    if (cachedDB && cachedSales && cachedPricing && cachedPriceRaise) {
      // ✅ cached path: load datasets into the dataStore
      window.dataStore["DB"] = cachedDB;
      window.dataStore["Sales"] = cachedSales;
      window.dataStore["Pricing"] = cachedPricing;
      window.dataStore["PriceRaise"] = cachedPriceRaise;
      console.log("[DOMContentLoaded] Data loaded from IndexedDB cache.", {
        DB: window.dataStore["DB"],
        Sales: window.dataStore["Sales"],
        Pricing: window.dataStore["Pricing"],
        PriceRaise: window.dataStore["PriceRaise"]
      });

      if (cachedContacts) {
        window.dataStore["CustomerContacts"] = cachedContacts.dataframe;
        console.log("[DOMContentLoaded] Customer contacts loaded from cache.",
                    Object.keys(window.dataStore["CustomerContacts"]).length);
      }
      
      if (cachedOrgContacts) {
        // Convert the stored object back to a Map for efficient lookups
        window.dataStore["OrgContacts"] = new Map(Object.entries(cachedOrgContacts));
        console.log("[DOMContentLoaded] Organizational contacts loaded from cache.", window.dataStore.OrgContacts.size);
      }

      // --- rebuild the three hrefs from what we just loaded ---
      const links       = window.dataStore.fileLinks ||= {};

      links.Sales = cachedSales?.metadata?.webUrl || null;
      links.DB    = cachedDB?.metadata?.webUrl    || null;

      // Pricing: scan the composite metadata and grab the first URL we find
      if (cachedPricing?.metadata) {
        for (const m of Object.values(cachedPricing.metadata)) {
          if (m?.webUrl) { links.Pricing = m.webUrl; break; }
        }
      }

      // ✅ cached path: tell the UI we’re good to go
      window.reportsReady = true;
      document.dispatchEvent(new Event('reports-ready'));
    } else {
      console.warn("[DOMContentLoaded] Cached data not found in IndexedDB.");
    }

    // Load cached equivalents data if available
    if (cachedEquivs && cachedEquivs.metadata) {
      window.dataStore["Equivalents"] = cachedEquivs.dataframe;
      console.log("[DOMContentLoaded] Equivalents loaded from IndexedDB cache.", window.dataStore["Equivalents"]);
    }
  } catch (error) {
    console.error("Error loading datasets from IndexedDB:", error);
  }

  document.getElementById('signInButton').addEventListener('click', async () => {
    await signIn();
    console.log("[signInButton] Sign-in successful, processing fresh data...");
    await dataLoader.processFiles();
    console.log("[signInButton] Data processing completed after sign-in.");
  });

  /* ---------------- link-icon hookup ---------------- */
  const exposeFileLinks = () => {
    const { fileLinks = {} } = window.dataStore;
    const show = (id, url) => {
      const a = document.getElementById(id);
      if (!a) return;
      a.href = url || '#';
      a.classList.toggle('d-none', !url);
    };
    show('salesFileLink',   fileLinks.Sales);
    show('dbFileLink',      fileLinks.DB);
    show('pricingFileLink', fileLinks.Pricing);
  };
  document.addEventListener('reports-ready', exposeFileLinks);
  exposeFileLinks();

  document.getElementById('signOutButton').addEventListener('click', async () => {
    signOut();
  });
});
