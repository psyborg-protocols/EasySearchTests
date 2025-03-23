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

  if (!query) {
    dropdown.innerHTML = "";
    dropdown.classList.remove('show');
    // Optionally, clear the product table when query is empty
    document.getElementById("productTable").innerHTML = "";
    return;
  }

  try {
    const products = await getMatchingProducts(query);
    if (products.length > 0) {
      dropdown.innerHTML = products
        .map(product => `<li><a class="dropdown-item" href="#" onclick="selectProduct('${encodeURIComponent(product["PartNumber"])}')">${product["PartNumber"]} - ${product["Description"]}</a></li>`)
        .join("");
      dropdown.classList.add('show');
    } else {
      dropdown.innerHTML = "";
      dropdown.classList.remove('show');
    }
  } catch (error) {
    console.error("Error performing product search:", error);
    dropdown.classList.remove('show');
  }
});

document.addEventListener('click', (e) => {
  if (!e.target.closest('.dropdown')) {
    document.getElementById("productDropdown").classList.remove('show');
  }
});

async function selectProduct(encodedPartNumber) {
  // Decode the PartNumber in case it contains special characters
  const partNumber = decodeURIComponent(encodedPartNumber);
  
  // Update the product search input with the selected PartNumber
  document.getElementById("productSearch").value = partNumber;
  document.getElementById("productDropdown").innerHTML = "";
  document.getElementById("productDropdown").classList.remove('show');
  
  // Retrieve all matching products (or you could filter from a global store)
  const products = await getMatchingProducts(partNumber);
  
  // Filter to the one that matches exactly the selected PartNumber (assuming PartNumber is unique)
  const selectedProduct = products.find(product => product["PartNumber"] === partNumber);
  
  if (selectedProduct) {
    // Render the selected product in the table
    document.getElementById("productTable").innerHTML = `
      <tr>
        <td>${selectedProduct["PartNumber"] || ""}</td>
        <td>${selectedProduct["Description"] || ""}</td>
        <td>${selectedProduct["QtyAvailable"]}</td>
        <td>${selectedProduct["UnitCost"] || ""}</td>
      </tr>
    `;
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