// ---------------------------------------------
// crmView.js
// Handles UI rendering for the CRM module
// with enhanced Timeline UI and Animations
// ---------------------------------------------

const CRMView = {
    init() {
        // Inject custom styles for the timeline once
        this.injectStyles();

        // Listeners
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
            /* Timeline Vertical Line - "Breadcrumb" style */
            .crm-timeline-container { position: relative; padding-left: 20px; }
            .crm-timeline-container::before {
                content: ''; position: absolute; top: 0; bottom: 0; 
                left: 45px; /* (50px icon col / 2) + 20px padding */
                width: 0;
                border-left: 2px dashed #cbd5e1;
                z-index: 0;
            }

            /* Prevent Avatar Squishing */
            .avatar-circle {
                flex: 0 0 36px; /* Do not grow, do not shrink, fixed 36px */
                height: 36px; border-radius: 50%; 
                background: #3b82f6; color: white; display: flex; 
                align-items: center; justify-content: center; 
                font-weight: 600; font-size: 0.8rem; text-transform: uppercase;
                box-shadow: 0 2px 4px rgba(0,0,0,0.05);
            }

            /* Sleek Lead Cards */
            .crm-lead-card { 
                transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1); 
                cursor: pointer;
                border: 1px solid #f1f5f9 !important;
            }
            .crm-lead-card:hover { 
                transform: translateY(-2px) scale(1.01); 
                box-shadow: 0 10px 15px -3px rgba(0,0,0,0.1) !important;
                border-color: #e2e8f0 !important;
            }
            .crm-lead-card.active-lead {
                background-color: #f8fafc;
                border-left-width: 5px !important;
            }

            /* Timeline Icon Refinement */
            .timeline-icon-wrapper {
                position: relative; z-index: 1; width: 34px; height: 34px;
                border-radius: 10px; /* Squircle look */
                display: flex; align-items: center; justify-content: center;
                background: #fff; border: 1px solid #e2e8f0;
                box-shadow: 0 1px 3px rgba(0,0,0,0.1);
            }

            /* Soft Badge Styling */
            .crm-badge {
                padding: 0.35em 0.8em;
                font-weight: 600;
                border-radius: 6px;
                font-size: 0.65rem;
                text-transform: uppercase;
                letter-spacing: 0.025em;
            }
            .badge-in-progress { background: #e0f2fe; color: #0369a1; }
            .badge-quoted { background: #fef3c7; color: #92400e; }
            .badge-closed { background: #dcfce7; color: #166534; }
            .badge-default { background: #f1f5f9; color: #475569; }

            /* Animations */
            @keyframes fadeInUp {
                from { opacity: 0; transform: translateY(10px); }
                to { opacity: 1; transform: translateY(0); }
            }
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
            console.error(e);
            container.innerHTML = `
                <div class="alert alert-danger m-3 small">
                    <i class="fas fa-exclamation-circle me-1"></i> ${e.message}
                </div>`;
        }
    },

    renderList() {
        const filterOwner = document.getElementById('crmOwnerFilter').value;
        const search = document.getElementById('crmSearch').value.toLowerCase();
        const container = document.getElementById('crmLeadList');
        
        let leads = CRMService.leadsCache;

        // 1. Filter
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

        // 2. Sort (Last Activity DESC)
        leads.sort((a, b) => new Date(b.LastActivityAt) - new Date(a.LastActivityAt));

        // 3. Render
        if (leads.length === 0) {
            container.innerHTML = `
                <div class="text-center text-muted mt-5 opacity-50">
                    <i class="fas fa-inbox fa-3x mb-3"></i>
                    <p class="small">No leads found.</p>
                </div>`;
            return;
        }

        container.innerHTML = leads.map(l => {
            const lastActive = new Date(l.LastActivityAt);
            const isStale = (Date.now() - lastActive) / (1000 * 60 * 60 * 24) > 14;
            const initials = l.Title.substring(0, 2).toUpperCase();
            
            // Modern Badge Logic
            let statusClass = 'badge-default';
            if (l.Status === 'In Progress') statusClass = 'badge-in-progress';
            else if (l.Status === 'Quoted') statusClass = 'badge-quoted';
            else if (l.Status === 'Closed') statusClass = 'badge-closed';

            return `
            <div class="card mb-2 border-0 shadow-sm crm-lead-card" 
                 onclick="CRMView.loadLead('${l.LeadId}')"
                 style="border-left: 4px solid ${isStale ? '#ef4444' : '#3b82f6'} !important;">
                <div class="card-body p-3">
                    <div class="d-flex align-items-center gap-3">
                        <div class="avatar-circle shadow-sm" style="background-color: ${isStale ? '#fee2e2' : '#dbeafe'}; color: ${isStale ? '#b91c1c' : '#1d4ed8'};">
                            ${initials}
                        </div>
                        <div class="flex-grow-1" style="min-width: 0;">
                            <h6 class="mb-0 text-truncate fw-bold text-dark" style="font-size: 0.9rem;">${l.Title}</h6>
                            <div class="small text-muted text-truncate">${l.Company || 'No Company'}</div>
                        </div>
                    </div>
                    
                    <div class="d-flex justify-content-between align-items-center mt-3">
                         <span class="crm-badge ${statusClass}">${l.Status}</span>
                         <span class="small text-muted" style="font-size:0.7rem">
                            <i class="far fa-clock me-1"></i>${this.getRelativeTime(lastActive)}
                         </span>
                    </div>
                </div>
            </div>`;
        }).join('');
    },

    async loadLead(leadId) {
        // 1. Setup UI for Loading
        const lead = CRMService.leadsCache.find(l => l.LeadId === leadId);
        
        // Populate Header
        const header = document.getElementById('crmDetailHeader');
        header.style.setProperty('display', 'flex', 'important');
        
        document.getElementById('crmDetailTitle').textContent = lead.Title;
        document.getElementById('crmDetailCompany').innerHTML = `<i class="far fa-building me-1"></i> ${lead.Company || "No Company"}`;
        
        const statusBadge = document.getElementById('crmDetailStatus');
        statusBadge.textContent = lead.Status;
        statusBadge.className = 'badge align-self-center px-3 py-2 rounded-pill ' + 
            (lead.Status === 'Quoted' ? 'bg-warning text-dark' : 
             lead.Status === 'Closed' ? 'bg-success' : 
             lead.Status === 'In Progress' ? 'bg-info text-dark' : 'bg-secondary');

        // Show Loading State in Timeline
        const timelineContainer = document.getElementById('crmTimeline');
        timelineContainer.innerHTML = `
            <div class="d-flex flex-column align-items-center justify-content-center h-100 text-muted">
                <div class="spinner-border text-primary mb-3" role="status"></div>
                <div class="fw-bold">Loading Timeline</div>
                <div class="small text-muted opacity-75">Fetching events & emails...</div>
            </div>`;

        // 2. Fetch Data
        try {
            const items = await CRMService.getFullTimeline(lead);
            this.renderTimeline(items);
        } catch (e) {
            console.error(e);
            timelineContainer.innerHTML = `
                <div class="alert alert-danger m-4 shadow-sm border-0">
                    <h5 class="alert-heading"><i class="fas fa-exclamation-triangle me-2"></i>Error</h5>
                    <p class="mb-0">${e.message}</p>
                </div>`;
        }
    },

    renderTimeline(items) {
        const container = document.getElementById('crmTimeline');
        if (items.length === 0) {
            container.innerHTML = `
                <div class="d-flex flex-column align-items-center justify-content-center h-100 text-muted opacity-50">
                    <div class="bg-light rounded-circle p-4 mb-3">
                        <i class="fas fa-feather-alt fa-3x"></i>
                    </div>
                    <h5>Start the conversation</h5>
                    <p class="small">Add a note or link an email to begin.</p>
                </div>`;
            return;
        }

        // Build HTML
        const timelineHtml = items.map((item, index) => {
            const dateObj = item.date;
            const timeStr = dateObj.toLocaleTimeString([], { hour: '2-digit', minute:'2-digit' });
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
                                    <small class="text-muted" title="${dateObj.toLocaleString()}">${relativeTime}</small>
                                </div>
                                <h6 class="card-title text-dark fw-bold mb-1" style="font-size: 0.95rem;">${item.subject}</h6>
                                
                                <!-- Collapsible Body -->
                                <div id="${uniqueId}" class="collapse mt-2">
                                    <div class="p-2 bg-light rounded text-secondary small border-start border-2 border-primary" 
                                         style="white-space: pre-wrap; font-family: sans-serif;">${item.preview || "No preview available."}</div>
                                </div>
                                <div class="text-center mt-1">
                                    <i class="fas fa-chevron-down text-muted opacity-25" style="font-size: 0.7rem;"></i>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>`;
            } else {
                // Event / Note
                const isSystem = item.eventType === 'System';
                const icon = isSystem ? 'fa-cog' : 'fa-sticky-note';
                const iconColor = isSystem ? 'text-secondary' : 'text-warning';
                // Use a soft yellow/post-it look for notes, clean gray for system
                const cardBg = isSystem ? '#f8f9fa' : '#fffbeb'; 
                const cardBorder = isSystem ? 'border-light' : 'border-warning-subtle';

                return `
                <div class="d-flex mb-4 fade-in-up">
                    <div class="d-flex flex-column align-items-center me-3" style="min-width: 50px;">
                        <div class="timeline-icon-wrapper bg-white ${iconColor}">
                            <i class="fas ${icon}" style="font-size: 0.85rem;"></i>
                        </div>
                    </div>
                    <div class="flex-grow-1">
                        <div class="card border-0 shadow-sm ${cardBorder}" style="background-color: ${cardBg};">
                            <div class="card-body p-3">
                                 <div class="d-flex justify-content-between align-items-center mb-2">
                                    <span class="text-uppercase fw-bold text-muted" style="font-size:0.7rem; letter-spacing:0.5px;">${item.eventType}</span>
                                    <small class="text-muted" title="${dateObj.toLocaleString()}">${relativeTime}</small>
                                </div>
                                <div class="fw-semibold text-dark mb-1">${item.summary}</div>
                                ${item.details ? `<div class="small text-dark opacity-75" style="white-space: pre-wrap;">${item.details}</div>` : ''}
                            </div>
                        </div>
                    </div>
                </div>`;
            }
        }).join('');

        // Wrap in the container that adds the vertical line via CSS
        container.innerHTML = `<div class="crm-timeline-container pt-2 pb-5">${timelineHtml}</div>`;
    },
    
    // Toggle helper for the email cards
    toggleCollapse(id) {
        const el = document.getElementById(id);
        if (el) {
            // Using Bootstrap 5 collapse API if available, else simple class toggle
            if (window.bootstrap && window.bootstrap.Collapse) {
                // Check if instance exists
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
        const diff = Math.floor((now - date) / 1000); // seconds
        
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
                // Optimistic UI update could go here, but for safety we reload
                await CRMService.addEvent(CRMService.currentLead.LeadId, "Note", "User Note", note);
                this.loadLead(CRMService.currentLead.LeadId);
             } catch(e) {
                 alert("Failed: " + e.message);
             }
        }
    }
};

// Start
document.addEventListener('DOMContentLoaded', () => CRMView.init());