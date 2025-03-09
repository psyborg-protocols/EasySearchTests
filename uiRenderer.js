// Handle the Customer search dropdown and selection
document.getElementById("customerSearch").addEventListener("input", async (e) => {
  const query = e.target.value.trim();
  if (!query) {
    document.getElementById("customerDropdown").innerHTML = "";
    return;
  }

  const results = await searchCustomers(query);
  const dropdown = document.getElementById("customerDropdown");

  dropdown.innerHTML = results
    .map(name => `<div class="dropdown-item" onclick="selectCustomer('${name}')">${name}</div>`)
    .join("");
});
 
// Handle Customer Selection
async function selectCustomer(customerName) {
  document.getElementById("customerSearch").value = customerName;
  document.getElementById("customerDropdown").innerHTML = "";

  const orderHistory = await getOrderHistory(customerName);
  const tableBody = document.getElementById("orderHistoryTable");

  tableBody.innerHTML = orderHistory
    .map(order => `
      <tr>
        <td>${order.Date}</td>
        <td>${order.Product_Service}</td>
        <td>${order.Memo_Description}
        <td>${order.Quantity}</td>
        <td>${order.Sales_Price}</td>
      </tr>
    `)
    .join("");
}

document.getElementById("productSearch").addEventListener("input", async (e) => {
  const query = e.target.value.trim();
  if (!query) {
    document.getElementById("productTable").innerHTML = "";
    return;
  }

  const products = await getMatchingProducts(query);
  const tableBody = document.getElementById("productTable");

  tableBody.innerHTML = products
    .map(product => `
      <tr>
        <td>${product["Product ID"]}</td>
        <td>${product.Inventory}</td>
        <td>${product.Cost}</td>
      </tr>
    `)
    .join("");
});



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
  updateUIForLoggedInUser,
  updateUIForLoggedOutUser
};