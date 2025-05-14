/* reports.js ------------------------------------------------------- */

/* ── 1. ONE shared Bootstrap modal handle ───────────────────────── */
let _reportsWired   = false;
let _bsReportsModal = null;   // <-- make it module-level so helpers can see it

window.initReports = function initReports () {
  if (_reportsWired) return;
  _reportsWired = true;

  const btnGen  = document.getElementById('generateReportsBtn');
  const modalEl = document.getElementById('reportsModal');
  if (!btnGen || !modalEl) return;

  _bsReportsModal = new bootstrap.Modal(modalEl);

  /* ── MAIN CLICK ──────────────────────────────────────────────── */
  btnGen.onclick = () => {
    /* reset modal each time */
    modalEl.querySelector('.list-group').innerHTML = `
      <li id="item-revdrop"
          class="list-group-item d-flex justify-content-between align-items-center">
        Top Customers With Revenue Drop &gt; 20%
        <span class="spinner-border spinner-border-sm text-primary" role="status"></span>
      </li>
      <li id="item-lapsed"
          class="list-group-item d-flex justify-content-between align-items-center">
        Lapsed Customers (No Orders in 6 Months, Avg. Freq. &gt; 1/6mo)
        <span class="spinner-border spinner-border-sm text-primary" role="status"></span>
      </li>`;
    modalEl.querySelector('.modal-footer').innerHTML = '';
    _bsReportsModal.show();

    /* build now or when data arrive */
    const runAllReports = () => {
      buildRevenueDropReport(modalEl);
      buildLapsedCustomersReport(modalEl); // Call the new report function
    };

    if (window.reportsReady) {
      runAllReports();
    } else {
      document.addEventListener('reports-ready', runAllReports, { once: true });
    }
  };
};

/* ── 2. Heavy-lifters ------------------------------------------------ */

