const ReportManager = {
  intervals: {
    none: { label: "Manual Only", ms: 0 },
    daily: { label: "Daily", ms: 24 * 60 * 60 * 1000 },
    weekly: { label: "Weekly", ms: 7 * 24 * 60 * 60 * 1000 },
    biweekly: { label: "Bi-Weekly", ms: 14 * 24 * 60 * 60 * 1000 },
    monthly: { label: "Monthly", ms: 30 * 24 * 60 * 60 * 1000 },
    quarterly: { label: "Quarterly", ms: 90 * 24 * 60 * 60 * 1000 }
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
    if (!meta) return false;

    // 1. Check for Custom Schedule Override
    if (meta.customNextRun) {
        return Date.now() >= meta.customNextRun;
    }

    // 2. Fallback to Standard Interval Logic
    if (!meta.interval || meta.interval === 'none') return false;
    if (!meta.lastRun) return true; // Never run, but has schedule
    
    const intervalMs = this.intervals[meta.interval]?.ms || 0;
    if (intervalMs === 0) return false;

    return (Date.now() - meta.lastRun) > intervalMs;
  },

  getNextDueDate(reportId) {
      const meta = this.statusMap[reportId];
      if (!meta) return null;

      // Custom Schedule takes precedence for display
      if (meta.customNextRun) return meta.customNextRun;
      
      if (!meta.interval || meta.interval === 'none') return null;
      if (!meta.lastRun) return Date.now(); // Due now

      const intervalMs = this.intervals[meta.interval]?.ms || 0;
      return meta.lastRun + intervalMs;
  },

  updateBadge() {
    const badge = document.getElementById('reportNotificationBadge');
    const btn = document.getElementById('generateReportsBtn');
    
    if (!badge || !btn) return;
    
    const dueCount = this.modules.filter(m => this.isDue(m.id)).length;
    
    if (dueCount > 0) {
      badge.classList.add('visible');
      // UX Enhancement: Update hover text
      btn.setAttribute('title', `${dueCount} Reports Due - Open Dashboard`);
      btn.setAttribute('data-bs-original-title', `${dueCount} Reports Due - Open Dashboard`);
    } else {
      badge.classList.remove('visible');
      btn.setAttribute('title', 'Open Reports Dashboard');
      btn.setAttribute('data-bs-original-title', 'Open Reports Dashboard');
    }
    
    // Refresh bootstrap tooltip if active
    const tooltip = bootstrap.Tooltip.getInstance(btn);
    if (tooltip) tooltip.hide();
  },

  async markRun(reportId) {
    // 1. Update State
    const meta = this.statusMap[reportId] || { id: reportId, interval: 'none' };
    
    meta.lastRun = Date.now();
    // Clear any custom schedule once the report is run, reverting to standard interval
    if (meta.customNextRun) delete meta.customNextRun; 

    this.statusMap[reportId] = meta;
    await window.idbUtil.saveReportMeta(reportId, meta);
    
    // 2. Update Global Badge
    this.updateBadge();

    // 3. Update Dashboard
    this.renderDashboard();
  },

  async updateInterval(reportId, newInterval) {
    const meta = this.statusMap[reportId] || { id: reportId };
    meta.interval = newInterval;
    this.statusMap[reportId] = meta;
    await window.idbUtil.saveReportMeta(reportId, meta);
    
    this.updateBadge();
    this.renderDashboard();
  },

  async setCustomSchedule(reportId, timestamp) {
      const meta = this.statusMap[reportId] || { id: reportId };
      if (timestamp) {
          meta.customNextRun = timestamp;
      } else {
          delete meta.customNextRun;
      }
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
        ? new Date(meta.lastRun).toLocaleDateString()
        : 'Never';

      // Logic for "Next Due" display
      const nextDueTs = this.getNextDueDate(mod.id);
      let nextDueText = 'Manual';
      let nextDueClass = 'text-muted';
      
      if (nextDueTs) {
          const d = new Date(nextDueTs);
          nextDueText = d.toLocaleDateString();
          if (meta.customNextRun) {
              nextDueText += ' <small class="text-muted fw-normal">(Scheduled)</small>';
              nextDueClass = 'text-primary fw-bold';
          } else if (isDue) {
              nextDueClass = 'text-danger fw-bold';
              nextDueText = 'Now';
          }
      } else if (interval !== 'none') {
          // Fallback if never run but has interval
          nextDueClass = 'text-danger fw-bold';
          nextDueText = 'Now';
      }

      const statusBadge = isDue 
        ? `<span class="badge bg-danger ms-2">Due</span>` 
        : (meta.lastRun ? `<span class="badge bg-success ms-2">Current</span>` : '');

      const cardClass = isDue ? 'report-card report-due' : 'report-card';

      const div = document.createElement('div');
      div.className = 'col-md-6 col-lg-4';
      div.innerHTML = `
        <div class="card h-100 ${cardClass}" id="card-${mod.id}">
          <div class="card-header">
            <div class="d-flex align-items-center">
                <span>${mod.title}</span>
                <span id="status-${mod.id}">${statusBadge}</span>
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

            <div class="d-flex justify-content-between align-items-end mt-2" style="font-size: 0.85rem;">
                <div class="report-meta">
                    <div class="mb-1">
                        <i class="far fa-clock me-1 text-muted"></i> Last: <strong>${lastRunText}</strong>
                    </div>
                    <div>
                        <i class="far fa-calendar-alt me-1 text-muted"></i> Next: 
                        <label class="position-relative d-inline-block" style="cursor:pointer;">
                            <span class="${nextDueClass}" style="border-bottom:1px dotted #999" title="Click to schedule start date">
                                ${nextDueText}
                            </span>
                            <!-- Invisible date input overlay - using label triggers input automatically -->
                            <input type="date" class="next-run-input" data-id="${mod.id}" 
                                   style="position:absolute; top:0; left:0; width:100%; height:100%; opacity:0; z-index:10; cursor:pointer;"
                                   onclick="try{this.showPicker()}catch(e){}"
                            >
                        </label>
                    </div>
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

    // --- Attach Listeners ---

    // 1. Interval Select
    document.querySelectorAll('.interval-select').forEach(sel => {
        sel.addEventListener('change', (e) => {
            this.updateInterval(e.target.dataset.id, e.target.value);
        });
    });

    // 2. Custom Schedule Input
    document.querySelectorAll('.next-run-input').forEach(inp => {
        // Pre-fill value so picker opens on current schedule
        const id = inp.dataset.id;
        const ts = this.getNextDueDate(id);
        if (ts) {
            const d = new Date(ts);
            const yyyy = d.getFullYear();
            const mm = String(d.getMonth() + 1).padStart(2, '0');
            const dd = String(d.getDate()).padStart(2, '0');
            inp.value = `${yyyy}-${mm}-${dd}`;
        }

        inp.addEventListener('change', (e) => {
            const val = e.target.value;
            if (val) {
                // Parse as local date to start of day
                const [y, m, d] = val.split('-').map(Number);
                const dateObj = new Date(y, m - 1, d); // Local Midnight
                this.setCustomSchedule(e.target.dataset.id, dateObj.getTime());
            } else {
                // User cleared the input
                this.setCustomSchedule(e.target.dataset.id, null);
            }
        });
        
        // Removed click stopPropagation to ensure label interaction works
    });

    // 3. Run Button
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
    itemTarget.innerHTML = `<span class="spinner-border spinner-border-sm text-primary" role="status"></span> <span class="text-muted ms-2 generating-text">Generating...</span>`;

    const modalEl = document.getElementById('reportsModal'); 

    if (typeof window[module.generatorFunctionName] === 'function') {
        try {
            await window[module.generatorFunctionName](modalEl, reportId);
            
            const genText = itemTarget.querySelector('.generating-text');
            if (genText) genText.remove();

            // Mark run on download click
            const downloadBtn = itemTarget.querySelector('.report-download-btn');
            if (downloadBtn) {
                downloadBtn.addEventListener('click', () => {
                    this.markRun(reportId);
                    console.log(`[Report] ${reportId} marked as run on download.`);
                });
            }

        } catch (err) {
            console.error(err);
            itemTarget.innerHTML = `<span class="text-danger small">Error generating report.</span>`;
        }
    } else {
        console.error("Generator function not found for", reportId);
        itemTarget.innerHTML = `<span class="text-danger small">Func Not Found</span>`;
    }
  },

  // --- NEW FEATURE: Visit Tracking & Reminder Email ---

  async checkDueReportsAndTrackVisits() {
    const dueReports = this.modules.filter(m => this.isDue(m.id));
    if (dueReports.length === 0) return;

    // 1. Get stats from IDB
    const stats = await window.idbUtil.getVisitStats() || { count: 0, lastDate: null, emailSentDate: null };
    const todayStr = new Date().toDateString(); // "Wed Dec 10 2025"

    // 2. Logic: Increment count if it's a new day
    if (stats.lastDate !== todayStr) {
        stats.count += 1;
        stats.lastDate = todayStr;
        await window.idbUtil.saveVisitStats(stats);
        console.log(`[VisitTracker] New day visit. Count for due reports: ${stats.count}`);
    }

    // 3. Logic: Send email if count >= 3 AND email not sent today
    if (stats.count >= 3 && stats.emailSentDate !== todayStr) {
        console.log("[VisitTracker] Threshold reached. Sending reminder email...");
        try {
            await this.sendReminderEmail(dueReports);
            stats.emailSentDate = todayStr;
            stats.count = 0; // Reset counter after sending
            await window.idbUtil.saveVisitStats(stats);
            console.log("[VisitTracker] Email sent and stats updated.");
        } catch (e) {
            console.error("[VisitTracker] Failed to send email:", e);
        }
    }
  },

  async sendReminderEmail(dueReports) {
    if (!userAccount || !userAccount.username) return;

    const reportListHtml = dueReports.map(r => 
        `<li style="margin-bottom: 10px;">
            <strong>${r.title}</strong><br>
            <span style="color: #666;">${r.desc}</span><br>
            <a href="${window.location.origin}${window.location.pathname}?runReport=${r.id}" 
               style="color: #0d6efd; text-decoration: none; font-weight: bold;">
               Open Report →
            </a>
         </li>`
    ).join('');

    const emailBody = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 8px; overflow: hidden;">
            <div style="background-color: #f8f9fa; padding: 20px; text-align: center; border-bottom: 1px solid #e0e0e0;">
                <h2 style="color: #2D2A32; margin: 0;">BrandyWise Reports Due</h2>
            </div>
            <div style="padding: 30px;">
                <p>Hello,</p>
                <p>We noticed you have <strong>${dueReports.length} reports</strong> that are currently due for review based on your scheduled preferences.</p>
                <p>Keeping up with these reports helps ensure you don't miss critical revenue drops or inventory issues.</p>
                <ul style="padding-left: 20px; margin-top: 20px;">
                    ${reportListHtml}
                </ul>
                <p style="margin-top: 30px; font-size: 0.9em; color: #888;">
                    Clicking a link above will take you directly to the dashboard to generate the report.
                </p>
            </div>
            <div style="background-color: #f8f9fa; padding: 15px; text-align: center; font-size: 0.8em; color: #aaa;">
                BrandyWine Materials LLC
            </div>
        </div>
    `;

    await window.sendMail("Reminder: You have pending reports", emailBody, userAccount.username);
  },

  // --- NEW FEATURE: Deep Linking ---
  async handleDeepLink() {
    const params = new URLSearchParams(window.location.search);
    const reportId = params.get('runReport');
    
    if (reportId) {
        console.log(`[DeepLink] Found runReport=${reportId}`);
        // 1. Open Modal
        const btnGen = document.getElementById('generateReportsBtn');
        if (btnGen) {
            btnGen.click(); // Triggers renderDashboard and modal show
        }
        
        // 2. Wait for modal DOM to populate, then run
        setTimeout(() => {
            // Scroll to card
            const card = document.getElementById(`card-${reportId}`);
            if (card) card.scrollIntoView({ behavior: 'smooth', block: 'center' });
            
            // Run report
            this.runReport(reportId);
            
            // Clean URL without reload
            const newUrl = window.location.protocol + "//" + window.location.host + window.location.pathname;
            window.history.pushState({path:newUrl},'',newUrl);
        }, 800);
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

  const bsReportsModal = new bootstrap.Modal(modalEl);

  await ReportManager.loadStatus();
  ReportManager.updateBadge();

  // Check logic for reminders
  await ReportManager.checkDueReportsAndTrackVisits();

  // Check logic for deep links
  setTimeout(() => ReportManager.handleDeepLink(), 1000);

  btnGen.onclick = () => {
    ReportManager.renderDashboard();
    bsReportsModal.show();
  };
  
  window.ReportManager = ReportManager;
};

document.addEventListener('DOMContentLoaded', window.initReports);