// Handle the Customer search dropdown and selection
document.getElementById("customerSearch").addEventListener("input", async (e) => {
  const query = e.target.value.trim();
  const dropdown = document.getElementById("customerDropdown");

  if (!query) {
    dropdown.innerHTML = "";
    dropdown.classList.remove('show');
    return;
  }

  try {
    const results = await searchCustomers(query);
    const uniqueResults = [...new Set(results)];

    if (uniqueResults.length > 0) {
      dropdown.innerHTML = uniqueResults
        .map(name => `<li><a class="dropdown-item" href="#" onclick="selectCustomer('${name}')">${name}</a></li>`)
        .join("");
      
      // Manually show the dropdown
      dropdown.classList.add('show');
    } else {
      dropdown.innerHTML = "";
      dropdown.classList.remove('show');
    }
  } catch (error) {
    console.error("Error performing customer search:", error);
    dropdown.classList.remove('show');
  }
});

// Hide dropdown when clicking outside
document.addEventListener('click', (e) => {
  if (!e.target.closest('.dropdown')) {
    document.getElementById("customerDropdown").classList.remove('show');
  }
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
        <td>${new Date(order.Date).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}</td>
        <td>${order.Product_Service}</td>
        <td>${order.Memo_Description}</td>
        <td>${order.Quantity}</td>
        <td>${order.Sales_Price}</td>
      </tr>
    `)
    .join("");
}

document.getElementById("productSearch").addEventListener("input", async (e) => {
  const query = e.target.value.trim();
  const dropdown = document.getElementById("productDropdown");

  console.log(`[productSearch input] Query changed: "${query}"`);

  if (!query) {
    console.log("[productSearch input] Empty query detected, clearing dropdown and table.");
    dropdown.innerHTML = "";
    dropdown.classList.remove('show');
    document.getElementById("productTable").innerHTML = "";
    return;
  }

  try {
    const products = await getMatchingProducts(query);
    console.log(`[productSearch input] Matching products received:`, products);

    if (products.length > 0) {
      dropdown.innerHTML = products
        .map(product => `
          <li>
            <a class="dropdown-item" href="#"
               onclick="event.stopPropagation(); selectProduct('${encodeURIComponent(product["PartNumber"])}');">
              ${product["PartNumber"]} - ${product["Description"]}
            </a>
          </li>`)
        .join("");
      dropdown.classList.add('show');
      console.log(`[productSearch input] Dropdown populated and shown.`);
    } else {
      console.log(`[productSearch input] No products found for query: "${query}"`);
      dropdown.innerHTML = "";
      dropdown.classList.remove('show');
    }
  } catch (error) {
    console.error("[productSearch input] Error performing product search:", error);
    dropdown.classList.remove('show');
  }
});

async function selectProduct(encodedPartNumber) {
  const partNumber = decodeURIComponent(encodedPartNumber).toString().trim();
  console.log(`[selectProduct] Product selected: "${partNumber}"`);

  document.getElementById("productSearch").value = partNumber;
  const dropdown = document.getElementById("productDropdown");
  dropdown.innerHTML = "";
  dropdown.classList.remove('show');

  console.log(`[selectProduct] Dropdown cleared.`);

  try {
    const inventoryData = window.dataStore["DB"]?.dataframe || [];

    const selectedProduct = inventoryData.find(
      item => String(item["PartNumber"]).trim() === partNumber
    );

    if (selectedProduct) {
      const qtyOnHand = parseFloat(selectedProduct["QtyOnHand"]) || 0;
      const qtyCommitted = parseFloat(selectedProduct["QtyCommitted"]) || 0;

      const formattedProduct = {
        PartNumber: selectedProduct["PartNumber"],
        Description: selectedProduct["Description"],
        QtyAvailable: qtyOnHand - qtyCommitted,
        UnitCost: parseFloat(selectedProduct["UnitCost"]).toFixed(2)
      };

      document.getElementById("productTable").innerHTML = `
        <tr>
          <td>${formattedProduct["PartNumber"]}</td>
          <td>${formattedProduct["Description"]}</td>
          <td>${formattedProduct["QtyAvailable"]}</td>
          <td>${formattedProduct["UnitCost"]}</td>
        </tr>`;

      console.log(`[selectProduct] Selected product displayed in table:`, formattedProduct);
    } else {
      document.getElementById("productTable").innerHTML = `
        <tr><td colspan="4" class="text-muted fst-italic">No matching product details found.</td></tr>`;
      console.warn(`[selectProduct] No exact match found for product: "${partNumber}"`);
    }
  } catch (error) {
    console.error(`[selectProduct] Error retrieving product details for "${partNumber}":`, error);
  }
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
  updateUIForLoggedInUser,
  updateUIForLoggedOutUser
};