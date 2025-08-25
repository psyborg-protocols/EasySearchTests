/* reports/bmReplacementReport.js
   --------------------------------------------------------------- */

window.buildBMReplacementReport = function buildBMReplacementReport(
        modalEl,
        reportId         // "bm-replacement"
) {
  return new Promise((resolve, reject) => {

    /* --- locate our <li> in the modal --- */
    const liId  = `item-${reportId}`;
    const li    = modalEl.querySelector(`#${liId}`);
    if (!li) {
      console.error(`[${reportId}] list-item not found`);
      return reject({ reportId, error : 'list-item not found' });
    }

    /* --- crunch the numbers (async-friendly 0 ms slot) --- */
    setTimeout(() => {
      try {
        // Access the necessary data stores, providing empty objects as fallbacks.
        const equivalents = dataStore.Equivalents || {};
        const salesData = dataStore.Sales?.dataframe || [];
        const customerContacts = dataStore.CustomerContacts || {};
        const orgContacts = dataStore.OrgContacts || new Map();


        if (!salesData.length) {
          li.querySelector('.spinner-border')?.remove();
          li.insertAdjacentHTML('beforeend',
            ' <small class="text-muted">(no sales data)</small>');
          return resolve({ reportId, status : 'success', count : 0 });
        }

        // --- Helper Functions ---
        // Safely parses a date string into a Date object.
        const parseDate = (str) => {
            if (!str) return null;
            // Handles formats like "MM/DD/YY" and converts them to a full year.
            const cleaned = str.toString().trim().replace(/,/g, '').replace(/(\d{1,2})\/(\d{1,2})\/(\d{2})$/, '$1/$2/20$3');
            const ts = Date.parse(cleaned);
            return isNaN(ts) ? null : new Date(ts);
        };

        // Safely parses a value (like "$1,234.56") into a number.
        const parseNumber = (val) => {
            if (val == null) return 0;
            const num = parseFloat(String(val).replace(/[^0-9.-]/g, ''));
            return isFinite(num) ? num : 0;
        };
        
        // Formats a number into a currency string.
        const formatCurrency = (val) => {
            const num = parseNumber(val);
            return num.toLocaleString('en-US', {
                style: 'currency',
                currency: 'USD'
            });
        };

        // Escapes a string for use in a CSV file.
        const toCsvField = (val) => {
            const str = String(val == null ? '' : val);
            // If the string contains a comma, double quote, or newline, wrap it in double quotes.
            if (/[",\n]/.test(str)) {
                return `"${str.replace(/"/g, '""')}"`;
            }
            return str;
        };


        // --- 1. Pre-build a Contact Lookup Map with structured contact objects ---
        const contactInfoByName = {};

        // Prioritize the detailed "CustomerContacts" file
        for (const companyName in customerContacts) {
            const contacts = customerContacts[companyName].contacts;
            if (contacts && contacts.length > 0) {
                contactInfoByName[companyName.toLowerCase()] = contacts
                    .map(c => ({ name: c.Name, email: c.Email }))
                    .filter(c => c.email); // Only include contacts with an email
            }
        }

        // Fallback to organizational contacts (GAL) if not in the primary file
        orgContacts.forEach((contacts, companyName) => {
            const lowerCaseName = companyName.toLowerCase();
            if (!contactInfoByName[lowerCaseName] && contacts && contacts.length > 0) {
                contactInfoByName[lowerCaseName] = contacts
                    .map(c => ({ name: c.Name, email: c.Email || c.mail }))
                    .filter(c => c.email); // Only include contacts with an email
            }
        });


        // --- 2. Pre-calculate 12-Month Sales Info (Total Revenue and Revenue per Company) ---
        const twelveMonthsAgo = new Date();
        twelveMonthsAgo.setFullYear(twelveMonthsAgo.getFullYear() - 1);

        const salesInfoByProduct = {};
        for (const sale of salesData) {
            const saleDate = parseDate(sale.Date);
            if (saleDate && saleDate >= twelveMonthsAgo) {
                const product = sale.Product_Service;
                const revenue = parseNumber(sale.Total_Amount);
                const customer = sale.Customer;
                if (product && customer && !isNaN(revenue)) {
                    if (!salesInfoByProduct[product]) {
                        salesInfoByProduct[product] = { totalRevenue: 0, companies: new Map() };
                    }
                    salesInfoByProduct[product].totalRevenue += revenue;
                    const currentCompanyRevenue = salesInfoByProduct[product].companies.get(customer) || 0;
                    salesInfoByProduct[product].companies.set(customer, currentCompanyRevenue + revenue);
                }
            }
        }

        // --- 3. Consolidate Products and their BM Replacements ---
        const consolidatedOutput = {};
        for (const product in equivalents) {
            if (product.toUpperCase().startsWith("BM")) continue;
            const replacements = equivalents[product];
            const bmReplacements = replacements.filter(r => r.toUpperCase().startsWith("BM"));
            if (bmReplacements.length > 0) {
                if (!consolidatedOutput[product]) {
                    const salesInfo = salesInfoByProduct[product] || { totalRevenue: 0, companies: new Map() };
                    consolidatedOutput[product] = {
                        revenue: salesInfo.totalRevenue,
                        companies: salesInfo.companies,
                        bmReplacements: new Set()
                    };
                }
                bmReplacements.forEach(bm => consolidatedOutput[product].bmReplacements.add(bm));
            }
        }

        // --- 4. Convert to Array, Filter, and Sort ---
        const outputArray = Object.entries(consolidatedOutput).map(([product, data]) => ({
            'Product': product,
            'BM Replacement(s)': Array.from(data.bmReplacements).join(', '),
            'Revenue (12 Mo)': data.revenue,
            'Purchasing Companies': data.companies
        }));

        const filteredOutput = outputArray.filter(row => row['Revenue (12 Mo)'] > 0);
        filteredOutput.sort((a, b) => b['Revenue (12 Mo)'] - a['Revenue (12 Mo)']);


        li.querySelector('.spinner-border')?.remove();

        if (!filteredOutput.length) {
          li.insertAdjacentHTML('beforeend',
            ' <small class="text-muted">(no opportunities found)</small>');
          return resolve({ reportId, status:'success', count:0 });
        }

        // --- 5. Generate and Download CSV with Grouped Layout ---
        const csvRows = [];

        // Define the main headers for the file
        // Note: Bolding/italics are not supported in the CSV format itself.
        const mainHeaders = [
            'Product', 'BM Replacement(s)', 'Total Product Revenue (12 Mo)',
            'Purchasing Company', 'Company Revenue for Product', 
            'Contact 1', 'Contact 2', 'Contact 3', 'Contact 4', 'Contact 5',
            'Contact 6', 'Contact 7', 'Contact 8', 'Contact 9', 'Contact 10'
        ];
        csvRows.push(mainHeaders.join(','));

        // Create the grouped data
        filteredOutput.forEach(productData => {
            // Add the main product row (header for the group)
            const productRowData = [
                productData.Product,
                productData['BM Replacement(s)'],
                formatCurrency(productData['Revenue (12 Mo)']) // Format revenue
            ];
            csvRows.push(productRowData.map(toCsvField).join(','));

            // Add the company rows underneath
            const sortedCompanies = Array.from(productData['Purchasing Companies'].entries()).sort((a, b) => b[1] - a[1]);

            if (sortedCompanies.length > 0) {
                sortedCompanies.forEach(([company, companyRevenue]) => {
                    const contacts = contactInfoByName[company.toLowerCase()] || [];
                    const companyRowData = [
                        '', // Indent
                        '', // Indent
                        '', // Indent
                        company,
                        formatCurrency(companyRevenue), // Format revenue
                    ];

                    // Add up to 10 contacts with HYPERLINK formulas
                    for (let i = 0; i < 10; i++) {
                        const contact = contacts[i];
                        if (contact) {
                            const displayName = contact.name || contact.email;
                            const formula = `=HYPERLINK("mailto:${contact.email}", "${displayName.replace(/"/g, '""')}")`;
                            companyRowData.push(formula);
                        } else {
                            companyRowData.push('');
                        }
                    }
                    // Apply CSV escaping to every field in the row before joining
                    csvRows.push(companyRowData.map(toCsvField).join(','));
                });
            }

            // Add a blank row for spacing between products
            csvRows.push('');
        });

        const csvContent = csvRows.join('\n');

        /* --- download-button --- */
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const btn   = document.createElement('button');
        btn.className = 'report-download-btn';
        btn.title     = 'Download BM Replacement Opportunities CSV';
        btn.innerHTML = `
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -960 960 960"
               width="24" height="24" fill="#5f6368">
            <path d="M480-320 280-520l56-58 104 104v-326h80v326l104-104 56
                     58-200 200ZM240-160q-33 0-56.5-23.5T160-240v-120h80v120h480
                     v-120h80v120q0 33-23.5 56.5T720-160H240Z"/>
          </svg>`;
        btn.onclick = () => saveAs(blob, 'BM_Replacement_Opportunities.csv');
        li.appendChild(btn);

        resolve({ reportId, status:'success', count:filteredOutput.length });

      } catch (err) {
        console.error(`[${reportId}]`, err);
        li.querySelector('.spinner-border')?.remove();
        li.insertAdjacentHTML('beforeend',
          ' <small class="text-danger">(error)</small>');
        reject({ reportId, error:err });
      }
    }, 0);
  });
};
