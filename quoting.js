/**
 * Quoting Module
 * Handles the Dashboard, Quote List, and Quote Editor views.
 * Adapted to work with window.dataStore
 */
(function() {
    class QuotingModule {
        constructor() {
            this.quotes = [
                // Mock initial history
                { id: 15033696, number: 4962, title: 'Permanent Unions (LA 06-08)', client: 'Aida Velazquez', company: 'Permanent Unions', status: 'draft', total: 80.00, date: '2025-10-25', items: [] },
                { id: 15026486, number: 4961, title: 'Safety Equipment Q3', client: 'Garret Colonna', company: 'Total Safety', status: 'sent', total: 327000.00, date: '2025-10-24', items: [] }
            ];
            this.currentView = 'dashboard';
            this.activeQuote = null;
            this.container = null;
        }

        init(containerId) {
            this.container = document.getElementById(containerId);
            if (!this.container) {
                console.error("Quoting container not found:", containerId);
                return;
            }
            this.render();
        }

        /**
         * Flattens the window.dataStore.OrgContacts Map into a usable array.
         */
        getContacts() {
            const allContacts = [];
            const orgContacts = window.dataStore?.OrgContacts; // Map<CompanyName, Array<Contact>>

            if (orgContacts && orgContacts instanceof Map) {
                orgContacts.forEach((contactsList, companyName) => {
                    if (Array.isArray(contactsList)) {
                        contactsList.forEach(c => {
                            if (c.Email) { // Filter out contacts without email
                                allContacts.push({
                                    name: c.Name || 'Unknown',
                                    email: c.Email,
                                    company: companyName,
                                    title: c.Title || ''
                                });
                            }
                        });
                    }
                });
            }
            // Sort by name for easier searching
            return allContacts.sort((a, b) => a.name.localeCompare(b.name));
        }

        /**
         * Maps window.dataStore.DB.dataframe to product format.
         */
        getProducts() {
            const rawProducts = window.dataStore?.DB?.dataframe || [];
            return rawProducts.map(p => ({
                id: p.PartNumber,
                name: p.PartNumber,
                description: p.Description || '',
                price: parseFloat(p.UnitCost) || 0,
                qtyOnHand: p.QtyOnHand || 0
            }));
        }

        render() {
            // Main Layout
            this.container.innerHTML = `
                <div class="quoting-app h-100 d-flex flex-column bg-light rounded shadow-sm" style="min-height: 800px;">
                    <!-- Quoting Toolbar -->
                    <div class="bg-white border-bottom p-3 d-flex justify-content-between align-items-center shadow-sm sticky-top rounded-top">
                        <div class="d-flex align-items-center gap-3">
                            <h5 class="m-0 fw-bold text-primary"><i class="fa-solid fa-file-invoice-dollar me-2"></i>Quoter</h5>
                            <div class="vr text-muted"></div>
                            <div class="btn-group" role="group">
                                <button class="btn btn-outline-secondary border-0 ${this.currentView === 'dashboard' ? 'active fw-bold text-primary' : ''}" id="nav-quote-dash">
                                    Dashboard
                                </button>
                                <button class="btn btn-outline-secondary border-0 ${this.currentView === 'list' ? 'active fw-bold text-primary' : ''}" id="nav-quote-list">
                                    Quotes
                                </button>
                            </div>
                        </div>
                        <button class="btn btn-primary shadow-sm" id="btn-new-quote">
                            <i class="fa-solid fa-plus me-2"></i>New Quote
                        </button>
                    </div>

                    <!-- Content Area -->
                    <div id="quoting-content" class="flex-grow-1 overflow-auto p-4">
                        <!-- Dynamic Content -->
                    </div>
                </div>
            `;

            this.bindNavigation();
            this.loadView();
        }

        bindNavigation() {
            document.getElementById('nav-quote-dash').onclick = () => this.switchView('dashboard');
            document.getElementById('nav-quote-list').onclick = () => this.switchView('list');
            document.getElementById('btn-new-quote').onclick = () => this.createNewQuote();
        }

        switchView(viewName) {
            this.currentView = viewName;
            
            // Update UI Tabs
            const dashBtn = document.getElementById('nav-quote-dash');
            const listBtn = document.getElementById('nav-quote-list');
            
            if(dashBtn && listBtn) {
                if (viewName === 'dashboard') {
                    dashBtn.classList.add('active', 'fw-bold', 'text-primary');
                    listBtn.classList.remove('active', 'fw-bold', 'text-primary');
                } else {
                    listBtn.classList.remove('active', 'fw-bold', 'text-primary');
                    if (viewName === 'list') {
                        listBtn.classList.add('active', 'fw-bold', 'text-primary');
                    }
                }
            }

            this.loadView();
        }

        loadView() {
            const content = document.getElementById('quoting-content');
            if (!content) return;
            
            content.innerHTML = '';

            if (this.currentView === 'dashboard') {
                content.innerHTML = this.getDashboardHTML();
            } else if (this.currentView === 'list') {
                content.innerHTML = this.getQuotesListHTML();
                this.attachListListeners();
            } else if (this.currentView === 'edit') {
                content.innerHTML = this.getQuoteEditorHTML();
                this.attachEditorListeners();
            }
        }

        // --- Dashboard View ---

        getDashboardHTML() {
            const accepted = this.quotes.filter(q => q.status === 'accepted');
            const totalAccepted = accepted.reduce((sum, q) => sum + q.total, 0);
            const draft = this.quotes.filter(q => q.status === 'draft');
            const sent = this.quotes.filter(q => q.status === 'sent');
            
            return `
                <div class="container-fluid" style="max-width: 1200px;">
                    <div class="row g-4 mb-5">
                        <div class="col-md-4">
                            <div class="card border-0 shadow-sm p-3 h-100 bg-white">
                                <div class="card-body">
                                    <div class="d-flex justify-content-between align-items-center mb-3">
                                        <h6 class="text-uppercase text-muted fw-bold mb-0" style="font-size: 0.75rem;">Accepted Revenue</h6>
                                        <div class="icon-shape bg-success-subtle text-success rounded-circle p-2">
                                            <i class="fas fa-dollar-sign"></i>
                                        </div>
                                    </div>
                                    <h2 class="text-dark fw-bold mb-0">$${totalAccepted.toLocaleString()}</h2>
                                    <small class="text-muted">From ${accepted.length} accepted quotes</small>
                                </div>
                            </div>
                        </div>
                        <div class="col-md-4">
                            <div class="card border-0 shadow-sm p-3 h-100 bg-white">
                                <div class="card-body">
                                    <div class="d-flex justify-content-between align-items-center mb-3">
                                        <h6 class="text-uppercase text-muted fw-bold mb-0" style="font-size: 0.75rem;">Draft Pipeline</h6>
                                        <div class="icon-shape bg-warning-subtle text-warning rounded-circle p-2">
                                            <i class="fas fa-pencil-alt"></i>
                                        </div>
                                    </div>
                                    <h2 class="text-dark fw-bold mb-0">${draft.length}</h2>
                                    <small class="text-muted">Potential deals in progress</small>
                                </div>
                            </div>
                        </div>
                        <div class="col-md-4">
                            <div class="card border-0 shadow-sm p-3 h-100 bg-white">
                                <div class="card-body">
                                    <div class="d-flex justify-content-between align-items-center mb-3">
                                        <h6 class="text-uppercase text-muted fw-bold mb-0" style="font-size: 0.75rem;">Pending Approval</h6>
                                        <div class="icon-shape bg-primary-subtle text-primary rounded-circle p-2">
                                            <i class="fas fa-paper-plane"></i>
                                        </div>
                                    </div>
                                    <h2 class="text-dark fw-bold mb-0">${sent.length}</h2>
                                    <small class="text-muted">Waiting on customer</small>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="card border-0 shadow-sm">
                        <div class="card-header bg-white border-bottom py-3">
                            <h6 class="m-0 fw-bold text-primary text-uppercase" style="font-size: 0.8rem;">Recent Activity</h6>
                        </div>
                        <div class="card-body p-0">
                            <div class="list-group list-group-flush">
                                ${this.quotes.slice(0, 5).map(q => `
                                    <div class="list-group-item list-group-item-action d-flex align-items-center justify-content-between py-3 px-4 border-bottom-0" onclick="window.QuotingApp.editQuote(${q.id})" style="cursor: pointer;">
                                        <div class="d-flex align-items-center">
                                            <div class="me-3">
                                                <div class="fw-bold text-dark">#${q.number}</div>
                                                <small class="text-muted">${q.date}</small>
                                            </div>
                                            <div>
                                                <div class="fw-bold text-dark">${q.title}</div>
                                                <small class="text-muted">${q.client} (${q.company})</small>
                                            </div>
                                        </div>
                                        <div class="d-flex align-items-center">
                                            <span class="fw-bold me-3">$${q.total.toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
                                            ${this.getStatusBadge(q.status)}
                                            <i class="fas fa-chevron-right text-muted ms-3" style="font-size: 0.8rem;"></i>
                                        </div>
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }

        // --- List View ---

        getQuotesListHTML() {
            return `
                <div class="container-fluid bg-white rounded shadow-sm p-0" style="max-width: 1200px;">
                    <div class="table-responsive">
                        <table class="table table-hover mb-0 align-middle">
                            <thead class="bg-light">
                                <tr>
                                    <th class="py-3 ps-4 text-uppercase text-muted small fw-bold">Number</th>
                                    <th class="py-3 text-uppercase text-muted small fw-bold">Title</th>
                                    <th class="py-3 text-uppercase text-muted small fw-bold">Customer</th>
                                    <th class="py-3 text-uppercase text-muted small fw-bold">Date</th>
                                    <th class="py-3 text-uppercase text-muted small fw-bold">Status</th>
                                    <th class="py-3 text-end pe-4 text-uppercase text-muted small fw-bold">Total</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${this.quotes.map(q => `
                                    <tr style="cursor: pointer;" class="quote-row" data-id="${q.id}">
                                        <td class="ps-4 fw-bold text-primary">#${q.number}</td>
                                        <td>${q.title}</td>
                                        <td>
                                            <div class="fw-bold text-dark">${q.client}</div>
                                            <small class="text-muted" style="font-size: 0.75rem;">${q.company}</small>
                                        </td>
                                        <td class="text-muted">${q.date}</td>
                                        <td>${this.getStatusBadge(q.status)}</td>
                                        <td class="text-end pe-4 fw-bold">$${q.total.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            `;
        }

        attachListListeners() {
            document.querySelectorAll('.quote-row').forEach(row => {
                row.onclick = () => this.editQuote(parseInt(row.dataset.id));
            });
        }

        // --- Editor View ---

        createNewQuote() {
            this.activeQuote = {
                id: Date.now(),
                number: Math.floor(Math.random() * 1000) + 5000,
                title: '',
                client: '',
                company: '',
                status: 'draft',
                total: 0,
                date: new Date().toISOString().split('T')[0],
                items: []
            };
            this.currentView = 'edit';
            this.loadView();
        }

        editQuote(id) {
            this.activeQuote = this.quotes.find(q => q.id === id);
            this.currentView = 'edit';
            this.loadView();
        }

        getQuoteEditorHTML() {
            const q = this.activeQuote;
            const contacts = this.getContacts();
            const products = this.getProducts();

            // Optimization: If products list is huge, don't render all in dropdown directly
            // Instead, limit to first 100 or implement a simple search.
            // For now, let's limit to 100 to prevent freezing.
            const displayProducts = products.slice(0, 100);

            return `
                <div class="container-fluid" style="max-width: 1100px;">
                    <div class="d-flex align-items-center mb-3">
                        <button class="btn btn-link text-muted p-0 me-3 text-decoration-none" id="btn-back-list">
                            <i class="fa-solid fa-arrow-left me-1"></i> Back
                        </button>
                        <span class="badge bg-white text-dark border shadow-sm">Editing Quote #${q.number}</span>
                        <div class="ms-auto">
                             <button class="btn btn-outline-danger btn-sm me-2" id="btn-delete-quote">
                                <i class="fa-solid fa-trash"></i>
                            </button>
                        </div>
                    </div>

                    <div class="row g-4">
                        <!-- Main Editor Column -->
                        <div class="col-lg-8">
                            <div class="card border-0 shadow-sm p-4">
                                <!-- Header Fields -->
                                <div class="row g-3 mb-4">
                                    <div class="col-12">
                                        <label class="form-label text-uppercase text-muted small fw-bold">Title</label>
                                        <input type="text" class="form-control form-control-lg fw-bold" id="quote-title" value="${q.title}" placeholder="e.g. Website Redesign">
                                    </div>
                                    <div class="col-12">
                                        <label class="form-label text-uppercase text-muted small fw-bold">Customer</label>
                                        <div class="input-group">
                                            <span class="input-group-text bg-light"><i class="fas fa-user"></i></span>
                                            <input type="text" class="form-control" list="customer-datalist" id="quote-customer-input" 
                                                value="${q.client ? q.client + (q.company ? ' (' + q.company + ')' : '') : ''}" 
                                                placeholder="Search & Select Customer...">
                                            <datalist id="customer-datalist">
                                                ${contacts.map(c => `<option value="${c.name} (${c.company})" data-email="${c.email}" data-name="${c.name}" data-company="${c.company}">`).join('')}
                                            </datalist>
                                        </div>
                                    </div>
                                </div>

                                <hr class="my-4">

                                <h6 class="fw-bold mb-3 text-uppercase text-primary">Line Items</h6>
                                <div id="items-container">
                                    <!-- JS injects items here -->
                                </div>

                                <!-- Add Buttons -->
                                <div class="mt-3 d-flex gap-2">
                                    <div class="dropdown">
                                        <button class="btn btn-outline-primary dropdown-toggle" type="button" id="addProductDropdown" data-bs-toggle="dropdown" aria-expanded="false">
                                            <i class="fa-solid fa-box me-2"></i>Add Product
                                        </button>
                                        <div class="dropdown-menu shadow p-2" aria-labelledby="addProductDropdown" style="width: 350px;">
                                            <div class="px-2 pb-2">
                                                <input type="text" class="form-control form-control-sm" id="product-dropdown-search" placeholder="Search products..." autocomplete="off">
                                            </div>
                                            <div id="product-list-container" style="max-height: 250px; overflow-y: auto;">
                                                <h6 class="dropdown-header">Inventory</h6>
                                                ${displayProducts.map(p => `
                                                    <a class="dropdown-item add-product-btn rounded p-2 border-bottom" href="#" 
                                                       data-id="${p.id}" data-name="${p.name}" data-price="${p.price}" data-desc="${p.description}">
                                                        <div class="d-flex justify-content-between align-items-center">
                                                            <span class="fw-bold text-dark text-truncate" style="max-width: 180px;">${p.name}</span>
                                                            <span class="fw-bold text-success">$${p.price.toFixed(2)}</span>
                                                        </div>
                                                        <div class="small text-muted text-truncate">${p.description}</div>
                                                    </a>
                                                `).join('')}
                                                ${products.length > 100 ? '<div class="text-center small text-muted py-2">Search to see more...</div>' : ''}
                                            </div>
                                        </div>
                                    </div>
                                    <button class="btn btn-outline-secondary" id="btn-add-text">
                                        <i class="fa-solid fa-font me-2"></i>Add Text
                                    </button>
                                </div>
                            </div>
                        </div>

                        <!-- Sidebar Summary -->
                        <div class="col-lg-4">
                            <div class="card border-0 shadow-sm sticky-top" style="top: 20px;">
                                <div class="card-body bg-light rounded">
                                    <h6 class="fw-bold text-uppercase text-muted mb-3" style="font-size: 0.75rem;">Summary</h6>
                                    <div class="d-flex justify-content-between mb-2">
                                        <span>Subtotal</span>
                                        <span class="fw-bold" id="summary-subtotal">$0.00</span>
                                    </div>
                                    <div class="d-flex justify-content-between mb-2 text-muted">
                                        <span>Tax (10%)</span>
                                        <span id="summary-tax">$0.00</span>
                                    </div>
                                    <hr>
                                    <div class="d-flex justify-content-between align-items-center mb-4">
                                        <span class="fw-bold fs-5">Total</span>
                                        <span class="fw-bold fs-3 text-primary" id="summary-total">$0.00</span>
                                    </div>
                                    
                                    <div class="d-grid gap-2">
                                        <button class="btn btn-success btn-lg" id="btn-save-quote">
                                            <i class="fa-solid fa-check me-2"></i>Save & Send
                                        </button>
                                        <button class="btn btn-outline-secondary" id="btn-save-draft">
                                            <i class="fa-solid fa-save me-2"></i>Save as Draft
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }

        attachEditorListeners() {
            document.getElementById('btn-back-list').onclick = () => this.switchView('list');
            
            document.getElementById('btn-save-quote').onclick = () => this.saveActiveQuote('sent');
            document.getElementById('btn-save-draft').onclick = () => this.saveActiveQuote('draft');
            document.getElementById('btn-delete-quote').onclick = () => this.deleteActiveQuote();

            // Product Dropdown Search Logic
            const searchInput = document.getElementById('product-dropdown-search');
            const listContainer = document.getElementById('product-list-container');
            if (searchInput && listContainer) {
                searchInput.addEventListener('input', (e) => {
                    const term = e.target.value.toLowerCase();
                    const allProducts = this.getProducts();
                    const filtered = allProducts.filter(p => 
                        String(p.name).toLowerCase().includes(term) || 
                        String(p.description).toLowerCase().includes(term)
                    ).slice(0, 50); // Limit results

                    listContainer.innerHTML = filtered.length ? filtered.map(p => `
                        <a class="dropdown-item add-product-btn rounded p-2 border-bottom" href="#" 
                           data-id="${p.id}" data-name="${p.name}" data-price="${p.price}" data-desc="${p.description}">
                            <div class="d-flex justify-content-between align-items-center">
                                <span class="fw-bold text-dark text-truncate" style="max-width: 180px;">${p.name}</span>
                                <span class="fw-bold text-success">$${p.price.toFixed(2)}</span>
                            </div>
                            <div class="small text-muted text-truncate">${p.description}</div>
                        </a>
                    `).join('') : '<div class="p-2 text-muted">No matches found</div>';
                    
                    this.reattachProductClickListeners();
                });
            }
            
            this.reattachProductClickListeners();

            document.getElementById('btn-add-text').onclick = () => {
                this.addItem({
                    id: Date.now(),
                    name: '',
                    description: '',
                    price: 0,
                    qty: 0,
                    type: 'text'
                });
            };

            // Customer Input Handling (Datalist doesn't return objects, so we parse string)
            const custInput = document.getElementById('quote-customer-input');
            custInput.addEventListener('change', (e) => {
                const val = e.target.value;
                // Try to find the selected option in contacts
                const contacts = this.getContacts();
                const matched = contacts.find(c => `${c.name} (${c.company})` === val);
                if (matched) {
                    this.activeQuote.client = matched.name;
                    this.activeQuote.company = matched.company;
                } else {
                    // Manual entry
                    this.activeQuote.client = val;
                    this.activeQuote.company = '';
                }
            });

            // Initial Render of items
            this.renderItems();
            this.calculateTotals();
        }

        reattachProductClickListeners() {
            document.querySelectorAll('.add-product-btn').forEach(btn => {
                btn.onclick = (e) => {
                    e.preventDefault();
                    e.stopPropagation(); // Keep dropdown open? Maybe close it.
                    // Let's close dropdown after selection
                    const dropdownToggle = document.getElementById('addProductDropdown');
                    const bsDropdown = bootstrap.Dropdown.getInstance(dropdownToggle);
                    if (bsDropdown) bsDropdown.hide();

                    this.addItem({
                        id: Date.now(),
                        name: btn.dataset.name,
                        description: btn.dataset.desc,
                        price: parseFloat(btn.dataset.price),
                        qty: 1,
                        type: 'product'
                    });
                };
            });
        }

        addItem(item) {
            this.activeQuote.items.push(item);
            this.renderItems();
            this.calculateTotals();
        }

        renderItems() {
            const container = document.getElementById('items-container');
            container.innerHTML = this.activeQuote.items.map((item, index) => {
                if (item.type === 'text') {
                    return `
                        <div class="card mb-3 border p-3 bg-white shadow-sm item-card">
                            <div class="d-flex justify-content-between mb-2">
                                <span class="badge bg-light text-muted border"><i class="fas fa-align-left me-1"></i> Text Section</span>
                                <button class="btn btn-sm text-danger p-0" onclick="window.QuotingApp.deleteItem(${index})">
                                    <i class="fa-solid fa-trash"></i>
                                </button>
                            </div>
                            <input type="text" class="form-control fw-bold mb-2 border-0 px-0 fs-5" value="${item.name}" placeholder="Section Header" onchange="window.QuotingApp.updateItem(${index}, 'name', this.value)">
                            <textarea class="form-control border-0 px-0 text-muted" rows="2" placeholder="Enter detailed text description..." onchange="window.QuotingApp.updateItem(${index}, 'description', this.value)">${item.description}</textarea>
                        </div>
                    `;
                }
                return `
                    <div class="card mb-3 border p-3 bg-white shadow-sm item-card">
                        <div class="row align-items-center g-3">
                            <div class="col-md-6">
                                <input type="text" class="form-control border-0 px-0 fw-bold text-dark mb-1" value="${item.name}" placeholder="Product Name" onchange="window.QuotingApp.updateItem(${index}, 'name', this.value)">
                                <input type="text" class="form-control border-0 px-0 small text-muted" value="${item.description}" placeholder="Description" onchange="window.QuotingApp.updateItem(${index}, 'description', this.value)">
                            </div>
                            <div class="col-md-2">
                                <label class="small text-muted d-block d-md-none">Qty</label>
                                <input type="number" class="form-control text-center bg-light border-0" value="${item.qty}" onchange="window.QuotingApp.updateItem(${index}, 'qty', this.value)">
                            </div>
                            <div class="col-md-3 text-end">
                                <div class="fw-bold fs-5">$${(item.price * item.qty).toFixed(2)}</div>
                                <div class="input-group input-group-sm justify-content-end">
                                    <span class="input-group-text border-0 bg-transparent text-muted px-1">@</span>
                                    <input type="number" class="form-control form-control-sm border-0 text-end text-muted p-0" style="max-width: 80px;" value="${item.price}" onchange="window.QuotingApp.updateItem(${index}, 'price', this.value)">
                                </div>
                            </div>
                            <div class="col-md-1 text-end">
                                <button class="btn btn-sm btn-light text-danger border" onclick="window.QuotingApp.deleteItem(${index})"><i class="fa-solid fa-times"></i></button>
                            </div>
                        </div>
                    </div>
                `;
            }).join('');
        }

        updateItem(index, field, value) {
            const item = this.activeQuote.items[index];
            if (field === 'qty' || field === 'price') {
                item[field] = parseFloat(value) || 0;
            } else {
                item[field] = value;
            }
            this.renderItems();
            this.calculateTotals();
        }

        deleteItem(index) {
            this.activeQuote.items.splice(index, 1);
            this.renderItems();
            this.calculateTotals();
        }

        calculateTotals() {
            const subtotal = this.activeQuote.items.reduce((sum, i) => sum + (i.type === 'product' ? i.price * i.qty : 0), 0);
            const tax = subtotal * 0.10;
            const total = subtotal + tax;

            this.activeQuote.total = total;

            document.getElementById('summary-subtotal').innerText = `$${subtotal.toLocaleString(undefined, {minimumFractionDigits: 2})}`;
            document.getElementById('summary-tax').innerText = `$${tax.toLocaleString(undefined, {minimumFractionDigits: 2})}`;
            document.getElementById('summary-total').innerText = `$${total.toLocaleString(undefined, {minimumFractionDigits: 2})}`;
        }

        saveActiveQuote(status = 'draft') {
            this.activeQuote.title = document.getElementById('quote-title').value || 'Untitled Quote';
            this.activeQuote.status = status;

            // Update or add to list
            const existingIndex = this.quotes.findIndex(q => q.id === this.activeQuote.id);
            if (existingIndex >= 0) {
                this.quotes[existingIndex] = this.activeQuote;
            } else {
                this.quotes.unshift(this.activeQuote);
            }

            // Show feedback
            const btnId = status === 'sent' ? 'btn-save-quote' : 'btn-save-draft';
            const btn = document.getElementById(btnId);
            const originalHTML = btn.innerHTML;
            
            btn.innerHTML = `<i class="fas fa-check"></i> Saved!`;
            btn.classList.remove(status === 'sent' ? 'btn-success' : 'btn-outline-secondary');
            btn.classList.add('btn-dark');
            
            setTimeout(() => {
                btn.innerHTML = originalHTML;
                btn.classList.remove('btn-dark');
                btn.classList.add(status === 'sent' ? 'btn-success' : 'btn-outline-secondary');
                this.switchView('list');
            }, 800);
        }

        deleteActiveQuote() {
            if (confirm("Are you sure you want to delete this quote?")) {
                const idx = this.quotes.findIndex(q => q.id === this.activeQuote.id);
                if (idx > -1) this.quotes.splice(idx, 1);
                this.switchView('list');
            }
        }

        getStatusBadge(status) {
            const map = {
                'draft': 'bg-secondary-subtle text-secondary border-secondary',
                'sent': 'bg-primary-subtle text-primary border-primary',
                'accepted': 'bg-success-subtle text-success border-success'
            };
            return `<span class="badge ${map[status] || 'bg-light'} text-uppercase border">${status}</span>`;
        }
    }

    // Expose to window for global access
    window.QuotingApp = new QuotingModule();

})();