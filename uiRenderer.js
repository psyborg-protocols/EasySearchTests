const moneyFmt = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,   // always “.00”
  maximumFractionDigits: 2
});

/**
 * Safely converts a value to a number, handling strings with currency symbols.
 * @param {*} val - The value to convert.
 * @returns {number} The converted number, or 0 if conversion fails.
 */
function toNumber(val) {
  if (typeof val === 'number') {
    return isFinite(val) ? val : 0;
  }
  if (typeof val === "string") {
    // Remove characters that aren't digits, decimal point, or negative sign.
    const sanitized = val.replace(/[^0-9.-]/g, '');
    const num = parseFloat(sanitized);
    return isFinite(num) ? num : 0;
  }
  return 0;
}

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

function asLink(url) {
  if (!url) return "N/A";
  const safe = url.startsWith("http") ? url : `https://${url}`;
  return `<a href="${safe}" target="_blank" rel="noopener">${safe.replace(/^https?:\/\//,"")}</a>`;
}

function emailLink(addr) {
  if (!addr) return "N/A";
  // Outlook Web deeplink — opens the user’s O365 / personal account
  const url = `https://outlook.office.com/mail/deeplink/compose?to=${encodeURIComponent(addr)}`;
  return `<a href="${url}" target="_blank" rel="noopener">${addr}</a>`;
}

