// app.js
document.addEventListener('DOMContentLoaded', async function () {
  initializeAuth();

  try {
    // Retrieve cached datasets from IndexedDB
    const cachedDB = await idbUtil.getDataset("DBData");
    const cachedOrders = await idbUtil.getDataset("ordersData");
    const cachedPricing = await idbUtil.getDataset("PricingData");

    if (cachedDB && cachedOrders && cachedPricing) {
      window.dataStore["DB"] = { dataframe: cachedDB };
      window.dataStore["orders"] = { dataframe: cachedOrders };
      window.dataStore["Pricing"] = { dataframe: cachedPricing };
      console.log("[DOMContentLoaded] Data loaded from IndexedDB cache.", {
        DB: window.dataStore["DB"],
        orders: window.dataStore["orders"],
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
    try {
      await idbUtil.clearDatasets();
      console.log("[signOutButton] IndexedDB cleared, signing out.");
    } catch (error) {
      console.error("Error clearing IndexedDB:", error);
    }
    signOut();
  });
});