function buildRevenueDropReport (modalEl) {
  const list   = modalEl.querySelector('.list-group');
  const footer = modalEl.querySelector('.modal-footer');

  // Ensure the list item for this report exists, or create it if not.
  let li = list.querySelector('#item-revdrop');
  if (!li) {
    li = document.createElement('li');
    li.id = 'item-revdrop';
    li.className = 'list-group-item d-flex justify-content-between align-items-center';
    li.innerHTML = `Top Customers With Revenue Drop &gt; 20%
        <span class="spinner-border spinner-border-sm text-primary" role="status"></span>`;
    list.appendChild(li);
  } else {
    // If it exists, ensure spinner is visible
    if (!li.querySelector('.spinner-border')) {
        const spinner = document.createElement('span');
        spinner.className = 'spinner-border spinner-border-sm text-primary';
        spinner.setAttribute('role', 'status');
        li.appendChild(spinner);
    }
  }


  setTimeout(() => {
    const raw = window.dataStore.Sales.dataframe;
      const parsed = raw.map(r => {
        const [m, d, y] = r.Date.split('/').map(s => s.trim());
        return {
          customer: r.Customer,
          date: new Date(+y, +m - 1, +d), // Month is 0-indexed
          revenue: parseFloat(r.Total_Amount.replace(/\s/g, '')) // Remove spaces before parsing
        };
      });

      const customers = Array.from(new Set(parsed.map(r => r.customer)));
      const years = Array.from(new Set(parsed.map(r => r.date.getFullYear()))).sort();

      const totalRev = parsed.reduce((acc, r) => {
        acc[r.customer] = (acc[r.customer] || 0) + r.revenue;
        return acc;
      }, {});

      const revByYear = years.reduce((outer, year) => {
        const byCust = parsed
          .filter(r => r.date.getFullYear() === year)
          .reduce((acc, r) => {
            acc[r.customer] = (acc[r.customer] || 0) + r.revenue;
            return acc;
          }, {});
        outer[year] = byCust;
        return outer;
      }, {});

      const now = new Date();
      const last12Start = new Date(now); last12Start.setFullYear(now.getFullYear() - 1);
      const prior12Start = new Date(now); prior12Start.setFullYear(now.getFullYear() - 2);

      const sumWindow = (start, end) =>
        parsed
          .filter(r => r.date >= start && r.date < end)
          .reduce((acc, r) => {
            acc[r.customer] = (acc[r.customer] || 0) + r.revenue;
            return acc;
          }, {});

      const revLast12 = sumWindow(last12Start, now);
      const revPrior12 = sumWindow(prior12Start, last12Start);

      const formatCurrency = val => `$${val.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
      const formatPercent = val => `${val.toFixed(1)}%`;

      const reportRows = customers.map(cust => {
        const prior = revPrior12[cust] || 0;
        const last = revLast12[cust] || 0;
        const pctChange = prior > 0 ? ((last - prior) / prior) * 100 : (last > 0 ? 100 : 0); // Avoid division by zero, if last > 0 and prior is 0, it's a 100% increase effectively

        const row = {
          Customer: cust,
          Total_Revenue: totalRev[cust] || 0,
          Revenue_Last12: last,
          Revenue_Prior12: prior,
          Pct_Change: pctChange
        };

        // Add Y2021, Y2022, etc.
        years.forEach(y => {
          row[`Y${y}`] = revByYear[y][cust] || 0;
        });

        return row;
      });

      const filtered = reportRows
        .filter(r => r.Pct_Change !== null && r.Pct_Change < -20)
        .sort((a, b) => b.Total_Revenue - a.Total_Revenue);

      // Format all currency fields and percent
      const formatted = filtered.map(r => {
        const formattedRow = { Customer: r.Customer };

        // Format revenue columns
        Object.entries(r).forEach(([k, v]) => {
          if (k === 'Customer') return;
          if (k === 'Pct_Change') {
            formattedRow[k] = formatPercent(v);
          } else {
            formattedRow[k] = formatCurrency(v);
          }
        });

        return formattedRow;
      });

      // CSV serialization
      const toCSV = rows => {
        if (!rows.length) return "";
        const cols = Object.keys(rows[0]);
        const esc = v => `"${String(v).replace(/"/g, '""')}"`; // Escape double quotes
        return [cols.join(",")]
          .concat(rows.map(r => cols.map(c => esc(r[c])).join(",")))
          .join("\n");
      };
      const csv = toCSV(formatted);

    const item = modalEl.querySelector('#item-revdrop');
    if(item) item.querySelector('.spinner-border')?.remove();

    if (formatted.length > 0) {
        const iconBtn = document.createElement('button');
        iconBtn.className = 'report-download-btn';
        iconBtn.title = 'Download Revenue Drop Report';
        iconBtn.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg"
                height="24px" viewBox="0 -960 960 960"
                width="24px" fill="#5f6368">
            <path d="M480-320 280-520l56-58 104 104v-326h80v326l104-104
                    56 58-200 200ZM240-160q-33 0-56.5-23.5T160-240v-120h80v120
                    h480v-120h80v120q0 33-23.5 56.5T720-160H240Z"/>
            </svg>
        `;
        iconBtn.onclick = () =>
          saveAs(new Blob([csv], { type: 'text/csv;charset=utf-8' }),
                 'revenue_drop_report.csv');
        if(item) item.appendChild(iconBtn);
    } else {
        if(item) item.innerHTML += ' <small class="text-muted">(No data matching criteria)</small>';
    }
  }, 0);
}


function buildLapsedCustomersReport(modalEl) {
  const list = modalEl.querySelector('.list-group');

  // Ensure the list item for this report exists, or create it if not.
  let li = list.querySelector('#item-lapsed');
  if (!li) {
    li = document.createElement('li');
    li.id = 'item-lapsed';
    li.className = 'list-group-item d-flex justify-content-between align-items-center';
    li.innerHTML = `Lapsed Customers (No Orders in 6 Months, Avg. Freq. &gt; 1/6mo)
        <span class="spinner-border spinner-border-sm text-primary" role="status"></span>`;
    list.appendChild(li);
  } else {
     // If it exists, ensure spinner is visible
    if (!li.querySelector('.spinner-border')) {
        const spinner = document.createElement('span');
        spinner.className = 'spinner-border spinner-border-sm text-primary';
        spinner.setAttribute('role', 'status');
        li.appendChild(spinner);
    }
  }


  setTimeout(() => {
    const rawSalesData = window.dataStore.Sales.dataframe;
    if (!rawSalesData || rawSalesData.length === 0) {
      const item = modalEl.querySelector('#item-lapsed');
      if(item) {
          item.querySelector('.spinner-border')?.remove();
          item.innerHTML += ' <small class="text-muted">(No sales data available)</small>';
      }
      return;
    }

    const today = new Date();
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(today.getMonth() - 6);

    // Helper to parse date strings like "MM/DD/YYYY"
    const parseDate = (dateStr) => {
      const [month, day, year] = dateStr.split('/').map(s => parseInt(s.trim(), 10));
      return new Date(year, month - 1, day); // Month is 0-indexed
    };

    // Group sales by customer
    const salesByCustomer = rawSalesData.reduce((acc, sale) => {
      const customerName = sale.Customer;
      if (!acc[customerName]) {
        acc[customerName] = [];
      }
      try {
        const saleDate = parseDate(sale.Date);
        // Ensure Sales_Price and Total_Amount are numbers, removing spaces and handling potential non-numeric values
        const salesPrice = parseFloat(String(sale.Sales_Price).replace(/\s/g, ''));
        const totalAmount = parseFloat(String(sale.Total_Amount).replace(/\s/g, ''));

        if (!isNaN(saleDate.getTime())) { // Check if date is valid
             acc[customerName].push({
                date: saleDate,
                productService: sale.Product_Service,
                quantity: parseInt(sale.Quantity, 10),
                salesPrice: isNaN(salesPrice) ? 0 : salesPrice,
                totalAmount: isNaN(totalAmount) ? 0 : totalAmount,
            });
        }
      } catch (e) {
        console.warn(`Could not parse date for sale: ${sale.Date}`, e);
      }
      return acc;
    }, {});

    const lapsedCustomersReportData = [];

    for (const customerName in salesByCustomer) {
      const customerSales = salesByCustomer[customerName].sort((a, b) => b.date - a.date); // Sort by date, most recent first

      if (customerSales.length === 0) continue;

      const lastSaleDate = customerSales[0].date;

      // Condition 1: No orders in the past 6 months
      if (lastSaleDate >= sixMonthsAgo) {
        continue; // Customer has made an order in the last 6 months
      }

      // Calculate sales frequency
      if (customerSales.length < 2) { // Need at least two sales to calculate frequency
        // If only one sale and it's older than 6 months, they are lapsed but frequency is undefined or 0.
        // Depending on strict interpretation, you might exclude them or handle differently.
        // For "frequency > 1/6 months", one sale ever doesn't qualify.
        continue;
      }

      const firstSaleDate = customerSales[customerSales.length - 1].date;
      const timespanInDays = (lastSaleDate - firstSaleDate) / (1000 * 60 * 60 * 24);
      
      // If all sales are on the same day, timespanInDays will be 0.
      // This would lead to division by zero or infinite frequency.
      // We can treat this as a very high frequency if multiple sales on one day,
      // or as "1 sale event" if it's just one day of activity.
      // For this report, if timespan is 0 and multiple sales, it's very frequent.
      // If only one distinct day of sales, frequency isn't really "over time".

      let averageSalesPer180Days;
      if (timespanInDays === 0) {
        // If multiple sales on the same day, it's highly frequent for that day.
        // But over a longer period, this doesn't translate to "more than 1 per 6 months" unless that day was recent.
        // Given they are already lapsed (last sale > 6mo ago), this scenario is unlikely to meet the "active then lapsed" profile.
        // Let's assume frequency is low if only one day of sales historically.
        averageSalesPer180Days = 0; // Or handle as per business rule
      } else {
        const salesFrequencyPerDay = (customerSales.length -1) / timespanInDays; // Number of intervals / days
        averageSalesPer180Days = salesFrequencyPerDay * 180;
      }


      // Condition 2: Average sales frequency is more than 1 per 6 months (180 days)
      if (averageSalesPer180Days > 1) {
        lapsedCustomersReportData.push({
          'Customer Name': customerName,
          'Average Sales Frequency (per 6 mo)': averageSalesPer180Days.toFixed(2),
          'Date of Last Sale': lastSaleDate.toLocaleDateString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit' })
        });
      }
    }

    // Sort by customer name for consistent output
    lapsedCustomersReportData.sort((a, b) => a['Customer Name'].localeCompare(b['Customer Name']));

    const item = modalEl.querySelector('#item-lapsed');
    if(item) item.querySelector('.spinner-border')?.remove();

    if (lapsedCustomersReportData.length > 0) {
      const toCSV = rows => {
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
      iconBtn.innerHTML = `
          <svg xmlns="http://www.w3.org/2000/svg"
              height="24px" viewBox="0 -960 960 960"
              width="24px" fill="#5f6368">
          <path d="M480-320 280-520l56-58 104 104v-326h80v326l104-104
                  56 58-200 200ZM240-160q-33 0-56.5-23.5T160-240v-120h80v120
                  h480v-120h80v120q0 33-23.5 56.5T720-160H240Z"/>
          </svg>
      `;
      iconBtn.onclick = () =>
        saveAs(new Blob([csv], { type: 'text/csv;charset=utf-8' }),
               'lapsed_customers_report.csv');
      if(item) item.appendChild(iconBtn);
    } else {
       if(item) item.innerHTML += ' <small class="text-muted">(No customers matching criteria)</small>';
    }
  }, 0); // Use setTimeout to allow UI to update before heavy processing
}


/* ── fire the initial wiring on page-ready ─────────────────────── */
document.addEventListener('DOMContentLoaded', initReports);
