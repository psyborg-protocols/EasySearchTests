const moneyFmt = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,   // always “.00”
  maximumFractionDigits: 2
});

function getCountryName(code) {
  const map = {
    CN: "China",
    ES: "Spain",
    GB: "England",
    CH: "Switzerland"
  };
  return map[code] || code;  // fallback to code if not found
}


function fmtPrice(value) {
  // Guard against undefined / blank cells
  const num = Number(value);
  return isFinite(num) ? moneyFmt.format(num) : "-";
}

// Global variable to store the current customer's full order history
window.currentOrderHistory = null;
// Global variable to store the current customer's full customer info
window.currentCustomerInfo = null;

// Handle the Customer search dropdown and selection for the Search tab
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

// Handle the Customer search dropdown and selection for the Customer Info tab
document.getElementById("customerInfoSearch").addEventListener("input", async (e) => {
  const query = e.target.value.trim();
  const dropdown = document.getElementById("customerInfoDropdown");

  if (!query) {
    dropdown.innerHTML = "";
    dropdown.classList.remove('show');
    // Hide customer details if search is cleared
    document.getElementById("customerOrderHistoryContainer").classList.add('customer-info-content-hidden');
    document.getElementById("customerFieldsContainer").classList.add('customer-info-content-hidden');
    document.getElementById("contactCardsContainer").classList.add('customer-info-content-hidden');
    return;
  }

  try {
    const results = await searchCustomers(query); // Assuming searchCustomers can be reused
    const uniqueResults = [...new Set(results)];

    if (uniqueResults.length > 0) {
      dropdown.innerHTML = uniqueResults
        .map(name => `<li><a class="dropdown-item" href="#" onclick="selectCustomerInfo('${name}')">${name}</a></li>`)
        .join("");
      
      dropdown.classList.add('show');
    } else {
      dropdown.innerHTML = "";
      dropdown.classList.remove('show');
      document.getElementById("customerOrderHistoryContainer").classList.add('customer-info-content-hidden');
      document.getElementById("customerFieldsContainer").classList.add('customer-info-content-hidden');
      document.getElementById("contactCardsContainer").classList.add('customer-info-content-hidden');
    }
  } catch (error) {
    console.error("Error performing customer info search:", error);
    dropdown.classList.remove('show');
  }
});


// Hide dropdowns when clicking outside
document.addEventListener('click', (e) => {
  if (!e.target.closest('#customerSearch') && !e.target.closest('#customerDropdown')) {
    document.getElementById("customerDropdown").classList.remove('show');
  }
  if (!e.target.closest('#productSearch') && !e.target.closest('#productDropdown')) {
    document.getElementById("productDropdown").classList.remove('show');
  }
  if (!e.target.closest('#customerInfoSearch') && !e.target.closest('#customerInfoDropdown')) {
    document.getElementById("customerInfoDropdown").classList.remove('show');
  }
});

// Helper function to update the pricing table based on pricing toggle and selected product
function updatePricingTable(partNumber) {
  const pricingData = window.dataStore["Pricing"]?.dataframe || [];
  const pricingEntry = pricingData.find(row => String(row["Product"]).trim() === partNumber);
  const isB2C = document.getElementById("pricingToggle").checked;
  
  let tableHTML = "";

  if (pricingEntry) {
    const priceFB = isB2C ? pricingEntry["DISTR FB"] : pricingEntry["USER FB"];
    const priceHB = isB2C ? pricingEntry["DISTR HB"] : pricingEntry["USER HB"];
    const priceLTB = isB2C ? pricingEntry["DISTR LTB"] : pricingEntry["USER LTB"];
    
    tableHTML = `
    <tr>
      <td>${fmtPrice(priceFB)}</td>
      <td>${fmtPrice(priceHB)}</td>
      <td>${fmtPrice(priceLTB)}</td>
    </tr>
    `;
  } else {
    tableHTML = `<tr><td colspan="3" class="text-muted fst-italic">No pricing data available for product ${partNumber}</td></tr>`;
  }
  
  document.getElementById("priceTable").innerHTML = tableHTML;
}

