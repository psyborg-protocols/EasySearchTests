// ---------------------------------------------
// app.js
// ---------------------------------------------

const APP_VERSION = "1.2.2"; // Bumped version for new Auth Architecture

document.addEventListener("DOMContentLoaded", async function () {

    // 1. Helper: Expose file links from dataStore
    const exposeFileLinks = () => {
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

    // 2. Version Check & Hard Reset
    const currentVersion = localStorage.getItem("APP_VERSION");
    if (currentVersion !== APP_VERSION) {
        console.log(`[Version Check] ${currentVersion} → ${APP_VERSION}`);
        if (window.idbUtil) await idbUtil.clearDatasets();
        localStorage.setItem("APP_VERSION", APP_VERSION);
        location.reload();
        return;
    }

    // 3. Initialize Auth (This now automatically handles rendering the UI via Events)
    await initializeAuth();

    // 4. Load Cache for Instant UI
    window.dataStore = window.dataStore || {};
    window.dataStore.fileLinks = window.dataStore.fileLinks || {};
    let isCacheLoaded = false;

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

            isCacheLoaded = true;
            exposeFileLinks();
            document.dispatchEvent(new Event("reports-ready"));
            console.log("[Startup] Cache loaded successfully.");
        }
    } catch (err) {
        console.error("[Startup] Cache load error:", err);
    }

    // 5. Background Network Refresh
    // Only execute if user is logged in
    if (msalInstance && msalInstance.getAllAccounts().length > 0) {
        try {
            console.log("[Startup] Authorized. Refreshing data in background...");
            // CRM initialization is now safely handled inside UIrenderer.updateUIForLoggedInUser()
            
            await dataLoader.processFiles();
            exposeFileLinks(); 

            if (!isCacheLoaded) {
                document.dispatchEvent(new Event("reports-ready"));
            }

            if (window.ReportManager) {
                await window.ReportManager.checkDueReportsAndTrackVisits();
            }
        } catch (e) {
            console.error("[Startup] Error during background refresh:", e);
        }
    }

    // 6. Event Listeners
    document.getElementById("signInButton")?.addEventListener("click", signIn);
    document.getElementById("signOutButton")?.addEventListener("click", signOut);
    document.addEventListener("reports-ready", exposeFileLinks);
});