/* ==========================================================================
   Orders & Samples Search Module
   Handles logic for the "Orders & Samples" tab, including local filtering
   and deep server-side searching.
   ========================================================================== */

const OrderSampleSearch = {
  // State
  data: [],
  filters: {
    type: 'all',
    id: '',
    customer: '',
    po: '',
    dateStart: null,
    dateEnd: null,
    priceMin: null,
    priceMax: null
  },
  // Deep search state
  deepSearchState: {
    loading: false,
    term: null
  },

  init: function() {
    // 1. Setup Default State Variables
    this.usingDefaultDates = true; 

    // Calculate default dates
    const today = new Date();
    const lastMonth = new Date();
    lastMonth.setDate(today.getDate() - 30);

    const startInput = document.getElementById('osDateStart');
    const endInput = document.getElementById('osDateEnd');

    // Helper to reset to defaults (used on load and tab switch)
    const resetToDefaults = () => {
        this.usingDefaultDates = true;
        this.deepSearchState = { loading: false, term: null }; // Reset deep search
        if (startInput) startInput.valueAsDate = lastMonth;
        if (endInput) endInput.valueAsDate = today;
    };

    // Initial set
    resetToDefaults();

    // 2. Define Event Handlers
    const onDateChange = () => {
        this.usingDefaultDates = false;
        this.updateFilters();
        this.render();
    };

    const onTextSearch = () => {
        if (this.usingDefaultDates) {
            if (startInput) startInput.value = '';
            if (endInput) endInput.value = '';
            this.usingDefaultDates = false;
        }
        this.updateFilters();
        this.render();
    };

    const onGenericChange = () => {
        this.updateFilters();
        this.render();
    };

    // 3. Attach Listeners
    ['osSearchId', 'osSearchCustomer', 'osSearchPO', 'osPriceMin', 'osPriceMax'].forEach(id => {
        document.getElementById(id)?.addEventListener('input', onTextSearch);
    });

    ['osDateStart', 'osDateEnd'].forEach(id => {
        document.getElementById(id)?.addEventListener('change', onDateChange);
    });

    ['osTypeAll', 'osTypeOrder', 'osTypeSample'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('change', onGenericChange);
    });

    // 4. Tab Activation Listener
    const tabEl = document.getElementById('order-sample-tab');
    if(tabEl) {
      tabEl.addEventListener('shown.bs.tab', () => {
        resetToDefaults(); 
        this.loadData();
        this.updateFilters();
        this.render();
      });
    }
  },

  loadData: function() {
    const orders = window.dataStore.Orders?.dataframe || [];
    const samples = window.dataStore.Samples?.dataframe || [];

    const normOrders = orders.map(r => ({
      type: 'Order',
      id: r["Order No."],
      customer: r["Customer"],
      dateStr: r["Order Date"], 
      dateObj: ReportUtils.parseDate(r["Order Date"]),
      po: r["Cust PO"],
      total: parseFloat(String(r["Invoice Total"]).replace(/[^0-9.-]/g, '')) || 0,
      raw: r
    }));

    const normSamples = samples.map(r => ({
      type: 'Sample',
      id: r["Order"],
      customer: r["Customer"],
      dateStr: r["Customer order(date)"],
      dateObj: ReportUtils.parseDate(r["Customer order(date)"]),
      po: null, 
      total: null, 
      raw: r
    }));

    this.data = [...normOrders, ...normSamples];
    // Keep existing data, sort by Date Descending
    this.data.sort((a, b) => (b.dateObj || 0) - (a.dateObj || 0));
  },

  updateFilters: function() {
    // Read Type
    const typeRadios = document.getElementsByName('osType');
    typeRadios.forEach(r => { if(r.checked) this.filters.type = r.value; });

    // Handle UI Greying out
    const orderFields = document.querySelectorAll('.os-order-only-field');
    orderFields.forEach(div => {
      const input = div.querySelector('input');
      if(this.filters.type === 'Sample') {
        div.style.opacity = '0.4';
        div.style.pointerEvents = 'none';
        if(input) input.value = ''; 
      } else {
        div.style.opacity = '1';
        div.style.pointerEvents = 'auto';
      }
    });

    // Read Inputs
    this.filters.id = document.getElementById('osSearchId').value.trim().toLowerCase();
    this.filters.customer = document.getElementById('osSearchCustomer').value.trim().toLowerCase();
    
    if (this.filters.type !== 'Sample') {
      this.filters.po = document.getElementById('osSearchPO').value.trim().toLowerCase();
      this.filters.priceMin = document.getElementById('osPriceMin').valueAsNumber;
      this.filters.priceMax = document.getElementById('osPriceMax').valueAsNumber;
    } else {
      this.filters.po = '';
      this.filters.priceMin = NaN;
      this.filters.priceMax = NaN;
    }

    // Use raw value (YYYY-MM-DD) to construct Local Date, matching ReportUtils.parseDate behavior
    const rawStart = document.getElementById('osDateStart').value;
    const rawEnd = document.getElementById('osDateEnd').value;

    let dStart = null;
    if (rawStart) {
        const [y, m, d] = rawStart.split('-').map(Number);
        dStart = new Date(y, m - 1, d); // Local Midnight
    }

    let dEnd = null;
    if (rawEnd) {
        const [y, m, d] = rawEnd.split('-').map(Number);
        dEnd = new Date(y, m - 1, d);
        dEnd.setHours(23, 59, 59, 999); // End of Local Day
    }
    
    this.filters.dateStart = dStart;
    this.filters.dateEnd = dEnd;
  },

  // Handles the "Search Server" logic
  performDeepSearch: async function(term, contextType) {
      if (!term) return;
      
      this.deepSearchState.loading = true;
      this.deepSearchState.term = term;
      this.render(); // Update UI to show spinner

      try {
          let result = null;
          let resultType = '';

          // Search logic based on context
          if (contextType === 'Order') {
              // 1. Try Order No.
              result = await dataLoader.findRecordInRemoteSheet("Orders", "Order No.", term);
              if (result) resultType = 'Order';
              
              // 2. Try Cust PO if not found
              if (!result) {
                   result = await dataLoader.findRecordInRemoteSheet("Orders", "Cust PO", term);
                   if (result) resultType = 'Order';
              }
          } 
          else if (contextType === 'Sample') {
              result = await dataLoader.findRecordInRemoteSheet("Samples", "Order", term);
              if (result) resultType = 'Sample';
          }

          if (result) {
              // Normalize the deep search result
              const normalized = {
                  type: resultType,
                  id: result["Order No."] || result["Order"],
                  customer: result["Customer"],
                  dateStr: result["Order Date"] || result["Customer order(date)"],
                  dateObj: ReportUtils.parseDate(result["Order Date"] || result["Customer order(date)"]),
                  po: result["Cust PO"] || null,
                  total: parseFloat(String(result["Invoice Total"] || '0').replace(/[^0-9.-]/g, '')) || 0,
                  raw: result,
                  isDeepSearchResult: true // Mark for UI highlighting
              };
              
              // Inject into local data
              this.data.unshift(normalized);
              
              // Clear date filters so the old record is visible
              document.getElementById('osDateStart').value = '';
              this.filters.dateStart = null;
              
          } else {
              alert(`No match found on server for "${term}" in ${contextType}s.`);
          }

      } catch (error) {
          console.error(error);
          alert("Server search failed. See console for details.");
      } finally {
          this.deepSearchState.loading = false;
          this.render();
      }
  },

  render: function() {
    const tbody = document.getElementById('osTableBody');
    if(!tbody) return;
    tbody.innerHTML = '';

    const labelMap = {
      "Cost of Order": "Internal Cost",
      "Ship To Customer(date)": "Date Shipped",
      "Customer order(date)": "Order Date",
      "Supplier": "Parts",
      "Track": "Track No.",
      "Order": "Order No."
    };

    const { type, id, customer, po, dateStart, dateEnd, priceMin, priceMax } = this.filters;

    const filtered = this.data.filter(row => {
      const hasCustomer = row.customer && String(row.customer).trim().length > 0;
      const hasDate = !!row.dateObj; 
      if (!hasCustomer || !hasDate) return false;

      if (type !== 'all' && row.type.toLowerCase() !== type.toLowerCase()) return false;
      if (id && !String(row.id || '').toLowerCase().includes(id)) return false;
      if (customer && !String(row.customer || '').toLowerCase().includes(customer)) return false;
      
      if (row.dateObj) {
        if (dateStart && row.dateObj < dateStart) return false;
        if (dateEnd && row.dateObj > dateEnd) return false;
      }
      
      if (row.type === 'Order') {
        if (po && !String(row.po || '').toLowerCase().includes(po)) return false;
        if (!isNaN(priceMin) && row.total < priceMin) return false;
        if (!isNaN(priceMax) && row.total > priceMax) return false;
      }
      
      return true;
    });

    // === UPDATED EMPTY STATE ===
    if (filtered.length === 0) {
      let emptyContent = `
        <div class="text-muted">
          <i class="fas fa-search fa-3x mb-3 text-light"></i>
          <p class="mb-0 fs-5">No recent records found</p>
        </div>`;

      // Determine if we should show the "Deep Search" button
      const searchId = this.filters.id; 
      const searchPO = this.filters.po;
      const activeType = this.filters.type; 

      if (this.deepSearchState.loading) {
           emptyContent = `
            <div class="text-primary py-4">
              <div class="spinner-border mb-3" role="status"></div>
              <p class="mb-0">Searching entire history on server...</p>
              <small class="text-muted">This may take a few seconds</small>
            </div>`;
      } else if (searchId || searchPO) {
          // Only offer deep search if specific ID or PO is entered
          const term = searchId || searchPO;
          const searchContext = activeType === 'all' ? 'Order' : activeType;
          
          // Check context validity (e.g. don't search POs in Samples)
          const isValidContext = !(activeType === 'Sample' && searchPO);

          if (isValidContext) {
              emptyContent += `
              <div class="mt-3">
                  <p class="small mb-2 text-muted">Looking for an older record?</p>
                  <button class="btn btn-sm btn-outline-primary" 
                      onclick="OrderSampleSearch.performDeepSearch('${term}', '${searchContext}')">
                      <i class="fas fa-cloud-download-alt me-1"></i> Search Server for "${term}"
                  </button>
              </div>`;
          }
      }

      tbody.innerHTML = `<tr><td colspan="7" class="text-center py-5">${emptyContent}</td></tr>`;
      return;
    }

    const toRender = filtered.slice(0, 100);

    const formatIfPrice = (key, value) => {
        if (!value) return value; 
        const lowerKey = key.toLowerCase();
        if (lowerKey.match(/price|cost|total|amount/)) {
            const clean = String(value).replace(/[^0-9.-]/g, '');
            const num = parseFloat(clean);
            if (!isNaN(num)) {
                return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(num);
            }
        }
        return value;
    };

    toRender.forEach((row, index) => {
      const tr = document.createElement('tr');
      tr.style.cursor = 'pointer';
      tr.setAttribute('data-bs-toggle', 'collapse');
      tr.setAttribute('data-bs-target', `#detail-${index}`);
      tr.onclick = function() { this.classList.toggle('expanded-row-parent'); };

      const isOrder = row.type === 'Order';
      const badgeClass = isOrder ? 'badge-os-order' : 'badge-os-sample';
      const dateDisplay = row.dateObj 
        ? row.dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
        : row.dateStr || '-';
      
      const totalDisplay = isOrder 
        ? `<span class="fw-bold text-dark">${row.total.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}</span>`
        : '<span class="text-muted small">N/A</span>';

      // Add visual indicator for deep search results
      const deepSearchBadge = row.isDeepSearchResult 
          ? `<span class="badge bg-info text-dark ms-2 shadow-sm" title="Fetched from server history" style="font-size:0.65rem">SERVER</span>` 
          : '';

      tr.innerHTML = `
        <td><span class="badge-os ${badgeClass}">${row.type.toUpperCase()}</span></td>
        <td class="fw-bold text-primary">${row.id || '-'}${deepSearchBadge}</td>
        <td class="fw-semibold">${row.customer || '-'}</td>
        <td class="text-muted">${dateDisplay}</td>
        <td class="text-muted">${row.po || '-'}</td>
        <td class="text-end">${totalDisplay}</td>
        <td class="text-center"><i class="fas fa-chevron-down text-muted row-toggle-icon"></i></td>
      `;

      const detailTr = document.createElement('tr');
      const detailTd = document.createElement('td');
      detailTd.colSpan = 7;
      detailTd.className = 'p-0 border-0';
      
      let gridItems = '';
      const keys = Object.keys(row.raw).sort();

      keys.forEach(key => {
        const val = row.raw[key];
        if (key.startsWith('__')) return;
        if (key.toLowerCase() === 'blank') return; 

        let displayVal = val;
        if (val === null || val === undefined || String(val).trim() === '') {
            displayVal = '<span class="text-muted italic">--</span>';
        } else {
            displayVal = formatIfPrice(key, val);
        }
        const displayLabel = labelMap[key] || key;

        gridItems += `
          <div class="os-detail-item">
              <label>${displayLabel}</label>
              <span>${displayVal}</span>
          </div>`;
      });

      const collapseDiv = document.createElement('div');
      collapseDiv.id = `detail-${index}`;
      collapseDiv.className = 'collapse';
      collapseDiv.innerHTML = `
          <div class="os-detail-wrapper">
              <div class="d-flex align-items-center mb-3">
                  <h6 class="text-uppercase text-muted fw-bold mb-0 me-3" style="font-size: 0.75rem; letter-spacing:1px;">Record Details</h6>
                  ${row.isDeepSearchResult ? '<span class="badge bg-info text-dark">Historical Record</span>' : ''}
                  <div class="border-bottom flex-grow-1 ms-3"></div>
              </div>
              <div class="os-detail-grid">
                  ${gridItems}
              </div>
          </div>
      `;

      detailTd.appendChild(collapseDiv);
      detailTr.appendChild(detailTd);
      tbody.appendChild(tr);
      tbody.appendChild(detailTr);
    });
    
    if(filtered.length > 100) {
      const infoRow = document.createElement('tr');
      infoRow.innerHTML = `
        <td colspan="7" class="text-center text-muted small py-3">
          Showing first 100 of ${filtered.length} results. Refine search to see more.
        </td>`;
      tbody.appendChild(infoRow);
    }
  }
};

// Initialize the module when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  OrderSampleSearch.init();
});