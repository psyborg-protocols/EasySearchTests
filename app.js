document.addEventListener('DOMContentLoaded', async function () {
  initializeAuth();

  // Load cached data from sessionStorage if available
  const cachedDB = sessionStorage.getItem("DBData");
  const cachedOrders = sessionStorage.getItem("ordersData");

  if (cachedDB && cachedOrders) {
    window.dataStore["DB"] = { dataframe: JSON.parse(cachedDB) };
    window.dataStore["orders"] = { dataframe: JSON.parse(cachedOrders) };
    console.log("Data loaded from sessionStorage cache.");
  }

  document.getElementById('signInButton').addEventListener('click', async () => {
    await signIn();

    // Fetch fresh data upon sign-in regardless, to refresh cache
    await dataLoader.processFiles();
  });

  document.getElementById('signOutButton').addEventListener('click', () => {
    sessionStorage.clear(); // clear cache on sign-out
    signOut();
  });
});
