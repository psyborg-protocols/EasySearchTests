/* reports.js (Main Registry) --------------------------------------------- */

let _reportsWired = false;
let _bsReportsModal = null;

window.reportModules = [
  {
    id: 'revdrop',
    title: 'Top Customers With Revenue Drop > 20%',
    generatorFunctionName: 'buildRevenueDropReport'
  },
  {
    id: 'bm-replacement',
    title: 'BM Replacement Opportunities',
    generatorFunctionName: 'buildBMReplacementReport'
  },
  {
    id: 'lapsed',
    title: 'Lapsed Customers (No Orders in 6 Months, Avg. Freq. > 1/6mo)',
    generatorFunctionName: 'buildLapsedCustomersReport'
  },
  { 
    id:'prodrev',
    title:'Top Products With Revenue Drop > 20%',
    generatorFunctionName:'buildProductRevenueDropReport'
  },
  {
    "id": "prodlapsed",
    "title": "Lapsed Products (No Orders in 6 Months, Avg. Freq. > 1/6mo)",
    "generatorFunctionName": "buildProductLapsedReport"
  },
  {
    id: 'invstuck',
    title: 'Stuck Inventory (Qty > 12-mo supply OR no sale in 6 mo)',
    generatorFunctionName: 'buildStuckInventoryReport'
  },
  {
  id: 'top20cust',
  title: 'Top 20 Customers by Revenue (Last 12 mo)',
  generatorFunctionName: 'buildTopCustomersByRevenueReport'
  },  
  {
  id: 'profit',
  title: 'Top Customers & Products by Profit',
  generatorFunctionName: 'buildProfitReport'
  }
  // Add more reports here
];

/* --------------------------------------------------------- */
/*  Common helper – returns an array of the top N customers  */
/*  for a given product SKU, ranked by total revenue.        */
/* --------------------------------------------------------- */
window.getTopCustomersForProduct = function (
        sku,          // product number / SKU
        topN   = 3,   // how many customers to return
        salesDF = window.dataStore?.Sales?.dataframe || []
) {
  if (!salesDF.length) return [];

  /* --- what column holds customer names? --- */
  const custField = 'Customer';

  /* --- aggregate revenue by customer for this SKU --- */
  const totals = {};
  salesDF.forEach(r => {
    if (r.Product_Service !== sku) return;
    const cust = r[custField];
    if (!cust) return;
    const amt  = +String(r.Total_Amount).replace(/\s/g, '') || 0;
    totals[cust] = (totals[cust] || 0) + amt;
  });

  return Object.entries(totals)
               .sort((a,b) => b[1] - a[1])        // high-rev first
               .slice(0, topN)                    // top N
               .map(([cust]) => cust);            // array of names
};

window.initReports = function initReports() {
  if (_reportsWired) return;
  _reportsWired = true;

  const btnGen = document.getElementById('generateReportsBtn');
  const modalEl = document.getElementById('reportsModal');
  if (!btnGen || !modalEl) {
    console.error('Report generation button or modal element not found.');
    return;
  }

  _bsReportsModal = new bootstrap.Modal(modalEl);
  const reportListGroup = modalEl.querySelector('.list-group');
  const modalFooter = modalEl.querySelector('.modal-footer');
  const modalTitleEl = modalEl.querySelector('.modal-title'); // Get the title element

  if (!reportListGroup || !modalTitleEl) {
    console.error('Report list group or modal title element not found in modal.');
    return;
  }

  btnGen.onclick = () => {
    reportListGroup.innerHTML = '';
    if (modalFooter) modalFooter.innerHTML = '';
    if (modalTitleEl) modalTitleEl.textContent = 'Generating Reports…'; // Set initial title

    window.reportModules.forEach(report => {
      const li = document.createElement('li');
      li.id = `item-${report.id}`;
      li.className = 'list-group-item d-flex justify-content-between align-items-center';
      li.innerHTML = `${report.title} <span class="spinner-border spinner-border-sm text-primary" role="status"></span>`;
      reportListGroup.appendChild(li);
    });

    _bsReportsModal.show();

    const runAllRegisteredReports = async () => { // Make this function async
      if (!window.dataStore || !window.dataStore.Sales || !window.dataStore.Sales.dataframe) {
        console.error("Sales data is not available for report generation.");
        reportListGroup.innerHTML = '<li class="list-group-item text-danger">Sales data not loaded. Cannot generate reports.</li>';
        if (modalTitleEl) modalTitleEl.textContent = 'Error: Data Not Loaded';
        return;
      }

      const reportPromises = window.reportModules.map(report => {
        if (typeof window[report.generatorFunctionName] === 'function') {
          // Expecting each generator function to return a Promise
          return window[report.generatorFunctionName](modalEl, report.id)
            .then(result => ({ status: 'fulfilled', id: report.id, value: result })) // Standardize success object
            .catch(error => {
              console.error(`Error in report ${report.id}:`, error);
              // The individual report should update its own <li> on error.
              // We return a standardized error object for Promise.allSettled-like behavior.
              return { status: 'rejected', id: report.id, reason: error };
            });
        } else {
          console.error(`Report generator function ${report.generatorFunctionName} not found for report ID ${report.id}.`);
          const item = reportListGroup.querySelector(`#item-${report.id}`);
          if (item) {
            item.querySelector('.spinner-border')?.remove();
            item.innerHTML += ' <small class="text-danger">(Error: Func not found)</small>';
          }
          return Promise.resolve({ status: 'rejected', id: report.id, reason: 'Generator function not found' });
        }
      });

      // Wait for all report promises to settle (either resolve or reject)
      const results = await Promise.all(reportPromises.map(p => p.catch(e => e))); // Catches individual rejections to let Promise.all complete

      let successfulCount = 0;
      let failedCount = 0;

      results.forEach(result => {
        if (result && result.status === 'fulfilled') {
          successfulCount++;
        } else {
          failedCount++;
          // Error details already logged by the catch within the map or by the report function itself
        }
      });
      
      if (modalTitleEl) {
        if (failedCount === 0) {
          modalTitleEl.textContent = `All ${successfulCount} Reports Generated`;
        } else if (successfulCount === 0) {
          modalTitleEl.textContent = `All ${failedCount} Reports Failed`;
        } else {
          modalTitleEl.textContent = `Reports Complete: ${successfulCount} Succeeded, ${failedCount} Failed`;
        }
      }
       // You could also update modalFooter here with more detailed summaries if needed.
    };

    if (window.reportsReady) {
      runAllRegisteredReports();
    } else {
      if (window.dataStore && window.dataStore.Sales && window.dataStore.Sales.dataframe) {
        console.warn("'reports-ready' event not caught, but data seems available. Proceeding with report generation.");
        window.reportsReady = true; 
        runAllRegisteredReports();
      } else {
        document.addEventListener('reports-ready', runAllRegisteredReports, { once: true });
      }
    }
  };
};

document.addEventListener('DOMContentLoaded', window.initReports);
