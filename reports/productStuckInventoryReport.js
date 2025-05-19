/* reports/productStuckInventoryReport.js ---------------------------------- */
window.buildStuckInventoryReport = function buildStuckInventoryReport(modalEl, reportId) {
  return new Promise((resolve, reject) => {
    const liId = `item-${reportId}`;
    const item = modalEl.querySelector(`#${liId}`);
    if (!item) return reject({ reportId, error: `List item #${liId} not found` });

    setTimeout(() => {
      try {
        const salesDF = window.dataStore?.Sales?.dataframe || [];
        const dbDF    = window.dataStore?.DB?.dataframe    || [];

        if (!salesDF.length || !dbDF.length) {
          item.querySelector('.spinner-border')?.remove();
          item.insertAdjacentHTML('beforeend',
            ' <small class="text-danger">(Sales and/or DB data not loaded)</small>');
          return resolve({ reportId, status:'error', message:'Missing data' });
        }

        /* ---------- configurable thresholds ---------- */
        const DAYS_BACK_SALES   = 365;
        const MONTH_SUPPLY_LIM  = 12;   // > 12 months on hand ⇒ “stuck”
        const LAPSED_SALE_DAYS  = 180;  // no sale in 6 mo ⇒ “stuck”

        /* ---------- helpers ---------- */
        const parseDate = s => {
          if (typeof s !== 'string') return null;
          const [m,d,y] = s.split('/').map(t => +t.trim());
          return (m&&d&&y) ? new Date(y, m-1, d) : null;
        };
        const today = new Date();
        const yearAgo   = new Date(today); yearAgo.setDate(today.getDate()-DAYS_BACK_SALES);
        const sixMonths = new Date(today); sixMonths.setDate(today.getDate()-LAPSED_SALE_DAYS);

        /* ---------- build look-ups ---------- */
        // 1. QtyAvailable  and cost per PartNumber from DB
        const invByPart = dbDF.reduce((acc,r)=>{
          const pn = r.PartNumber;
          const avail = (+r.QtyOnHand||0) - (+r.QtyOnOrder||0);
          const cost  = +r.UnitCost || 0;
          acc[pn] = {...acc[pn], avail, cost, descr: r.Description || r.PartDesc || ''};
          return acc;
        },{});

        // 2. sales stats, split into “demand window” and “ever”
        const statsByPart = {};

        salesDF.forEach(r => {
        const pn = r.Product_Service?.trim();
        const dt = parseDate(r.Date);
        if (!pn || !dt) return;

        // Get (or create) the stats bucket for this part
        const s = statsByPart[pn] ||= { units: 0, last: null };

        // 2a. Demand in the last 365 days
        if (dt >= yearAgo) s.units += +r.Quantity || 0;

        // 2b. Absolute last-sale date (keeps even very old sales)
        if (!s.last || dt > s.last) s.last = dt;
        });

        /* ---------- identify “stuck” products ---------- */
        const outRows = [];

        Object.entries(invByPart).forEach(([pn, inv])=>{
          const stats = statsByPart[pn] || {units:0,last:null};
          const avgMonthly = stats.units / 12;
          const monthsOnHand = avgMonthly ? inv.avail / avgMonthly : Infinity;
          const lastSale = stats.last;
          // metrics for sorting
          const sixMonthSupply = avgMonthly * 6;           
          const excessUnits    = Math.max(0, inv.avail - sixMonthSupply); 
          const excessCapital  = excessUnits * inv.cost;           

          const stuck =
            (!lastSale) ||                                    // never sold
            (lastSale < sixMonths) ||                         // no sale in 6 mo
            (monthsOnHand > MONTH_SUPPLY_LIM);                // >x months supply

          if (!stuck || inv.avail <= 0) return;

            const reason =
            avgMonthly === 0 ? 'No sales in past year' :
            monthsOnHand > MONTH_SUPPLY_LIM ? 'Oversupply' :
            lastSale < sixMonths ? 'Lapsed sales - No sales in the past six months' : '';

            outRows.push({
            'Product Number'   : pn,
            'Description'      : inv.descr,
            'Top Customers'    : window.getTopCustomersForProduct(pn).join(', '),
            'Qty Available'    : inv.avail,
            'Avg Monthly Units Sold (1 yr)' : avgMonthly.toFixed(2),
            'Months On Hand (at current rate of sale)'   : isFinite(monthsOnHand) ? monthsOnHand.toFixed(1) : '∞',
            'Excess Capital (>$) – over 6-mo supply' :               // display
                  excessCapital.toLocaleString('en-US',{style:'currency',currency:'USD'}),
            excessCapitalNum : excessCapital,                        // raw ★
            'Last Sale Date'   : lastSale ? lastSale.toLocaleDateString('en-US') : '—',
            'Stuck Reason'     : reason
            });
        });

        outRows.sort((a,b)=> b.excessCapitalNum - a.excessCapitalNum
                 ||  b['Qty Available']   - a['Qty Available']);

        /* ---------- render result ---------- */
        item.querySelector('.spinner-border')?.remove();

        if (outRows.length) {
          const toCSV = rows=>{
            const esc = v => `"${String(v).replace(/"/g,'""')}"`;
            const cols = Object.keys(rows[0]);
            return [cols.join(',')]
              .concat(rows.map(r=>cols.map(c=>esc(r[c])).join(','))).join('\n');
          };
          const csv = toCSV(outRows);

          const btn = document.createElement('button');
          btn.className = 'report-download-btn';
          btn.title = 'Download Stuck Inventory Report';
          btn.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" height="24" viewBox="0 -960 960 960" width="24" fill="#5f6368">
              <path d="M480-320 280-520l56-58 104 104v-326h80v326l104-104 56 58-200 200ZM240-160q-33 0-56.5-23.5T160-240v-120h80v120h480v-120h80v120q0 33-23.5 56.5T720-160H240Z"/>
            </svg>`;
          btn.onclick = () => saveAs(
              new Blob([csv],{type:'text/csv;charset=utf-8'}),
              'stuck_inventory_report.csv');
          item.appendChild(btn);
          resolve({reportId,status:'success',count:outRows.length});
        } else {
          item.insertAdjacentHTML('beforeend',
            ' <small class="text-muted">(No stuck items found)</small>');
          resolve({reportId,status:'success',message:'No matches'});
        }

      } catch(err){
        console.error('Stuck Inventory error',err);
        item.querySelector('.spinner-border')?.remove();
        item.insertAdjacentHTML('beforeend',' <small class="text-danger">(Error)</small>');
        reject({reportId,error:err});
      }
    },0);
  });
};
