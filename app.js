// app.js
document.addEventListener('DOMContentLoaded', async function () {
  initializeAuth();

  try {
    // Retrieve cached datasets from IndexedDB
    const cachedDB = await idbUtil.getDataset("DBData");
    const cachedSales = await idbUtil.getDataset("SalesData");
    const cachedPricing = await idbUtil.getDataset("PricingData");

    if (cachedDB && cachedSales && cachedPricing) {
      window.dataStore["DB"] = cachedDB;
      window.dataStore["Sales"] = cachedSales;
      window.dataStore["Pricing"] = cachedPricing;
      console.log("[DOMContentLoaded] Data loaded from IndexedDB cache.", {
        DB: window.dataStore["DB"],
        Sales: window.dataStore["Sales"],
        Pricing: window.dataStore["Pricing"]
      });
    } else {
      console.warn("[DOMContentLoaded] Cached data not found in IndexedDB.");
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

  document.getElementById('signOutButton').addEventListener('click', async () => {
    signOut();
  });
});
