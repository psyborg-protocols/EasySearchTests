/**
 * Enhanced Quoting & Leads Module
 * Handles Dashboard, Leads, Quote List, and Quote Editor views
 * with improved UI/UX and comprehensive functionality
 */
(function() {
    class QuotingModule {
        constructor() {
            this.quotes = [
                // Mock initial history
                { id: 15033696, number: 4962, title: 'Permanent Unions (LA 06-08)', client: 'Aida Velazquez', company: 'Permanent Unions', status: 'draft', total: 80.00, date: '2025-10-25', items: [], notes: '', validUntil: '2025-11-25' },
                { id: 15026486, number: 4961, title: 'Safety Equipment Q3', client: 'Garret Colonna', company: 'Total Safety', status: 'sent', total: 327000.00, date: '2025-10-24', items: [], notes: '', validUntil: '2025-11-24' }
            ];
            this.leads = [
                // Mock leads data
                { id: 1, name: 'John Smith', email: 'john@acmecorp.com', company: 'Acme Corp', phone: '555-0123', message: 'Looking for bulk syringes', source: 'website', status: 'new', date: '2025-12-01', priority: 'high' },
                { id: 2, name: 'Sarah Johnson', email: 'sarah@techmed.com', company: 'TechMed Solutions', phone: '555-0456', message: 'Need pricing on dispensing equipment', source: 'referral', status: 'contacted', date: '2025-11-28', priority: 'medium' }
            ];
            this.currentView = 'dashboard';
            this.activeQuote = null;
            this.activeLead = null;
            this.container = null;
            this.searchTerm = '';
            this.sortBy = 'date';
            this.sortOrder = 'desc';
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
            const orgContacts = window.dataStore?.OrgContacts;

            if (orgContacts && orgContacts instanceof Map) {
                orgContacts.forEach((contactsList, companyName) => {
                    if (Array.isArray(contactsList)) {
                        contactsList.forEach(c => {
                            if (c.Email) {
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
            this.container.innerHTML = `
                <div class="quoting-app h-100 d-flex flex-column bg-light rounded shadow-sm" style="min-height: 800px;">
                    <div class="bg-white border-bottom shadow-sm sticky-top rounded-top">
                        <div class="p-3 d-flex justify-content-between align-items-center">
                            <div class="d-flex align-items-center gap-3">
                                <h5 class="m-0 fw-bold text-primary">
                                    <i class="fa-solid fa-file-invoice-dollar me-2"></i>Sales Pipeline
                                </h5>
                                <div class="vr text-muted"></div>
                                <div class="btn-group" role="group">
                                    <button class="btn btn-sm ${this.currentView === 'dashboard' ? 'btn-primary' : 'btn-outline-secondary'}" id="nav-quote-dash">
                                        <i class="fa-solid fa-chart-line me-1"></i> Dashboard
                                    </button>
                                    <button class="btn btn-sm ${this.currentView === 'leads' ? 'btn-primary' : 'btn-outline-secondary'}" id="nav-leads">
                                        <i class="fa-solid fa-user-plus me-1"></i> Leads
                                        ${this.getLeadBadge()}
                                    </button>
                                    <button class="btn btn-sm ${this.currentView === 'list' ? 'btn-primary' : 'btn-outline-secondary'}" id="nav-quote-list">
                                        <i class="fa-solid fa-file-invoice me-1"></i> Quotes
                                    </button>
                                </div>
                            </div>
                            <div class="d-flex gap-2">
                                ${this.currentView === 'list' || this.currentView === 'dashboard' ? `
                                    <button class="btn btn-primary shadow-sm" id="btn-new-quote">
                                        <i class="fa-solid fa-plus me-2"></i>New Quote
                                    </button>
                                ` : ''}
                            </div>
                        </div>
                        
                        ${this.currentView === 'list' || this.currentView === 'leads' ? `
                            <div class="px-3 pb-3 border-top bg-light">
                                <div class="row g-2 align-items-center">
                                    <div class="col-md-6">
                                        <div class="input-group input-group-sm">
                                            <span class="input-group-text bg-white"><i class="fa-solid fa-search"></i></span>
                                            <input type="text" class="form-control" id="search-input" 
                                                   placeholder="Search ${this.currentView === 'leads' ? 'leads' : 'quotes'}..." 
                                                   value="${this.searchTerm}">
                                        </div>
                                    </div>
                                    <div class="col-md-3">
                                        <select class="form-select form-select-sm" id="sort-select">
                                            <option value="date-desc" ${this.sortBy === 'date' && this.sortOrder === 'desc' ? 'selected' : ''}>Newest First</option>
                                            <option value="date-asc" ${this.sortBy === 'date' && this.sortOrder === 'asc' ? 'selected' : ''}>Oldest First</option>
                                            <option value="amount-desc" ${this.sortBy === 'amount' && this.sortOrder === 'desc' ? 'selected' : ''}>Highest Value</option>
                                            <option value="amount-asc" ${this.sortBy === 'amount' && this.sortOrder === 'asc' ? 'selected' : ''}>Lowest Value</option>
                                        </select>
                                    </div>
                                    <div class="col-md-3">
                                        <select class="form-select form-select-sm" id="status-filter">
                                            <option value="all">All ${this.currentView === 'leads' ? 'Statuses' : 'Quotes'}</option>
                                            ${this.currentView === 'leads' ? `
                                                <option value="new">New</option>
                                                <option value="contacted">Contacted</option>
                                                <option value="qualified">Qualified</option>
                                                <option value="converted">Converted</option>
                                            ` : `
                                                <option value="draft">Draft</option>
                                                <option value="sent">Sent</option>
                                                <option value="accepted">Accepted</option>
                                                <option value="rejected">Rejected</option>
                                            `}
                                        </select>
                                    </div>
                                </div>
                            </div>
                        ` : ''}
                    </div>

                    <div id="quoting-content" class="flex-grow-1 overflow-auto p-4">
                    </div>
                </div>
            `;

            this.bindNavigation();
            this.loadView();
        }

        bindNavigation() {
            document.getElementById('nav-quote-dash')?.addEventListener('click', () => this.switchView('dashboard'));
            document.getElementById('nav-quote-list')?.addEventListener('click', () => this.switchView('list'));
            document.getElementById('nav-leads')?.addEventListener('click', () => this.switchView('leads'));
            document.getElementById('btn-new-quote')?.addEventListener('click', () => this.createNewQuote());
            
            document.getElementById('search-input')?.addEventListener('input', (e) => {
                this.searchTerm = e.target.value;
                this.loadView();
            });
            
            document.getElementById('sort-select')?.addEventListener('change', (e) => {
                const [by, order] = e.target.value.split('-');
                this.sortBy = by;
                this.sortOrder = order;
                this.loadView();
            });
            
            document.getElementById('status-filter')?.addEventListener('change', () => {
                this.loadView();
            });
        }

        switchView(viewName) {
            this.currentView = viewName;
            this.searchTerm = '';
            this.render();
        }

        getLeadBadge() {
            const newLeads = this.leads.filter(l => l.status === 'new').length;
            return newLeads > 0 ? `<span class="badge bg-danger ms-1">${newLeads}</span>` : '';
        }

        loadView() {
            const content = document.getElementById('quoting-content');
            if (!content) return;
            
            content.innerHTML = '';

            if (this.currentView === 'dashboard') {
                content.innerHTML = this.getDashboardHTML();
            } else if (this.currentView === 'leads') {
                content.innerHTML = this.getLeadsViewHTML();
                this.attachLeadsListeners();
            } else if (this.currentView === 'list') {
                content.innerHTML = this.getQuotesListHTML();
                this.attachListListeners();
            } else if (this.currentView === 'edit') {
                content.innerHTML = this.getQuoteEditorHTML();
                this.attachEditorListeners();
            } else if (this.currentView === 'lead-detail') {
                content.innerHTML = this.getLeadDetailHTML();
                this.attachLeadDetailListeners();
            }
        }

        // --- Dashboard View ---

        getDashboardHTML() {
            const accepted = this.quotes.filter(q => q.status === 'accepted');
            const totalAccepted = accepted.reduce((sum, q) => sum + q.total, 0);
            const draft = this.quotes.filter(q => q.status === 'draft');
            const sent = this.quotes.filter(q => q.status === 'sent');
            const newLeads = this.leads.filter(l => l.status === 'new');
            const qualifiedLeads = this.leads.filter(l => l.status === 'qualified');
            
            const totalLeads = this.leads.length;
            const convertedLeads = this.leads.filter(l => l.status === 'converted').length;
            const conversionRate = totalLeads > 0 ? (convertedLeads / totalLeads * 100).toFixed(1) : 0;
            
            return `
                <div class="container-fluid" style="max-width: 1400px;">
                    <div class="row g-4 mb-4">
                        <div class="col-lg-3 col-md-6">
                            <div class="card border-0 shadow-sm h-100 bg-gradient" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);">
                                <div class="card-body text-white">
                                    <div class="d-flex justify-content-between align-items-start mb-3">
                                        <div>
                                            <h6 class="text-white-50 text-uppercase mb-2" style="font-size: 0.7rem; letter-spacing: 0.5px;">Revenue (Accepted)</h6>
                                            <h2 class="fw-bold mb-0">${totalAccepted.toLocaleString()}</h2>
                                        </div>
                                        <div class="bg-white bg-opacity-25 rounded-circle p-3">
                                            <i class="fas fa-dollar-sign fa-lg"></i>
                                        </div>
                                    </div>
                                    <small class="text-white-50">From ${accepted.length} accepted quotes</small>
                                </div>
                            </div>
                        </div>
                        <div class="col-lg-3 col-md-6">
                            <div class="card border-0 shadow-sm h-100">
                                <div class="card-body">
                                    <div class="d-flex justify-content-between align-items-start mb-3">
                                        <div>
                                            <h6 class="text-muted text-uppercase mb-2" style="font-size: 0.7rem; letter-spacing: 0.5px;">Pipeline Value</h6>
                                            <h2 class="fw-bold mb-0">${sent.length + draft.length}</h2>
                                        </div>
                                        <div class="bg-primary bg-opacity-10 rounded-circle p-3">
                                            <i class="fas fa-file-invoice text-primary fa-lg"></i>
                                        </div>
                                    </div>
                                    <small class="text-muted">${sent.length} sent, ${draft.length} draft</small>
                                </div>
                            </div>
                        </div>
                        <div class="col-lg-3 col-md-6">
                            <div class="card border-0 shadow-sm h-100">
                                <div class="card-body">
                                    <div class="d-flex justify-content-between align-items-start mb-3">
                                        <div>
                                            <h6 class="text-muted text-uppercase mb-2" style="font-size: 0.7rem; letter-spacing: 0.5px;">Active Leads</h6>
                                            <h2 class="fw-bold mb-0">${newLeads.length + qualifiedLeads.length}</h2>
                                        </div>
                                        <div class="bg-warning bg-opacity-10 rounded-circle p-3">
                                            <i class="fas fa-user-plus text-warning fa-lg"></i>
                                        </div>
                                    </div>
                                    <small class="text-muted">${newLeads.length} new, ${qualifiedLeads.length} qualified</small>
                                </div>
                            </div>
                        </div>
                        <div class="col-lg-3 col-md-6">
                            <div class="card border-0 shadow-sm h-100">
                                <div class="card-body">
                                    <div class="d-flex justify-content-between align-items-start mb-3">
                                        <div>
                                            <h6 class="text-muted text-uppercase mb-2" style="font-size: 0.7rem; letter-spacing: 0.5px;">Conversion Rate</h6>
                                            <h2 class="fw-bold mb-0">${conversionRate}%</h2>
                                        </div>
                                        <div class="bg-success bg-opacity-10 rounded-circle p-3">
                                            <i class="fas fa-chart-line text-success fa-lg"></i>
                                        </div>
                                    </div>
                                    <small class="text-muted">${convertedLeads} of ${totalLeads} leads converted</small>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="row g-4">
                        <div class="col-lg-8">
                            <div class="card border-0 shadow-sm mb-4">
                                <div class="card-header bg-white border-bottom py-3 d-flex justify-content-between align-items-center">
                                    <h6 class="m-0 fw-bold text-dark">Recent Activity</h6>
                                    <a href="#" class="text-decoration-none small" onclick="window.QuotingApp.switchView('list'); return false;">View All →</a>
                                </div>
                                <div class="card-body p-0">
                                    ${this.quotes.length === 0 ? `
                                        <div class="text-center py-5">
                                            <i class="fas fa-inbox fa-3x text-muted mb-3"></i>
                                            <p class="text-muted">No recent quotes</p>
                                            <button class="btn btn-primary btn-sm" onclick="window.QuotingApp.createNewQuote()">
                                                <i class="fas fa-plus me-2"></i>Create First Quote
                                            </button>
                                        </div>
                                    ` : `
                                        <div class="list-group list-group-flush">
                                            ${this.quotes.slice(0, 5).map(q => `
                                                <div class="list-group-item list-group-item-action d-flex align-items-center justify-content-between py-3 px-4" 
                                                     onclick="window.QuotingApp.editQuote(${q.id})" style="cursor: pointer;">
                                                    <div class="d-flex align-items-center flex-grow-1">
                                                        <div class="bg-primary bg-opacity-10 rounded p-2 me-3">
                                                            <i class="fas fa-file-invoice text-primary"></i>
                                                        </div>
                                                        <div>
                                                            <div class="fw-bold text-dark">#${q.number} - ${q.title}</div>
                                                            <small class="text-muted">${q.client} (${q.company})</small>
                                                        </div>
                                                    </div>
                                                    <div class="d-flex align-items-center gap-3">
                                                        <div class="text-end">
                                                            <div class="fw-bold">${q.total.toLocaleString(undefined, {minimumFractionDigits: 2})}</div>
                                                            <small class="text-muted">${new Date(q.date).toLocaleDateString()}</small>
                                                        </div>
                                                        ${this.getStatusBadge(q.status)}
                                                        <i class="fas fa-chevron-right text-muted" style="font-size: 0.8rem;"></i>
                                                    </div>
                                                </div>
                                            `).join('')}
                                        </div>
                                    `}
                                </div>
                            </div>

                            ${newLeads.length > 0 ? `
                                <div class="card border-0 shadow-sm border-start border-danger border-4">
                                    <div class="card-header bg-white border-bottom py-3 d-flex justify-content-between align-items-center">
                                        <h6 class="m-0 fw-bold text-dark">
                                            <i class="fas fa-exclamation-circle text-danger me-2"></i>New Leads Needing Attention
                                        </h6>
                                        <a href="#" class="text-decoration-none small" onclick="window.QuotingApp.switchView('leads'); return false;">View All →</a>
                                    </div>
                                    <div class="card-body p-0">
                                        <div class="list-group list-group-flush">
                                            ${newLeads.slice(0, 3).map(lead => `
                                                <div class="list-group-item list-group-item-action d-flex align-items-center justify-content-between py-3 px-4"
                                                     onclick="window.QuotingApp.viewLeadDetail(${lead.id})" style="cursor: pointer;">
                                                    <div class="d-flex align-items-center flex-grow-1">
                                                        <div class="bg-danger bg-opacity-10 rounded p-2 me-3">
                                                            <i class="fas fa-user text-danger"></i>
                                                        </div>
                                                        <div>
                                                            <div class="fw-bold text-dark">${lead.name}</div>
                                                            <small class="text-muted">${lead.company} - ${lead.source}</small>
                                                        </div>
                                                    </div>
                                                    <div class="d-flex align-items-center gap-3">
                                                        <small class="text-muted">${new Date(lead.date).toLocaleDateString()}</small>
                                                        <button class="btn btn-sm btn-primary" onclick="event.stopPropagation(); window.QuotingApp.convertLeadToQuote(${lead.id})">
                                                            Convert
                                                        </button>
                                                    </div>
                                                </div>
                                            `).join('')}
                                        </div>
                                    </div>
                                </div>
                            ` : ''}
                        </div>

                        <div class="col-lg-4">
                            <div class="card border-0 shadow-sm mb-4">
                                <div class="card-header bg-light">
                                    <h6 class="m-0 fw-bold text-uppercase" style="font-size: 0.75rem;">Quote Status Breakdown</h6>
                                </div>
                                <div class="card-body">
                                    <div class="d-flex justify-content-between align-items-center mb-3 pb-3 border-bottom">
                                        <div class="d-flex align-items-center">
                                            <div class="bg-secondary bg-opacity-10 rounded p-2 me-2">
                                                <i class="fas fa-pencil-alt text-secondary"></i>
                                            </div>
                                            <span>Draft</span>
                                        </div>
                                        <span class="badge bg-secondary">${draft.length}</span>
                                    </div>
                                    <div class="d-flex justify-content-between align-items-center mb-3 pb-3 border-bottom">
                                        <div class="d-flex align-items-center">
                                            <div class="bg-primary bg-opacity-10 rounded p-2 me-2">
                                                <i class="fas fa-paper-plane text-primary"></i>
                                            </div>
                                            <span>Sent</span>
                                        </div>
                                        <span class="badge bg-primary">${sent.length}</span>
                                    </div>
                                    <div class="d-flex justify-content-between align-items-center">
                                        <div class="d-flex align-items-center">
                                            <div class="bg-success bg-opacity-10 rounded p-2 me-2">
                                                <i class="fas fa-check-circle text-success"></i>
                                            </div>
                                            <span>Accepted</span>
                                        </div>
                                        <span class="badge bg-success">${accepted.length}</span>
                                    </div>
                                </div>
                            </div>

                            <div class="card border-0 shadow-sm">
                                <div class="card-header bg-light">
                                    <h6 class="m-0 fw-bold text-uppercase" style="font-size: 0.75rem;">Quick Actions</h6>
                                </div>
                                <div class="card-body d-grid gap-2">
                                    <button class="btn btn-primary" onclick="window.QuotingApp.createNewQuote()">
                                        <i class="fas fa-plus me-2"></i>New Quote
                                    </button>
                                    <button class="btn btn-outline-primary" onclick="window.QuotingApp.switchView('leads')">
                                        <i class="fas fa-users me-2"></i>View Leads
                                    </button>
                                    <button class="btn btn-outline-primary" onclick="window.QuotingApp.switchView('list')">
                                        <i class="fas fa-list me-2"></i>All Quotes
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }

// --- Leads View ---

        getLeadsViewHTML() {
            const statusFilter = document.getElementById('status-filter')?.value || 'all';
            
            let filtered = this.leads.filter(lead => {
                if (statusFilter !== 'all' && lead.status !== statusFilter) return false;
                if (this.searchTerm) {
                    const term = this.searchTerm.toLowerCase();
                    return lead.name.toLowerCase().includes(term) ||
                           lead.company.toLowerCase().includes(term) ||
                           lead.email.toLowerCase().includes(term);
                }
                return true;
            });

            // Sort leads
            filtered.sort((a, b) => {
                if (this.sortBy === 'date') {
                    const dateA = new Date(a.date);
                    const dateB = new Date(b.date);
                    return this.sortOrder === 'desc' ? dateB - dateA : dateA - dateB;
                }
                return 0;
            });

            const newLeads = filtered.filter(l => l.status === 'new');
            const contacted = filtered.filter(l => l.status === 'contacted');
            const qualified = filtered.filter(l => l.status === 'qualified');
            const converted = filtered.filter(l => l.status === 'converted');

            return `
                <div class="container-fluid" style="max-width: 1400px;">
                    <!-- Pipeline Overview Cards -->
                    <div class="row g-3 mb-4">
                        <div class="col-md-3">
                            <div class="card border-0 shadow-sm h-100 border-start border-danger border-4">
                                <div class="card-body">
                                    <div class="d-flex justify-content-between align-items-start mb-2">
                                        <h6 class="text-uppercase text-muted mb-0" style="font-size: 0.7rem; letter-spacing: 0.5px;">New Leads</h6>
                                        <i class="fas fa-star text-danger"></i>
                                    </div>
                                    <h2 class="mb-0 fw-bold">${newLeads.length}</h2>
                                    <small class="text-muted">Needs attention</small>
                                </div>
                            </div>
                        </div>
                        <div class="col-md-3">
                            <div class="card border-0 shadow-sm h-100 border-start border-warning border-4">
                                <div class="card-body">
                                    <div class="d-flex justify-content-between align-items-start mb-2">
                                        <h6 class="text-uppercase text-muted mb-0" style="font-size: 0.7rem; letter-spacing: 0.5px;">Contacted</h6>
                                        <i class="fas fa-phone text-warning"></i>
                                    </div>
                                    <h2 class="mb-0 fw-bold">${contacted.length}</h2>
                                    <small class="text-muted">In progress</small>
                                </div>
                            </div>
                        </div>
                        <div class="col-md-3">
                            <div class="card border-0 shadow-sm h-100 border-start border-info border-4">
                                <div class="card-body">
                                    <div class="d-flex justify-content-between align-items-start mb-2">
                                        <h6 class="text-uppercase text-muted mb-0" style="font-size: 0.7rem; letter-spacing: 0.5px;">Qualified</h6>
                                        <i class="fas fa-check-circle text-info"></i>
                                    </div>
                                    <h2 class="mb-0 fw-bold">${qualified.length}</h2>
                                    <small class="text-muted">Ready to quote</small>
                                </div>
                            </div>
                        </div>
                        <div class="col-md-3">
                            <div class="card border-0 shadow-sm h-100 border-start border-success border-4">
                                <div class="card-body">
                                    <div class="d-flex justify-content-between align-items-start mb-2">
                                        <h6 class="text-uppercase text-muted mb-0" style="font-size: 0.7rem; letter-spacing: 0.5px;">Converted</h6>
                                        <i class="fas fa-trophy text-success"></i>
                                    </div>
                                    <h2 class="mb-0 fw-bold">${converted.length}</h2>
                                    <small class="text-muted">Now quotes</small>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Leads Table -->
                    <div class="card border-0 shadow-sm">
                        <div class="card-header bg-white border-bottom py-3">
                            <h6 class="m-0 fw-bold text-dark">All Leads</h6>
                        </div>
                        <div class="card-body p-0">
                            ${filtered.length === 0 ? `
                                <div class="text-center py-5">
                                    <i class="fas fa-inbox fa-3x text-muted mb-3"></i>
                                    <p class="text-muted">No leads found</p>
                                </div>
                            ` : `
                                <div class="table-responsive">
                                    <table class="table table-hover mb-0 align-middle">
                                        <thead class="table-light">
                                            <tr>
                                                <th class="ps-4">Priority</th>
                                                <th>Contact</th>
                                                <th>Company</th>
                                                <th>Source</th>
                                                <th>Status</th>
                                                <th>Date</th>
                                                <th class="text-end pe-4">Actions</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            ${filtered.map(lead => `
                                                <tr class="lead-row" data-id="${lead.id}" style="cursor: pointer;">
                                                    <td class="ps-4">
                                                        ${this.getPriorityBadge(lead.priority)}
                                                    </td>
                                                    <td>
                                                        <div class="fw-bold">${lead.name}</div>
                                                        <small class="text-muted">${lead.email}</small>
                                                    </td>
                                                    <td>${lead.company}</td>
                                                    <td>
                                                        <span class="badge bg-light text-dark border">${lead.source}</span>
                                                    </td>
                                                    <td>${this.getLeadStatusBadge(lead.status)}</td>
                                                    <td class="text-muted">${new Date(lead.date).toLocaleDateString()}</td>
                                                    <td class="text-end pe-4">
                                                        <div class="btn-group btn-group-sm">
                                                            <button class="btn btn-outline-primary convert-to-quote-btn" data-id="${lead.id}" title="Convert to Quote">
                                                                <i class="fas fa-file-invoice"></i>
                                                            </button>
                                                            <button class="btn btn-outline-secondary view-lead-btn" data-id="${lead.id}" title="View Details">
                                                                <i class="fas fa-eye"></i>
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            `).join('')}
                                        </tbody>
                                    </table>
                                </div>
                            `}
                        </div>
                    </div>
                </div>
            `;
        }

        attachLeadsListeners() {
            document.querySelectorAll('.lead-row').forEach(row => {
                row.onclick = (e) => {
                    if (!e.target.closest('button')) {
                        this.viewLeadDetail(parseInt(row.dataset.id));
                    }
                };
            });
            
            document.querySelectorAll('.convert-to-quote-btn').forEach(btn => {
                btn.onclick = (e) => {
                    e.stopPropagation();
                    this.convertLeadToQuote(parseInt(btn.dataset.id));
                };
            });
            
            document.querySelectorAll('.view-lead-btn').forEach(btn => {
                btn.onclick = (e) => {
                    e.stopPropagation();
                    this.viewLeadDetail(parseInt(btn.dataset.id));
                };
            });
        }

        viewLeadDetail(id) {
            this.activeLead = this.leads.find(l => l.id === id);
            this.currentView = 'lead-detail';
            this.loadView();
        }

        getLeadDetailHTML() {
            const lead = this.activeLead;
            if (!lead) return '<div class="alert alert-danger">Lead not found</div>';

            return `
                <div class="container-fluid" style="max-width: 1000px;">
                    <div class="d-flex align-items-center mb-4">
                        <button class="btn btn-link text-muted p-0 me-3 text-decoration-none" id="btn-back-leads">
                            <i class="fa-solid fa-arrow-left me-1"></i> Back to Leads
                        </button>
                        <h4 class="m-0 fw-bold">${lead.name}</h4>
                        ${this.getPriorityBadge(lead.priority)}
                        <div class="ms-auto">
                            <button class="btn btn-primary" id="btn-convert-lead">
                                <i class="fas fa-file-invoice me-2"></i>Convert to Quote
                            </button>
                        </div>
                    </div>

                    <div class="row g-4">
                        <!-- Lead Information -->
                        <div class="col-lg-8">
                            <div class="card border-0 shadow-sm mb-4">
                                <div class="card-header bg-light">
                                    <h6 class="m-0 fw-bold">Contact Information</h6>
                                </div>
                                <div class="card-body">
                                    <div class="row g-3">
                                        <div class="col-md-6">
                                            <label class="text-muted small">Company</label>
                                            <div class="fw-bold">${lead.company}</div>
                                        </div>
                                        <div class="col-md-6">
                                            <label class="text-muted small">Email</label>
                                            <div><a href="mailto:${lead.email}">${lead.email}</a></div>
                                        </div>
                                        <div class="col-md-6">
                                            <label class="text-muted small">Phone</label>
                                            <div>${lead.phone || 'N/A'}</div>
                                        </div>
                                        <div class="col-md-6">
                                            <label class="text-muted small">Source</label>
                                            <div><span class="badge bg-light text-dark border">${lead.source}</span></div>
                                        </div>
                                        <div class="col-12">
                                            <label class="text-muted small">Message</label>
                                            <div class="p-3 bg-light rounded">${lead.message}</div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <!-- Activity Log -->
                            <div class="card border-0 shadow-sm">
                                <div class="card-header bg-light">
                                    <h6 class="m-0 fw-bold">Activity Log</h6>
                                </div>
                                <div class="card-body">
                                    <div class="timeline">
                                        <div class="timeline-item">
                                            <div class="timeline-marker bg-primary"></div>
                                            <div class="timeline-content">
                                                <small class="text-muted">${new Date(lead.date).toLocaleString()}</small>
                                                <div class="fw-bold">Lead Created</div>
                                                <div class="text-muted small">Submitted via ${lead.source}</div>
                                            </div>
                                        </div>
                                    </div>
                                    <textarea class="form-control mt-3" rows="3" id="add-note-text" placeholder="Add a note..."></textarea>
                                    <button class="btn btn-sm btn-outline-primary mt-2" id="btn-add-note">
                                        <i class="fas fa-plus me-1"></i> Add Note
                                    </button>
                                </div>
                            </div>
                        </div>

                        <!-- Sidebar -->
                        <div class="col-lg-4">
                            <!-- Status Management -->
                            <div class="card border-0 shadow-sm mb-4">
                                <div class="card-body">
                                    <label class="text-muted small mb-2">Status</label>
                                    <select class="form-select mb-3" id="lead-status-select">
                                        <option value="new" ${lead.status === 'new' ? 'selected' : ''}>New</option>
                                        <option value="contacted" ${lead.status === 'contacted' ? 'selected' : ''}>Contacted</option>
                                        <option value="qualified" ${lead.status === 'qualified' ? 'selected' : ''}>Qualified</option>
                                        <option value="converted" ${lead.status === 'converted' ? 'selected' : ''}>Converted</option>
                                    </select>

                                    <label class="text-muted small mb-2">Priority</label>
                                    <select class="form-select" id="lead-priority-select">
                                        <option value="low" ${lead.priority === 'low' ? 'selected' : ''}>Low</option>
                                        <option value="medium" ${lead.priority === 'medium' ? 'selected' : ''}>Medium</option>
                                        <option value="high" ${lead.priority === 'high' ? 'selected' : ''}>High</option>
                                    </select>
                                </div>
                            </div>

                            <!-- Quick Actions -->
                            <div class="card border-0 shadow-sm">
                                <div class="card-header bg-light">
                                    <h6 class="m-0 fw-bold text-uppercase" style="font-size: 0.75rem;">Quick Actions</h6>
                                </div>
                                <div class="card-body d-grid gap-2">
                                    <a href="mailto:${lead.email}" class="btn btn-outline-primary btn-sm">
                                        <i class="fas fa-envelope me-2"></i>Send Email
                                    </a>
                                    <a href="tel:${lead.phone}" class="btn btn-outline-primary btn-sm">
                                        <i class="fas fa-phone me-2"></i>Call
                                    </a>
                                    <button class="btn btn-outline-danger btn-sm" id="btn-delete-lead">
                                        <i class="fas fa-trash me-2"></i>Delete Lead
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <style>
                    .timeline {
                        position: relative;
                        padding-left: 30px;
                    }
                    .timeline-item {
                        position: relative;
                        padding-bottom: 20px;
                    }
                    .timeline-marker {
                        position: absolute;
                        left: -30px;
                        width: 12px;
                        height: 12px;
                        border-radius: 50%;
                        border: 2px solid white;
                        box-shadow: 0 0 0 2px #0d6efd;
                    }
                    .timeline-item:before {
                        content: '';
                        position: absolute;
                        left: -24px;
                        top: 12px;
                        bottom: -20px;
                        width: 2px;
                        background: #e9ecef;
                    }
                    .timeline-item:last-child:before {
                        display: none;
                    }
                </style>
            `;
        }

        attachLeadDetailListeners() {
            document.getElementById('btn-back-leads')?.addEventListener('click', () => this.switchView('leads'));
            document.getElementById('btn-convert-lead')?.addEventListener('click', () => this.convertLeadToQuote(this.activeLead.id));
            document.getElementById('btn-delete-lead')?.addEventListener('click', () => this.deleteLead(this.activeLead.id));
            
            document.getElementById('lead-status-select')?.addEventListener('change', (e) => {
                this.activeLead.status = e.target.value;
                this.render();
            });
            
            document.getElementById('lead-priority-select')?.addEventListener('change', (e) => {
                this.activeLead.priority = e.target.value;
                this.render();
            });
        }

        convertLeadToQuote(leadId) {
            const lead = this.leads.find(l => l.id === leadId);
            if (!lead) return;

            // Mark lead as converted
            lead.status = 'converted';

            // Create new quote from lead
            this.activeQuote = {
                id: Date.now(),
                number: Math.floor(Math.random() * 1000) + 5000,
                title: `Quote for ${lead.company}`,
                client: lead.name,
                company: lead.company,
                status: 'draft',
                total: 0,
                date: new Date().toISOString().split('T')[0],
                items: [],
                notes: lead.message,
                validUntil: new Date(Date.now() + 30*24*60*60*1000).toISOString().split('T')[0]
            };
            
            this.currentView = 'edit';
            this.loadView();
        }

        deleteLead(leadId) {
            if (confirm('Are you sure you want to delete this lead?')) {
                const index = this.leads.findIndex(l => l.id === leadId);
                if (index > -1) {
                    this.leads.splice(index, 1);
                    this.switchView('leads');
                }
            }
        }

        getPriorityBadge(priority) {
            const map = {
                'high': '<span class="badge bg-danger ms-2"><i class="fas fa-exclamation-circle me-1"></i>High</span>',
                'medium': '<span class="badge bg-warning text-dark ms-2">Medium</span>',
                'low': '<span class="badge bg-secondary ms-2">Low</span>'
            };
            return map[priority] || '';
        }

        getLeadStatusBadge(status) {
            const map = {
                'new': '<span class="badge bg-danger">New</span>',
                'contacted': '<span class="badge bg-warning text-dark">Contacted</span>',
                'qualified': '<span class="badge bg-info">Qualified</span>',
                'converted': '<span class="badge bg-success">Converted</span>'
            };
            return map[status] || '';
        }

        // --- List View ---

        getQuotesListHTML() {
            const statusFilter = document.getElementById('status-filter')?.value || 'all';
            
            let filtered = this.quotes.filter(quote => {
                if (statusFilter !== 'all' && quote.status !== statusFilter) return false;
                if (this.searchTerm) {
                    const term = this.searchTerm.toLowerCase();
                    return quote.title.toLowerCase().includes(term) ||
                           quote.client.toLowerCase().includes(term) ||
                           quote.company.toLowerCase().includes(term) ||
                           String(quote.number).includes(term);
                }
                return true;
            });

            // Sort quotes
            filtered.sort((a, b) => {
                if (this.sortBy === 'date') {
                    const dateA = new Date(a.date);
                    const dateB = new Date(b.date);
                    return this.sortOrder === 'desc' ? dateB - dateA : dateA - dateB;
                } else if (this.sortBy === 'amount') {
                    return this.sortOrder === 'desc' ? b.total - a.total : a.total - b.total;
                }
                return 0;
            });

            return `
                <div class="container-fluid bg-white rounded shadow-sm p-0" style="max-width: 1400px;">
                    ${filtered.length === 0 ? `
                        <div class="text-center py-5">
                            <i class="fas fa-search fa-3x text-muted mb-3"></i>
                            <p class="text-muted mb-4">No quotes found</p>
                            <button class="btn btn-primary" onclick="window.QuotingApp.createNewQuote()">
                                <i class="fas fa-plus me-2"></i>Create New Quote
                            </button>
                        </div>
                    ` : `
                        <div class="table-responsive">
                            <table class="table table-hover mb-0 align-middle">
                                <thead class="bg-light sticky-top">
                                    <tr>
                                        <th class="py-3 ps-4 text-uppercase text-muted small fw-bold">Number</th>
                                        <th class="py-3 text-uppercase text-muted small fw-bold">Title</th>
                                        <th class="py-3 text-uppercase text-muted small fw-bold">Customer</th>
                                        <th class="py-3 text-uppercase text-muted small fw-bold">Date</th>
                                        <th class="py-3 text-uppercase text-muted small fw-bold">Valid Until</th>
                                        <th class="py-3 text-uppercase text-muted small fw-bold">Status</th>
                                        <th class="py-3 text-end pe-4 text-uppercase text-muted small fw-bold">Total</th>
                                        <th class="py-3 text-end pe-4 text-uppercase text-muted small fw-bold">Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${filtered.map(q => {
                                        const isExpiringSoon = q.validUntil && new Date(q.validUntil) < new Date(Date.now() + 7*24*60*60*1000);
                                        return `
                                        <tr class="quote-row" data-id="${q.id}" style="cursor: pointer;">
                                            <td class="ps-4 fw-bold text-primary">#${q.number}</td>
                                            <td>
                                                <div class="fw-bold">${q.title}</div>
                                                ${q.items.length > 0 ? `<small class="text-muted">${q.items.length} items</small>` : ''}
                                            </td>
                                            <td>
                                                <div class="fw-bold text-dark">${q.client}</div>
                                                <small class="text-muted" style="font-size: 0.75rem;">${q.company}</small>
                                            </td>
                                            <td class="text-muted">${new Date(q.date).toLocaleDateString()}</td>
                                            <td>
                                                ${q.validUntil ? `
                                                    <span class="${isExpiringSoon ? 'text-danger fw-bold' : 'text-muted'}">
                                                        ${new Date(q.validUntil).toLocaleDateString()}
                                                        ${isExpiringSoon ? '<i class="fas fa-exclamation-triangle ms-1"></i>' : ''}
                                                    </span>
                                                ` : '<span class="text-muted">-</span>'}
                                            </td>
                                            <td>${this.getStatusBadge(q.status)}</td>
                                            <td class="text-end pe-4 fw-bold">$${q.total.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                                            <td class="text-end pe-4">
                                                <div class="btn-group btn-group-sm">
                                                    <button class="btn btn-outline-primary" onclick="event.stopPropagation(); window.QuotingApp.duplicateQuote(${q.id})" title="Duplicate">
                                                        <i class="fas fa-copy"></i>
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    `}).join('')}
                                </tbody>
                            </table>
                        </div>
                    `}
                </div>
            `;
        }

        attachListListeners() {
            document.querySelectorAll('.quote-row').forEach(row => {
                row.onclick = (e) => {
                    if (!e.target.closest('button')) {
                        this.editQuote(parseInt(row.dataset.id));
                    }
                };
            });
        }

        duplicateQuote(id) {
            const original = this.quotes.find(q => q.id === id);
            if (!original) return;

            const duplicate = {
                ...original,
                id: Date.now(),
                number: Math.floor(Math.random() * 1000) + 5000,
                title: `${original.title} (Copy)`,
                status: 'draft',
                date: new Date().toISOString().split('T')[0],
                validUntil: new Date(Date.now() + 30*24*60*60*1000).toISOString().split('T')[0]
            };

            this.quotes.unshift(duplicate);
            this.editQuote(duplicate.id);
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
                items: [],
                notes: '',
                validUntil: new Date(Date.now() + 30*24*60*60*1000).toISOString().split('T')[0]
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

            // Optimization: Limit products for performance
            const displayProducts = products.slice(0, 100);

            return `
                <div class="container-fluid" style="max-width: 1200px;">
                    <div class="d-flex align-items-center mb-4">
                        <button class="btn btn-link text-muted p-0 me-3 text-decoration-none" id="btn-back-list">
                            <i class="fa-solid fa-arrow-left me-1"></i> Back
                        </button>
                        <div class="flex-grow-1">
                            <h4 class="m-0 fw-bold">Quote #${q.number}</h4>
                            <small class="text-muted">Created ${new Date(q.date).toLocaleDateString()}</small>
                        </div>
                        <div class="d-flex gap-2">
                            <button class="btn btn-outline-secondary" id="btn-preview-quote">
                                <i class="fas fa-eye me-2"></i>Preview
                            </button>
                            <button class="btn btn-outline-danger" id="btn-delete-quote">
                                <i class="fa-solid fa-trash"></i>
                            </button>
                        </div>
                    </div>

                    <div class="row g-4">
                        <!-- Main Editor Column -->
                        <div class="col-lg-8">
                            <div class="card border-0 shadow-sm p-4 mb-4">
                                <!-- Header Section -->
                                <div class="mb-4">
                                    <h6 class="text-uppercase text-muted small fw-bold mb-3">Quote Details</h6>
                                    <div class="row g-3">
                                        <div class="col-12">
                                            <label class="form-label fw-bold">Title <span class="text-danger">*</span></label>
                                            <input type="text" class="form-control form-control-lg" id="quote-title" 
                                                   value="${q.title}" placeholder="e.g. Q3 Equipment Order">
                                        </div>
                                        <div class="col-md-6">
                                            <label class="form-label fw-bold">Customer <span class="text-danger">*</span></label>
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
                                        <div class="col-md-6">
                                            <label class="form-label fw-bold">Valid Until</label>
                                            <input type="date" class="form-control" id="quote-valid-until" 
                                                   value="${q.validUntil || ''}">
                                        </div>
                                    </div>
                                </div>

                                <hr class="my-4">

                                <!-- Line Items Section -->
                                <div class="mb-4">
                                    <div class="d-flex justify-content-between align-items-center mb-3">
                                        <h6 class="text-uppercase text-primary fw-bold mb-0">Line Items</h6>
                                        <span class="badge bg-light text-dark border">${q.items.length} items</span>
                                    </div>
                                    <div id="items-container">
                                        <!-- JS injects items here -->
                                    </div>

                                    <!-- Add Buttons -->
                                    <div class="mt-3 d-flex gap-2">
                                        <div class="dropdown">
                                            <button class="btn btn-outline-primary dropdown-toggle" type="button" id="addProductDropdown" 
                                                    data-bs-toggle="dropdown" aria-expanded="false">
                                                <i class="fa-solid fa-box me-2"></i>Add Product
                                            </button>
                                            <div class="dropdown-menu shadow p-2" aria-labelledby="addProductDropdown" style="width: 400px; max-height: 400px;">
                                                <div class="px-2 pb-2">
                                                    <input type="text" class="form-control form-control-sm" id="product-dropdown-search" 
                                                           placeholder="Search products..." autocomplete="off">
                                                </div>
                                                <div id="product-list-container" style="max-height: 300px; overflow-y: auto;">
                                                    ${displayProducts.length > 0 ? `
                                                        <h6 class="dropdown-header small">Inventory (${products.length} total)</h6>
                                                        ${displayProducts.map(p => `
                                                            <a class="dropdown-item add-product-btn rounded p-2 border-bottom" href="#" 
                                                               data-id="${p.id}" data-name="${p.name}" data-price="${p.price}" data-desc="${p.description}">
                                                                <div class="d-flex justify-content-between align-items-center">
                                                                    <span class="fw-bold text-dark text-truncate" style="max-width: 220px;">${p.name}</span>
                                                                    <span class="fw-bold text-success">$${p.price.toFixed(2)}</span>
                                                                </div>
                                                                <div class="small text-muted text-truncate">${p.description}</div>
                                                            </a>
                                                        `).join('')}
                                                        ${products.length > 100 ? '<div class="text-center small text-muted py-2">Type to search more...</div>' : ''}
                                                    ` : '<div class="text-center text-muted py-3">No products available</div>'}
                                                </div>
                                            </div>
                                        </div>
                                        <button class="btn btn-outline-secondary" id="btn-add-text">
                                            <i class="fa-solid fa-font me-2"></i>Add Section
                                        </button>
                                        <button class="btn btn-outline-secondary" id="btn-add-discount">
                                            <i class="fa-solid fa-percent me-2"></i>Add Discount
                                        </button>
                                    </div>
                                </div>

                                <hr class="my-4">

                                <!-- Notes Section -->
                                <div>
                                    <label class="form-label fw-bold">Internal Notes</label>
                                    <textarea class="form-control" rows="3" id="quote-notes" 
                                              placeholder="Add internal notes (not visible to customer)...">${q.notes || ''}</textarea>
                                </div>
                            </div>
                        </div>

                        <!-- Sidebar Summary -->
                        <div class="col-lg-4">
                            <div class="card border-0 shadow-sm sticky-top" style="top: 20px;">
                                <div class="card-body">
                                    <h6 class="fw-bold text-uppercase text-muted mb-3" style="font-size: 0.75rem;">Summary</h6>
                                    
                                    <!-- Pricing Breakdown -->
                                    <div class="mb-4">
                                        <div class="d-flex justify-content-between mb-2">
                                            <span class="text-muted">Subtotal</span>
                                            <span class="fw-bold" id="summary-subtotal">$0.00</span>
                                        </div>
                                        <div class="d-flex justify-content-between mb-2">
                                            <span class="text-muted">Tax (10%)</span>
                                            <span id="summary-tax">$0.00</span>
                                        </div>
                                        <div class="d-flex justify-content-between mb-2" id="discount-row" style="display: none;">
                                            <span class="text-success">Discount</span>
                                            <span class="text-success" id="summary-discount">-$0.00</span>
                                        </div>
                                        <hr>
                                        <div class="d-flex justify-content-between align-items-center mb-4">
                                            <span class="fw-bold fs-5">Total</span>
                                            <span class="fw-bold fs-3 text-primary" id="summary-total">$0.00</span>
                                        </div>
                                    </div>

                                    <!-- Status -->
                                    <div class="mb-4">
                                        <label class="form-label fw-bold small">Status</label>
                                        <select class="form-select" id="quote-status-select">
                                            <option value="draft" ${q.status === 'draft' ? 'selected' : ''}>Draft</option>
                                            <option value="sent" ${q.status === 'sent' ? 'selected' : ''}>Sent</option>
                                            <option value="accepted" ${q.status === 'accepted' ? 'selected' : ''}>Accepted</option>
                                            <option value="rejected" ${q.status === 'rejected' ? 'selected' : ''}>Rejected</option>
                                        </select>
                                    </div>
                                    
                                    <!-- Action Buttons -->
                                    <div class="d-grid gap-2">
                                        <button class="btn btn-success btn-lg" id="btn-save-quote">
                                            <i class="fa-solid fa-check me-2"></i>Save & Send
                                        </button>
                                        <button class="btn btn-outline-primary" id="btn-save-draft">
                                            <i class="fa-solid fa-save me-2"></i>Save as Draft
                                        </button>
                                        <button class="btn btn-outline-secondary" id="btn-export-pdf">
                                            <i class="fa-solid fa-file-pdf me-2"></i>Export PDF
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
            document.getElementById('btn-back-list')?.addEventListener('click', () => this.switchView('list'));
            
            document.getElementById('btn-save-quote')?.addEventListener('click', () => this.saveActiveQuote('sent'));
            document.getElementById('btn-save-draft')?.addEventListener('click', () => this.saveActiveQuote('draft'));
            document.getElementById('btn-delete-quote')?.addEventListener('click', () => this.deleteActiveQuote());
            document.getElementById('btn-preview-quote')?.addEventListener('click', () => this.previewQuote());
            document.getElementById('btn-export-pdf')?.addEventListener('click', () => this.exportQuotePDF());
            
            // Status change
            document.getElementById('quote-status-select')?.addEventListener('change', (e) => {
                this.activeQuote.status = e.target.value;
            });

            // Valid until change
            document.getElementById('quote-valid-until')?.addEventListener('change', (e) => {
                this.activeQuote.validUntil = e.target.value;
            });

            // Notes change
            document.getElementById('quote-notes')?.addEventListener('change', (e) => {
                this.activeQuote.notes = e.target.value;
            });

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
                    ).slice(0, 50);

                    listContainer.innerHTML = filtered.length ? filtered.map(p => `
                        <a class="dropdown-item add-product-btn rounded p-2 border-bottom" href="#" 
                           data-id="${p.id}" data-name="${p.name}" data-price="${p.price}" data-desc="${p.description}">
                            <div class="d-flex justify-content-between align-items-center">
                                <span class="fw-bold text-dark text-truncate" style="max-width: 220px;">${p.name}</span>
                                <span class="fw-bold text-success">$${p.price.toFixed(2)}</span>
                            </div>
                            <div class="small text-muted text-truncate">${p.description}</div>
                        </a>
                    `).join('') : '<div class="p-2 text-muted">No matches found</div>';
                    
                    this.reattachProductClickListeners();
                });
            }
            
            this.reattachProductClickListeners();

            document.getElementById('btn-add-text')?.addEventListener('click', () => {
                this.addItem({
                    id: Date.now(),
                    name: '',
                    description: '',
                    price: 0,
                    qty: 0,
                    type: 'text'
                });
            });

            document.getElementById('btn-add-discount')?.addEventListener('click', () => {
                this.addItem({
                    id: Date.now(),
                    name: 'Discount',
                    description: '',
                    price: 0,
                    qty: 1,
                    type: 'discount'
                });
            });

            // Customer Input Handling
            const custInput = document.getElementById('quote-customer-input');
            custInput?.addEventListener('change', (e) => {
                const val = e.target.value;
                const contacts = this.getContacts();
                const matched = contacts.find(c => `${c.name} (${c.company})` === val);
                if (matched) {
                    this.activeQuote.client = matched.name;
                    this.activeQuote.company = matched.company;
                } else {
                    this.activeQuote.client = val;
                    this.activeQuote.company = '';
                }
            });

            // Initial Render
            this.renderItems();
            this.calculateTotals();
        }

        previewQuote() {
            alert('Preview functionality coming soon!');
        }

        exportQuotePDF() {
            alert('PDF export functionality coming soon!');
        }

        reattachProductClickListeners() {
            document.querySelectorAll('.add-product-btn').forEach(btn => {
                btn.onclick = (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    
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
            if (!container) return;
            
            container.innerHTML = this.activeQuote.items.length === 0 ? `
                <div class="text-center py-5 bg-light rounded">
                    <i class="fas fa-box-open fa-3x text-muted mb-3"></i>
                    <p class="text-muted">No items added yet</p>
                    <small class="text-muted">Add products or sections to get started</small>
                </div>
            ` : this.activeQuote.items.map((item, index) => {
                if (item.type === 'text') {
                    return `
                        <div class="card mb-3 border shadow-sm bg-light">
                            <div class="card-body">
                                <div class="d-flex justify-content-between mb-2">
                                    <span class="badge bg-secondary"><i class="fas fa-align-left me-1"></i> Section</span>
                                    <button class="btn btn-sm text-danger p-0" onclick="window.QuotingApp.deleteItem(${index})">
                                        <i class="fa-solid fa-trash"></i>
                                    </button>
                                </div>
                                <input type="text" class="form-control fw-bold mb-2 border-0 px-0 bg-transparent fs-5" 
                                       value="${item.name}" placeholder="Section Header" 
                                       onchange="window.QuotingApp.updateItem(${index}, 'name', this.value)">
                                <textarea class="form-control border-0 px-0 bg-transparent text-muted" rows="2" 
                                          placeholder="Enter section description..." 
                                          onchange="window.QuotingApp.updateItem(${index}, 'description', this.value)">${item.description}</textarea>
                            </div>
                        </div>
                    `;
                }
                
                if (item.type === 'discount') {
                    return `
                        <div class="card mb-3 border border-success shadow-sm">
                            <div class="card-body">
                                <div class="row align-items-center g-3">
                                    <div class="col-md-8">
                                        <div class="d-flex align-items-center">
                                            <span class="badge bg-success me-2"><i class="fas fa-percent me-1"></i> Discount</span>
                                            <input type="text" class="form-control border-0 px-0 fw-bold text-success" 
                                                   value="${item.description}" placeholder="Discount reason..." 
                                                   onchange="window.QuotingApp.updateItem(${index}, 'description', this.value)">
                                        </div>
                                    </div>
                                    <div class="col-md-3">
                                        <div class="input-group input-group-sm">
                                            <span class="input-group-text">-$</span>
                                            <input type="number" class="form-control text-end fw-bold text-success" 
                                                   value="${Math.abs(item.price)}" 
                                                   onchange="window.QuotingApp.updateItem(${index}, 'price', -Math.abs(this.value))">
                                        </div>
                                    </div>
                                    <div class="col-md-1 text-end">
                                        <button class="btn btn-sm btn-light text-danger border" 
                                                onclick="window.QuotingApp.deleteItem(${index})">
                                            <i class="fa-solid fa-times"></i>
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    `;
                }
                
                return `
                    <div class="card mb-3 border shadow-sm hover-shadow" style="transition: all 0.2s;">
                        <div class="card-body">
                            <div class="row align-items-center g-3">
                                <div class="col-md-5">
                                    <input type="text" class="form-control border-0 px-0 fw-bold text-dark mb-1" 
                                           value="${item.name}" placeholder="Product Name" 
                                           onchange="window.QuotingApp.updateItem(${index}, 'name', this.value)">
                                    <input type="text" class="form-control border-0 px-0 small text-muted" 
                                           value="${item.description}" placeholder="Description" 
                                           onchange="window.QuotingApp.updateItem(${index}, 'description', this.value)">
                                </div>
                                <div class="col-md-2">
                                    <label class="small text-muted d-block">Quantity</label>
                                    <input type="number" class="form-control text-center" value="${item.qty}" min="0"
                                           onchange="window.QuotingApp.updateItem(${index}, 'qty', this.value)">
                                </div>
                                <div class="col-md-2">
                                    <label class="small text-muted d-block">Unit Price</label>
                                    <div class="input-group input-group-sm">
                                        <span class="input-group-text">$</span>
                                        <input type="number" class="form-control text-end" value="${item.price}" min="0" step="0.01"
                                               onchange="window.QuotingApp.updateItem(${index}, 'price', this.value)">
                                    </div>
                                </div>
                                <div class="col-md-2">
                                    <label class="small text-muted d-block">Total</label>
                                    <div class="fw-bold fs-5 text-primary">$${(item.price * item.qty).toFixed(2)}</div>
                                </div>
                                <div class="col-md-1 text-end">
                                    <button class="btn btn-sm btn-light text-danger border" 
                                            onclick="window.QuotingApp.deleteItem(${index})" title="Remove">
                                        <i class="fa-solid fa-times"></i>
                                    </button>
                                </div>
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
            const productItems = this.activeQuote.items.filter(i => i.type === 'product' || i.type === 'discount');
            const subtotal = productItems.reduce((sum, i) => {
                if (i.type === 'discount') {
                    return sum;
                }
                return sum + (i.price * i.qty);
            }, 0);
            
            const discount = Math.abs(productItems.reduce((sum, i) => {
                if (i.type === 'discount') {
                    return sum + i.price;
                }
                return sum;
            }, 0));
            
            const tax = (subtotal - discount) * 0.10;
            const total = subtotal - discount + tax;

            this.activeQuote.total = total;

            const subtotalEl = document.getElementById('summary-subtotal');
            const taxEl = document.getElementById('summary-tax');
            const discountEl = document.getElementById('summary-discount');
            const discountRow = document.getElementById('discount-row');
            const totalEl = document.getElementById('summary-total');

            if (subtotalEl) subtotalEl.innerText = `$${subtotal.toLocaleString(undefined, {minimumFractionDigits: 2})}`;
            if (taxEl) taxEl.innerText = `$${tax.toLocaleString(undefined, {minimumFractionDigits: 2})}`;
            if (discountEl && discountRow) {
                if (discount > 0) {
                    discountRow.style.display = 'flex';
                    discountEl.innerText = `-$${discount.toLocaleString(undefined, {minimumFractionDigits: 2})}`;
                } else {
                    discountRow.style.display = 'none';
                }
            }
            if (totalEl) totalEl.innerText = `$${total.toLocaleString(undefined, {minimumFractionDigits: 2})}`;
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
            btn.classList.remove(status === 'sent' ? 'btn-success' : 'btn-outline-primary');
            btn.classList.add('btn-dark');
            
            setTimeout(() => {
                btn.innerHTML = originalHTML;
                btn.classList.remove('btn-dark');
                btn.classList.add(status === 'sent' ? 'btn-success' : 'btn-outline-primary');
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
                'accepted': 'bg-success-subtle text-success border-success',
                'rejected': 'bg-danger-subtle text-danger border-danger'
            };
            return `<span class="badge ${map[status] || 'bg-light'} text-uppercase border">${status}</span>`;
        }
    }

    // Expose to window for global access
    window.QuotingApp = new QuotingModule();

})();