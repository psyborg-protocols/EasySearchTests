// ---------------------------------------------
// crmView.js
// Handles UI rendering for the CRM module
// ---------------------------------------------

const CRMView = {
    init() {
        this.injectStyles();

        const crmTab = document.getElementById('crm-tab');
        if (crmTab) {
            crmTab.addEventListener('shown.bs.tab', () => this.refreshList());
        }
        
        const ownerFilter = document.getElementById('crmOwnerFilter');
        if (ownerFilter) {
            ownerFilter.addEventListener('change', () => this.renderList());
        }
        
        const searchInput = document.getElementById('crmSearch');
        if (searchInput) {
            searchInput.addEventListener('input', () => this.renderList());
        }
    },

    injectStyles() {
        if (document.getElementById('crm-custom-styles')) return;
        const style = document.createElement('style');
        style.id = 'crm-custom-styles';
        style.innerHTML = `
            .crm-timeline-container { position: relative; padding-left: 20px; }
            .crm-timeline-container::before {
                content: ''; position: absolute; top: 0; bottom: 0; 
                left: 45px; width: 0; border-left: 2px dashed #cbd5e1; z-index: 0;
            }

            .avatar-circle {
                flex: 0 0 36px; height: 36px; border-radius: 50%; 
                background: #3b82f6; color: white; display: flex; 
                align-items: center; justify-content: center; 
                font-weight: 600; font-size: 0.8rem; text-transform: uppercase;
                box-shadow: 0 2px 4px rgba(0,0,0,0.05);
            }

            .crm-lead-card { 
                transition: all 0.2s ease; cursor: pointer;
                border: 1px solid #f1f5f9 !important;
            }
            .crm-lead-card:hover { 
                transform: translateY(-1px); 
                box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1) !important;
            }

            .timeline-icon-wrapper {
                position: relative; z-index: 1; width: 34px; height: 34px;
                border-radius: 10px; display: flex; align-items: center; justify-content: center;
                background: #fff; border: 1px solid #e2e8f0;
                box-shadow: 0 1px 3px rgba(0,0,0,0.1);
            }

            /* Precise Status Colors */
            .crm-badge-new { background-color: #dcfce7 !important; color: #166534 !important; }
            .crm-badge-waiting { background-color: #ecfdf5 !important; color: #065f46 !important; }
            .crm-badge-action { background-color: #ffedd5 !important; color: #9a3412 !important; }
            .crm-badge-quotes { background-color: #e0f2fe !important; color: #0369a1 !important; }
            .crm-badge-closed { background-color: #f3f4f6 !important; color: #374151 !important; }

            .status-dropdown-toggle {
                border: none; 
                transition: filter 0.2s;
                min-width: 135px; /* Set minimum width */
            }
            .status-dropdown-toggle:hover { filter: brightness(0.95); }

            /* Updated Note Button - Clean iconic look */
            .btn-note-icon {
                background: none; border: none; padding: 0;
                width: 42px; height: 42px;
                color: #f59e0b; /* Amber/Sticky note color */
                display: flex; align-items: center; justify-content: center;
                transition: all 0.2s;
                cursor: pointer;
            }
            .btn-note-icon:hover { transform: scale(1.15); color: #d97706; }

            /* Updated Custom Lead/Quote Action Icon - Using Image */
            .btn-action-icon-plain {
                background: none; border: none; padding: 0;
                width: 42px; height: 42px;
                display: flex; align-items: center; justify-content: center;
                transition: all 0.2s;
                cursor: pointer;
            }
            .btn-action-icon-plain:hover { transform: scale(1.15); }
            .btn-action-icon-plain img {
                width: 32px; height: 32px;
                object-fit: contain;
            }

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
                <div class="spinner-border text-primary mb-2" role="status"></div>
                <small>Syncing leads...</small>
            </div>`;
            
        try {
            await CRMService.getLeads();
            this.renderList();
        } catch (e) {
            container.innerHTML = `<div class="alert alert-danger m-3 small">${e.message}</div>`;
        }
    },

    renderList() {
        const filterOwner = document.getElementById('crmOwnerFilter').value;
        const search = document.getElementById('crmSearch').value.toLowerCase();
        const container = document.getElementById('crmLeadList');
        
        let leads = CRMService.leadsCache;

        if (filterOwner === 'me' && userAccount) {
            leads = leads.filter(l => 
                (l.Owner || "").toLowerCase().includes(userAccount.username.toLowerCase()) || 
                (l.Owner || "").toLowerCase().includes((userAccount.name || "").toLowerCase())
            );
        }
        
        if (search) {
            leads = leads.filter(l => 
                (l.Title || "").toLowerCase().includes(search) || 
                (l.Company || "").toLowerCase().includes(search)
            );
        }

        leads.sort((a, b) => new Date(b.LastActivityAt) - new Date(a.LastActivityAt));

        if (leads.length === 0) {
            container.innerHTML = `<div class="text-center text-muted mt-5 opacity-50"><p class="small">No leads found.</p></div>`;
            return;
        }

        container.innerHTML = leads.map(l => {
            const lastActive = new Date(l.LastActivityAt);
            const initials = l.Title.substring(0, 2).toUpperCase();
            
            let badgeClass = 'crm-badge-new';
            if (l.Status === 'Waiting On Contact') badgeClass = 'crm-badge-waiting';
            else if (l.Status === 'Action Required') badgeClass = 'crm-badge-action';
            else if (l.Status === 'Sent To Quotes') badgeClass = 'crm-badge-quotes';
            else if (l.Status === 'Closed') badgeClass = 'crm-badge-closed';

            return `
            <div class="card mb-2 border-0 shadow-sm crm-lead-card" onclick="CRMView.loadLead('${l.LeadId}')">
                <div class="card-body p-3">
                    <div class="d-flex align-items-center gap-3">
                        <div class="avatar-circle shadow-sm">${initials}</div>
                        <div class="flex-grow-1" style="min-width: 0;">
                            <h6 class="mb-0 text-truncate fw-bold text-dark" style="font-size: 0.9rem;">${l.Title}</h6>
                            <div class="small text-muted text-truncate">${l.Company || 'No Company'}</div>
                        </div>
                    </div>
                    <div class="d-flex justify-content-between align-items-center mt-3">
                         <span class="badge ${badgeClass} text-uppercase px-2" style="font-size:0.6rem">${l.Status}</span>
                         <span class="small text-muted" style="font-size:0.7rem">${this.getRelativeTime(lastActive)}</span>
                    </div>
                </div>
            </div>`;
        }).join('');
    },

    async loadLead(leadId) {
        const lead = CRMService.leadsCache.find(l => l.LeadId === leadId);
        if(!lead) return;

        const header = document.getElementById('crmDetailHeader');
        header.style.setProperty('display', 'flex', 'important');
        
        document.getElementById('crmDetailTitle').textContent = lead.Title;
        document.getElementById('crmDetailCompany').innerHTML = `<i class="far fa-building me-1"></i> ${lead.Company || "No Company"}`;
        
        this.renderHeaderActions(lead);

        const timelineContainer = document.getElementById('crmTimeline');
        timelineContainer.innerHTML = `<div class="text-center p-5"><div class="spinner-border text-primary"></div></div>`;

        try {
            const items = await CRMService.getFullTimeline(lead);
            this.renderTimeline(items);
        } catch (e) {
            timelineContainer.innerHTML = `<div class="alert alert-danger m-4">${e.message}</div>`;
        }
    },

    renderHeaderActions(lead) {
        const actionContainer = document.querySelector('#crmDetailHeader .d-flex.gap-2');
        
        let badgeClass = 'crm-badge-new';
        if (lead.Status === 'Waiting On Contact') badgeClass = 'crm-badge-waiting';
        else if (lead.Status === 'Action Required') badgeClass = 'crm-badge-action';
        else if (lead.Status === 'Sent To Quotes') badgeClass = 'crm-badge-quotes';
        else if (lead.Status === 'Closed') badgeClass = 'crm-badge-closed';

        actionContainer.innerHTML = `
            <!-- 1. Note Button (First) -->
            <button class="btn-note-icon" title="Add Note" onclick="CRMView.openAddNoteModal()">
                <i class="fas fa-sticky-note fa-2x"></i>
            </button>

            <!-- 2. Send To Quotes Button (Second) - Updated to use custom icon in /static -->
            <button class="btn-action-icon-plain" title="Send to Quotes" onclick="CRMView.updateStatus('${lead.LeadId}', 'Sent To Quotes')">
                <img src="/EasySearchTests/static/leads-icon.png" alt="Send to Quotes">
            </button>

            <!-- 3. Status Dropdown -->
            <div class="dropdown">
                <button class="badge ${badgeClass} dropdown-toggle status-dropdown-toggle text-uppercase px-3 py-2 rounded-pill fw-bold border-0" 
                        type="button" data-bs-toggle="dropdown">
                    ${lead.Status}
                </button>
                <ul class="dropdown-menu dropdown-menu-end shadow border-0 p-2">
                    <li><h6 class="dropdown-header small text-muted">Update Status</h6></li>
                    <li><a class="dropdown-item rounded mb-1 crm-badge-new" href="#" onclick="CRMView.updateStatus('${lead.LeadId}', 'New Lead')">New Lead</a></li>
                    <li><a class="dropdown-item rounded mb-1 crm-badge-waiting" href="#" onclick="CRMView.updateStatus('${lead.LeadId}', 'Waiting On Contact')">Waiting On Contact</a></li>
                    <li><a class="dropdown-item rounded mb-1 crm-badge-action" href="#" onclick="CRMView.updateStatus('${lead.LeadId}', 'Action Required')">Action Required</a></li>
                    <li><hr class="dropdown-divider"></li>
                    <li><a class="dropdown-item rounded text-danger" href="#" onclick="CRMView.closeLeadConfirm('${lead.LeadId}')"><i class="fas fa-times-circle me-2"></i>Close this lead</a></li>
                </ul>
            </div>
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
                        <div class="timeline-icon-wrapper bg-white text-primary border-primary-subtle">
                            <i class="fas fa-envelope" style="font-size: 0.85rem;"></i>
                        </div>
                    </div>
                    <div class="flex-grow-1">
                        <div class="card timeline-card border-0 shadow-sm" onclick="CRMView.toggleCollapse('${uniqueId}')">
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
                        <div class="timeline-icon-wrapper bg-white ${iconColor}">
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
        if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
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