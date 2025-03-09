/**
 * Displays parsed Excel data as Bootstrap tables.
 * @param {Array} results - Array of objects containing dataframe data.
 */
async function displayData(results) {
  results.forEach(result => {
    const { dataframe, destination, filenamePrefix, directory } = result;

    const container = document.querySelector(destination);
    if (!container) {
      console.warn(`Destination ${destination} not found in the DOM.`);
      return;
    }

    // Ensure you have at least header and some rows
    if (!dataframe || dataframe.length < 1) {
      console.warn(`Dataframe for ${filenamePrefix} is empty or invalid.`);
      return;
    }

    const [header, ...rows] = dataframe;

    // Convert rows into array of objects for Tabulator
    const dataObjects = rows
      .filter(row => Array.isArray(row) && row.length > 0)
      .map(row => {
        // Create an object with keys from header and values from row
        // Ensure we only pair up to the minimum length of both arrays
        const obj = {};
        const minLength = Math.min(header.length, row.length);
        
        for (let i = 0; i < minLength; i++) {
          if (header[i] !== undefined && header[i] !== null) {
            obj[header[i]] = row[i];
          }
        }
        
        return obj;
      });

    // Tabulator initialization
    new Tabulator(destination, {
      data: dataObjects,
      layout: "fitDataStretch",
      pagination: "local",
      paginationSize: 10,
      movableColumns: true,
      columns: header.map(col => ({ title: col, field: col })),
    });

    console.log(`Loaded ${filenamePrefix} from ${directory} into ${destination}`);
  });
}
  
// Update UI after successful login
function updateUIForLoggedInUser() {
    document.getElementById('loginContainer').style.display = 'none';
    document.getElementById('appContainer').style.display = 'block';
    
    // Display user name
    const displayName = userAccount?.name || userAccount?.username || "User";
    document.getElementById('userDisplayName').textContent = displayName;
}

// Update UI after logout
function updateUIForLoggedOutUser() {
    document.getElementById('appContainer').style.display = 'none';
    document.getElementById('loginContainer').style.display = 'flex';
    
    // Check if elements exist before manipulating them
    const fileListContainer = document.getElementById('fileListContainer');
    if (fileListContainer) fileListContainer.innerHTML = '';
    
    const tableContainer = document.getElementById('tableContainer');
    if (tableContainer) tableContainer.style.display = 'none';
    
    const welcomeMessage = document.getElementById('welcomeMessage');
    if (welcomeMessage) welcomeMessage.style.display = 'block';
}

// Expose function globally
window.UIrenderer = {
  displayData,
  updateUIForLoggedInUser,
  updateUIForLoggedOutUser
};