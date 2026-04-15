window.buildStrategicBuyReport = function(modalEl, reportId) {
    return new Promise((resolve, reject) => {
        try {
            // 1. Validate Data Exists
            const dataStore = window.dataStore;
            if (!dataStore || !dataStore.Sales || !dataStore.DB) {
                alert("Data not fully loaded. Please wait for the app to finish syncing and try again.");
                return reject({ reportId, error: 'Data not loaded' });
            }

            const salesData = dataStore.Sales.dataframe || [];
            const dbData = dataStore.DB.dataframe || [];

            // Helper functions
            const parseDate = window.ReportUtils?.parseDate || (d => new Date(d));
            const parseNumber = window.ReportUtils?.parseNumber || (n => parseFloat(String(n).replace(/[^0-9.-]/g, '')) || 0);
            const moneyFmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

            // 2. Build the Unified Modal Shell
            const reportModalId = 'strategicBuyReportModal';
            let existingReportModal = document.getElementById(reportModalId);
            if (existingReportModal) existingReportModal.remove();

            const modalHtml = `
            <div class="modal fade" id="${reportModalId}" tabindex="-1" aria-hidden="true">
              <div class="modal-dialog modal-xl modal-dialog-centered modal-dialog-scrollable">
                <div class="modal-content border-0 shadow-lg">
                  
                  <div class="modal-header bg-white text-dark border-bottom">
                    <h5 class="modal-title fw-bold"><i class="fas fa-bullseye me-2 text-primary"></i> Strategic Forward Buy Dashboard</h5>
                    <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                  </div>
                  
                  <!-- Interactive Control Bar -->
                  <div class="p-3 border-bottom bg-light d-flex flex-wrap gap-4 align-items-end">
                    <div>
                      <label class="form-label small fw-bold text-muted mb-1 text-uppercase"><i class="fas fa-filter me-1"></i> Product Line</label>
                      <select id="sfbProductLine" class="form-select form-select-sm fw-bold text-primary" style="min-width: 220px; cursor: pointer;">
                        <option value="ALL">All Lines (ME, MS, MSR)</option>
                        <option value="ME">ME Series Only</option>
                        <option value="MS">MS Series Only</option>
                        <option value="MSR">MSR Series Only</option>
                      </select>
                    </div>
                    <div>
                      <label class="form-label small fw-bold text-muted mb-1 text-uppercase">
                        <i class="fas fa-calendar-alt me-1"></i> Break-Even Horizon
                        <i class="fas fa-info-circle ms-1" data-bs-toggle="tooltip" data-bs-placement="top" title="The number of months of holding costs covered by the manufacturer's discount (e.g., % discount ÷ monthly holding cost %)."></i>
                      </label>
                      <div class="input-group input-group-sm" style="width: 140px;">
                        <input type="number" id="sfbHorizon" class="form-control fw-bold" value="8" min="1" max="24" style="cursor: pointer;">
                        <span class="input-group-text bg-white text-muted">Months</span>
                      </div>
                    </div>
                    <div class="ms-auto text-end">
                      <label class="form-label small fw-bold text-muted mb-1 text-uppercase">Total Recommended PO</label>
                      <h3 class="mb-0 text-success fw-bold" id="sfbTotalSpend">$0.00</h3>
                    </div>
                  </div>

                  <!-- Report Content Area -->
                  <div class="modal-body p-4" style="background-color: #f4f6f8;">
                    <div class="accordion shadow-sm" id="sfbAnalysisAccordion">
                        <!-- Dynamically populated by updateReport() -->
                    </div>
                  </div>
                  
                  <div class="modal-footer border-0 bg-white">
                    <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
                  </div>
                </div>
              </div>
            </div>`;

            document.body.insertAdjacentHTML('beforeend', modalHtml);
            const reportModalEl = document.getElementById(reportModalId);
            const bsReportModal = new bootstrap.Modal(reportModalEl);

            // Initialize tooltips for the dynamically added modal elements
            const tooltips = [].slice.call(reportModalEl.querySelectorAll('[data-bs-toggle="tooltip"]'));
            tooltips.forEach(t => new bootstrap.Tooltip(t));

            // 3. Core Calculation & Rendering Logic
            function updateReport() {
                const lineSelection = document.getElementById('sfbProductLine').value;
                const HORIZON_MONTHS = parseInt(document.getElementById('sfbHorizon').value, 10) || 8;
                
                let TARGET_PREFIXES = ['ME', 'MS', 'MSR'];
                if (lineSelection !== 'ALL') {
                    TARGET_PREFIXES = [lineSelection];
                }

                const today = new Date();
                const horizonDate = new Date(today.getTime() + (HORIZON_MONTHS * 30.44 * 24 * 60 * 60 * 1000));

                // Filter Sales
                const productSales = {};
                salesData.forEach(row => {
                    const prod = String(row.Product_Service || '').trim();
                    const isTarget = TARGET_PREFIXES.some(prefix => prod.startsWith(prefix));
                    if (isTarget) {
                        if (!productSales[prod]) productSales[prod] = [];
                        productSales[prod].push(row);
                    }
                });

                const accordionContainer = document.getElementById('sfbAnalysisAccordion');
                
                if (Object.keys(productSales).length === 0) {
                    accordionContainer.innerHTML = `<div class="alert alert-warning m-0"><i class="fas fa-exclamation-triangle me-2"></i> No sales history found matching the selected criteria.</div>`;
                    document.getElementById('sfbTotalSpend').textContent = "$0.00";
                    return;
                }

                const pricingData = dataStore.Pricing?.dataframe || [];

                const analysisResults = [];
                let totalRecommendedSpend = 0;

                Object.entries(productSales).forEach(([prodName, rows]) => {
                    rows.sort((a, b) => parseDate(b.Date) - parseDate(a.Date));

                    // Aggregate by customer
                    const custMap = {};
                    let totalVolume = 0;
                    rows.forEach(r => {
                        const c = String(r.Customer || 'Unknown').trim();
                        const q = parseNumber(r.Quantity);
                        if (!custMap[c]) custMap[c] = { orders: [], totalQty: 0 };
                        
                        const d = parseDate(r.Date);
                        if (d && !isNaN(d.getTime())) {
                            custMap[c].orders.push({ date: d, qty: q });
                            custMap[c].totalQty += q;
                            totalVolume += q;
                        }
                    });

                    // Top 20%
                    const sortedCusts = Object.entries(custMap).sort((a, b) => b[1].totalQty - a[1].totalQty);
                    const numGiants = Math.max(1, Math.ceil(sortedCusts.length * 0.2)); 
                    const giants = sortedCusts.slice(0, numGiants);
                    const longTail = sortedCusts.slice(numGiants);

                    let recommendedBuy = 0;
                    const giantDetails = [];

                    // Giants Math
                    giants.forEach(([cName, cData]) => {
                        const orders = cData.orders.sort((a, b) => b.date - a.date);
                        const lastOrder = orders[0];
                        const avgQty = cData.totalQty / orders.length;

                        let dropCycleMonths = 12; 
                        let projectedDate = new Date(lastOrder.date.getTime() + (365 * 24 * 60 * 60 * 1000));

                        if (orders.length > 1) {
                            const firstOrder = orders[orders.length - 1];
                            const msDiff = lastOrder.date - firstOrder.date;
                            const monthsDiff = msDiff / (1000 * 60 * 60 * 24 * 30.44);
                            dropCycleMonths = Math.max(1, monthsDiff / (orders.length - 1));
                            projectedDate = new Date(lastOrder.date.getTime() + (dropCycleMonths * 30.44 * 24 * 60 * 60 * 1000));
                        }

                        // Lapsed Logic
                        const monthsSinceLastOrder = (today - lastOrder.date) / (1000 * 60 * 60 * 24 * 30.44);
                        const isLapsed = monthsSinceLastOrder > Math.max(dropCycleMonths * 1.5, 6);

                        let buyQty = 0;
                        let expectedOrders = 0;
                        let currentProjectedDate = new Date(projectedDate.getTime());

                        // Accumulate ALL projected orders that fall within the horizon
                        if (!isLapsed) {
                            while (currentProjectedDate <= horizonDate) {
                                expectedOrders++;
                                buyQty += avgQty;
                                currentProjectedDate = new Date(currentProjectedDate.getTime() + (dropCycleMonths * 30.44 * 24 * 60 * 60 * 1000));
                            }
                        }

                        recommendedBuy += buyQty;

                        giantDetails.push({
                            customer: cName,
                            avgQty: Math.round(avgQty),
                            dropCycle: dropCycleMonths.toFixed(1),
                            lastOrderDate: lastOrder.date,
                            projectedDate: projectedDate, // Display the first upcoming order date
                            isWithinHorizon: expectedOrders > 0,
                            expectedOrders: expectedOrders,
                            isLapsed,
                            buyQty: Math.round(buyQty)
                        });
                    });

                    // Long Tail Math
                    const longTailNames = new Set(longTail.map(x => x[0]));
                    const ltOrders = rows.filter(r => longTailNames.has(String(r.Customer || '').trim()));

                    let m0 = 0, m1 = 0, m2 = 0; 
                    ltOrders.forEach(r => {
                        const d = parseDate(r.Date);
                        if (!d) return;
                        const diffDays = (today - d) / (1000 * 60 * 60 * 24);
                        const q = parseNumber(r.Quantity);
                        if (diffDays <= 30) m0 += q;
                        else if (diffDays <= 60) m1 += q;
                        else if (diffDays <= 90) m2 += q;
                    });

                    const wma = ((m0 * 3) + (m1 * 2) + (m2 * 1)) / 6;
                    const ltBuy = wma * HORIZON_MONTHS;
                    recommendedBuy += ltBuy;

                    // Pricing check for 2026 Discount
                    const pricingEntry = pricingData.find(row => String(row.Product).trim() === prodName);
                    const discountCost = pricingEntry ? parseNumber(pricingEntry["DISCOUNT UNIT COST"]) : 0;
                    const hasDiscount = discountCost > 0;

                    // Inventory check
                    const invRow = dbData.find(r => String(r.PartNumber || '').trim() === prodName);
                    const qtyOnHand = invRow ? parseNumber(invRow.QtyOnHand) - parseNumber(invRow.QtyCommited) : 0;
                    const unitCost = invRow ? parseNumber(invRow.UnitCost) : 0;
                    
                    const activeUnitCost = hasDiscount ? discountCost : unitCost;
                    const netToOrder = hasDiscount ? Math.max(0, Math.round(recommendedBuy) - qtyOnHand) : 0;
                    const costToOrder = netToOrder * activeUnitCost;

                    totalRecommendedSpend += costToOrder;

                    analysisResults.push({
                        product: prodName,
                        giants: giantDetails,
                        longTailVolume: Math.round(ltBuy),
                        wma: wma.toFixed(1),
                        totalRecBuy: Math.round(recommendedBuy),
                        qtyOnHand: qtyOnHand,
                        netToOrder: netToOrder,
                        costToOrder: costToOrder,
                        unitCost: activeUnitCost,
                        hasDiscount: hasDiscount
                    });
                });

                // Update UI
                analysisResults.sort((a, b) => b.costToOrder - a.costToOrder);
                document.getElementById('sfbTotalSpend').textContent = moneyFmt.format(totalRecommendedSpend);

                accordionContainer.innerHTML = analysisResults.map((res, idx) => {
                    const collapseId = `collapseProd${idx}`;
                    const giantRows = res.giants.map(g => {
                        let actionHtml = '';
                        let rowClass = 'table-secondary opacity-75';
                        
                        if (g.isLapsed) {
                            actionHtml = `<i class="fas fa-ban text-danger"></i> Lapsed`;
                            rowClass = 'table-danger opacity-75';
                        } else if (g.buyQty > 0) {
                            actionHtml = `<i class="fas fa-check text-success"></i> Buy ${g.buyQty} <small class="text-dark fw-normal">(${g.expectedOrders} expected orders)</small>`;
                            rowClass = 'table-success';
                        } else {
                            actionHtml = `<i class="fas fa-times text-muted"></i> Skip (Out of Horizon)`;
                        }

                        return `
                        <tr class="${rowClass}">
                            <td class="fw-bold">${g.customer}</td>
                            <td>${g.avgQty}</td>
                            <td>Every ${g.dropCycle} mo</td>
                            <td>${g.lastOrderDate.toLocaleDateString()}</td>
                            <td>${g.projectedDate.toLocaleDateString()}</td>
                            <td class="fw-bold">${actionHtml}</td>
                        </tr>`;
                    }).join('');

                    const accordionItemClass = res.hasDiscount ? "accordion-item" : "accordion-item opacity-75";
                    const btnClass = res.hasDiscount ? "accordion-button collapsed" : "accordion-button collapsed bg-light text-muted";
                    const titleClass = res.hasDiscount ? "text-primary" : "text-muted";
                    const badgeHtml = res.hasDiscount 
                        ? `<span class="badge ${res.netToOrder > 0 ? 'bg-success' : 'bg-secondary'}">Recommend: Order ${res.netToOrder} units</span>`
                        : `<span class="badge bg-secondary border border-secondary text-white"><i class="fas fa-ban me-1"></i> Not available at discount</span>`;
                    
                    const nonDiscountWarning = res.hasDiscount ? '' : `<div class="alert alert-secondary py-2 mb-3"><i class="fas fa-info-circle me-2"></i>This product does not have a discounted price available. It has been excluded from the strategic buy recommendation.</div>`;

                    return `
                    <div class="${accordionItemClass}">
                        <h2 class="accordion-header" id="heading${idx}">
                            <button class="${btnClass}" type="button" data-bs-toggle="collapse" data-bs-target="#${collapseId}">
                                <div class="d-flex justify-content-between w-100 pe-3 align-items-center">
                                    <span class="fw-bold ${titleClass}">${res.product}</span>
                                    ${badgeHtml}
                                </div>
                            </button>
                        </h2>
                        <div id="${collapseId}" class="accordion-collapse collapse" data-bs-parent="#sfbAnalysisAccordion">
                            <div class="accordion-body bg-light p-4">
                                ${nonDiscountWarning}
                                <div class="row mb-4">
                                    <div class="col-md-3 border-end">
                                        <h6 class="text-muted text-uppercase small fw-bold">Calculated Buy</h6>
                                        <h4 class="mb-0 text-primary">${res.totalRecBuy}</h4>
                                    </div>
                                    <div class="col-md-3 border-end">
                                        <h6 class="text-muted text-uppercase small fw-bold">Current Stock</h6>
                                        <h4 class="mb-0">${res.qtyOnHand}</h4>
                                    </div>
                                    <div class="col-md-3 border-end">
                                        <h6 class="text-muted text-uppercase small fw-bold">Net Purchase</h6>
                                        <h4 class="mb-0 text-success">${res.netToOrder}</h4>
                                    </div>
                                    <div class="col-md-3">
                                        <h6 class="text-muted text-uppercase small fw-bold">PO Cost (@ ${moneyFmt.format(res.unitCost)})</h6>
                                        <h4 class="mb-0 text-dark">${moneyFmt.format(res.costToOrder)}</h4>
                                    </div>
                                </div>

                                <h6 class="fw-bold"><i class="fas fa-users text-primary me-2"></i>Top Customers (The 20%)</h6>
                                <div class="table-responsive mb-4">
                                    <table class="table table-sm table-bordered bg-white shadow-sm">
                                        <thead class="table-light">
                                            <tr>
                                                <th>Customer</th>
                                                <th>Avg Order Qty</th>
                                                <th>Drop Cycle</th>
                                                <th>Last Order</th>
                                                <th>Next Projected</th>
                                                <th>Action</th>
                                            </tr>
                                        </thead>
                                        <tbody>${giantRows}</tbody>
                                    </table>
                                </div>

                                <h6 class="fw-bold"><i class="fas fa-chart-line text-info me-2"></i>Long Tail Demand (The 80%)</h6>
                                <div class="p-3 bg-white border rounded shadow-sm">
                                    <p class="mb-1">Recent run-rate (3-Month WMA): <strong>${res.wma} units/month</strong></p>
                                    <p class="mb-0 text-muted small">Projected over ${HORIZON_MONTHS}-month break-even horizon = <strong>${res.longTailVolume} units</strong></p>
                                </div>
                            </div>
                        </div>
                    </div>`;
                }).join('');
            }

            // 4. Attach Listeners for Live Updates
            document.getElementById('sfbProductLine').addEventListener('change', updateReport);
            document.getElementById('sfbHorizon').addEventListener('input', updateReport);

            // Clean up DOM on close
            reportModalEl.addEventListener('hidden.bs.modal', () => {
                reportModalEl.remove();
            });

            // 5. Initial Render & Show
            updateReport();
            bsReportModal.show();

            // 6. Clear the spinner from the main Reports Dashboard
            if (modalEl && reportId) {
                const itemTarget = modalEl.querySelector(`#item-${reportId}`);
                if (itemTarget) {
                    itemTarget.querySelector('.spinner-border')?.remove();
                }
            }
            
            resolve({ reportId, status: 'success' });

        } catch (err) {
            reject({ reportId, error: err });
        }
    });
};

const strategicBuyBtn = document.getElementById("strategicBuyBtn");
if (strategicBuyBtn) {
    strategicBuyBtn.addEventListener("click", () => {
        buildStrategicBuyReport(document.body, 'strategicBuy');
    });
}