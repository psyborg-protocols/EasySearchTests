/* reports/profitReport.js
   ----------------------- */
window.buildProfitReport = function buildProfitReport(modalEl, reportId, topN = 5) {
  return new Promise((resolve, reject) => {
    const item = modalEl.querySelector(`#item-${reportId}`);
    if (!item) return reject({ reportId, error:'LI not found' });

    setTimeout(() => {             // let spinner paint
      try {
        /* ---------- pull datasets ---------- */
        const salesDF = window.dataStore?.Sales?.dataframe || [];
        const dbDF    = window.dataStore?.DB?.dataframe    || [];
        if (!salesDF.length || !dbDF.length) {
          item.querySelector('.spinner-border')?.remove();
          item.insertAdjacentHTML('beforeend',
            ' <small class="text-danger">(Sales and/or DB data missing)</small>');
          return resolve({ reportId, status:'error' });
        }

        /* ---------- look-ups & helpers ---------- */
        const costBySku = dbDF.reduce((a,r)=>{
          a[r.PartNumber||r.Product_Service] = +r.UnitCost||+r.Unit_Cost||0;
          return a;
        },{});
        const parseDate = s => {
          const [m,d,y]=typeof s==='string'?s.split('/').map(t=>+t.trim()):[];
          return (m&&d&&y) ? new Date(y,m-1,d) : null;
        };
        const currency=v=>`$${v.toLocaleString(undefined,{minimumFractionDigits:0})}`;
        const pct=v=>`${v.toFixed(1)}%`;

        /* ---------- flatten sales → profit rows ---------- */
        const rows=[];
        salesDF.forEach(r=>{
          const dt=parseDate(r.Date); if(!dt) return;
          const sku=r.Product_Service;
          const rev= +String(r.Total_Amount||0).replace(/\s/g,'');
          const cost=(costBySku[sku]||0)*(+r.Quantity||1);
          rows.push({
            year:dt.getFullYear(),
            customer:r.Customer,
            product:sku,
            descr:r.Memo_Description||r.Description||'',
            profit:rev-cost
          });
        });

        if(!rows.length){
          item.querySelector('.spinner-border')?.remove();
          item.insertAdjacentHTML('beforeend',' <small class="text-muted">(No calculable rows)</small>');
          return resolve({ reportId, status:'success', message:'empty' });
        }

        /* ---------- helper to rank ---------- */
        function topBy(key, yr=null){
          const bucket={};
          rows.forEach(r=>{
            if(yr!==null && r.year!==yr) return;
            const k = key==='customer' ? r.customer : `${r.product}: ${r.descr}`;
            if(!k) return;
            bucket[k] = (bucket[k]||0)+r.profit;
          });
          const total = Object.values(bucket).reduce((a,b)=>a+b,0);
          const list  = Object.entries(bucket)
                          .sort((a,b)=>b[1]-a[1])
                          .slice(0,topN)
                          .map(([label,total])=>({label,total,percent:total/total}));
          return { total, list };
        }

        /* ---------- collect global + yearly ---------- */
        const years=[...new Set(rows.map(r=>r.year))].sort((a,b)=>b-a); // newest first
        const overallCompanyProfit=rows.reduce((a,r)=>a+r.profit,0);

        const overallCust=topBy('customer').list.map(o=>{
          o.percent=o.total/overallCompanyProfit; return o;
        });
        const overallProd=topBy('product').list.map(o=>{
          o.percent=o.total/overallCompanyProfit; return o;
        });

        const custByYear={}, prodByYear={}, companyByYear={};
        years.forEach(y=>{
          const c=topBy('customer',y); custByYear[y]=c.list;
          const p=topBy('product' ,y); prodByYear[y]=p.list;
          companyByYear[y]=rows.filter(r=>r.year===y)
                               .reduce((a,r)=>a+r.profit,0);
          // fix % once company total known
          custByYear[y].forEach(o=>o.percent=o.total/companyByYear[y]);
          prodByYear[y].forEach(o=>o.percent=o.total/companyByYear[y]);
        });

        /* ---------- build header row ---------- */
        const header=[
          'All-Time Customer/Product','All-Time Profit',
          'All-Time % of Profit','',''  // the blank separator col gets empty header
        ];
        years.forEach(y=>{
          header.push(`${y} Customer/Product`,`${y} Profit`,`${y} % of Profit`);
        });

        /* ---------- assemble section helper ---------- */
        const makeSection=(overallArr, yearlyDict)=>{
          const out=[];
          for(let i=0;i<topN;i++){
            const row=[];
            // overall
            const o=overallArr[i]||{};
            row.push(o.label||'', o.label?currency(o.total):'',
                      o.label?pct(o.percent*100):'', '');
            years.forEach(y=>{
              const v=yearlyDict[y][i]||{};
              row.push(v.label||'', v.label?currency(v.total):'',
                       v.label?pct(v.percent*100):'');
            });
            out.push(row);
          }
          return out;
        };

        const rowsCSV=[
          header,
          ...makeSection(overallCust,custByYear),
          [],                                    // blank row between cust / prod
          ...makeSection(overallProd,prodByYear)
        ];

        /* ---------- CSV stringify ---------- */
        const toCSV = arr => arr.map(r => r.map(c=>`"${String(c??'').replace(/"/g,'""')}"`).join(',')).join('\n');
        const csv = toCSV(rowsCSV);

        /* ---------- UI ---------- */
        item.querySelector('.spinner-border')?.remove();
        const btn=document.createElement('button');
        btn.className='report-download-btn';
        btn.title='Download Profit Report';
        btn.innerHTML=`<svg xmlns="http://www.w3.org/2000/svg" height="24" viewBox="0 -960 960 960" width="24" fill="#5f6368"><path d="M480-320 280-520l56-58 104 104v-326h80v326l104-104 56 58-200 200ZM240-160q-33 0-56.5-23.5T160-240v-120h80v120h480v-120h80v120q0 33-23.5 56.5T720-160H240Z"/></svg>`;
        btn.onclick=()=>saveAs(new Blob([csv],{type:'text/csv;charset=utf-8'}),'profit_report.csv');
        item.appendChild(btn);

        resolve({ reportId, status:'success', rows:rowsCSV.length });

      } catch(err){
        console.error('Profit report error',err);
        item.querySelector('.spinner-border')?.remove();
        item.insertAdjacentHTML('beforeend',' <small class="text-danger">(Error)</small>');
        reject({ reportId, error:err });
      }
    },0);
  });
};
