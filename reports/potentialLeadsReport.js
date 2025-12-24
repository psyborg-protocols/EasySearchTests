/* reports/potentialLeadsReport.js */

window.buildPotentialLeadsReport = function buildPotentialLeadsReport(modalEl, reportId) {
  return new Promise((resolve, reject) => {
    const item = modalEl.querySelector(`#item-${reportId}`);
    if (!item) return reject({ reportId, error: 'list-item not found' });

    setTimeout(() => {
      try {
        const salesDF = window.dataStore?.Sales?.dataframe || [];
        const orgContacts = window.dataStore?.OrgContacts || new Map();

        if (!salesDF.length) {
          item.querySelector('.spinner-border')?.remove();
          item.insertAdjacentHTML('beforeend', ' <small class="text-muted">(no sales data)</small>');
          return resolve({ reportId, status: 'success', count: 0 });
        }

        const today = new Date();
        const twelveMonthsAgo = new Date();
        twelveMonthsAgo.setFullYear(today.getFullYear() - 1);

        // 1. Group Data by Customer
        const customerStats = {};

        salesDF.forEach(r => {
          const customer = r.Customer;
          if (!customer) return;

          const date = ReportUtils.parseDate(r.Date);
          const amount = ReportUtils.parseNumber(r.Total_Amount);
          const invoiceNum = r.Num || 'No-Inv';

          if (!customerStats[customer]) {
            customerStats[customer] = {
              lastDate: new Date(0),
              invoices: {}, // To track total per invoice
              hasHighValueOrder: false
            };
          }

          // Track the most recent order date
          if (date && date > customerStats[customer].lastDate) {
            customerStats[customer].lastDate = date;
          }

          // Aggregate by Invoice Number (Num)
          customerStats[customer].invoices[invoiceNum] = (customerStats[customer].invoices[invoiceNum] || 0) + amount;
        });

        // 2. Filter for Leads (Inactive 12mo AND had an invoice > $5k)
        const leads = [];
        Object.entries(customerStats).forEach(([name, stats]) => {
          // Check if any invoice exceeded $5,000
          const hasBigOrder = Object.values(stats.invoices).some(total => total >= 5000);
          const isInactive = stats.lastDate < twelveMonthsAgo;

          if (hasBigOrder && isInactive) {
            const contacts = orgContacts.get(name) || [];
            leads.push({
              name,
              lastOrder: stats.lastDate,
              maxInvoice: Math.max(...Object.values(stats.invoices)),
              contact: contacts.length > 0 ? contacts[0] : null // Primary contact
            });
          }
        });

        // Sort by most recent "last order" (hottest leads first)
        leads.sort((a, b) => b.lastOrder - a.lastOrder);

        // 3. Generate CSV
        const headers = ['Customer Name', 'Last Order Date', 'Highest Single Invoice', 'Contact Name', 'Contact Email'];
        const csvRows = [headers.join(',')];

        leads.forEach(l => {
          const row = [
            l.name,
            l.lastOrder.toLocaleDateString(),
            l.maxInvoice.toFixed(2),
            l.contact ? l.contact.Name : 'N/A',
            l.contact ? (l.contact.Email || l.contact.mail) : 'N/A'
          ];
          csvRows.push(row.map(val => `"${String(val).replace(/"/g, '""')}"`).join(','));
        });

        // 4. UI & Download
        item.querySelector('.spinner-border')?.remove();
        if (leads.length > 0) {
          const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
          const btn = document.createElement('button');
          btn.className = 'report-download-btn';
          btn.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" height="24" viewBox="0 -960 960 960" width="24" fill="#5f6368">
              <path d="M480-320 280-520l56-58 104 104v-326h80v326l104-104 56 58-200 200ZM240-160q-33 0-56.5-23.5T160-240v-120h80v120h480v-120h80v120q0 33-23.5 56.5T720-160H240Z"/>
            </svg>`;
          btn.onclick = () => saveAs(blob, 'Potential_Leads_Report.csv');
          item.appendChild(btn);
        } else {
          item.insertAdjacentHTML('beforeend', ' <small class="text-muted">(no leads found)</small>');
        }

        resolve({ reportId, status: 'success', count: leads.length });
      } catch (err) {
        console.error(err);
        item.querySelector('.spinner-border')?.remove();
        reject({ reportId, error: err });
      }
    }, 0);
  });
};