/* reports/revenueDropReport.js --------------------------------------------- */

// Make sure this function is globally accessible
// It will be called by the main reports.js registry
// Parameters:
// - modalEl: The main modal DOM element.
// - reportId: The unique ID for this report (e.g., 'revdrop'), used to target the correct <li>.
window.buildRevenueDropReport = function buildRevenueDropReport(modalEl, reportId) {
  // Return a new Promise
  return new Promise((resolve, reject) => {
    const listItemId = `item-${reportId}`;
    const item = modalEl.querySelector(`#${listItemId}`);

    if (!item) {
      console.error(`List item #${listItemId} not found for Revenue Drop Report.`);
      // Reject the promise if the list item isn't found
      return reject({ reportId: reportId, error: `List item #${listItemId} not found` });
    }

    // Spinner should have been added by the main reports.js

    setTimeout(() => {
      try {
        const raw = window.dataStore.Sales.dataframe;
        if (!raw || raw.length === 0) {
          item.querySelector('.spinner-border')?.remove();
          item.innerHTML += ' <small class="text-muted">(No sales data available)</small>';
          // Resolve even if no data, as the report "ran" but had nothing to show
          return resolve({ reportId: reportId, status: 'success', message: 'No sales data' });
        }

        const parsed = raw.map(r => {
          // Basic validation for date format
          const dateParts = r.Date && typeof r.Date === 'string' ? r.Date.split('/') : [];
          if (dateParts.length !== 3) {
            // console.warn(`Invalid date format: ${r.Date} for customer ${r.Customer}`);
            return null; // Skip this record or handle as appropriate
          }
          const [m, d, y] = dateParts.map(s => s.trim());
          const parsedDate = new Date(+y, +m - 1, +d);
          if (isNaN(parsedDate.getTime())) {
            // console.warn(`Invalid date after parsing: ${r.Date} for customer ${r.Customer}`);
            return null; // Skip invalid date
          }

          return {
            customer: r.Customer,
            date: parsedDate,
            revenue: parseFloat(String(r.Total_Amount).replace(/\s/g, '')) || 0
          };
        }).filter(p => p !== null); // Filter out records with invalid dates

        if (parsed.length === 0) {
            item.querySelector('.spinner-border')?.remove();
            item.innerHTML += ' <small class="text-muted">(No valid sales data after parsing)</small>';
            return resolve({ reportId: reportId, status: 'success', message: 'No valid sales data after parsing' });
        }

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
          const pctChange = prior > 0 ? ((last - prior) / prior) * 100 : (last > 0 ? 100 : (prior === 0 && last === 0 ? 0 : -100) );


          const row = {
            Customer: cust,
            Total_Revenue: totalRev[cust] || 0,
            Revenue_Last12: last,
            Revenue_Prior12: prior,
            Pct_Change: pctChange
          };

          years.forEach(y => {
            row[`Y${y}`] = revByYear[y]?.[cust] || 0;
          });

          return row;
        });

        const filtered = reportRows
          .filter(r => r.Pct_Change !== null && r.Pct_Change < -20)
          .sort((a, b) => b.Total_Revenue - a.Total_Revenue);

        const formatted = filtered.map(r => {
          const formattedRow = { Customer: r.Customer };
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

        const toCSV = rows => {
          if (!rows.length) return "";
          const cols = Object.keys(rows[0]);
          const esc = v => `"${String(v).replace(/"/g, '""')}"`;
          return [cols.join(",")]
            .concat(rows.map(r => cols.map(c => esc(r[c])).join(",")))
            .join("\n");
        };
        const csv = toCSV(formatted);

        item.querySelector('.spinner-border')?.remove();

        if (formatted.length > 0) {
          const iconBtn = document.createElement('button');
          iconBtn.className = 'report-download-btn';
          iconBtn.title = 'Download Revenue Drop Report';
          iconBtn.innerHTML = `
              <svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="#5f6368">
              <path d="M480-320 280-520l56-58 104 104v-326h80v326l104-104 56 58-200 200ZM240-160q-33 0-56.5-23.5T160-240v-120h80v120h480v-120h80v120q0 33-23.5 56.5T720-160H240Z"/>
              </svg>`;
          iconBtn.onclick = () =>
            saveAs(new Blob([csv], { type: 'text/csv;charset=utf-8' }), 'revenue_drop_report.csv');
          item.appendChild(iconBtn);
          // Resolve the promise with success status and count
          resolve({ reportId: reportId, status: 'success', count: formatted.length });
        } else {
          item.innerHTML += ' <small class="text-muted">(No data matching criteria)</small>';
          // Resolve the promise with success status, indicating no matching data
          resolve({ reportId: reportId, status: 'success', message: 'No matching criteria' });
        }
      } catch (error) {
        console.error(`Error in Revenue Drop Report (${reportId}):`, error);
        item.querySelector('.spinner-border')?.remove();
        item.innerHTML += ' <small class="text-danger">(Error generating report)</small>';
        // Reject the promise with error information
        reject({ reportId: reportId, error: error });
      }
    }, 0); // setTimeout
  }); // Promise
};
