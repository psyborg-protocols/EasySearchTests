document.addEventListener('DOMContentLoaded', async function () {
  initializeAuth();

  const cachedDB = sessionStorage.getItem("DBData");
  const cachedOrders = sessionStorage.getItem("ordersData");

  if (cachedDB && cachedOrders) {
    window.dataStore["DB"] = { dataframe: JSON.parse(cachedDB) };
    window.dataStore["orders"] = { dataframe: JSON.parse(cachedOrders) };
    console.log("[DOMContentLoaded] Data loaded from sessionStorage cache.", {
      DB: window.dataStore["DB"],
      orders: window.dataStore["orders"]
    });
  } else {
    console.warn("[DOMContentLoaded] Cached data not found in sessionStorage.");
  }

  document.getElementById('signInButton').addEventListener('click', async () => {
    await signIn();
    console.log("[signInButton] Sign-in successful, processing fresh data...");
    await dataLoader.processFiles();
    console.log("[signInButton] Data processing completed after sign-in.");
  });

  document.getElementById('signOutButton').addEventListener('click', () => {
    sessionStorage.clear();
    console.log("[signOutButton] Session storage cleared, signing out.");
    signOut();
  });
});