/* keep one Chart.js instance per tab load */
let salesChart = null;
function drawSalesChart(salesByYearObj) {
  const safe = salesByYearObj || {};

  /* ---- build ordered arrays of years & values ---- */
  const YEARS  = ["2019","2020","2021","2022","2023","2024","2025"];
  const years  = [];
  const values = [];

  YEARS.forEach(y => {
    if (Object.prototype.hasOwnProperty.call(safe, y)) {
      // strip commas, currency symbols, spaces -> float
      const num = parseFloat(String(safe[y]).replace(/[^0-9.\-]/g, ""));
      if (!isNaN(num)) {
        years.push(y);
        values.push(num);
      }
    }
  });

  /* ---- nothing to plot? clear & bail ---- */
  if (years.length === 0) {
    if (salesChart) salesChart.destroy();
    return;
  }

  /* ---- prepare canvas ---- */
  const ctx = document.getElementById("salesByYearChart");
  if (!ctx) return;

  if (salesChart) salesChart.destroy();            // remove previous instance

  /* ---- create new bar chart ---- */
  salesChart = new Chart(ctx, {
    type: "bar",
    data: {
      labels: years,
      datasets: [{
        data: values,
        borderWidth: 1
      }]
    },
    options: {
      plugins: { legend: { display: false } },
      scales : {
        x: {
          ticks: { font: { size: 10 } }
        },
        y: {
          display: false,
          beginAtZero: true
        }
      }
    }
  });
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
    const results = await searchCustomers(query);
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

// Handle the pricing toggle switch label
const toggle = document.getElementById("pricingToggle");
const label = document.getElementById("pricingLabel");

toggle.addEventListener("change", () => {
  if (toggle.checked) {
    label.textContent = "Distributor Pricing";
  } else {
    label.textContent = "Customer Pricing";
  }
});

// Helper function to update the pricing table based on pricing toggle and selected product
function updatePricingTable(partNumber) {
  const pricingData = window.dataStore["Pricing"]?.dataframe || [];
  const pricingEntry = pricingData.find(row => String(row["Product"]).trim() === partNumber);
  const isB2B = document.getElementById("pricingToggle").checked;
  
  let tableHTML = "";

  if (pricingEntry) {
    const priceFB = isB2B ? pricingEntry["DISTR FB"] : pricingEntry["USER FB"];
    const priceHB = isB2B ? pricingEntry["DISTR HB"] : pricingEntry["USER HB"];
    const priceLTB = isB2B ? pricingEntry["DISTR LTB"] : pricingEntry["USER LTB"];
    
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
      select a customer to display order history
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
      <tr class="order-row" data-product="${order.Product_Service}" data-quantity="${order.Quantity}" data-price="${order.Sales_Price}" onclick="UIrenderer.orderRowClicked(this)">
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
  
  // Retrieve data from the row's data attributes
  const product = rowElement.dataset.product.trim();
  const quantity = rowElement.dataset.quantity;
  const price = rowElement.dataset.price;
  
  // Set the product search input to the product
  document.getElementById("productSearch").value = product;

  // Call selectProduct, passing the extra info from the order
  selectProduct(encodeURIComponent(product), { quantity, price });
}

 
// Handle Customer Selection for Search Tab
async function selectCustomer(customerName) {
  document.getElementById("customerSearch").value = customerName;
  document.getElementById("customerDropdown").innerHTML = "";

  const orderHistory = await getOrderHistory(customerName);
  // Save full order history for later filtering
  window.currentOrderHistory = orderHistory;

  // store the current customer name
  window.currentCustomer = customerName;

  // Sort orders by ascending date if needed
  orderHistory.sort((a, b) => new Date(b.Date) - new Date(a.Date));

  // Render orders (this will apply filtering if the toggle is on)
  updateOrderTable("orderHistoryTable");

  const details = await getCustomerDetails(customerName);
  if (details) {
    const toggle = document.getElementById("pricingToggle");
    const isDistributor = String(details.business).trim().toLowerCase() === "distributor";
    toggle.checked = isDistributor;
    // Update the label based on the toggle state
    toggle.dispatchEvent(new Event('change'));

    // Optionally update pricing table if product is already selected
    if (window.currentProduct) updatePricingTable(window.currentProduct);
  }
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

  // Fetch customer details from the Excel file
  const customerDetails = await getCustomerDetails(customerName);
  window.currentCustomerInfo = customerDetails; // Store for potential future use

  // Populate Customer Fields from Excel data
  if (customerDetails) {
    drawSalesChart(customerDetails.salesByYear);
    document.getElementById("customerLocation").textContent = customerDetails.location || "N/A";
    document.getElementById("customerBusiness").textContent = customerDetails.business || "N/A";
    document.getElementById("customerType").textContent = customerDetails.type || "N/A";
    document.getElementById("customerRemarks").textContent = customerDetails.remarks || "N/A";
    document.getElementById("customerWebsite").innerHTML  = asLink(customerDetails.website);
  } else {
    // clear everything if no Excel data found
    if (salesChart) salesChart.destroy();
    ["customerLocation","customerBusiness","customerType","customerRemarks","customerWebsite"]
      .forEach(id => document.getElementById(id).textContent = "N/A");
  }

  // --- NEW: Populate Contacts from GAL data ---
  const contactCardsContainer = document.getElementById("contactCardsContainer");
  const orgContacts = window.dataStore.OrgContacts; // This is a Map
  const companyKey = customerName.trim().toLowerCase();
  
  if (orgContacts && orgContacts.has(companyKey)) {
    const contacts = orgContacts.get(companyKey);
    contactCardsContainer.innerHTML = contacts.map(c => `
        <div class="contact-card">
          <h6>${c.Name || "N/A"}</h6>
          <p><strong>Title:</strong> ${c.Title || "N/A"}</p>
          <p><strong>Email:</strong> ${emailLink(c.Email)}</p>
        </div>
      `).join("");
  } else {
    contactCardsContainer.innerHTML = '<p class="text-muted fst-italic">No contacts found in GAL for this company.</p>';
  }
}

let productInfoModalInstance = null;
/**
 * Finds all data for a given product and displays it in a polished Bootstrap modal.
 * @param {string} encodedPartNumber - The URI-encoded part number of the product.
 */
function showProductInfoModal(encodedPartNumber) {
  const partNumber = decodeURIComponent(encodedPartNumber).toString().trim();
  const inventoryData = window.dataStore["DB"]?.dataframe || [];
  const product = inventoryData.find(item => String(item["PartNumber"]).trim() === partNumber);

  if (!product) {
    console.error("Could not find product details for modal:", partNumber);
    return;
  }

  // 2. Check if the modal instance has been created yet. If not, create it.
  if (!productInfoModalInstance) {
    productInfoModalInstance = new bootstrap.Modal(document.getElementById('productInfoModal'));
  }

  // --- (The rest of the function to populate the modal content remains the same) ---
  document.getElementById('productInfoModalLabel').textContent = product.PartNumber || "N/A";
  document.getElementById('productInfoModalDescription').textContent = product.Description || "";
  const modalBody = document.getElementById('productInfoModalBody');
  const fieldsToShow = [
    "Active", "QtyOnHand", "QtyCommited", "ReOrder Level",
    "QtyOnOrder", "FullBoxQty", "UnitCost", "ExtValue"
  ];
  let bodyHtml = '';
  fieldsToShow.forEach(field => {
    const displayName = field.replace(/([A-Z])/g, ' $1').trim();
    const value = product[field];
    let displayValue;
    if (value === undefined || value === null || String(value).trim() === "") {
      displayValue = '<i class="text-muted">N/A</i>';
    } else {
      switch (field) {
        case 'UnitCost':
        case 'ExtValue':
          displayValue = (typeof value === 'number') ? moneyFmt.format(value) : value;
          break;
        case 'Active':
          displayValue = String(value).toLowerCase() === 'active' 
            ? '<span class="badge bg-success">Active</span>' 
            : '<span class="badge bg-secondary">Inactive</span>';
          break;
        case 'QtyOnHand':
          const qtyOnHand = toNumber(value);
          const reOrderLevel = toNumber(product["ReOrder Level"]);
          let qtyClass = '';
          if (reOrderLevel > 0 && qtyOnHand <= reOrderLevel) {
            qtyClass = 'text-danger fw-bold low-stock';
          }
          displayValue = `<span class="${qtyClass}">${qtyOnHand}</span>`;
          break;
        default:
          displayValue = value;
          break;
      }
    }
    bodyHtml += `
      <div class="row">
        <dt class="col-sm-5">${displayName}</dt>
        <dd class="col-sm-7 mb-0">${displayValue}</dd>
      </div>
    `;
  });
  modalBody.innerHTML = bodyHtml;
  // --- (End of content population logic) ---

  // 3. Now, just show the single, persistent modal instance.
  productInfoModalInstance.show();
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
        .map(product => {
          // Check if the product's PartNumber is an exact match (case-insensitive)
          const isExact = product["PartNumber"].toLowerCase() === query.toLowerCase();
          
          return `
          <li>
            <a class="dropdown-item ${isExact ? 'fw-bold' : ''}" href="#"
              onclick="event.stopPropagation(); selectProduct('${encodeURIComponent(product["PartNumber"])}');">
              ${product["PartNumber"]} - ${product["Description"]}
            </a>
          </li>`;
        })
        .join("");
      dropdown.classList.add('show');
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

async function selectProduct(encodedPartNumber, options = {}) {
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
      const qtyOnHand = toNumber(selectedProduct["QtyOnHand"]);
      const qtyCommitted = toNumber(selectedProduct["QtyCommited"]);
      const qtyAvailable = qtyOnHand - qtyCommitted;
      const qtyOnOrder = toNumber(selectedProduct["QtyOnOrder"]);
  
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
      const baseUnitCost = toNumber(selectedProduct["UnitCost"]);
      const raiseInfo = window.dataStore["PriceRaise"]?.dataframe[partNumber];

      let unitCostCellContent = baseUnitCost? `$${baseUnitCost.toFixed(2)}`: "N/A";

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
        <tr class="product-row" onclick="showProductInfoModal('${encodeURIComponent(partNumber)}')">
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

      // --- Populate Quote Calculator ---
      const quoteInfo = {
          PartNumber: selectedProduct["PartNumber"],
          UnitCost: baseUnitCost, // Use the parsed number
          Quantity: options.quantity, // from the clicked order row
          Price: options.price        // from the clicked order row
      };
      quoteCalculator.populate(quoteInfo);


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

  // if a customer is selected in the Search tab, show them in Customer Info
  if (window.currentCustomer) {
    selectCustomerInfo(window.currentCustomer);
  } else {
    // fallback: blank out content if no customer was selected
    ["customerOrderHistoryContainer", "customerFieldsContainer", "contactCardsContainer"]
      .forEach(id => document.getElementById(id).classList.add('customer-info-content-hidden'));

    document.getElementById("customerInfoSearch").value = "";
    document.getElementById("customerInfoDropdown").innerHTML = "";
    document.getElementById("customerInfoOrderHistoryTable").innerHTML = `<tr><td colspan="5" class="text-muted fst-italic">
      select a customer to display order history
    </td></tr>`;
  }
});


async function getCustomerDetails(customerName) {
  // thin wrapper around dataLoader => keeps rest of code unchanged
  return window.dataLoader.getCustomerDetails(customerName);
}

// --- Quote Calculator Object ---
const quoteCalculator = {
    /**
     * Updates a single row in the quote calculator table based on its editable inputs.
     * @param {HTMLElement} rowElement - The <tr> element to update.
     */
    updateRow: function(rowElement) {
        // If it was a placeholder, make it a normal row upon editing
        if (rowElement.classList.contains('placeholder-row')) {
            rowElement.classList.remove('placeholder-row');
        }

        const getNumeric = (selector) => {
            const el = rowElement.querySelector(`[data-col="${selector}"]`);
            if (!el) return 0;
            // Use the global toNumber helper for safe parsing
            return toNumber(el.textContent);
        };

        const quantity = getNumeric('quantity');
        const unitCost = getNumeric('unitcost');
        const price = getNumeric('price');

        const orderTotal = quantity * price;
        const totalProfit = (price - unitCost) * quantity;
        const margin = (price > 0) ? ((price - unitCost) / price) * 100 : 0;

        // Update the calculated cells with formatting
        rowElement.querySelector('[data-col="ordertotal"]').textContent = moneyFmt.format(orderTotal);
        rowElement.querySelector('[data-col="totalprofit"]').textContent = moneyFmt.format(totalProfit);
        rowElement.querySelector('[data-col="margin"]').textContent = margin.toFixed(1) + '%';

        // Update the price difference indicator
        this.updatePriceDifferenceIndicator();
    },

    /**
     * Checks prices in the first two rows and displays a percentage difference
     * indicator below the second row's price cell if they are different.
     */
    updatePriceDifferenceIndicator: function() {
        const tableBody = document.getElementById('quoteCalculatorBody');
        if (tableBody.rows.length < 2) return; // Exit if there aren't at least two rows

        const firstRow = tableBody.rows[0];
        const secondRow = tableBody.rows[1];
        const priceCellSecondRow = secondRow.querySelector('[data-col="price"]');

        // First, remove any existing indicator to ensure a clean slate
        const existingIndicator = priceCellSecondRow.querySelector('.price-diff-indicator');
        if (existingIndicator) {
            existingIndicator.remove();
        }

        const price1 = toNumber(firstRow.querySelector('[data-col="price"]').textContent);
        const price2 = toNumber(secondRow.querySelector('[data-col="price"]').textContent);

        // Show indicator only if both prices are valid numbers and are different
        if (price1 > 0 && price2 > 0 && price1 !== price2) {
            const diff = ((price2 - price1) / price1) * 100;
            
            const indicator = document.createElement('div');
            indicator.className = 'price-diff-indicator'; // For easy selection
            
            const sign = diff > 0 ? '+' : '';
            indicator.textContent = `${sign}${diff.toFixed(1)}%`;
            indicator.style.color = diff > 0 ? 'green' : 'red';
            indicator.style.fontSize = '0.75rem';
            indicator.style.fontWeight = 'bold';
            indicator.style.textAlign = 'center';
            indicator.style.marginTop = '4px';

            priceCellSecondRow.appendChild(indicator);
        }
    },

    /**
     * Populates the quote calculator with data from a selected product.
     * – If the selection came from **order‑history** (has Quantity & Price),
     * fill everything and precalculate profit.
     * – If the selection came from a **plain product search**, leave
     * Quantity/Price blank so the user can type them and calculations
     * will run only after input.
     *
     * @param {object} productInfo  {
     * PartNumber : string,            // required
     * UnitCost   : number|string,     // required
     * Quantity   : number|string,     // optional (order history only)
     * Price      : number|string      // optional (order history only)
     * }
     */
    populate: function (productInfo) {
        if (!productInfo || !productInfo.PartNumber) return;

        const tableBody = document.getElementById('quoteCalculatorBody');
        const firstRow  = tableBody.rows[0];
        const secondRow = tableBody.rows[1];

        const unitCost = toNumber(productInfo.UnitCost);

        // ---------- decide whether this came from Order‑History ----------
        const hasOrder = productInfo.Quantity !== undefined &&
                        productInfo.Price    !== undefined;

        // ---------- FIRST ROW -------------------------------------------------
        firstRow.querySelector('[data-col="product"]').textContent  = productInfo.PartNumber;
        firstRow.querySelector('[data-col="unitcost"]').textContent = unitCost.toFixed(2);

        if (hasOrder) {
            // Pre‑fill everything and calculate profit
            firstRow.querySelector('[data-col="quantity"]').textContent = productInfo.Quantity;
            firstRow.querySelector('[data-col="price"]').textContent    = toNumber(productInfo.Price).toFixed(2);
            this.updateRow(firstRow);                 // runs the math
        } else {
            // Leave qty/price blank; clear all computed cells
            ['quantity','price','ordertotal','margin','totalprofit'].forEach(c =>
                firstRow.querySelector(`[data-col="${c}"]`).textContent = ''
            );
        }

        // ---------- SECOND ROW (grey placeholder) -----------------------------
        const initPlaceholder = (cloneQtyPrice) => {
            secondRow.classList.add('placeholder-row');
            secondRow.querySelector('[data-col="product"]').textContent  = productInfo.PartNumber;
            secondRow.querySelector('[data-col="unitcost"]').textContent = unitCost.toFixed(2);

            // copy or leave blank depending on click source
            secondRow.querySelector('[data-col="quantity"]').textContent = cloneQtyPrice ? productInfo.Quantity : '';
            secondRow.querySelector('[data-col="price"]').textContent    = cloneQtyPrice ? toNumber(productInfo.Price).toFixed(2) : '';

            // always clear the computed columns
            ['ordertotal','margin','totalprofit'].forEach(c =>
                secondRow.querySelector(`[data-col="${c}"]`).textContent = ''
            );
        };

        initPlaceholder(hasOrder);   // duplicate qty/price only for order‑history picks

    }

};


// Expose functions and objects globally
window.quoteCalculator = quoteCalculator;
window.UIrenderer = {
  updateUIForLoggedInUser,
  updateUIForLoggedOutUser,
  orderRowClicked,
  selectCustomer, // Expose selectCustomer for the Search tab
  selectCustomerInfo, // Expose selectCustomerInfo for the Customer Info tab
  showProductInfoModal
};
