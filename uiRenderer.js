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
  // Outlook Web deeplink — opens the user’s O355 / personal account
  const url = `https://outlook.office.com/mail/deeplink/compose?to=${encodeURIComponent(addr)}`;
  return `<a href="${url}" target="_blank" rel="noopener">${addr}</a>`;
}

/* keep one Chart.js instance per tab load */
let salesChart = null;
function drawSalesChart(salesByYearObj) {
  const safe = salesByYearObj || {};

  const today = new Date();
  const currentYear = today.getFullYear();
  const startOfYear = new Date(today.getFullYear(), 0, 0);
  const diff = today - startOfYear;
  const oneDay = 1000 * 60 * 60 * 24;
  const dayOfYear = Math.floor(diff / oneDay);
  const isLeap = new Date(currentYear, 1, 29).getMonth() === 1;
  const daysInYear = isLeap ? 366 : 365;

  const labels = [];
  const actualValues = [];
  const projectedValues = [];
  
  // Get all years from the data and sort them
  const yearsInData = Object.keys(safe).sort();

  yearsInData.forEach(yearStr => {
    const year = parseInt(yearStr, 10);
    const num = safe[yearStr];
    
    labels.push(yearStr);
    actualValues.push(num);

    if (year === currentYear && dayOfYear > 0 && dayOfYear < daysInYear) {
        const runRate = num / (dayOfYear / daysInYear);
        const projection = runRate - num;
        projectedValues.push(projection > 0 ? projection : 0);
    } else {
        projectedValues.push(0);
    }
  });

  if (labels.length === 0) {
    if (salesChart) salesChart.destroy();
    return;
  }

  const ctx = document.getElementById("salesByYearChart");
  if (!ctx) return;

  if (salesChart) salesChart.destroy();

  salesChart = new Chart(ctx, {
    type: "bar",
    data: {
      labels: labels,
      datasets: [{
        label: 'Actual',
        data: actualValues,
        backgroundColor: 'rgba(54, 162, 235, 0.8)',
        borderColor: 'rgba(54, 162, 235, 1)',
        borderWidth: 1
      }, {
        label: 'Projected',
        data: projectedValues,
        backgroundColor: 'rgba(255, 159, 64, 0.8)',
        borderColor: 'rgba(255, 159, 64, 1)',
        borderWidth: 1
      }]
    },
    options: {
      plugins: {
        legend: { display: true, position: 'bottom', labels: { boxWidth: 12, font: { size: 10 } } },
        tooltip: {
            callbacks: {
                label: function(context) {
                    let label = context.dataset.label || '';
                    if (label) {
                        label += ': ';
                    }
                    if (context.parsed.y !== null) {
                        label += new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(context.parsed.y);
                    }
                    return label;
                }
            }
        }
      },
      scales: {
        x: { stacked: true, ticks: { font: { size: 10 } } },
        y: { stacked: true, display: false, beginAtZero: true }
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


// Helper function to update the pricing table based on pricing toggle and selected product
function updatePricingTable(partNumber) {
  const pricingData = window.dataStore["Pricing"]?.dataframe || [];
  const pricingEntry = pricingData.find(row => String(row["Product"]).trim() === partNumber);
  const isB2B = document.getElementById("pricingToggle").checked;
  const tableBody = document.getElementById("priceTable"); // This is the <tbody>

  // Get the parent table element
  const parentTable = tableBody.closest('table');
  if (parentTable) {
    // Apply/remove a class to the whole table for styling
    if (isB2B) {
      parentTable.classList.add("b2b-pricing-active");
    } else {
      parentTable.classList.remove("b2b-pricing-active");
    }
  }
  
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
  
  tableBody.innerHTML = tableHTML;
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

/**
 * Handles the logic for merging/updating contacts when the user confirms.
 * This version is designed to work with the accordion UI.
 * @param {HTMLElement} buttonElement - The button that was clicked.
 * @param {string} correctCompanyName - The company name from Sales data.
 * @param {string} mismatchedCompanyName - The company name found in the GAL.
 */
async function handleContactMerge(buttonElement, correctCompanyName, mismatchedCompanyName) {
    const actionDiv = buttonElement.parentElement;
    if (!actionDiv) return;

    // 1. Show spinner
    actionDiv.innerHTML = `
        <div class="d-flex align-items-center text-primary">
            <div class="spinner-border spinner-border-sm me-2" role="status"></div>
            <span>Updating contacts...</span>
        </div>`;

    const orgContacts = window.dataStore.OrgContacts;
    const contactsToUpdate = orgContacts.get(mismatchedCompanyName) || [];
    
    try {
        // 2. Call the backend for each contact
        const updatePromises = contactsToUpdate.map(contact => 
            dataLoader.updateContactCompany(contact.Email, correctCompanyName)
        );
        await Promise.all(updatePromises);

        // --- 3. Handle Success ---
        
        // a. Update UI to show success
        actionDiv.innerHTML = `<div class="text-success fw-bold"><i class="fas fa-check-circle me-2"></i>Contacts updated successfully!</div>`;
        const accordionItem = actionDiv.closest('.accordion-item');
        if (accordionItem) {
            const headerButton = accordionItem.querySelector('.accordion-button');
            headerButton.classList.add('text-muted');
            headerButton.innerHTML += ` <span class="badge bg-success ms-auto">Updated</span>`;
        }

        // b. Update in-memory data store to prevent re-suggestion
        const correctKey = correctCompanyName.trim().toLowerCase();
        const correctContactsList = orgContacts.get(correctKey) || [];
        
        contactsToUpdate.forEach(contact => {
            if (!correctContactsList.some(c => c.Email.toLowerCase() === contact.Email.toLowerCase())) {
                 correctContactsList.push(contact);
            }
        });

        orgContacts.set(correctKey, correctContactsList);
        orgContacts.delete(mismatchedCompanyName);

        console.log(`In-memory store updated. Moved ${contactsToUpdate.length} contacts from "${mismatchedCompanyName}" to "${correctCompanyName}".`);
        
        // c. After a delay, refresh the whole view to reflect the changes cleanly
        setTimeout(() => {
            selectCustomerInfo(correctCompanyName);
        }, 2000);

    } catch (error) {
        // --- 4. Handle Error ---
        console.error("Failed to update contacts:", error);
        const safeCorrectName = correctCompanyName.replace(/'/g, "\\'");
        const safeMismatchedName = mismatchedCompanyName.replace(/'/g, "\\'");
        actionDiv.innerHTML = `
            <div class="text-danger">
                <i class="fas fa-times-circle me-2"></i>Update Failed.
                <button class="btn btn-sm btn-outline-secondary ms-2" onclick="UIrenderer.handleContactMerge(this, '${safeCorrectName}', '${safeMismatchedName}')">Retry</button>
            </div>`;
    }
}

/**
 * Handles the user clicking "Save" on the AI-suggested details.
 * @param {string} customerName - The name of the customer being updated.
 * @param {object} finalDetails - The complete, merged details object to save.
 */
async function confirmAndSaveChanges(customerName, finalDetails) {
    const confirmationBox = document.getElementById('aiConfirmationBox');
    if (!confirmationBox) return;

    // 1. Show a saving state
    confirmationBox.innerHTML = `
        <div class="d-flex align-items-center text-primary">
            <div class="spinner-border spinner-border-sm me-2" role="status"></div>
            <span>Saving details...</span>
        </div>`;

    try {
        // 2. Call the dataLoader function to perform the update
        await dataLoader.updateCustomerDetails(customerName, finalDetails);
        
        // 3. Update the global state
        window.currentCustomerInfo = finalDetails;

        // 4. Show success and then fade out
        confirmationBox.innerHTML = `
            <div class="text-success fw-bold">
                <i class="fas fa-check-circle me-2"></i>Details Saved!
            </div>`;
        
        setTimeout(() => {
            confirmationBox.style.opacity = '0';
            setTimeout(() => {
                confirmationBox.style.display = 'none';
                confirmationBox.innerHTML = ''; // Clear content
            }, 300); // Wait for fade out transition
        }, 2000); // Show success for 2 seconds

    } catch (error) {
        console.error("Failed to save customer details:", error);
        // 5. Show an error state
        const safeCustomerName = customerName.replace(/'/g, "\\'");
        confirmationBox.innerHTML = `
            <div class="text-danger">
                <i class="fas fa-times-circle me-2"></i>Save Failed.
                <button class="btn btn-sm btn-outline-secondary ms-2" 
                        onclick='UIrenderer.confirmAndSaveChanges("${safeCustomerName}", ${JSON.stringify(finalDetails)})'>
                    Retry
                </button>
            </div>`;
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

  // Hide and clear the confirmation box from any previous selection
  const confirmationBox = document.getElementById('aiConfirmationBox');
  confirmationBox.style.display = 'none';
  confirmationBox.innerHTML = '';

  // --- IMMEDIATE UI UPDATES ---
  // Fetch and display everything we already have, right away.

  // 1. Fetch and display order history
  const orderHistory = await getOrderHistory(customerName);
  window.currentOrderHistory = orderHistory;
  orderHistory.sort((a, b) => new Date(b.Date) - new Date(a.Date));
  updateOrderTable("customerInfoOrderHistoryTable");

  // 2. Fetch existing details and display them immediately
  let customerDetails = (await getCustomerDetails(customerName)) || {};
  window.currentCustomerInfo = customerDetails;

  document.getElementById("customerLocation").textContent = customerDetails.location || "N/A";
  document.getElementById("customerBusiness").textContent = customerDetails.business || "N/A";
  document.getElementById("customerType").textContent = customerDetails.type || "N/A";
  document.getElementById("customerRemarks").textContent = customerDetails.remarks || "N/A";
  document.getElementById("customerWebsite").innerHTML = asLink(customerDetails.website);

  // 3. Render Sales Chart
  const salesByYear = (window.dataStore.Sales?.dataframe || [])
    .filter(sale => sale.Customer === customerName)
    .reduce((acc, sale) => {
        const date = new Date(sale.Date);
        if (!isNaN(date)) {
            const year = date.getFullYear();
            const amount = toNumber(sale.Total_Amount);
            acc[year] = (acc[year] || 0) + amount;
        }
        return acc;
    }, {});
  drawSalesChart(salesByYear);

  // 4. Render Contacts
  renderContactCards(customerName);


  // --- ASYNCHRONOUS ENHANCEMENT ---
  // Now, check if we need to fetch more data in the background.

  const needsResearch = !customerDetails.location || !customerDetails.business || !customerDetails.type || !customerDetails.website;

  if (needsResearch) {
    // --- UI CUE: Show spinners for fields that are being researched ---
    const fieldsToResearch = {
      location: !customerDetails.location,
      business: !customerDetails.business,
      type: !customerDetails.type,
      website: !customerDetails.website
    };

    Object.keys(fieldsToResearch).forEach(fieldKey => {
      if (fieldsToResearch[fieldKey]) {
        const el = document.getElementById(`customer${fieldKey.charAt(0).toUpperCase() + fieldKey.slice(1)}`);
        if (el) {
          el.innerHTML = `
            <div class="spinner-border spinner-border-sm text-primary" role="status">
              <span class="visually-hidden">Loading...</span>
            </div>`;
        }
      }
    });

    // This async function runs in the background without blocking the UI
    (async () => {
        try {
            console.log(`[selectCustomerInfo] Missing info for ${customerName}. Starting background research.`);
            const researchResults = await dataLoader.getCompanyResearch(customerName);

            // If research fails or returns nothing, just reset the UI to original state (remove spinners).
            if (!researchResults) {
                document.getElementById("customerLocation").textContent = customerDetails.location || "N/A";
                document.getElementById("customerBusiness").textContent = customerDetails.business || "N/A";
                document.getElementById("customerType").textContent = customerDetails.type || "N/A";
                document.getElementById("customerWebsite").innerHTML = asLink(customerDetails.website);
                return;
            }

            let updated = false;
            const updatedFields = {};

            // Map research results
            if (!customerDetails.website && researchResults.website) { updatedFields.website = researchResults.website; updated = true; }
            if (!customerDetails.business && researchResults.businessType) { updatedFields.business = researchResults.businessType; updated = true; }
            else if (!customerDetails.business && researchResults.description) { updatedFields.business = researchResults.description; updated = true; }
            if (!customerDetails.location && researchResults.country) { updatedFields.location = researchResults.country; updated = true; }
            if (!customerDetails.type && researchResults.industry) { updatedFields.type = researchResults.industry; updated = true; }
            
            if (updated) {
                const disclaimer = "AI-suggested data may be inaccurate.";
                updatedFields.remarks = customerDetails.remarks ? `${customerDetails.remarks}\n${disclaimer}` : disclaimer;
                
                const finalDetails = { ...customerDetails, ...updatedFields };

                // Update UI immediately with the *suggested* data
                console.log("[selectCustomerInfo] Research complete. Displaying suggestions:", updatedFields);
                document.getElementById("customerLocation").textContent = finalDetails.location || "N/A";
                document.getElementById("customerBusiness").textContent = finalDetails.business || "N/A";
                document.getElementById("customerType").textContent = finalDetails.type || "N/A";
                document.getElementById("customerRemarks").textContent = finalDetails.remarks || "N/A";
                document.getElementById("customerWebsite").innerHTML = asLink(finalDetails.website);
                
                // Show the confirmation box
                const safeCustomerName = customerName.replace(/'/g, "\\'");
                confirmationBox.innerHTML = `
                    <div class="d-flex justify-content-between align-items-center">
                        <div>
                            <i class="fas fa-robot me-2 text-primary"></i>
                            <span class="fw-bold">AI found new details. Are they correct?</span>
                        </div>
                        <button class="btn btn-sm btn-primary" 
                                onclick='UIrenderer.confirmAndSaveChanges("${safeCustomerName}", ${JSON.stringify(finalDetails)})'>
                            <i class="fas fa-save me-1"></i> Save
                        </button>
                    </div>`;
                confirmationBox.style.display = 'block';
                confirmationBox.style.opacity = '1';
            } else {
                 // No updates were found, so just reset the UI to its original state (remove spinners)
                document.getElementById("customerLocation").textContent = customerDetails.location || "N/A";
                document.getElementById("customerBusiness").textContent = customerDetails.business || "N/A";
                document.getElementById("customerType").textContent = customerDetails.type || "N/A";
                document.getElementById("customerWebsite").innerHTML = asLink(customerDetails.website);
            }

        } catch (error) {
            console.error("Error during background company research:", error);
            // On error, also reset the UI to its original state (remove spinners)
            document.getElementById("customerLocation").textContent = customerDetails.location || "N/A";
            document.getElementById("customerBusiness").textContent = customerDetails.business || "N/A";
            document.getElementById("customerType").textContent = customerDetails.type || "N/A";
            document.getElementById("customerWebsite").innerHTML = asLink(customerDetails.website);
        }
    })();
  }
}

/**
 * Renders the contact cards, including the logic for fuzzy matching and suggesting merges.
 * This is separated to be called after the initial customer details are rendered.
 * @param {string} customerName The name of the customer.
 */
function renderContactCards(customerName) {
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
    // Fuzzy search for potential mismatches
    if (orgContacts && orgContacts.size > 0) {
        const allCompanyNames = Array.from(orgContacts.keys());
        const fuse = new Fuse(allCompanyNames, { threshold: 0.4 });
        const matches = fuse.search(companyKey).slice(0, 3);

        if (matches.length > 0) {
            const safeCorrectName = customerName.replace(/'/g, "\\'");
            const accordionId = `mergeAccordion-${safeCorrectName.replace(/[^a-zA-Z0-9]/g, '')}`;

            const accordionItemsHTML = matches.map((match, index) => {
                const mismatchedName = match.item;
                const contactsUnderMismatch = orgContacts.get(mismatchedName);
                const safeMismatchedName = mismatchedName.replace(/'/g, "\\'");
                const contactCount = contactsUnderMismatch.length;
                const contactOrContacts = contactCount === 1 ? 'contact' : 'contacts';
                const collapseId = `collapse-${accordionId}-${index}`;

                return `
                <div class="accordion-item">
                    <h2 class="accordion-header" id="heading-${collapseId}">
                        <button class="accordion-button collapsed" type="button" data-bs-toggle="collapse" data-bs-target="#${collapseId}" aria-expanded="false" aria-controls="${collapseId}">
                            <strong>${mismatchedName}</strong>&nbsp;(${contactCount} ${contactOrContacts} found)
                        </button>
                    </h2>
                    <div id="${collapseId}" class="accordion-collapse collapse" aria-labelledby="heading-${collapseId}" data-bs-parent="#${accordionId}">
                        <div class="accordion-body">
                            <p>The following contacts will be updated to match the sales name "<strong>${customerName}</strong>":</p>
                            <div class="mb-3">
                                ${contactsUnderMismatch.map(c => `
                                    <div class="contact-card bg-light border-warning mb-2 py-2">
                                        <h6>${c.Name}</h6>
                                        <p class="mb-0 small"><strong>Email:</strong> ${c.Email}</p>
                                    </div>
                                `).join('')}
                            </div>
                            <div class="merge-actions">
                                <button class="btn btn-primary" onclick="UIrenderer.handleContactMerge(this, '${safeCorrectName}', '${safeMismatchedName}')">
                                    <i class="fas fa-sync-alt me-2"></i>Update ${contactCount} ${contactOrContacts}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>`;
            }).join('');

            const mergeUIHTML = `
            <div class="card mt-3">
                <div class="card-header bg-light">
                    <i class="fas fa-search me-2 text-primary"></i>
                    <strong>No exact contact match found. Did you mean?</strong>
                </div>
                <div class="accordion" id="${accordionId}">
                    ${accordionItemsHTML}
                </div>
            </div>`;
            
            contactCardsContainer.innerHTML = mergeUIHTML;

        } else {
            contactCardsContainer.innerHTML = '<p class="text-muted fst-italic">No contacts found in GAL for this company.</p>';
        }
    } else {
        contactCardsContainer.innerHTML = '<p class="text-muted fst-italic">Contact data is not available.</p>';
    }
  }
}


/**
 * Calculates and displays the total sales for the last 12 months and the percent change
 * from the prior 12 months.
 * @param {string} partNumber - The product's part number.
 */
function calculateAndDisplayYoYSales(partNumber) {
    setTimeout(() => {
        const salesData = window.dataStore?.Sales?.dataframe || [];
        const yoyEl = document.getElementById('yoySales'); // Changed ID for clarity

        if (!salesData.length || !yoyEl) {
            if (yoyEl) yoyEl.innerHTML = '<i class="text-muted">N/A</i>';
            return;
        }

        const today = new Date();
        const last12Start = new Date();
        last12Start.setFullYear(today.getFullYear() - 1);
        const prior12Start = new Date();
        prior12Start.setFullYear(today.getFullYear() - 2);

        let totalLast12 = 0;
        let totalPrior12 = 0;

        salesData.forEach(sale => {
            if (sale.Product_Service !== partNumber) return;

            const saleDate = new Date(sale.Date);
            const quantity = parseInt(sale.Quantity) || 0;

            if (saleDate >= last12Start && saleDate <= today) {
                totalLast12 += quantity;
            } else if (saleDate >= prior12Start && saleDate < last12Start) {
                totalPrior12 += quantity;
            }
        });

        let percentChange = 0;
        if (totalPrior12 > 0) {
            percentChange = ((totalLast12 - totalPrior12) / totalPrior12) * 100;
        } else if (totalLast12 > 0) {
            percentChange = 100; // Indicate growth from zero
        }

        const badgeColor = percentChange > 0 ? 'bg-success' : 'bg-danger';
        const sign = percentChange > 0 ? '+' : '';
        const changeHtml = totalLast12 > 0 || totalPrior12 > 0 ?
            `<span class="badge ${badgeColor} ms-2">${sign}${percentChange.toFixed(0)}%</span>` : '';

        yoyEl.innerHTML = `<span>${totalLast12} units ${changeHtml}</span>`;

    }, 500); // Delay to show spinner
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

    if (!productInfoModalInstance) {
        productInfoModalInstance = new bootstrap.Modal(document.getElementById('productInfoModal'));
    }

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
                    displayValue = String(value).toLowerCase() === 'true' ?
                        '<span class="badge bg-success">Active</span>' :
                        '<span class="badge bg-secondary">Inactive</span>';
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

    // Add the placeholder for the new Year-over-Year sales metric
    bodyHtml += `
      <div class="row">
        <dt class="col-sm-5">Sales (Last 12 Mo)</dt>
        <dd class="col-sm-7 mb-0" id="yoySales">
            <div class="spinner-border spinner-border-sm text-primary" role="status"></div>
        </dd>
      </div>
  `;

    modalBody.innerHTML = bodyHtml;

    // Calculate and display the new metric
    calculateAndDisplayYoYSales(partNumber);

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
    document.getElementById("competitorPriceLink").style.display = "none";
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

      // --- Show and wire up the competitor price link ---
      const priceLink = document.getElementById("competitorPriceLink");
      priceLink.style.display = "inline-block";
      // Pass the partNumber to the click handler
      priceLink.onclick = () => UIrenderer.showCompetitorPricingModal(partNumber);

      // --- Populate Quote Calculator ---
      const quoteInfo = {
          PartNumber: selectedProduct["PartNumber"],
          UnitCost: baseUnitCost, // Use the parsed number
          Quantity: options.quantity, // from the clicked order row
          Price: options.price        // from the clicked order row
      };
      quoteCalculator.populate(quoteInfo);


      // Retrieve the replacements mapping for this product
      const equivalentsMap = window.dataStore.Equivalents?.dataframe || {};
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

let competitorPriceModalInstance = null;

/**
 * Formats the raw results from MarketSearch into a clean, card-based accordion.
 * Displays the first few price tiers (Qty / Price Each) in the summary header.
 * @param {Array} results - The array of listing objects.
 * @returns {string} - The HTML string for the results.
 */
function formatPriceResults(results) {
  if (!results || results.length === 0) {
    return `<p class="text-muted fst-italic">No competitor pricing found for this product.</p>`;
  }

  // --- Helper to build the inner (detail) table ---
  const buildDetailTable = (listings) => {
    let detailHtml = `
      <div class="table-responsive">
        <table class="table table-sm table-striped table-hover mb-0">
          <thead class="table-light">
            <tr>
              <th>Title / SKU</th>
              <th>In Stock</th>
              <th>Qty</th>
              <th>Total Price</th>
              <th>Price/Each</th>
            </tr>
          </thead>
          <tbody>
    `;
    listings.forEach(r => {
      const stockBadge = r.inStock === true ? `<span class="badge bg-success">Yes</span>` :
                         r.inStock === false ? `<span class="badge bg-danger">No</span>` :
                         '<span class="badge bg-secondary">Unknown</span>';
      detailHtml += `
        <tr>
          <td style="min-width: 250px;">
            <a href="${r.url}" target="_blank" rel="noopener noreferrer">${r.title || 'View Product'} <i class="fas fa-external-link-alt fa-xs"></i></a>
            <br>
            <small class="text-muted">${r.sku || ''}</small>
          </td>
          <td>${stockBadge}</td>
          <td>${r.qty || '-'}</td>
          <td>${r.price ? moneyFmt.format(r.price) : '-'}</td>
          <td class="fw-bold">${r.eachPrice ? moneyFmt.format(r.eachPrice) : '-'}</td>
        </tr>
      `;
    });
    detailHtml += `</tbody></table></div>`;
    return detailHtml;
  };

  // 1. Group results by retailer
  const groupedByRetailer = results.reduce((acc, r) => {
    const key = r.retailer || 'Unknown';
    if (!acc[key]) {
      acc[key] = [];
    }
    acc[key].push(r);
    return acc;
  }, {});

  // 2. Create retailer objects and sort listings within each retailer
  //    Sort listings primarily by quantity (ascending) for tier display
  const retailerData = Object.entries(groupedByRetailer).map(([retailer, listings]) => {
    const sortedListings = [...listings].sort((a, b) => (a.qty ?? 0) - (b.qty ?? 0)); // Sort by Qty first
    const bestPriceListing = [...listings].sort((a, b) => (a.eachPrice ?? Infinity) - (b.eachPrice ?? Infinity))[0];
    const bestPrice = bestPriceListing?.eachPrice ?? Infinity;
    const anyInStock = listings.some(r => r.inStock === true);

    return { retailer, listings: sortedListings, bestPrice, anyInStock };
  });

  // 3. Sort retailers by their overall best eachPrice for ordering the accordion items
  retailerData.sort((a, b) => a.bestPrice - b.bestPrice);

  // 4. Build the Bootstrap Accordion HTML
  let html = `<div class="accordion" id="competitorAccordion">`;

  retailerData.forEach(({ retailer, listings, bestPrice, anyInStock }, index) => {
    const collapseId = `competitor-collapse-${index}`;
    const listingCount = listings.length;
    const listingText = listingCount === 1 ? '1 Listing' : `${listingCount} Listings`;

    const stockBadge = anyInStock ? `<span class="badge bg-success">In Stock</span>` :
                       (listings.every(r => r.inStock === false) ? `<span class="badge bg-danger">Out of Stock</span>` :
                       '<span class="badge bg-secondary">Unknown</span>');

    // --- Generate Price Tier Snippets for the Header ---
    const MAX_TIERS_IN_SUMMARY = 3;
    const tierSnippets = listings
      .slice(0, MAX_TIERS_IN_SUMMARY)
      .map(r => `
        <div class="tier-snippet">
          <span class="tier-qty">${r.qty || '-'}</span>
          <span class="tier-price">${r.eachPrice ? moneyFmt.format(r.eachPrice) : '-'}</span>
        </div>
      `)
      .join('');
    const moreTiersText = listings.length > MAX_TIERS_IN_SUMMARY
      ? `<div class="tier-snippet more-tiers">+${listings.length - MAX_TIERS_IN_SUMMARY} more</div>`
      : '';
    // --- End Tier Snippets ---

    html += `
      <div class="accordion-item">
        <h2 class="accordion-header" id="heading-${collapseId}">
          <button class="accordion-button collapsed" type="button" data-bs-toggle="collapse" data-bs-target="#${collapseId}" aria-expanded="false" aria-controls="${collapseId}">

            <div class="d-flex justify-content-between align-items-center w-100 pe-2">

              <!-- Left Side: Retailer Name -->
              <span class="text-capitalize fw-bold fs-6 text-dark retailer-name">
                ${retailer}
              </span>

              <!-- Right Side: Summary Details -->
              <div class="d-flex align-items-center gap-3 accordion-summary-details">
                <span class="text-muted listing-count">${listingText}</span>
                ${stockBadge}
                <!-- Price Tiers Display -->
                <div class="d-flex align-items-center gap-2 price-tier-summary">
                  ${tierSnippets}
                  ${moreTiersText}
                </div>
              </div>

            </div>
          </button>
        </h2>
        <div id="${collapseId}" class="accordion-collapse collapse" aria-labelledby="heading-${collapseId}" data-bs-parent="#competitorAccordion">
          <div class="accordion-body p-0">
            ${buildDetailTable(listings)}
          </div>
        </div>
      </div>
    `;
  });

  html += `</div>`; // Close accordion
  return html;
}


/**
 * Fetches competitor pricing for a given SKU and displays it in a modal.
 * @param {string} sku - The product SKU to search for.
 */
async function showCompetitorPricingModal(sku) {
  if (!sku) return;

  if (!competitorPriceModalInstance) {
    competitorPriceModalInstance = new bootstrap.Modal(document.getElementById('competitorPriceModal'));
  }
  
  const modalBody = document.getElementById('competitorPriceModalBody');
  const modalTitle = document.getElementById('competitorPriceModalLabel');

  // 1. Set loading state and show modal
  modalTitle.textContent = `Competitor Pricing for ${sku}`;
  modalBody.innerHTML = `
    <div class="d-flex align-items-center justify-content-center p-5">
      <div class="spinner-border text-primary" role="status">
        <span class="visually-hidden">Loading...</span>
      </div>
      <span class="ms-3 fs-5 text-muted">Searching all providers...</span>
    </div>
  `;
  competitorPriceModalInstance.show();

  try {
    // 2. Call the search function (this is the new part)
    console.log(`[MarketSearch] Searching for SKU: ${sku}`);
    const results = await window.MarketSearch.searchAllProvidersBySku(sku, { timeoutMs: 10000 });
    console.log(`[MarketSearch] Found ${results.length} results:`, results);

    // 3. Format and display results
    modalBody.innerHTML = formatPriceResults(results);

  } catch (error) {
    console.error("[MarketSearch] Error:", error);
    // 4. Display error state
    modalBody.innerHTML = `
      <div class="alert alert-danger">
        <strong>Search Failed</strong>
        <p class="mb-0">An error occurred while fetching competitor data. ${error.message || ''}</p>
      </div>
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
  handleContactMerge, // Expose the new merge handler
  confirmAndSaveChanges, // Expose the new save handler
  showProductInfoModal,
  showCompetitorPricingModal
};
