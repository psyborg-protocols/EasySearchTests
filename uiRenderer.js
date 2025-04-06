// Global variable to store the current customer's full order history
window.currentOrderHistory = null;

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

// Helper function to update the pricing table based on pricing toggle and selected product
function updatePricingTable(partNumber) {
  const pricingData = window.dataStore["Pricing"]?.dataframe || [];
  const pricingEntry = pricingData.find(row => String(row["Product"]).trim() === partNumber);
  const isB2C = document.getElementById("pricingToggle").checked;
  
  let tableHTML = "";

  if (pricingEntry) {
    const priceFB = isB2C ? pricingEntry["DISTR_FB"] : pricingEntry["USER_FB"];
    const priceHB = isB2C ? pricingEntry["DISTR_HB"] : pricingEntry["USER_HB"];
    const priceLTB = isB2C ? pricingEntry["DISTR_LTB"] : pricingEntry["USER_LTB"];
    
    tableHTML = `
    <tr>
      <td>${pricingEntry["UnitsPerBox"]}</td>
      <td>$${priceFB}</td>
      <td>$${priceHB}</td>
      <td>$${priceLTB}</td>
    </tr>
    `;
  } else {
    tableHTML = `<tr><td colspan="4" class="text-muted fst-italic">No pricing data available for product ${partNumber}</td></tr>`;
  }
  
  document.getElementById("priceTable").innerHTML = tableHTML;
}

// Helper function to update the order table based on filter state and selected product
function updateOrderTable() {
  const orderHistory = window.currentOrderHistory;
  if (!orderHistory) return; // No customer selected

  const filterToggle = document.getElementById("filterOrdersToggle").checked;
  const productValue = document.getElementById("productSearch").value.trim();
  let filteredOrders = orderHistory;

  // If the toggle is on and a product has been selected, filter orders.
  if (filterToggle && productValue) {
    console.log("Filtering orders for product:", productValue);
    filteredOrders = orderHistory.filter(order => {
      const orderProduct = String(order.Product_Service).trim();
      console.log("Comparing order product:", orderProduct, "to selected product:", productValue);
      return orderProduct === productValue;
    });
  }

  const tableBody = document.getElementById("orderHistoryTable");
  if (filteredOrders.length > 0) {
    tableBody.innerHTML = filteredOrders
    .map(order => `
      <tr class="order-row" data-product="${order.Product_Service}" onclick="UIrenderer.orderRowClicked(this)">
        <td>${new Date(order.Date).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}</td>
        <td>${order.Product_Service}</td>
        <td>${order.Memo_Description}</td>
        <td>${order.Quantity}</td>
        <td>$${order.Sales_Price}</td>
      </tr>
    `)
    .join("");
  } else {
    tableBody.innerHTML = `<tr><td colspan="5" class="text-muted fst-italic">
      No orders found for product ${productValue}.
    </td></tr>`;
  }
}

function orderRowClicked(rowElement) {
  // Remove any existing highlight from order rows
  document.querySelectorAll("#orderHistoryTable tr").forEach(tr => tr.classList.remove("selected-row"));
  
  // Highlight the clicked row
  rowElement.classList.add("selected-row");
  
  // Retrieve the product from the row's data attribute
  const product = rowElement.getAttribute("data-product").trim();
  
  // Set the product search input to the product and trigger search
  document.getElementById("productSearch").value = product;
  // Call selectProduct to update the product details and pricing info
  selectProduct(encodeURIComponent(product));
}

 
// Handle Customer Selection
async function selectCustomer(customerName) {
  document.getElementById("customerSearch").value = customerName;
  document.getElementById("customerDropdown").innerHTML = "";

  const orderHistory = await getOrderHistory(customerName);
  // Save full order history for later filtering
  window.currentOrderHistory = orderHistory;

  // Optionally, you can also store the current customer name
  window.currentCustomer = customerName;

  // Sort orders by ascending date if needed
  orderHistory.sort((a, b) => new Date(b.Date) - new Date(a.Date));

  // Render orders (this will apply filtering if the toggle is on)
  updateOrderTable();
}

// Add an event listener for changes on the filter toggle switch
document.getElementById("filterOrdersToggle").addEventListener("change", () => {
  updateOrderTable();
});

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
  document.getElementById("productSearch").value = partNumber;
  const dropdown = document.getElementById("productDropdown");
  dropdown.innerHTML = "";
  dropdown.classList.remove('show');

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
          <td>$${formattedProduct["UnitCost"]}</td>
        </tr>`;

      // Store the current product for later reference
      window.currentProduct = partNumber;
      // Update the pricing table with the selected product’s pricing info
      updatePricingTable(partNumber);

      const equivalentsMap = window.dataStore["Equivalents"] || {};
      const generic = equivalentsMap[partNumber];
      const bulbIcon = document.getElementById("genericBulb");
      
      // Show the bulb icon if a generic replacement is found
      if (generic) {
        bulbIcon.style.display = "none"; // Start hidden
      
        // Remove previous classes (if any)
        bulbIcon.classList.remove("animate__animated", "animate__heartBeat", "glow-effect");
      
        // Use a delay to trigger bounceIn after 0.5s
        setTimeout(() => {
          bulbIcon.setAttribute("data-bs-original-title", `Generic replacement found: ${generic}`);
          bulbIcon.style.display = "inline-block";
      
          // Reflow to ensure animation triggers
          void bulbIcon.offsetWidth;
          bulbIcon.classList.add("animate__animated", "animate__heartBeat", "glow-effect");
      
          // Remove glow after 2 seconds
          setTimeout(() => bulbIcon.classList.remove("glow-effect"), 2000);
      
          bulbIcon.onclick = () => selectProduct(encodeURIComponent(generic));
        }, 500);
      } else {
        bulbIcon.style.display = "none";
        bulbIcon.onclick = null;
      }

      // After selecting a product, if a customer is already selected, update order filtering
      if (window.currentOrderHistory) {
        updateOrderTable();
      }
    } else {
      document.getElementById("productTable").innerHTML = `
        <tr><td colspan="4" class="text-muted fst-italic">
          No matching product details found.
        </td></tr>`;
      // Also clear the pricing table if no product is found
      document.getElementById("priceTable").innerHTML = "";
    }
  } catch (error) {
    console.error(`[selectProduct] Error retrieving product details for "${partNumber}":`, error);
  }
}

document.getElementById("pricingToggle").addEventListener("change", () => {
  if (window.currentProduct) {
    updatePricingTable(window.currentProduct);
  }
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
  updateUIForLoggedOutUser,
  orderRowClicked
};