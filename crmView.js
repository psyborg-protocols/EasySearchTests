// ---------------------------------------------
// crmView.js
// Handles UI rendering for the CRM module with smooth inline editing and color-coded statuses
// ---------------------------------------------

const CRMView = {
    sortBy: 'recent', 
    currentTimelineItems: [], // Cache for instant UI reverts

    init() {
        this.injectStyles();

        const crmTab = document.getElementById('crm-tab');
        if (crmTab) {
            crmTab.addEventListener('shown.bs.tab', () => this.refreshList());
        }
        
        const searchInput = document.getElementById('crmSearch');
        if (searchInput) {
            searchInput.addEventListener('input', () => this.renderList());
        }

        // Sort Listeners
        const btnRecent = document.getElementById('crmSortRecent');
        const btnValue = document.getElementById('crmSortValue');

        if (btnRecent && btnValue) {
            btnRecent.addEventListener('click', () => {
                this.sortBy = 'recent';
                btnRecent.classList.add('active');
                btnValue.classList.remove('active');
                this.renderList();
            });
            btnValue.addEventListener('click', () => {
                this.sortBy = 'value';
                btnValue.classList.add('active');
                btnRecent.classList.remove('active');
                this.renderList();
            });
        }

        // Close dropdowns on outside click
        document.addEventListener('mousedown', (e) => {
            const dd = document.getElementById('crmEditPartDropdown');
            if (dd && !e.target.closest('.crm-edit-dropdown') && !e.target.closest('#crmEditPartInput')) {
                dd.classList.remove('show');
            }
        });
    },

    injectStyles() {
        if (document.getElementById('crm-custom-styles')) return;
        const style = document.createElement('style');
        style.id = 'crm-custom-styles';
        style.innerHTML = `
            /* --- Timeline Styling --- */
            .crm-timeline-container { position: relative; padding-left: 20px; }
            .crm-timeline-container::before {
                content: ''; position: absolute; top: 0; bottom: 0; margin-top: 10px;
                left: 37px; width: 0; border-left: 3.5px dotted #cbd5e1; z-index: 0;
            }

            .avatar-circle {
                flex: 0 0 32px; height: 32px; border-radius: 8px; 
                background: #f1f5f9; color: #475569; display: flex; 
                align-items: center; justify-content: center; 
                font-weight: 700; font-size: 0.75rem; text-transform: uppercase;
                border: 1px solid #e2e8f0;
            }

            /* --- Lead Cards --- */
            .crm-lead-card { 
                transition: all 0.2s ease; cursor: pointer;
                border: 1px solid #e2e8f0 !important;
                border-radius: 10px !important;
            }
            .crm-lead-card:hover { 
                border-color: #3b82f6 !important;
                background-color: #f8fafc !important;
                box-shadow: 0 4px 12px -2px rgba(0,0,0,0.08) !important;
            }
            .crm-lead-card.active-lead {
                border-left: 4px solid #3b82f6 !important;
                background-color: #eff6ff !important;
            }

            /* --- Color Coded Statuses --- */
            .crm-badge-new { background-color: #dcfce7 !important; color: #166534 !important; }
            .crm-badge-waiting { background-color: #fef9c3 !important; color: #854d0e !important; }
            .crm-badge-action { background-color: #fee2e2 !important; color: #991b1b !important; }
            .crm-badge-quotes { background-color: #e0f2fe !important; color: #0369a1 !important; }
            .crm-badge-closed { background-color: #f3f4f6 !important; color: #374151 !important; }

            .status-dropdown-item {
                display: flex; align-items: center; gap: 8px;
                padding: 8px 12px; font-weight: 500; font-size: 0.8rem;
                border-radius: 6px; margin: 2px 0; transition: background 0.2s;
            }
            .status-dropdown-item:hover { filter: brightness(0.95); }

            /* --- Editable Summary Fields --- */
            .lead-summary-field-box {
                position: relative;
                cursor: pointer;
                transition: all 0.2s;
                border: 1px solid #e2e8f0;
                border-radius: 6px;
                background: #f8fafc;
                min-height: 32px;
                display: flex;
                align-items: center;
                padding: 0 10px;
                font-weight: 600;
                color: #1e293b;
                font-size: 0.9rem;
            }
            .lead-summary-field-box:hover {
                border-color: #cbd5e1;
                background: #f1f5f9;
            }
            .lead-summary-field-box .edit-indicator {
                position: absolute;
                right: 8px;
                color: #94a3b8;
                font-size: 0.65rem;
                opacity: 0;
                transition: opacity 0.2s;
            }
            .lead-summary-field-box:hover .edit-indicator {
                opacity: 1;
            }

            .crm-edit-container {
                position: absolute;
                top: 0; left: 0; right: 0; bottom: 0;
                z-index: 10;
                background: white;
                border-radius: 6px;
                display: flex;
                align-items: center;
                box-shadow: 0 0 0 2px #3b82f6, 0 4px 6px -1px rgba(0,0,0,0.1);
            }
            .crm-edit-input-field {
                border: none;
                background: transparent;
                width: 100%;
                height: 100%;
                padding: 0 40px 0 10px;
                font-size: 0.9rem;
                font-weight: 600;
                outline: none;
            }
            /* Hide the up/down arrows (spinners) specifically for the quantity input */
            #crmEditQtyInput::-webkit-outer-spin-button,
            #crmEditQtyInput::-webkit-inner-spin-button {
                -webkit-appearance: none;
                margin: 0;
            }
            #crmEditQtyInput {
                padding-right: 32px !important; /* Reduces the "dead zone" slightly now that arrows are gone */
            }
            #crmEditQtyInput[type=number] {
                -moz-appearance: textfield; /* For Firefox */
            }            
            .crm-edit-actions {
                position: absolute;
                right: 5px;
                display: flex;
                gap: 2px;
            }
            .btn-crm-save, .btn-crm-cancel {
                border: none; background: none; padding: 4px; border-radius: 4px;
                cursor: pointer; transition: background 0.2s;
            }
            .btn-crm-save { color: #10b981; }
            .btn-crm-cancel { color: #ef4444; }
            .btn-crm-save:hover { background: #ecfdf5; }
            .btn-crm-cancel:hover { background: #fef2f2; }

            .crm-edit-dropdown {
                position: absolute;
                top: 100%; left: 0; right: 0;
                background: white; border: 1px solid #e2e8f0;
                border-radius: 8px; box-shadow: 0 10px 15px -3px rgba(0,0,0,0.1);
                z-index: 100; max-height: 220px; overflow-y: auto;
                margin-top: 5px; display: none;
            }
            .crm-edit-dropdown.show { display: block; }
            .crm-edit-dropdown .dropdown-item {
                padding: 10px 12px; font-size: 0.75rem; border-bottom: 1px solid #f1f5f9;
                cursor: pointer;
            }
            .crm-edit-dropdown .dropdown-item:hover { background: #f8fafc; }

            .btn-note-icon {
                background: none !important; border: none !important; padding: 0;
                width: 36px; height: 36px; color: #fcd34d;
                display: flex; align-items: center; justify-content: center;
                transition: all 0.2s; cursor: pointer; position: relative;
            }
            .btn-note-icon:hover { transform: scale(1.1); color: #fbbf24; }

            #crmSortRecent.active { background-color: #0d6efd; color: white; }
            #crmSortValue.active { background-color: #198754; color: white; }

            @keyframes fadeInUp { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
            .fade-in-up { animation: fadeInUp 0.4s ease-out forwards; }
        `;
        document.head.appendChild(style);
    },

    async refreshList() {
        const container = document.getElementById('crmLeadList');
        if (!container) return;
        container.innerHTML = `<div class="text-center mt-5 text-muted"><div class="spinner-border spinner-border-sm text-primary mb-2"></div><br><small>Syncing My Leads...</small></div>`;
        try {
            await CRMService.getLeads();
            this.renderList();
        } catch (e) {
            container.innerHTML = `<div class="alert alert-danger m-3 small">${e.message}</div>`;
        }
    },

    renderList() {
        const search = document.getElementById('crmSearch').value.toLowerCase();
        const container = document.getElementById('crmLeadList');
        const fmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
        let leads = CRMService.leadsCache;

        if (userAccount) {
            const userName = (userAccount.name || "").toLowerCase();
            const userEmail = (userAccount.username || "").toLowerCase();
            leads = leads.filter(l => {
                const owner = (l.Owner || "").toLowerCase();
                return owner.includes(userEmail) || owner.includes(userName);
            });
        }
        
        if (search) {
            leads = leads.filter(l => (l.Title||"").toLowerCase().includes(search) || (l.Company||"").toLowerCase().includes(search) || (l.PartNumber||"").toLowerCase().includes(search));
        }

        leads.forEach(l => l._calculatedValue = CRMService.calculateLeadValue(l.PartNumber, l.Quantity));

        if (this.sortBy === 'value') leads.sort((a, b) => (b._calculatedValue || 0) - (a._calculatedValue || 0));
        else leads.sort((a, b) => new Date(b.LastActivityAt) - new Date(a.LastActivityAt));

        if (leads.length === 0) {
            container.innerHTML = `<div class="text-center text-muted mt-5 opacity-50"><p class="small">No active leads found.</p></div>`;
            return;
        }

        container.innerHTML = leads.map(l => {
            const initials = l.Title.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
            const valueStr = l._calculatedValue > 0 ? fmt.format(l._calculatedValue) : "TBD";
            const isActive = CRMService.currentLead?.LeadId === l.LeadId ? 'active-lead' : '';
            
            let badgeClass = 'crm-badge-new';
            if (l.Status === 'Waiting On Contact') badgeClass = 'crm-badge-waiting';
            else if (l.Status === 'Action Required') badgeClass = 'crm-badge-action';
            else if (l.Status === 'Sent To Quotes') badgeClass = 'crm-badge-quotes';
            else if (l.Status === 'Closed') badgeClass = 'crm-badge-closed';

            return `
            <div class="card mb-2 shadow-sm crm-lead-card ${isActive}" onclick="CRMView.loadLead('${l.LeadId}')">
                <div class="card-body p-2 px-3">
                    <div class="d-flex justify-content-between align-items-start mb-1">
                        <div class="d-flex align-items-center gap-2 overflow-hidden">
                            <div class="avatar-circle">${initials}</div>
                            <div class="text-truncate">
                                <div class="fw-bold text-dark text-truncate" style="font-size: 0.85rem;">${l.Title}</div>
                                <div class="text-muted text-truncate" style="font-size: 0.7rem;">${l.Company || 'Private Lead'}</div>
                            </div>
                        </div>
                        <div class="text-end ps-2"><div class="fw-bold text-success" style="font-size: 0.9rem;">${valueStr}</div></div>
                    </div>
                    <div class="d-flex justify-content-between align-items-center mt-2 pt-2 border-top border-light">
                        <div class="d-flex gap-2">
                            <span class="badge ${badgeClass} text-uppercase" style="font-size: 0.55rem; padding: 4px 8px; border-radius: 4px;">${l.Status}</span>
                            <span class="text-muted" style="font-size: 0.65rem;">${l.PartNumber || ''}</span>
                        </div>
                        <span class="text-muted" style="font-size: 0.65rem;">${this.getRelativeTime(new Date(l.LastActivityAt))}</span>
                    </div>
                </div>
            </div>`;
        }).join('');
    },

    async loadLead(leadId) {
        const lead = CRMService.leadsCache.find(l => l.LeadId === leadId);
        if(!lead) return;

        document.querySelectorAll('.crm-lead-card').forEach(c => c.classList.remove('active-lead'));
        document.querySelectorAll('.crm-lead-card').forEach(c => {
            if (c.getAttribute('onclick')?.includes(leadId)) c.classList.add('active-lead');
        });

        document.getElementById('crmDetailHeader').style.setProperty('display', 'flex', 'important');
        const summaryPane = document.getElementById('crmLeadSummary');
        summaryPane.style.display = 'block';
        summaryPane.innerHTML = `<div class="p-3 text-center"><div class="spinner-border spinner-border-sm text-primary"></div></div>`;

        document.getElementById('crmDetailTitle').textContent = lead.Title;
        document.getElementById('crmDetailCompany').innerHTML = `<i class="far fa-building me-1"></i> ${lead.Company || "No Company"}`;
        
        this.renderHeaderActions(lead);

        try {
            const items = await CRMService.getFullTimeline(lead);
            this.currentTimelineItems = items; 
            this.renderTimeline(items);
            this.renderLeadSummary(lead, items);
        } catch (e) {
            document.getElementById('crmTimeline').innerHTML = `<div class="alert alert-danger m-4">${e.message}</div>`;
        }
    },

    renderLeadSummary(lead, timelineItems) {
        const container = document.getElementById('crmLeadSummary');
        if (!container) return;

        const partNumber = (lead.PartNumber || "").trim();
        const estimatedValue = CRMService.calculateLeadValue(partNumber, lead.Quantity);
        const fmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
        
        let bodyMessage = "No specific notes found.";
        const latestNote = timelineItems.find(item => item.type === 'event' && item.eventType === 'Note');
        if (latestNote) bodyMessage = latestNote.details;
        else if (lead.Description && !lead.Description.toLowerCase().includes('created by outlook add on')) bodyMessage = lead.Description;

        container.innerHTML = `
            <div class="p-3">
                <h6 class="text-uppercase fw-bold text-muted mb-3" style="font-size: 0.75rem; letter-spacing: 0.5px;">Lead Information</h6>
                
                <div class="row g-2 mb-3">
                    <div class="col-7">
                        <label class="small text-muted mb-1 d-block">Requested Part #</label>
                        <div id="summaryFieldPartNumber" class="lead-summary-field-box" onclick="CRMView.enterEditMode('${lead.LeadId}', 'PartNumber')">
                            <span class="text-truncate">${partNumber || 'N/A'}</span>
                            <i class="fas fa-pen edit-indicator"></i>
                        </div>
                    </div>
                    <div class="col-5">
                        <label class="small text-muted mb-1 d-block">Quantity</label>
                        <div id="summaryFieldQuantity" class="lead-summary-field-box" onclick="CRMView.enterEditMode('${lead.LeadId}', 'Quantity')">
                            <span>${lead.Quantity || '0'}</span>
                            <i class="fas fa-pen edit-indicator"></i>
                        </div>
                    </div>
                </div>

                <div class="mb-4">
                    <label class="small text-muted mb-1 d-block">Estimated Value</label>
                    <div class="fw-bold text-success border rounded p-2 bg-light shadow-sm" style="font-size: 1.1rem; border-left: 4px solid #198754 !important;">
                        ${estimatedValue > 0 ? fmt.format(estimatedValue) : "TBD"}
                    </div>
                </div>

                <div class="mb-4">
                    <label class="small text-muted mb-1 d-block">Most Recent Update</label>
                    <div class="p-3 rounded bg-white border-start border-4 border-warning shadow-sm" style="font-size: 0.85rem; white-space: pre-wrap; background: #fffbeb;">
                        ${bodyMessage}
                    </div>
                </div>

                <div class="mt-4 pt-3 border-top">
                    <div class="d-flex justify-content-between align-items-center">
                        <small class="text-muted">Owner</small>
                        <small class="fw-semibold">${lead.Owner || 'Unassigned'}</small>
                    </div>
                </div>
            </div>
        `;
    },

    enterEditMode(leadId, field) {
        const lead = CRMService.leadsCache.find(l => l.LeadId === leadId);
        if (!lead) return;

        const containerId = field === 'PartNumber' ? 'summaryFieldPartNumber' : 'summaryFieldQuantity';
        const box = document.getElementById(containerId);
        if (!box) return;

        const currentValue = lead[field] || '';
        
        const editContainer = document.createElement('div');
        editContainer.className = 'crm-edit-container';
        editContainer.onclick = (e) => e.stopPropagation(); 

        const input = document.createElement('input');
        input.type = field === 'Quantity' ? 'number' : 'text';
        input.className = 'crm-edit-input-field';
        if (field === 'Quantity') input.classList.add('text-center');
        input.id = field === 'PartNumber' ? 'crmEditPartInput' : 'crmEditQtyInput';
        input.value = currentValue;
        input.autocomplete = "off";

        const actions = document.createElement('div');
        actions.className = 'crm-edit-actions';
        actions.innerHTML = `
            <button class="btn-crm-save" onclick="CRMView.saveEdit('${leadId}', '${field}')"><i class="fas fa-check"></i></button>
            <button class="btn-crm-cancel" onclick="CRMView.renderLeadSummary(CRMService.leadsCache.find(l => l.LeadId === '${leadId}'), CRMView.currentTimelineItems)"><i class="fas fa-times"></i></button>
        `;

        editContainer.appendChild(input);
        editContainer.appendChild(actions);

        if (field === 'PartNumber') {
            const dropdown = document.createElement('div');
            dropdown.id = 'crmEditPartDropdown';
            dropdown.className = 'crm-edit-dropdown';
            editContainer.appendChild(dropdown);

            input.addEventListener('input', (e) => {
                const query = e.target.value.trim().toLowerCase();
                if (query.length < 1) { dropdown.classList.remove('show'); return; }
                const db = window.dataStore?.DB?.dataframe || [];
                const matches = db.filter(p => String(p.PartNumber).toLowerCase().includes(query) || String(p.Description).toLowerCase().includes(query)).slice(0, 8);
                if (matches.length > 0) {
                    dropdown.innerHTML = matches.map(p => `
                        <div class="dropdown-item" onclick="document.getElementById('crmEditPartInput').value = '${p.PartNumber}'; CRMView.saveEdit('${leadId}', 'PartNumber');">
                            <div class="fw-bold">${p.PartNumber}</div>
                            <div class="text-muted" style="font-size: 0.65rem;">${p.Description}</div>
                        </div>
                    `).join('');
                    dropdown.classList.add('show');
                } else dropdown.classList.remove('show');
            });
        }

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') this.saveEdit(leadId, field);
            if (e.key === 'Escape') this.renderLeadSummary(lead, this.currentTimelineItems);
        });

        box.appendChild(editContainer);
        input.focus();
        input.select();
    },

    async saveEdit(leadId, field) {
        const lead = CRMService.leadsCache.find(l => l.LeadId === leadId);
        const inputId = field === 'PartNumber' ? 'crmEditPartInput' : 'crmEditQtyInput';
        const input = document.getElementById(inputId);
        if (!input) return;

        const newValue = input.value.trim();
        if (newValue === String(lead[field])) { 
            this.renderLeadSummary(lead, this.currentTimelineItems); 
            return; 
        }

        try {
            const updates = {}; updates[field] = newValue;
            const containerId = field === 'PartNumber' ? 'summaryFieldPartNumber' : 'summaryFieldQuantity';
            document.getElementById(containerId).innerHTML = `<div class="p-2 text-center w-100"><div class="spinner-border spinner-border-sm text-primary"></div></div>`;
            
            await CRMService.updateLeadFields(leadId, updates);
            this.renderLeadSummary(lead, this.currentTimelineItems);
            this.renderList();
        } catch (e) {
            alert("Save failed: " + e.message);
            this.renderLeadSummary(lead, this.currentTimelineItems);
        }
    },

    renderHeaderActions(lead) {
        const actionContainer = document.querySelector('#crmDetailHeader .d-flex.gap-2');
        if (!actionContainer) return;
        
        let badgeClass = 'crm-badge-new';
        if (lead.Status === 'Waiting On Contact') badgeClass = 'crm-badge-waiting';
        else if (lead.Status === 'Action Required') badgeClass = 'crm-badge-action';
        else if (lead.Status === 'Sent To Quotes') badgeClass = 'crm-badge-quotes';
        else if (lead.Status === 'Closed') badgeClass = 'crm-badge-closed';

        actionContainer.innerHTML = `
            <div class="dropdown me-2">
                <button class="badge ${badgeClass} dropdown-toggle text-uppercase px-3 py-2 rounded-pill fw-bold border-0" type="button" data-bs-toggle="dropdown">
                    ${lead.Status}
                </button>
                <ul class="dropdown-menu dropdown-menu-end shadow-lg border-0 p-2" style="min-width: 150px; border-radius: 12px;">
                    <li><h6 class="dropdown-header small text-muted text-uppercase mb-2" style="font-size: 0.65rem; letter-spacing: 0.5px;">Change Status</h6></li>
                    <li><a class="dropdown-item status-dropdown-item crm-badge-new" onclick="CRMView.updateStatus('${lead.LeadId}', 'New Lead')"><i class="fas fa-star me-2"></i>New Lead</a></li>
                    <li><a class="dropdown-item status-dropdown-item crm-badge-waiting" onclick="CRMView.updateStatus('${lead.LeadId}', 'Waiting On Contact')"><i class="fas fa-clock me-2"></i>Waiting On Contact</a></li>
                    <li><a class="dropdown-item status-dropdown-item crm-badge-action" onclick="CRMView.updateStatus('${lead.LeadId}', 'Action Required')"><i class="fas fa-exclamation-circle me-2"></i>Action Required</a></li>
                    <li><hr class="dropdown-divider"></li>
                    <li><a class="dropdown-item status-dropdown-item crm-badge-closed text-danger" onclick="CRMView.closeLeadConfirm('${lead.LeadId}')"><i class="fas fa-times-circle me-2"></i>Close Lead</a></li>
                </ul>
            </div>
            <button class="btn-note-icon" onclick="CRMView.openAddNoteModal()"><i class="fas fa-sticky-note fa-2x"></i><div class="note-plus" style="position: absolute; top: 5px; right: 4px; font-size: 0.65rem; background: white; border-radius: 50%; width: 14px; height: 14px; display: flex; align-items: center; justify-content: center; border: 1px solid #fbbf24; color: #b45309; font-weight: bold;">+</div></button>
            <button onclick="CRMView.updateStatus('${lead.LeadId}', 'Sent To Quotes')" style="background:none; border:none; padding:0; cursor:pointer;"><img src="/EasySearchTests/static/leads-icon.png" style="width:26px; height:26px;"></button>
        `;
    },

    async updateStatus(lId, s) { await CRMService.updateStatus(lId, s); this.loadLead(lId); this.renderList(); },
    async closeLeadConfirm(lId) { if (confirm("Close lead?")) this.updateStatus(lId, 'Closed'); },

    renderTimeline(items) {
        const container = document.getElementById('crmTimeline');
        if (items.length === 0) { container.innerHTML = `<div class="text-center mt-5 opacity-50"><h5>Start the conversation</h5></div>`; return; }
        const html = items.map((item, idx) => {
            const rel = this.getRelativeTime(item.date);
            if (item.type === 'email') {
                const id = `email-${idx}`;
                return `
                <div class="d-flex mb-4 fade-in-up">
                    <div class="me-3 flex-shrink-0" style="width: 34px;">
                        <div class="bg-white text-primary border rounded-circle p-2 d-flex align-items-center justify-content-center" style="width: 34px; height: 34px; box-shadow: 0 2px 4px rgba(0,0,0,0.05);">
                            <i class="fas fa-envelope"></i>
                        </div>
                    </div>
                    <div class="flex-grow-1">
                        <div class="card border-0 shadow-sm" onclick="CRMView.toggleCollapse('${id}')" style="cursor:pointer;">
                            <div class="card-body p-3">
                                <div class="d-flex justify-content-between mb-1">
                                    <span class="small fw-bold text-primary">${item.from}</span>
                                    <small class="text-muted">${rel}</small>
                                </div>
                                <h6 class="mb-0 small fw-bold">${item.subject}</h6>
                                <div id="${id}" class="collapse mt-2">
                                    <div class="p-2 bg-light small border-start border-primary" style="border-width: 4px !important;">${item.preview || ""}</div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>`;
            } else {
                const isSys = item.eventType === 'System';
                const icon = isSys ? 'fa-cog' : 'fa-sticky-note';
                const colorClass = isSys ? 'text-secondary' : 'text-warning';
                return `
                <div class="d-flex mb-4 fade-in-up">
                    <div class="me-3 flex-shrink-0" style="width: 34px;">
                        <div class="bg-white border rounded-circle p-2 ${colorClass} d-flex align-items-center justify-content-center" style="width: 34px; height: 34px; box-shadow: 0 2px 4px rgba(0,0,0,0.05);">
                            <i class="fas ${icon}"></i>
                        </div>
                    </div>
                    <div class="flex-grow-1">
                        <div class="card border-0 shadow-sm ${isSys?'bg-light':''}" style="${isSys?'':'background:#fffbeb'}">
                            <div class="card-body p-3">
                                <div class="d-flex justify-content-between mb-2">
                                    <span class="text-uppercase fw-bold text-muted" style="font-size:0.7rem;">${item.eventType}</span>
                                    <small class="text-muted">${rel}</small>
                                </div>
                                <div class="fw-semibold small">${item.summary}</div>
                                ${item.details ? `<div class="small opacity-75 mt-1" style="white-space: pre-wrap;">${item.details}</div>` : ''}
                            </div>
                        </div>
                    </div>
                </div>`;
            }
        }).join('');
        container.innerHTML = `<div class="crm-timeline-container pt-2 pb-5">${html}</div>`;
    },
    
    toggleCollapse(id) { const el = document.getElementById(id); if (el) { el.classList.toggle('show'); } },
    getRelativeTime(d) {
        const diff = Math.floor((new Date() - d) / 1000);
        if (diff < 60) return 'Just now';
        if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
        if (diff < 84400) return `${Math.floor(diff / 3600)}h ago`;
        return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
    },

    async openAddNoteModal() {
        const note = prompt("Add a note:");
        if(note && note.trim()) { await CRMService.addEvent(CRMService.currentLead.LeadId, "Note", "User Note", note); this.loadLead(CRMService.currentLead.LeadId); }
    }
};

document.addEventListener('DOMContentLoaded', () => CRMView.init());