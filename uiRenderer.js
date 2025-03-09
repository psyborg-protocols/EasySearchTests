/**
 * Displays parsed Excel data as Bootstrap tables.
 * @param {Array} results - Array of objects containing dataframe data.
 */
async function displayData(results) {
  results.forEach(({ dataframe, destination }) => {
    const container = document.querySelector(destination);
    if (!container) {
      console.warn(`Destination ${destination} not found.`);
      return;
    }

    const [headers, ...rows] = dataframe;
    const dataObjects = rows.map(row => 
      Object.fromEntries(row.map((cell, idx) => [dataframe[0][idx], cell]))
    );

    new Tabulator(destination, {
      data: dataframes,
      layout: "fitData",
      pagination: "local",
      paginationSize: 10,
      movableColumns: true,
      resizableRows: true,
      columns: dataframe[0].map(header => ({
        title: header,
        field: header,
      })),
    });
  });
}
  
// Update UI after successful login
function updateUIForLoggedInUser() {
    document.getElementById('loginContainer').style.display = 'none';
    document.getElementById('appContainer').style.display = 'block';
    
    // Display user name
    const displayName = userAccount.name || userAccount.username || "User";
    document.getElementById('userDisplayName').textContent = displayName;
}

// Update UI after logout
function updateUIForLoggedOutUser() {
    document.getElementById('appContainer').style.display = 'none';
    document.getElementById('loginContainer').style.display = 'flex';
    document.getElementById('fileListContainer').innerHTML = '';
    document.getElementById('tableContainer').style.display = 'none';
    document.getElementById('welcomeMessage').style.display = 'block';
}

  // Expose function globally
  window.UIrenderer = {
    displayData,
    updateUIForLoggedInUser,
    updateUIForLoggedOutUser
  };