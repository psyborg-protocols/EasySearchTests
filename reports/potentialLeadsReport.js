/* reports/potentialLeadsReport.js
   --------------------------------------------------------------- 
   Identifies customers who have placed a single order > $5,000 
   in the past but haven't bought anything in the last 12 months.
*/

window.buildPotentialLeadsReport = function buildPotentialLeadsReport(modalEl, reportId) {
  return new Promise((resolve, reject) => {

    /* --- 1. Locate list item in Modal --- */
    const liId = `item-${reportId}`;
    const item = modalEl.querySelector(`#${liId}`);
    if (!item) {
      return reject({ reportId, error: 'list-item not found' });
    }

    setTimeout(() => {
      try {
        const salesDF = window.dataStore?.Sales?.dataframe || [];

        if (!salesDF.length) {
          item.querySelector('.spinner-border')?.remove();
          item.insertAdjacentHTML('beforeend', ' <small class="text-muted">(No sales data)</small>');
          return resolve({ reportId, status: 'success', count: 0 });
        }

        /* --- 2. Configuration --- */
        const LARGE_ORDER_THRESHOLD = 5000;
        const today = new Date();
        const oneYearAgo = new Date();
        oneYearAgo.setFullYear(today.getFullYear() - 1);

        const parseDate = ReportUtils.parseDate;
        const parseNumber = ReportUtils.parseNumber;
        const normalize = ReportUtils.normalise;

        /* --- 3. Aggregation --- */
        // We need to group by Customer -> Invoice(Num) to check order totals.
        // We also need to track the *latest* date per customer to check inactivity.
        
        const custMap = {}; // Key: normalizedName -> { displayName, lastDate, invoices: { num: total }, products: { name: totalRev } }

        salesDF.forEach(row => {
          const rawName = row.Customer;
          if (!rawName) return;
          
          const nameKey = normalize(rawName);
          const date = parseDate(row.Date);
          if (!date) return;

          const amount = parseNumber(row.Total_Amount);
          const invoiceNum = row.Num || 'UNKNOWN_INV';
          const prodName = row.Product_Service;

          // Init customer bucket
          if (!custMap[nameKey]) {
            custMap[nameKey] = {
              displayName: rawName,
              lastDate: date,
              invoices: {},
              products: {}
            };
          }

          const c = custMap[nameKey];

          // Update Last Seen Date
          if (date > c.lastDate) {
            c.lastDate = date;
          }

          // Accumulate Invoice Total (Stacking line items by Invoice Number)
          c.invoices[invoiceNum] = (c.invoices[invoiceNum] || 0) + amount;

          // Accumulate Product Revenue (for "Top Products" list)
          if (prodName) {
            c.products[prodName] = (c.products[prodName] || 0) + amount;
          }
        });

        /* --- 4. Filtering --- */
        const leads = [];

        Object.values(custMap).forEach(c => {
          // Rule 1: Must be inactive (Latest date < 12 months ago)
          if (c.lastDate >= oneYearAgo) return;

          // Rule 2: Must have at least one invoice > $5,000
          // specificBigOrder will hold the highest order amount found
          let maxOrderVal = 0;
          const hasBigOrder = Object.values(c.invoices).some(val => {
            if (val > maxOrderVal) maxOrderVal = val;
            return val >= LARGE_ORDER_THRESHOLD;
          });

          if (hasBigOrder) {
            // Determine Top 3 Products by Revenue
            const sortedProds = Object.entries(c.products)
              .sort((a, b) => b[1] - a[1]) // Sort desc by revenue
              .slice(0, 3)
              .map(p => p[0])
              .join(', ');

            leads.push({
              'Customer': c.displayName,
              'Last Sale Date': c.lastDate.toLocaleDateString('en-US'),
              'Max Order Value': maxOrderVal, // Keep number for sorting, format later
              'Top Products': sortedProds
            });
          }
        });

        /* --- 5. Sorting (Highest potential value first) --- */
        leads.sort((a, b) => b['Max Order Value'] - a['Max Order Value']);

        item.querySelector('.spinner-border')?.remove();

        if (leads.length === 0) {
          item.insertAdjacentHTML('beforeend', ' <small class="text-muted">(No matching leads)</small>');
          return resolve({ reportId, status: 'success', message: 'empty' });
        }

        /* --- 6. CSV Generation --- */
        // Helper to format currency for CSV
        const fmtMoney = v => `$${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        
        // Convert rows to CSV-ready strings
        const csvRows = leads.map(r => ({
          ...r,
          'Max Order Value': fmtMoney(r['Max Order Value'])
        }));

        const toCSV = (data) => {
          if (!data.length) return '';
          const headers = Object.keys(data[0]);
          const csvContent = [
            headers.join(','),
            ...data.map(row => headers.map(fieldName => {
              let val = row[fieldName] || '';
              // Escape quotes and wrap in quotes
              val = String(val).replace(/"/g, '""');
              return `"${val}"`;
            }).join(','))
          ].join('\n');
          return csvContent;
        };

        const csv = toCSV(csvRows);

        /* --- 7. UI Download Button --- */
        const btn = document.createElement('button');
        btn.className = 'report-download-btn';
        btn.title = 'Download Potential Leads Report';
        btn.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" height="24" viewBox="0 -960 960 960" width="24" fill="#5f6368">
              <path d="M480-320 280-520l56-58 104 104v-326h80v326l104-104 56 58-200 200ZM240-160q-33 0-56.5-23.5T160-240v-120h80v120h480v-120h80v120q0 33-23.5 56.5T720-160H240Z"/>
            </svg>`;
        
        btn.onclick = () => {
          const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
          saveAs(blob, 'Potential_Leads_Report.csv');
        };

        item.appendChild(btn);
        resolve({ reportId, status: 'success', rows: leads.length });

      } catch (err) {
        console.error('Potential Leads Report Error:', err);
        item.querySelector('.spinner-border')?.remove();
        item.insertAdjacentHTML('beforeend', ' <small class="text-danger">(Error)</small>');
        reject({ reportId, error: err });
      }
    }, 0);
  });
};