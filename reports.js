/* reports.js – Revenue Drop Report */

window.initReports = function initReports() {
  const btnGen = document.getElementById('generateReportsBtn');
  const modalEl = document.getElementById('reportsModal');
  if (!btnGen || !modalEl) {
    console.error('[reports] Missing #generateReportsBtn or #reportsModal – reports disabled');
    return;
  }
  const bsModal = new bootstrap.Modal(modalEl);

  btnGen.onclick = () => {
    // 1. Clear & set up a single list-item for this report
    const list = modalEl.querySelector('.list-group');
    list.innerHTML = '';
    const li = document.createElement('li');
    li.id = 'item-drop';
    li.className = 'list-group-item d-flex justify-content-between align-items-center';
    li.textContent = 'Revenue Drop > 20%';
    const spinner = document.createElement('span');
    spinner.className = 'spinner-border spinner-border-sm text-primary';
    spinner.setAttribute('role', 'status');
    li.appendChild(spinner);
    list.appendChild(li);

    // 2. Show modal and clear footer
    const footer = modalEl.querySelector('.modal-footer');
    footer.innerHTML = '';
    bsModal.show();

    // 3. Build the report after a tiny delay (so spinner appears)
    setTimeout(() => {
      // ——— your snippet, adapted to use Sales.dataframe ———
      const raw = window.dataStore.Sales.dataframe;
      const parsed = raw.map(r => {
        const [m, d, y] = r.Date.split('/').map(s => s.trim());
        return {
          customer: r.Customer,
          date:    new Date(+y, +m - 1, +d),
          revenue: parseFloat(r.Total_Amount)
        };
      });

      const customers = Array.from(new Set(parsed.map(r => r.customer)));
      const years     = Array.from(new Set(parsed.map(r => r.date.getFullYear()))).sort();

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
      const last12Start  = new Date(now); last12Start.setFullYear(now.getFullYear() - 1);
      const prior12Start = new Date(now); prior12Start.setFullYear(now.getFullYear() - 2);

      const sumWindow = (start, end) =>
        parsed
          .filter(r => r.date >= start && r.date < end)
          .reduce((acc, r) => {
            acc[r.customer] = (acc[r.customer] || 0) + r.revenue;
            return acc;
          }, {});

      const revLast12  = sumWindow(last12Start, now);
      const revPrior12 = sumWindow(prior12Start, last12Start);

      const reportRows = customers.map(cust => {
        const prior = revPrior12[cust] || 0;
        const last  = revLast12[cust]  || 0;
        const pctChange = prior > 0
          ? ((last - prior) / prior) * 100
          : null;

        return {
          Customer:      cust,
          Total_Revenue: totalRev[cust] || 0,
          ...years.reduce((o, y) => {
            o[`Y${y}`] = revByYear[y][cust] || 0;
            return o;
          }, {}),
          Revenue_Last12:  last,
          Revenue_Prior12: prior,
          Pct_Change:      pctChange
        };
      });

      const filtered = reportRows
        .filter(r => r.Pct_Change !== null && r.Pct_Change < -20)
        .sort((a, b) => b.Total_Revenue - a.Total_Revenue);

      // 4. CSV serialization
      const toCSV = rows => {
        if (!rows.length) return "";
        const cols = Object.keys(rows[0]);
        const esc  = v => `"${String(v).replace(/"/g, '""')}"`;
        return [cols.join(",")]
          .concat(rows.map(r => cols.map(c => esc(r[c])).join(",")))
          .join("\n");
      };
      const csv = toCSV(filtered);

      // 5. Swap spinner for your SVG icon button
      const item = modalEl.querySelector('#item-drop');
      item.querySelector('.spinner-border')?.remove();

      const iconBtn = document.createElement('button');
      iconBtn.className = 'generate-reports-btn';
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
      iconBtn.onclick = () => {
        saveAs(new Blob([csv], { type: 'text/csv;charset=utf-8' }),
               'revenue_drop_report.csv');
      };
      item.appendChild(iconBtn);

      // 6. Log to console
      console.table(filtered);
    }, 100);
  };
};

// auto-run on load
document.addEventListener('DOMContentLoaded', initReports);
