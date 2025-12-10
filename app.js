// ---------------------------------------------
// app.js — Improved startup + login flow
// ---------------------------------------------

const APP_VERSION = "1.1.0";

document.addEventListener("DOMContentLoaded", async function () {
    // ------------------------------
    // VERSION CHECK
    // ------------------------------
    const currentVersion = localStorage.getItem("APP_VERSION");
    if (currentVersion !== APP_VERSION) {
        console.log(`[Version Check] ${currentVersion} → ${APP_VERSION}`);
        await idbUtil.clearDatasets();
        localStorage.setItem("APP_VERSION", APP_VERSION);
        location.reload();
        return;
    }

    initializeAuth(); // ← redirect handling now happens internally

    // ------------------------------
    // LOAD CACHE FIRST (instant UI)
    // ------------------------------
    let isCacheLoaded = false;

    try {
        console.log("[Startup] Attempting to load cache...");

        const cachedDB = await idbUtil.getDataset("DBData");
        const cachedSales = await idbUtil.getDataset("SalesData");
        const cachedPricing = await idbUtil.getDataset("PricingData");
        const cachedEquivalents = await idbUtil.getDataset("EquivalentsData");
        const cachedPriceRaise = await idbUtil.getDataset("PriceRaiseData");
        const cachedCompanyInfo = await idbUtil.getDataset("CompanyInfoData");
        const cachedOrgContacts = await idbUtil.getDataset("OrgContactsData");
        const cachedOrders = await idbUtil.getDataset("OrdersData");
        const cachedSamples = await idbUtil.getDataset("SamplesData");

        if (cachedDB && cachedSales && cachedPricing) {
            window.dataStore["DB"] = cachedDB;
            window.dataStore["Sales"] = cachedSales;
            window.dataStore["Pricing"] = cachedPricing;
            window.dataStore["PriceRaise"] = cachedPriceRaise;

            if (cachedCompanyInfo) window.dataStore["CompanyInfo"] = cachedCompanyInfo;
            if (cachedEquivalents) window.dataStore["Equivalents"] = cachedEquivalents;
            if (cachedOrgContacts) window.dataStore["OrgContacts"] = new Map(Object.entries(cachedOrgContacts));
            if (cachedOrders) window.dataStore["Orders"] = cachedOrders;
            if (cachedSamples) window.dataStore["Samples"] = cachedSamples;

            console.log("[Startup] Cache loaded. UI active.");
            isCacheLoaded = true;

            window.reportsReady = true;
            document.dispatchEvent(new Event("reports-ready"));
        } else {
            console.warn("[Startup] Cache incomplete; full load required.");
        }
    } catch (err) {
        console.error("[Startup] Cache load error:", err);
    }

    // ------------------------------
    // OPTIONAL: Try background refresh
    // ------------------------------
    try {
        const token = await getAccessToken(); // Will auto-redirect if expired
        if (token) {
            console.log("[Startup] Refreshing data in background...");
            await dataLoader.processFiles();

            if (!isCacheLoaded) {
                window.reportsReady = true;
                document.dispatchEvent(new Event("reports-ready"));
            }

            console.log("[Startup] Background refresh complete.");
            
            // Re-check reports logic after fresh data load
            if (window.ReportManager) {
                await window.ReportManager.checkDueReportsAndTrackVisits();
            }
        }
    } catch (e) {
        console.log("[Startup] No active session yet — waiting for login.");
    }

    // ------------------------------
    // BUTTONS
    // ------------------------------

    document.getElementById("signInButton").addEventListener("click", async () => {
        await signIn(); // Redirect happens here
    });

    document.getElementById("signOutButton").addEventListener("click", () => {
        signOut();
    });

    // ------------------------------
    // FILE LINK POPULATION
    // ------------------------------

    const exposeFileLinks = () => {
        const { fileLinks = {} } = window.dataStore;
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

    document.addEventListener("reports-ready", exposeFileLinks);
    exposeFileLinks();
});