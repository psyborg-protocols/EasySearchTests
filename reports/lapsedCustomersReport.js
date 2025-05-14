/* reports/lapsedCustomersReport.js --------------------------------------------- */

window.buildLapsedCustomersReport = function buildLapsedCustomersReport(modalEl, reportId) {
  // Return a new Promise
  return new Promise((resolve, reject) => {
    const listItemId = `item-${reportId}`;
    const item = modalEl.querySelector(`#${listItemId}`);

    if (!item) {
      console.error(`List item #${listItemId} not found for Lapsed Customers Report.`);
      // Reject the promise if the list item isn't found
      return reject({ reportId: reportId, error: `List item #${listItemId} not found` });
    }

    // Spinner should have been added by the main reports.js
    // If not, ensure it's there or add it.

    setTimeout(() => {
      try {
        const rawSalesData = window.dataStore.Sales.dataframe;
        if (!rawSalesData || rawSalesData.length === 0) {
          item.querySelector('.spinner-border')?.remove();
          item.innerHTML += ' <small class="text-muted">(No sales data available)</small>';
          // Resolve even if no data, as the report "ran" but had nothing to show
          return resolve({ reportId: reportId, status: 'success', message: 'No sales data' });
        }

        const today = new Date();
        const sixMonthsAgo = new Date();
        sixMonthsAgo.setMonth(today.getMonth() - 6);

        const parseDate = (dateStr) => {
          if (!dateStr || typeof dateStr !== 'string') return null;
          const parts = dateStr.split('/');
          if (parts.length !== 3) return null;
          const [month, day, year] = parts.map(s => parseInt(s.trim(), 10));
          if (isNaN(month) || isNaN(day) || isNaN(year)) return null;
          return new Date(year, month - 1, day);
        };

        const salesByCustomer = rawSalesData.reduce((acc, sale) => {
          const customerName = sale.Customer;
          if (!acc[customerName]) acc[customerName] = [];
          const saleDate = parseDate(sale.Date);
          if (saleDate && !isNaN(saleDate.getTime())) {
            const salesPrice = parseFloat(String(sale.Sales_Price).replace(/\s/g, '')) || 0;
            const totalAmount = parseFloat(String(sale.Total_Amount).replace(/\s/g, '')) || 0;
            const quantity = parseInt(sale.Quantity, 10) || 0;
            acc[customerName].push({
              date: saleDate, productService: sale.Product_Service,
              quantity: quantity, salesPrice: salesPrice, totalAmount: totalAmount,
            });
          }
          return acc;
        }, {});

        const lapsedCustomersReportData = [];
        for (const customerName in salesByCustomer) {
          const customerSales = salesByCustomer[customerName].sort((a, b) => b.date - a.date);
          if (customerSales.length === 0) continue;
          const lastSaleDate = customerSales[0].date;
          // Skip if last sale is within 6 months
          if (lastSaleDate >= sixMonthsAgo) continue;
          if (customerSales.length < 2) continue;
          const firstSaleDate = customerSales[customerSales.length - 1].date;
          const timespanInDays = (lastSaleDate - firstSaleDate) / (1000 * 60 * 60 * 24);
          // Skip if they were a customer for less than six months
          const MIN_PERIOD_DAYS = 180;
          if (timespanInDays < MIN_PERIOD_DAYS) {
            continue;
          }
          let averageSalesPer180Days;
          if (timespanInDays <= 0) {
            averageSalesPer180Days = (customerSales.length > 1) ? customerSales.length : 0;
          } else {
            averageSalesPer180Days = (customerSales.length / timespanInDays) * 180;
          }
          if (averageSalesPer180Days > 1) {
            lapsedCustomersReportData.push({
              'Customer Name': customerName,
              'Avg Sales Freq (orders/6mo)': averageSalesPer180Days.toFixed(2),
              'Date of Last Sale': lastSaleDate.toLocaleDateString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit' })
            });
          }
        }
        lapsedCustomersReportData.sort((a, b) => new Date(b['Date of Last Sale']) - new Date(a['Date of Last Sale']));

        item.querySelector('.spinner-border')?.remove();

        if (lapsedCustomersReportData.length > 0) {
          const toCSV = rows => { /* ... (toCSV logic remains the same) ... */ 
            if (!rows.length) return "";
            const cols = Object.keys(rows[0]);
            const esc = v => `"${String(v).replace(/"/g, '""')}"`;
            return [cols.join(",")]
              .concat(rows.map(r => cols.map(c => esc(r[c])).join(",")))
              .join("\n");
          };
          const csv = toCSV(lapsedCustomersReportData);
          const iconBtn = document.createElement('button');
          iconBtn.className = 'report-download-btn';
          iconBtn.title = 'Download Lapsed Customers Report';
          iconBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="#5f6368"><path d="M480-320 280-520l56-58 104 104v-326h80v326l104-104 56 58-200 200ZM240-160q-33 0-56.5-23.5T160-240v-120h80v120h480v-120h80v120q0 33-23.5 56.5T720-160H240Z"/></svg>`;
          iconBtn.onclick = () => saveAs(new Blob([csv], { type: 'text/csv;charset=utf-8' }), 'lapsed_customers_report.csv');
          item.appendChild(iconBtn);
          resolve({ reportId: reportId, status: 'success', count: lapsedCustomersReportData.length });
        } else {
          item.innerHTML += ' <small class="text-muted">(No customers matching criteria)</small>';
          resolve({ reportId: reportId, status: 'success', message: 'No matching criteria' });
        }
      } catch (error) {
        console.error(`Error in Lapsed Customers Report (${reportId}):`, error);
        item.querySelector('.spinner-border')?.remove();
        item.innerHTML += ' <small class="text-danger">(Error generating report)</small>';
        // Reject the promise with error information
        reject({ reportId: reportId, error: error });
      }
    }, 0); // setTimeout
  }); // Promise
};
