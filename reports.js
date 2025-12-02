/* reports.js (Main Registry & Dashboard Logic) --------------------------------------------- */

const ReportManager = {
  intervals: {
    none: { label: "Manual Only", ms: 0 },
    daily: { label: "Daily", ms: 24 * 60 * 60 * 1000 },
    weekly: { label: "Weekly", ms: 7 * 24 * 60 * 60 * 1000 },
    biweekly: { label: "Bi-Weekly", ms: 14 * 24 * 60 * 60 * 1000 },
    monthly: { label: "Monthly", ms: 30 * 24 * 60 * 60 * 1000 }
  },

  modules: [
    { id: 'revdrop', title: 'Revenue Drop Alert', desc: 'Customers with >20% revenue drop.', generatorFunctionName: 'buildRevenueDropReport' },
    { id: 'bm-replacement', title: 'BM Replacements', desc: 'Identify opportunities to switch to BM brand.', generatorFunctionName: 'buildBMReplacementReport' },
    { id: 'lapsed', title: 'Lapsed Customers', desc: 'Customers with no orders in 6 months.', generatorFunctionName: 'buildLapsedCustomersReport' },
    { id: 'prodrev', title: 'Product Rev Drop', desc: 'Products with >20% revenue drop.', generatorFunctionName: 'buildProductRevenueDropReport' },
    { id: 'prodlapsed', title: 'Lapsed Products', desc: 'Products with no sales in 6 months.', generatorFunctionName: 'buildProductLapsedReport' },
    { id: 'invstuck', title: 'Stuck Inventory', desc: 'Excess inventory (>12mo supply).', generatorFunctionName: 'buildStuckInventoryReport' },
    { id: 'top20cust', title: 'Top 20 Customers', desc: 'Highest revenue customers (Last 12mo).', generatorFunctionName: 'buildTopCustomersByRevenueReport' },
    { id: 'profit', title: 'Profit Report', desc: 'Profitability analysis by Customer/Product.', generatorFunctionName: 'buildProfitReport' }
  ],

  // Load status from IDB
  async loadStatus() {
    const metaList = await window.idbUtil.getAllReportMeta();
    this.statusMap = {};
    metaList.forEach(m => this.statusMap[m.id] = m);
  },

  isDue(reportId) {
    const meta = this.statusMap[reportId];
    if (!meta || !meta.interval || meta.interval === 'none') return false;
    if (!meta.lastRun) return true; // Never run, but has schedule
    
    const intervalMs = this.intervals[meta.interval]?.ms || 0;
    if (intervalMs === 0) return false;

    return (Date.now() - meta.lastRun) > intervalMs;
  },

  updateBadge() {
    const badge = document.getElementById('reportNotificationBadge');
    if (!badge) return;
    
    const anyDue = this.modules.some(m => this.isDue(m.id));
    if (anyDue) {
      badge.classList.add('visible');
    } else {
      badge.classList.remove('visible');
    }
  },

  async markRun(reportId) {
    const meta = this.statusMap[reportId] || { id: reportId, interval: 'none' };
    meta.lastRun = Date.now();
    this.statusMap[reportId] = meta;
    await window.idbUtil.saveReportMeta(reportId, meta);
    this.updateBadge();
    this.renderDashboard(); // Re-render to update "Last Run" text
  },

  async updateInterval(reportId, newInterval) {
    const meta = this.statusMap[reportId] || { id: reportId };
    meta.interval = newInterval;
    // If setting a schedule and never run, mark lastRun as 0 so it shows due immediately? 
    // Or null. Logic in isDue handles null as due.
    this.statusMap[reportId] = meta;
    await window.idbUtil.saveReportMeta(reportId, meta);
    this.updateBadge();
    this.renderDashboard();
  },

  renderDashboard() {
    const grid = document.getElementById('reportsDashboardGrid');
    if (!grid) return;
    grid.innerHTML = '';

    this.modules.forEach(mod => {
      const meta = this.statusMap[mod.id] || {};
      const isDue = this.isDue(mod.id);
      const interval = meta.interval || 'none';
      
      const lastRunText = meta.lastRun 
        ? new Date(meta.lastRun).toLocaleDateString() + ' ' + new Date(meta.lastRun).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})
        : 'Never';

      const statusBadge = isDue 
        ? `<span class="badge bg-danger ms-2">Due</span>` 
        : (meta.lastRun ? `<span class="badge bg-success ms-2">Ready</span>` : '');

      const cardClass = isDue ? 'report-card report-due' : 'report-card';

      const div = document.createElement('div');
      div.className = 'col-md-6 col-lg-4';
      div.innerHTML = `
        <div class="card h-100 ${cardClass}">
          <div class="card-header">
            <div class="d-flex align-items-center">
                <span>${mod.title}</span>
                ${statusBadge}
            </div>
          </div>
          <div class="card-body">
            <p class="card-text text-muted small">${mod.desc}</p>
            
            <div class="mb-3">
                <label class="form-label small fw-bold text-uppercase text-muted" style="font-size:0.7rem">Frequency</label>
                <select class="form-select form-select-sm interval-select" data-id="${mod.id}">
                    ${Object.entries(this.intervals).map(([key, val]) => 
                        `<option value="${key}" ${key === interval ? 'selected' : ''}>${val.label}</option>`
                    ).join('')}
                </select>
            </div>

            <div class="d-flex justify-content-between align-items-end mt-3">
                <div class="report-meta">
                    <i class="far fa-clock me-1"></i> Last Run:<br>
                    <strong>${lastRunText}</strong>
                </div>
                <button class="btn btn-primary btn-sm run-report-btn" data-id="${mod.id}">
                    <i class="fas fa-play me-1"></i> Run
                </button>
            </div>
          </div>
          <div class="report-actions" style="display:none" id="container-${mod.id}">
             <div class="report-output-container">
                <div id="item-${mod.id}" class="d-flex align-items-center gap-2 w-100 justify-content-end">
                    </div>
             </div>
          </div>
        </div>
      `;
      grid.appendChild(div);
    });

    // Attach Event Listeners
    document.querySelectorAll('.interval-select').forEach(sel => {
        sel.addEventListener('change', (e) => {
            this.updateInterval(e.target.dataset.id, e.target.value);
        });
    });

    document.querySelectorAll('.run-report-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            this.runReport(e.target.closest('button').dataset.id);
        });
    });
  },

  async runReport(reportId) {
    const module = this.modules.find(m => m.id === reportId);
    if (!module) return;

    // UI Feedback
    const container = document.getElementById(`container-${reportId}`);
    const itemTarget = document.getElementById(`item-${reportId}`);
    container.style.display = 'block';
    itemTarget.innerHTML = `<span class="spinner-border spinner-border-sm text-primary" role="status"></span> <span class="text-muted ms-2">Generating...</span>`;

    // The legacy functions expect "modalEl" to find #item-{id} inside it. 
    // We pass the document or the modal content wrapper.
    const modalEl = document.getElementById('reportsModal'); 

    if (typeof window[module.generatorFunctionName] === 'function') {
        try {
            await window[module.generatorFunctionName](modalEl, reportId);
            // On success, update timestamp
            await this.markRun(reportId);
        } catch (err) {
            console.error(err);
            itemTarget.innerHTML = `<span class="text-danger small">Error generating report.</span>`;
        }
    } else {
        console.error("Generator function not found for", reportId);
        itemTarget.innerHTML = `<span class="text-danger small">Func Not Found</span>`;
    }
  }
};