// Helper function to update the order table based on filter state and selected product
function updateOrderTable(targetTableId = "orderHistoryTable") {
  const orderHistory = window.currentOrderHistory;
  if (!orderHistory) {
    document.getElementById(targetTableId).innerHTML = `<tr><td colspan="5" class="text-muted fst-italic">
      search for a customer to display order history
    </td></tr>`;
    return; // No customer selected
  }

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

  const tableBody = document.getElementById(targetTableId);
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
  document.querySelectorAll("#customerInfoOrderHistoryTable tr").forEach(tr => tr.classList.remove("selected-row"));
  
  // Highlight the clicked row
  rowElement.classList.add("selected-row");
  
  // Retrieve the product from the row's data attribute
  const product = rowElement.getAttribute("data-product").trim();
  
  // Set the product search input to the product and trigger search
  document.getElementById("productSearch").value = product;
  // Call selectProduct to update the product details and pricing info
  selectProduct(encodeURIComponent(product));
}

 
// Handle Customer Selection for Search Tab
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
  updateOrderTable("orderHistoryTable");
}

// Handle Customer Selection for Customer Info Tab
async function selectCustomerInfo(customerName) {
  document.getElementById("customerInfoSearch").value = customerName;
  document.getElementById("customerInfoDropdown").innerHTML = "";
  
  // Show the content containers
  document.getElementById("customerOrderHistoryContainer").classList.remove('customer-info-content-hidden');
  document.getElementById("customerFieldsContainer").classList.remove('customer-info-content-hidden');
  document.getElementById("contactCardsContainer").classList.remove('customer-info-content-hidden');

  // Fetch order history
  const orderHistory = await getOrderHistory(customerName);
  window.currentOrderHistory = orderHistory; // Update global for filtering
  orderHistory.sort((a, b) => new Date(b.Date) - new Date(a.Date));
  updateOrderTable("customerInfoOrderHistoryTable"); // Update order table for customer info tab

  // Fetch customer details (assuming there's a function like getCustomerDetails)
  const customerDetails = await getCustomerDetails(customerName); // This function needs to be implemented
  window.currentCustomerInfo = customerDetails; // Store for potential future use

  // Populate Customer Fields
  if (customerDetails) {
    document.getElementById("salesByYear").textContent = customerDetails["Sales by Year"] || "N/A";
    document.getElementById("customerLocation").textContent = customerDetails["Location"] || "N/A";
    document.getElementById("customerBusiness").textContent = customerDetails["Business"] || "N/A";
    document.getElementById("customerType").textContent = customerDetails["Type"] || "N/A";
    document.getElementById("customerRemarks").textContent = customerDetails["Remarks"] || "N/A";
    document.getElementById("customerWebsite").textContent = customerDetails["Website"] || "N/A";

    // Populate Contact Cards (assuming customerDetails.Contacts is an array of contact objects)
    const contactCardsContainer = document.getElementById("contactCardsContainer");
    contactCardsContainer.innerHTML = ''; // Clear previous contacts
    if (customerDetails.Contacts && customerDetails.Contacts.length > 0) {
      customerDetails.Contacts.forEach(contact => {
        const card = `
          <div class="contact-card">
            <h6>${contact.Name || 'N/A'}</h6>
            <p><strong>Title:</strong> ${contact.Title || 'N/A'}</p>
            <p><strong>Email:</strong> ${contact.Email || 'N/A'}</p>
            <p><strong>Phone:</strong> ${contact.Phone || 'N/A'}</p>
          </div>
        `;
        contactCardsContainer.innerHTML += card;
      });
    } else {
      contactCardsContainer.innerHTML = '<p class="text-muted fst-italic">No contacts available</p>';
    }

  } else {
    // Clear fields if no details found
    document.getElementById("salesByYear").textContent = "N/A";
    document.getElementById("customerLocation").textContent = "N/A";
    document.getElementById("customerBusiness").textContent = "N/A";
    document.getElementById("customerType").textContent = "N/A";
    document.getElementById("customerRemarks").textContent = "N/A";
    document.getElementById("customerWebsite").textContent = "N/A";
    document.getElementById("contactCardsContainer").innerHTML = '<p class="text-muted fst-italic">No contacts available</p>';
  }
}


