// app.js
const APP_VERSION = "1.0.6"; // Incremented version to ensure cache is cleared on next load

document.addEventListener('DOMContentLoaded', async function () {
  // Version check
  const currentVersion = localStorage.getItem("APP_VERSION");
  if (currentVersion !== APP_VERSION) {
    console.log(`[Version Check] Detected app update: ${currentVersion} → ${APP_VERSION}`);
    await idbUtil.clearDatasets();
    localStorage.setItem("APP_VERSION", APP_VERSION);
    location.reload();
    return;
  }

  initializeAuth();

  // --- OPTIMIZED STARTUP LOGIC ---

  // 1. Immediately try to load data from the local cache to make the app usable ASAP.
  let isCacheLoaded = false;
  try {
    console.log("[Startup] Attempting to load data from cache...");
    const cachedDB = await idbUtil.getDataset("DBData");
    const cachedSales = await idbUtil.getDataset("SalesData");
    const cachedPricing = await idbUtil.getDataset("PricingData");
    const cachedEquivs = await idbUtil.getDataset("EquivalentsData");
    const cachedPriceRaise = await idbUtil.getDataset("PriceRaiseData");
    const cachedContacts = await idbUtil.getDataset("CustomerContactsData");
    const cachedOrgContacts = await idbUtil.getDataset("OrgContactsData");
    // Also load the metadata which contains the deltaLink
    const cachedOrgContactsMetadata = await idbUtil.getDataset("OrgContactsMetadata");


    if (cachedDB && cachedSales && cachedPricing) {
      // ✅ Cache Hit: Populate the dataStore and make the UI interactive.
      window.dataStore["DB"] = cachedDB;
      window.dataStore["Sales"] = cachedSales;
      window.dataStore["Pricing"] = cachedPricing;
      window.dataStore["PriceRaise"] = cachedPriceRaise;
      if (cachedContacts) window.dataStore["CustomerContacts"] = cachedContacts.dataframe;
      if (cachedEquivs) window.dataStore["Equivalents"] = cachedEquivs.dataframe;
      if (cachedOrgContacts) window.dataStore["OrgContacts"] = new Map(Object.entries(cachedOrgContacts));
      
      console.log("[Startup] Success! Data loaded from cache. UI is now active.");
      isCacheLoaded = true;
      
      // Make the app usable now
      window.reportsReady = true;
      document.dispatchEvent(new Event('reports-ready'));
    } else {
      console.warn("[Startup] Cache miss or incomplete. Will rely on fresh data fetch.");
    }
  } catch (error) {
    console.error("Error loading datasets from IndexedDB:", error);
  }

  // 2. After loading from cache, check for an active session and fetch fresh data in the background.
  try {
    const token = await getAccessToken();      
    if (token) {
      console.log("[Startup] Active session detected. Fetching fresh data in the background...");
      await dataLoader.processFiles(); 
      console.log("[Startup] Background data refresh complete.");
      
      // If cache hadn't loaded before, the app is now ready with fresh data.
      if (!isCacheLoaded) {
        window.reportsReady = true;
        document.dispatchEvent(new Event('reports-ready'));
      }
    }
  } catch (authErr) {
    console.warn("[Startup] No active session. Waiting for user sign-in.", authErr);
  }

  // --- EVENT LISTENERS ---

  document.getElementById('signInButton').addEventListener('click', async () => {
    await signIn();
    console.log("[signInButton] Sign-in successful, processing fresh data...");
    await dataLoader.processFiles();
    console.log("[signInButton] Data processing completed after sign-in.");
    // Ensure UI becomes ready if it wasn't from cache
     if (!isCacheLoaded) {
        window.reportsReady = true;
        document.dispatchEvent(new Event('reports-ready'));
      }
  });

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
  exposeFileLinks(); // Call it once in case the event fired before this listener was attached

  document.getElementById('signOutButton').addEventListener('click', async () => {
    signOut();
  });
});