/* --------------------------------------------------------- */
/* Common Helper used by specific reports                    */
/* --------------------------------------------------------- */
window.getTopCustomersForProduct = function (
        sku,          // product number / SKU
        topN   = 3,   // how many customers to return
        salesDF = window.dataStore?.Sales?.dataframe || []
) {
  if (!salesDF.length) return [];

  const custField = 'Customer';
  const totals = {}; 
  
  const today = new Date();
  const last12Start = new Date();
  last12Start.setFullYear(today.getFullYear() - 1);

  salesDF.forEach(r => {
    if (r.Product_Service !== sku) return;
    const saleDate = ReportUtils.parseDate(r.Date);
    if (!saleDate || saleDate < last12Start) return;

    const originalName = r[custField];
    if (!originalName) return;

    const normKey = ReportUtils.normalise(originalName);
    if (!normKey) return;

    const amt = ReportUtils.parseNumber(r.Total_Amount);

    if (!totals[normKey]) {
      totals[normKey] = {
        revenue: 0,
        prettyName: originalName 
      };
    }
    totals[normKey].revenue += amt;
  });

  return Object.values(totals)                 
               .sort((a,b) => b.revenue - a.revenue) 
               .slice(0, topN)                 
               .map(item => ({
                 name: item.prettyName,        
                 totalRevenue: item.revenue
               }));
};

window.initReports = async function initReports() {
  const btnGen = document.getElementById('generateReportsBtn');
  const modalEl = document.getElementById('reportsModal');
  
  if (!btnGen || !modalEl) return;

  // Initialize Modal
  const bsReportsModal = new bootstrap.Modal(modalEl);

  // Load Status on startup
  await ReportManager.loadStatus();
  
  // Initial Badge Check
  ReportManager.updateBadge();

  // Button Click -> Show Modal -> Render Dashboard
  btnGen.onclick = () => {
    ReportManager.renderDashboard();
    bsReportsModal.show();
  };
  
  // Also expose ReportManager for debug
  window.ReportManager = ReportManager;
};

// Start everything up
document.addEventListener('DOMContentLoaded', window.initReports);