// Add an event listener for changes on the filter toggle switch
document.getElementById("filterOrdersToggle").addEventListener("change", () => {
  updateOrderTable("orderHistoryTable");
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
      const qtyCommitted = parseFloat(selectedProduct["QtyCommited"]) || 0;
      const qtyAvailable = qtyOnHand - qtyCommitted;
      const reorderLevel = parseFloat(selectedProduct["ReOrder Level"]) || 0;
      const qtyOnOrder = parseFloat(selectedProduct["QtyOnOrder"]) || 0;
  
      console.debug(`[selectProduct] Qty Available: ${qtyAvailable}, Reorder Level: ${reorderLevel}, Qty On Order: ${qtyOnOrder}`);
      // Prepare the cell content with a truck icon
      let qtyAvailableCellContent = `${qtyAvailable}`;
      const truckColorClass = qtyOnOrder > 0 ? "truck-bright-green" : "truck-faded-grey";
      qtyAvailableCellContent += `
        <i class="fas fa-truck ${truckColorClass} ms-2"
          data-bs-toggle="tooltip" 
          data-bs-placement="top" 
          title="Qty On Order: ${qtyOnOrder}">
        </i>`;
  
      // Prepare Unit Cost with a tooltip for price raises
      const baseUnitCost = selectedProduct["UnitCost"];
      const raiseInfo = window.dataStore["PriceRaise"]?.dataframe[partNumber];

      let unitCostCellContent = baseUnitCost;

      if (raiseInfo) {
        // Bootstrap needs <br> and data-bs-html="true" for line-breaks
        const country = getCountryName(raiseInfo.COO);
        const tooltipHtml = `COO: ${country}<br>
                            July&nbsp;9<sup>th</sup>&nbsp;Cost&nbsp;<i class="fa-solid fa-arrow-up"></i>: ${raiseInfo.July9thIncrease}<br>
                            Added&nbsp;Cost: ${raiseInfo.AddedCost}`;
                            
        unitCostCellContent += `
          <i class="fa-solid fa-chart-line text-danger ms-2"
            data-bs-toggle="tooltip"
            data-bs-html="true"
            data-bs-placement="top"
            title='${tooltipHtml}'>
          </i>`;
      }
      
      document.getElementById("productTable").innerHTML = `
        <tr>
          <td>${selectedProduct["PartNumber"]}</td>
          <td>${selectedProduct["Description"]}</td>
          <td>${qtyAvailableCellContent}</td>
          <td>${unitCostCellContent}</td>
          <td>${selectedProduct["FullBoxQty"] || '-'}</td>
        </tr>`;

      // Initialize tooltips (necessary if dynamically adding tooltips)
      document.querySelectorAll('[data-bs-toggle="tooltip"]').forEach(el => {
        new bootstrap.Tooltip(el);
      });

      // Store the current product for later reference
      window.currentProduct = partNumber;
      // Update the pricing table with the selected product’s pricing info
      updatePricingTable(partNumber);

      // Retrieve the replacements mapping for this product
      const equivalentsMap = window.dataStore["Equivalents"] || {};
      const replacements = equivalentsMap[partNumber];
      const bulbIcon = document.getElementById("genericBulb");
      const container = document.getElementById("genericContainer");
      const slideText = document.getElementById("genericSlideText");
      
      if (replacements && replacements.length > 0) {
        // Show the general message instead of a specific replacement
        slideText.textContent = "Replacements found";
        container.style.display = "inline-block";
        
        // Set initial animation states
        slideText.style.opacity = '0';
        slideText.style.transform = 'translateY(-50%) translateX(20px)';
        void slideText.offsetWidth; // Force reflow for transition
        setTimeout(() => {
          slideText.style.opacity = '1';
          slideText.style.transform = 'translateY(-50%) translateX(0)';
        }, 10);

        // Animate the lightbulb icon
        bulbIcon.classList.remove("animate__animated", "animate__heartBeat", "glow-effect");
        void bulbIcon.offsetWidth;
        bulbIcon.classList.add("animate__animated", "animate__heartBeat", "glow-effect");
        setTimeout(() => bulbIcon.classList.remove("glow-effect"), 2000);
        
        // Set click handler to drop all available replacements into the dropdown
        bulbIcon.onclick = (e) => {
          e.stopPropagation();  // Prevents the document's click event from hiding the dropdown immediately
          
          // Create dropdown items for each replacement
          dropdown.innerHTML = replacements.map(repl =>
            `<li>
              <a class="dropdown-item" href="#"
                 onclick="event.stopPropagation(); selectProduct('${encodeURIComponent(repl)}');">
                ${repl}
              </a>
            </li>`).join("");
          dropdown.classList.add("show");
        };
      } else {
        container.style.display = "none";
        bulbIcon.onclick = null;
      }

      // After selecting a product, if a customer is already selected, update order filtering
      if (window.currentOrderHistory) {
        updateOrderTable("orderHistoryTable");
      }
    } else {
      document.getElementById("productTable").innerHTML = `
        <tr>
          <td colspan="5" class="text-muted fst-italic">
            No matching product details found.
          </td>
        </tr>`;
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

    // Ensure the default tab is active and corresponding content is shown
    const searchTab = document.getElementById('search-tab');
    const searchView = document.getElementById('searchView');
    if (searchTab && searchView) {
      searchTab.classList.add('active');
      searchView.classList.add('show', 'active');
      document.getElementById('customerInfoView').classList.remove('show', 'active');
      document.getElementById('customer-info-tab').classList.remove('active');
    }
}

// Update UI after logout
function updateUIForLoggedOutUser() {
    document.getElementById('appContainer').style.display = 'none';
    document.getElementById('loginContainer').style.display = 'flex';
    
    // Check if elements exist before manipulating them
    const fileListContainer = document.getElementById('fileListContainer');
    if (fileListContainer) fileListContainer.innerHTML = '';
    
    const welcomeMessage = document.getElementById('welcomeMessage');
    if (welcomeMessage) welcomeMessage.style.display = 'block';

    // Hide all customer info containers on logout
    document.getElementById("customerOrderHistoryContainer").classList.add('customer-info-content-hidden');
    document.getElementById("customerFieldsContainer").classList.add('customer-info-content-hidden');
    document.getElementById("contactCardsContainer").classList.add('customer-info-content-hidden');
}

// Add event listeners for tab switching
document.getElementById('search-tab').addEventListener('click', () => {
  document.getElementById('searchView').classList.add('show', 'active');
  document.getElementById('customerInfoView').classList.remove('show', 'active');
});

document.getElementById('customer-info-tab').addEventListener('click', () => {
  document.getElementById('customerInfoView').classList.add('show', 'active');
  document.getElementById('searchView').classList.remove('show', 'active');
  
  // Hide customer details content when switching to Customer Info tab
  document.getElementById("customerOrderHistoryContainer").classList.add('customer-info-content-hidden');
  document.getElementById("customerFieldsContainer").classList.add('customer-info-content-hidden');
  document.getElementById("contactCardsContainer").classList.add('customer-info-content-hidden');

  // Clear customer search on tab switch
  document.getElementById("customerInfoSearch").value = "";
  document.getElementById("customerInfoDropdown").innerHTML = "";
  document.getElementById("customerInfoOrderHistoryTable").innerHTML = `<tr><td colspan="5" class="text-muted fst-italic">
      select a customer to display order history
    </td></tr>`;
});


// Temporary mock function for getCustomerDetails
// YOU WILL NEED TO REPLACE THIS WITH ACTUAL DATA FETCHING LOGIC
async function getCustomerDetails(customerName) {
  // Mock data for demonstration
  const mockCustomerData = {
    "Acme Corp": {
      "Sales by Year": "$1,200,000 (2024)",
      "Location": "New York, USA",
      "Business": "Manufacturing",
      "Type": "B2B",
      "Remarks": "Key account, high potential for growth.",
      "Website": "https://www.acmecorp.com",
      "Contacts": [
        { Name: "John Doe", Title: "Purchasing Manager", Email: "john.doe@acme.com", Phone: "555-123-4567" },
        { Name: "Jane Smith", Title: "CEO", Email: "jane.smith@acme.com", Phone: "555-987-6543" }
      ]
    },
    "Global Solutions": {
      "Sales by Year": "$500,000 (2024)",
      "Location": "London, UK",
      "Business": "Software Development",
      "Type": "B2B",
      "Remarks": "New client, growing steadily.",
      "Website": "https://www.globalsolutions.co.uk",
      "Contacts": [
        { Name: "Alice Brown", Title: "CTO", Email: "alice.brown@global.com", Phone: "020-7946-0123" }
      ]
    }
  };
  return mockCustomerData[customerName] || null;
}


// Expose function globally
window.UIrenderer = {
  updateUIForLoggedInUser,
  updateUIForLoggedOutUser,
  orderRowClicked,
  selectCustomer, // Expose selectCustomer for the Search tab
  selectCustomerInfo // Expose selectCustomerInfo for the Customer Info tab
};
