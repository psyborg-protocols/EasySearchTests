// ---------------------------------------------
// crmView.js
// Handles UI rendering for the CRM module
// ---------------------------------------------

const CRMView = {
    sortBy: 'recent', // 'recent' or 'value'

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
    },

    injectStyles() {
        if (document.getElementById('crm-custom-styles')) return;
        const style = document.createElement('style');
        style.id = 'crm-custom-styles';
        style.innerHTML = `
            .crm-timeline-container { position: relative; padding-left: 20px; }
            .crm-timeline-container::before {
                content: ''; position: absolute; top: 0; bottom: 0; margin-top: 10px;
                left: 44px; width: 0; border-left: 3.5px dotted #cbd5e1; z-index: 0;
            }

            .avatar-circle {
                flex: 0 0 32px; height: 32px; border-radius: 8px; 
                background: #f1f5f9; color: #475569; display: flex; 
                align-items: center; justify-content: center; 
                font-weight: 700; font-size: 0.75rem; text-transform: uppercase;
                border: 1px solid #e2e8f0;
            }

            .crm-lead-card { 
                transition: all 0.2s ease; cursor: pointer;
                border: 1px solid #e2e8f0 !important;
                border-radius: 10px !important;
                overflow: hidden;
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

            .crm-badge-new { background-color: #dcfce7 !important; color: #166534 !important; }
            .crm-badge-waiting { background-color: #fef9c3 !important; color: #854d0e !important; }
            .crm-badge-action { background-color: #fee2e2 !important; color: #991b1b !important; }
            .crm-badge-quotes { background-color: #e0f2fe !important; color: #0369a1 !important; }
            .crm-badge-closed { background-color: #f3f4f6 !important; color: #374151 !important; }

            .btn-note-icon {
                background: none !important; border: none !important; padding: 0;
                width: 36px; height: 36px;
                color: #fcd34d;
                display: flex; align-items: center; justify-content: center;
                transition: all 0.2s;
                cursor: pointer;
                box-shadow: none !important;
                position: relative;
            }
            .btn-note-icon:hover { transform: scale(1.1); color: #fbbf24; }
            
            #crmSortRecent.active { background-color: #0d6efd; color: white; border-color: #0d6efd; }
            #crmSortValue.active { background-color: #198754; color: white; border-color: #198754; }

            @keyframes fadeInUp { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
            .fade-in-up { animation: fadeInUp 0.4s ease-out forwards; }
        `;
        document.head.appendChild(style);
    },

    async refreshList() {
        const container = document.getElementById('crmLeadList');
        if (!container) return;

        container.innerHTML = `
            <div class="d-flex flex-column align-items-center justify-content-center mt-5 text-muted">
                <div class="spinner-border spinner-border-sm text-primary mb-2" role="status"></div>
                <small>Syncing My Leads...</small>
            </div>`;
            
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

        // Requirement: Only show leads tied to user
        if (userAccount) {
            const userName = (userAccount.name || "").toLowerCase();
            const userEmail = (userAccount.username || "").toLowerCase();
            leads = leads.filter(l => {
                const owner = (l.Owner || "").toLowerCase();
                return owner.includes(userEmail) || owner.includes(userName);
            });
        }
        
        // Search filter
        if (search) {
            leads = leads.filter(l => 
                (l.Title || "").toLowerCase().includes(search) || 
                (l.Company || "").toLowerCase().includes(search) ||
                (l.PartNumber || "").toLowerCase().includes(search)
            );
        }

        // Calculate values for sorting and display
        leads.forEach(l => {
            l._calculatedValue = CRMService.calculateLeadValue(l.PartNumber, l.Quantity);
        });

        // Sorting logic
        if (this.sortBy === 'value') {
            leads.sort((a, b) => (b._calculatedValue || 0) - (a._calculatedValue || 0));
        } else {
            leads.sort((a, b) => new Date(b.LastActivityAt) - new Date(a.LastActivityAt));
        }

        if (leads.length === 0) {
            container.innerHTML = `<div class="text-center text-muted mt-5 opacity-50"><p class="small">No active leads found.</p></div>`;
            return;
        }

        container.innerHTML = leads.map(l => {
            const lastActive = new Date(l.LastActivityAt);
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
                                <div class="fw-bold text-dark text-truncate" style="font-size: 0.85rem; line-height: 1.2;">${l.Title}</div>
                                <div class="text-muted text-truncate" style="font-size: 0.7rem;">${l.Company || 'Private Lead'}</div>
                            </div>
                        </div>
                        <div class="text-end ps-2">
                            <div class="fw-bold text-success" style="font-size: 0.9rem;">${valueStr}</div>
                        </div>
                    </div>
                    
                    <div class="d-flex justify-content-between align-items-center mt-2 pt-2 border-top border-light">
                        <div class="d-flex gap-2">
                            <span class="badge ${badgeClass} text-uppercase" style="font-size: 0.55rem; padding: 0.35em 0.65em;">${l.Status}</span>
                            <span class="text-muted" style="font-size: 0.65rem;">${l.PartNumber ? l.PartNumber : ''}</span>
                        </div>
                        <span class="text-muted" style="font-size: 0.65rem;">${this.getRelativeTime(lastActive)}</span>
                    </div>
                </div>
            </div>`;
        }).join('');
    },

    async loadLead(leadId) {
        const lead = CRMService.leadsCache.find(l => l.LeadId === leadId);
        if(!lead) return;

        // Highlight active card
        document.querySelectorAll('.crm-lead-card').forEach(c => c.classList.remove('active-lead'));
        // Find the card by searching the DOM for an element that calls loadLead with this ID
        // Simplified: renderList handles this via active-lead class if we re-render, 
        // but for immediate feedback we can find it:
        const cards = document.querySelectorAll('.crm-lead-card');
        cards.forEach(c => {
            if (c.getAttribute('onclick')?.includes(leadId)) c.classList.add('active-lead');
        });

        const header = document.getElementById('crmDetailHeader');
        header.style.setProperty('display', 'flex', 'important');
        
        const summaryPane = document.getElementById('crmLeadSummary');
        if (summaryPane) {
            summaryPane.style.display = 'block';
            summaryPane.innerHTML = `<div class="p-3 text-center"><div class="spinner-border spinner-border-sm text-primary"></div></div>`;
        }

        document.getElementById('crmDetailTitle').textContent = lead.Title;
        document.getElementById('crmDetailCompany').innerHTML = `<i class="far fa-building me-1"></i> ${lead.Company || "No Company"}`;
        
        this.renderHeaderActions(lead);

        const timelineContainer = document.getElementById('crmTimeline');
        timelineContainer.innerHTML = `<div class="text-center p-5"><div class="spinner-border text-primary"></div></div>`;

        try {
            const items = await CRMService.getFullTimeline(lead);
            this.renderTimeline(items);
            this.renderLeadSummary(lead, items);
        } catch (e) {
            timelineContainer.innerHTML = `<div class="alert alert-danger m-4">${e.message}</div>`;
        }
    },

    renderLeadSummary(lead, timelineItems) {
        const container = document.getElementById('crmLeadSummary');
        if (!container) return;

        const partNumber = (lead.PartNumber || "").trim();
        const estimatedValue = CRMService.calculateLeadValue(partNumber, lead.Quantity);
        const fmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
        const estimatedValueFormatted = estimatedValue > 0 ? fmt.format(estimatedValue) : "TBD";

        let bodyMessage = "No specific notes found.";
        const latestNote = timelineItems.find(item => item.type === 'event' && item.eventType === 'Note');
        
        if (latestNote && latestNote.details) {
            bodyMessage = latestNote.details;
        } else if (lead.Description && !lead.Description.toLowerCase().includes('created by outlook add on')) {
            bodyMessage = lead.Description;
        }

        container.innerHTML = `
            <div class="p-3">
                <h6 class="text-uppercase fw-bold text-muted mb-3" style="font-size: 0.75rem; letter-spacing: 0.5px;">Lead Information</h6>
                
                <div class="row g-2 mb-3">
                    <div class="col-7">
                        <label class="small text-muted mb-1 d-block">Requested Part #</label>
                        <div class="fw-bold text-dark border rounded p-2 bg-light text-truncate" style="font-size: 0.85rem;" title="${partNumber || 'N/A'}">
                            ${partNumber || 'N/A'}
                        </div>
                    </div>
                    <div class="col-5">
                        <label class="small text-muted mb-1 d-block">Quantity</label>
                        <div class="fw-bold text-dark border rounded p-2 bg-light text-center" style="font-size: 0.85rem;">
                            ${lead.Quantity || '0'}
                        </div>
                    </div>
                </div>

                <div class="mb-4">
                    <label class="small text-muted mb-1 d-block">Estimated Value</label>
                    <div class="fw-bold text-success border rounded p-2 bg-light shadow-sm" style="font-size: 1.1rem; border-left: 4px solid #198754 !important;">
                        ${estimatedValueFormatted}
                    </div>
                </div>

                <div class="mb-4">
                    <label class="small text-muted mb-1 d-block">Most Recent Update</label>
                    <div class="p-3 rounded bg-white border-start border-4 border-warning shadow-sm" 
                         style="font-size: 0.85rem; white-space: pre-wrap; line-height: 1.5; background: #fffbeb;">
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

    renderHeaderActions(lead) {
        const actionContainer = document.querySelector('#crmDetailHeader .d-flex.gap-2');
        if (!actionContainer) return;

        actionContainer.classList.remove('gap-2');
        
        let badgeClass = 'crm-badge-new';
        if (lead.Status === 'Waiting On Contact') badgeClass = 'crm-badge-waiting';
        else if (lead.Status === 'Action Required') badgeClass = 'crm-badge-action';
        else if (lead.Status === 'Sent To Quotes') badgeClass = 'crm-badge-quotes';
        else if (lead.Status === 'Closed') badgeClass = 'crm-badge-closed';

        actionContainer.innerHTML = `
            <div class="dropdown me-2">
                <button class="badge ${badgeClass} dropdown-toggle status-dropdown-toggle text-uppercase px-3 py-2 rounded-pill fw-bold border-0" 
                        type="button" data-bs-toggle="dropdown">
                    ${lead.Status}
                </button>
                <ul class="dropdown-menu dropdown-menu-end shadow border-0 p-2 crm-status-menu">
                    <li><h6 class="dropdown-header small text-muted">Update Status</h6></li>
                    <li><a class="dropdown-item rounded mb-1 crm-badge-new" href="#" onclick="CRMView.updateStatus('${lead.LeadId}', 'New Lead')">New Lead</a></li>
                    <li><a class="dropdown-item rounded mb-1 crm-badge-waiting" href="#" onclick="CRMView.updateStatus('${lead.LeadId}', 'Waiting On Contact')">Waiting On Contact</a></li>
                    <li><a class="dropdown-item rounded mb-1 crm-badge-action" href="#" onclick="CRMView.updateStatus('${lead.LeadId}', 'Action Required')">Action Required</a></li>
                    <li><hr class="dropdown-divider"></li>
                    <li><a class="dropdown-item rounded text-danger" href="#" onclick="CRMView.closeLeadConfirm('${lead.LeadId}')"><i class="fas fa-times-circle me-2"></i>Close this lead</a></li>
                </ul>
            </div>

            <button class="btn-note-icon" title="Add Note" onclick="CRMView.openAddNoteModal()">
                <i class="fas fa-sticky-note fa-2x"></i>
                <div class="note-plus" style="position: absolute; top: 5px; right: 4px; font-size: 0.65rem; background: white; border-radius: 50%; width: 14px; height: 14px; display: flex; align-items: center; justify-content: center; border: 1px solid #fbbf24; color: #b45309; font-weight: bold;">+</div>
            </button>

            <button class="btn-action-icon-plain" title="Send to Quotes" onclick="CRMView.updateStatus('${lead.LeadId}', 'Sent To Quotes')" style="background: none !important; border: none !important; padding: 0; width: 36px; height: 36px; display: flex; align-items: center; justify-content: center; transition: all 0.2s; cursor: pointer; box-shadow: none !important;">
                <img src="/EasySearchTests/static/leads-icon.png" alt="Send to Quotes" style="width: 26px; height: 26px; object-fit: contain;">
            </button>
        `;
    },

    async updateStatus(leadId, newStatus) {
        try {
            await CRMService.updateStatus(leadId, newStatus);
            this.loadLead(leadId); 
            this.renderList(); 
        } catch (e) {
            console.error(e);
        }
    },

    async closeLeadConfirm(leadId) {
        if (confirm("Are you sure you want to close this lead?")) {
            await this.updateStatus(leadId, 'Closed');
        }
    },

    renderTimeline(items) {
        const container = document.getElementById('crmTimeline');
        if (items.length === 0) {
            container.innerHTML = `<div class="text-center mt-5 opacity-50"><h5>Start the conversation</h5></div>`;
            return;
        }

        const timelineHtml = items.map((item, index) => {
            const dateObj = item.date;
            const relativeTime = this.getRelativeTime(dateObj);
            
            if (item.type === 'email') {
                const uniqueId = `email-collapse-${index}`;
                return `
                <div class="d-flex mb-4 fade-in-up">
                    <div class="d-flex flex-column align-items-center me-3" style="min-width: 50px;">
                        <div class="timeline-icon-wrapper bg-white text-primary border-primary-subtle" style="position: relative; z-index: 1; width: 34px; height: 34px; border-radius: 10px; display: flex; align-items: center; justify-content: center; background: #fff; border: 1px solid #e2e8f0; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
                            <i class="fas fa-envelope" style="font-size: 0.85rem;"></i>
                        </div>
                    </div>
                    <div class="flex-grow-1">
                        <div class="card timeline-card border-0 shadow-sm" onclick="CRMView.toggleCollapse('${uniqueId}')" style="cursor: pointer;">
                            <div class="card-body p-3">
                                <div class="d-flex justify-content-between align-items-center mb-1">
                                    <div class="d-flex align-items-center gap-2">
                                        <span class="badge bg-primary bg-opacity-10 text-primary fw-bold" style="font-size:0.7rem">EMAIL</span>
                                        <span class="text-dark fw-bold small">${item.from}</span>
                                    </div>
                                    <small class="text-muted">${relativeTime}</small>
                                </div>
                                <h6 class="card-title text-dark fw-bold mb-1" style="font-size: 0.95rem;">${item.subject}</h6>
                                <div id="${uniqueId}" class="collapse mt-2">
                                    <div class="p-2 bg-light rounded text-secondary small border-start border-2 border-primary" 
                                         style="white-space: pre-wrap;">${item.preview || "No preview available."}</div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>`;
            } else {
                const isSystem = item.eventType === 'System';
                const icon = isSystem ? 'fa-cog' : 'fa-sticky-note';
                const iconColor = isSystem ? 'text-secondary' : 'text-warning';
                const cardBg = isSystem ? '#f8f9fa' : '#fffbeb'; 

                return `
                <div class="d-flex mb-4 fade-in-up">
                    <div class="d-flex flex-column align-items-center me-3" style="min-width: 50px;">
                        <div class="timeline-icon-wrapper bg-white ${iconColor}" style="position: relative; z-index: 1; width: 34px; height: 34px; border-radius: 10px; display: flex; align-items: center; justify-content: center; background: #fff; border: 1px solid #e2e8f0; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
                            <i class="fas ${icon}" style="font-size: 0.85rem;"></i>
                        </div>
                    </div>
                    <div class="flex-grow-1">
                        <div class="card border-0 shadow-sm" style="background-color: ${cardBg};">
                            <div class="card-body p-3">
                                 <div class="d-flex justify-content-between align-items-center mb-2">
                                    <span class="text-uppercase fw-bold text-muted" style="font-size:0.7rem;">${item.eventType}</span>
                                    <small class="text-muted">${relativeTime}</small>
                                </div>
                                <div class="fw-semibold text-dark mb-1">${item.summary}</div>
                                ${item.details ? `<div class="small text-dark opacity-75" style="white-space: pre-wrap;">${item.details}</div>` : ''}
                            </div>
                        </div>
                    </div>
                </div>`;
            }
        }).join('');

        container.innerHTML = `<div class="crm-timeline-container pt-2 pb-5">${timelineHtml}</div>`;
    },
    
    toggleCollapse(id) {
        const el = document.getElementById(id);
        if (el) {
            if (window.bootstrap && window.bootstrap.Collapse) {
                let bsCollapse = bootstrap.Collapse.getInstance(el);
                if (!bsCollapse) bsCollapse = new bootstrap.Collapse(el, { toggle: false });
                bsCollapse.toggle();
            } else {
                el.classList.toggle('show');
            }
        }
    },

    getRelativeTime(date) {
        const now = new Date();
        const diff = Math.floor((now - date) / 1000);
        if (diff < 60) return 'Just now';
        if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
        if (diff < 84400) return `${Math.floor(diff / 3600)}h ago`;
        if (diff < 172800) return 'Yesterday';
        return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    },

    async openAddNoteModal() {
        if(!CRMService.currentLead) return;
        const note = prompt("Add a note:");
        if(note && note.trim().length > 0) {
             try {
                await CRMService.addEvent(CRMService.currentLead.LeadId, "Note", "User Note", note);
                this.loadLead(CRMService.currentLead.LeadId);
             } catch(e) {
                 alert("Failed: " + e.message);
             }
        }
    }
};

document.addEventListener('DOMContentLoaded', () => CRMView.init());