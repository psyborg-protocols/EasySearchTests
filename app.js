// ---------------------------------------------
// app.js
// ---------------------------------------------

const APP_VERSION = "1.2.4"; // Bumped version for Dynamic Data Loading

// 1. Extract File Link logic so it can be called dynamically
window.exposeFileLinks = () => {
    const { fileLinks = {} } = window.dataStore || {};
    const setLink = (id, url) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.href = url || "#";
        el.classList.toggle("d-none", !url);
    };
    setLink("salesFileLink", fileLinks.Sales);
    setLink("dbFileLink", fileLinks.DB);
    setLink("pricingFileLink", fileLinks.Pricing);
};

// 2. Extract Data Sync logic so it can be called exactly when the user logs in
window.loadFreshAppData = async () => {
    if (window.isFetchingData) return; // Prevent duplicate network calls
    window.isFetchingData = true;

    try {
        console.log("[App] Authorized. Fetching fresh network data...");
        if (window.dataLoader) {
            await dataLoader.processFiles();
        }
        
        window.exposeFileLinks(); 
        document.dispatchEvent(new Event("reports-ready"));

        if (window.ReportManager) {
            await window.ReportManager.checkDueReportsAndTrackVisits();
        }
        console.log("[App] Network data sync complete.");
    } catch (e) {
        console.error("[App] Error during background refresh:", e);
    } finally {
        window.isFetchingData = false;
    }
};

document.addEventListener("DOMContentLoaded", async function () {
    // Guard against MSAL hidden iframe execution
    if (window !== window.parent) return; 

    // Version Check & Hard Reset
    const currentVersion = localStorage.getItem("APP_VERSION");
    if (currentVersion !== APP_VERSION) {
        console.log(`[Version Check] ${currentVersion} → ${APP_VERSION}`);
        if (window.idbUtil) await idbUtil.clearDatasets();
        localStorage.setItem("APP_VERSION", APP_VERSION);
        location.reload();
        return;
    }

    // Initialize Auth (This automatically handles rendering the UI)
    await initializeAuth();

    // 3. 🚀 NEW: Listen for Popup Login Success!
    // When the Microsoft popup closes, this fires and dynamically downloads your data.
    if (window.msalInstance) {
        msalInstance.addEventCallback((message) => {
            if (message.eventType === msal.EventType.LOGIN_SUCCESS) {
                console.log("[App] Popup login successful! Firing initial data sync...");
                window.loadFreshAppData();
            }
        });
    }

    // Load Cache for Instant UI
    window.dataStore = window.dataStore || {};
    window.dataStore.fileLinks = window.dataStore.fileLinks || {};

    try {
        const cachedDB = await idbUtil.getDataset("DBData");
        const cachedSales = await idbUtil.getDataset("SalesData");
        const cachedPricing = await idbUtil.getDataset("PricingData");
        
        if (cachedDB && cachedSales && cachedPricing) {
            window.dataStore["DB"] = cachedDB;
            window.dataStore["Sales"] = cachedSales;
            window.dataStore["Pricing"] = cachedPricing;
            
            // Load remaining cache entries...
            window.dataStore["PriceRaise"] = await idbUtil.getDataset("PriceRaiseData");
            window.dataStore["CompanyInfo"] = await idbUtil.getDataset("CompanyInfoData");
            window.dataStore["Equivalents"] = await idbUtil.getDataset("EquivalentsData");
            window.dataStore["Orders"] = await idbUtil.getDataset("OrdersData");
            window.dataStore["Samples"] = await idbUtil.getDataset("SamplesData");
            window.dataStore["Purchases"] = await idbUtil.getDataset("PurchasesData");
            
            const cachedOrgContacts = await idbUtil.getDataset("OrgContactsData");
            if (cachedOrgContacts) {
                window.dataStore["OrgContacts"] = new Map(Object.entries(cachedOrgContacts));
            }

            if (cachedDB.metadata?.webUrl) window.dataStore.fileLinks["DB"] = cachedDB.metadata.webUrl;
            if (cachedSales.metadata?.webUrl) window.dataStore.fileLinks["Sales"] = cachedSales.metadata.webUrl;
            if (cachedPricing.metadata?.webUrl) window.dataStore.fileLinks["Pricing"] = cachedPricing.metadata.webUrl;

            window.exposeFileLinks();
            document.dispatchEvent(new Event("reports-ready"));
            console.log("[Startup] Cache loaded successfully.");
        }
    } catch (err) {
        console.error("[Startup] Cache load error:", err);
    }

    // 4. Background Network Refresh
    // This runs on standard page loads if the user was ALREADY logged in yesterday.
    if (msalInstance && msalInstance.getAllAccounts().length > 0) {
        window.loadFreshAppData();
    }

    // Event Listeners
    document.getElementById("signInButton")?.addEventListener("click", signIn);
    document.getElementById("signOutButton")?.addEventListener("click", signOut);
    document.addEventListener("reports-ready", window.exposeFileLinks);
});