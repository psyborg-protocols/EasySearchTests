// ---------------------------------------------
// crmView.js
// Handles UI rendering for the CRM module
// ---------------------------------------------

const CRMView = {
    init() {
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
                <div class="alert alert-danger m-3">
                    <i class="fas fa-exclamation-circle me-2"></i>
                    Error loading leads. <br>
                    <small>${e.message}</small>
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
            // Loose comparison to catch "User Name" vs "user@domain.com" variations if needed,
            // though standard Graph/SP usually returns display names. 
            // We assume Owner field in SP is text matching display name or email.
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

        // 2. Sort (Last Activity DESC - newest on top)
        leads.sort((a, b) => new Date(b.LastActivityAt) - new Date(a.LastActivityAt));

        // 3. Render
        if (leads.length === 0) {
            container.innerHTML = `
                <div class="text-center text-muted mt-5">
                    <i class="fas fa-filter fa-2x mb-3 opacity-25"></i>
                    <p>No leads found matching criteria.</p>
                </div>`;
            return;
        }

        container.innerHTML = leads.map(l => {
            const lastActive = new Date(l.LastActivityAt);
            const daysSince = (Date.now() - lastActive) / (1000 * 60 * 60 * 24);
            const isStale = daysSince > 14;
            
            // Stale Styling
            // If stale: Red border left, red "Stale" badge.
            // If fresh: Blue border left.
            const borderClass = isStale ? 'border-danger' : 'border-primary';
            const staleBadge = isStale ? '<span class="badge bg-danger ms-auto" style="font-size:0.65rem">Stale</span>' : '';
            
            // Status Badge Color
            let statusColor = 'bg-secondary';
            if (l.Status === 'In Progress') statusColor = 'bg-info text-dark';
            if (l.Status === 'Quoted') statusColor = 'bg-warning text-dark';
            if (l.Status === 'Closed') statusColor = 'bg-success';

            return `
            <div class="card mb-2 shadow-sm crm-lead-card border-start border-4 ${borderClass}" 
                 style="cursor:pointer; transition: transform 0.1s;" 
                 onclick="CRMView.loadLead('${l.LeadId}')"
                 onmouseover="this.style.transform='translateX(3px)'"
                 onmouseout="this.style.transform='translateX(0)'">
                <div class="card-body p-3">
                    <div class="d-flex align-items-center mb-1">
                        <h6 class="card-title mb-0 text-truncate fw-bold text-dark" style="max-width: 160px;">${l.Title}</h6>
                        ${staleBadge}
                    </div>
                    <div class="d-flex align-items-center gap-2 mb-2">
                         <span class="badge ${statusColor} fw-normal" style="font-size:0.7rem">${l.Status}</span>
                         <span class="small text-muted text-truncate" style="max-width: 100px;">${l.Company || ''}</span>
                    </div>
                    <div class="d-flex justify-content-between small text-muted" style="font-size:0.75rem">
                         <span><i class="far fa-clock me-1"></i> ${lastActive.toLocaleDateString()}</span>
                         <span>${l.Owner ? l.Owner.split(' ')[0] : ''}</span>
                    </div>
                </div>
            </div>`;
        }).join('');
    },

    async loadLead(leadId) {
        // 1. Setup UI for Loading
        const lead = CRMService.leadsCache.find(l => l.LeadId === leadId);
        
        // Show Header
        const header = document.getElementById('crmDetailHeader');
        header.style.setProperty('display', 'flex', 'important');
        
        document.getElementById('crmDetailTitle').textContent = lead.Title;
        document.getElementById('crmDetailCompany').textContent = lead.Company || "No Company Listed";
        
        const statusBadge = document.getElementById('crmDetailStatus');
        statusBadge.textContent = lead.Status;
        // Simple color mapping for badge
        statusBadge.className = 'badge align-self-center ' + 
            (lead.Status === 'Quoted' ? 'bg-warning text-dark' : 
             lead.Status === 'Closed' ? 'bg-success' : 'bg-secondary');

        // Show Spinner in Timeline
        const timelineContainer = document.getElementById('crmTimeline');
        timelineContainer.innerHTML = `
            <div class="d-flex flex-column align-items-center justify-content-center h-100 text-muted">
                <div class="spinner-border text-secondary mb-3" role="status"></div>
                <div>Compiling timeline...</div>
                <div class="small text-muted fst-italic mt-1">Fetching events & searching emails</div>
            </div>`;

        // 2. Fetch Data
        try {
            const items = await CRMService.getFullTimeline(lead);
            this.renderTimeline(items);
        } catch (e) {
            console.error(e);
            timelineContainer.innerHTML = `
                <div class="alert alert-danger m-4">
                    <strong>Error loading timeline</strong><br>
                    ${e.message}
                </div>`;
        }
    },

    renderTimeline(items) {
        const container = document.getElementById('crmTimeline');
        if (items.length === 0) {
            container.innerHTML = `
                <div class="d-flex flex-column align-items-center justify-content-center h-100 text-muted opacity-50">
                    <i class="far fa-folder-open fa-4x mb-3"></i>
                    <h4>No Activity Yet</h4>
                    <p>Add a note to start the timeline.</p>
                </div>`;
            return;
        }

        // Timeline HTML construction
        // We use a vertical line approach
        const html = items.map(item => {
            const dateObj = item.date;
            const dateStr = dateObj.toLocaleDateString([], { month: 'short', day: 'numeric' });
            const timeStr = dateObj.toLocaleTimeString([], { hour: '2-digit', minute:'2-digit' });
            
            if (item.type === 'email') {
                return `
                <div class="d-flex mb-4 fade-in-up">
                    <div class="d-flex flex-column align-items-center me-3" style="min-width: 50px;">
                        <div class="bg-primary text-white rounded-circle d-flex align-items-center justify-content-center shadow-sm" style="width: 32px; height: 32px; z-index:1;">
                            <i class="fas fa-envelope" style="font-size: 0.8rem;"></i>
                        </div>
                        <div class="h-100 bg-light border-start border-2 mt-1" style="width: 0px;"></div>
                    </div>
                    <div class="card border-0 shadow-sm flex-grow-1" style="background-color: #f0f7ff;">
                        <div class="card-body p-3">
                            <div class="d-flex justify-content-between align-items-center mb-2">
                                <span class="badge bg-primary bg-opacity-10 text-primary">Email</span>
                                <small class="text-muted">${dateStr} &bull; ${timeStr}</small>
                            </div>
                            <h6 class="card-title text-dark fw-bold mb-1">${item.subject}</h6>
                            <div class="d-flex align-items-center mb-2 text-muted small">
                                <i class="far fa-user-circle me-1"></i> ${item.from}
                            </div>
                            <p class="card-text text-secondary small mb-0 text-truncate">${item.preview}</p>
                        </div>
                    </div>
                </div>`;
            } else {
                // Event / Note
                const isSystem = item.eventType === 'System';
                const icon = isSystem ? 'fa-cog' : 'fa-comment-alt';
                const colorClass = isSystem ? 'secondary' : 'warning'; // Bootstrap colors
                const bgColor = isSystem ? '#f8f9fa' : '#fff9e6';
                
                return `
                <div class="d-flex mb-4 fade-in-up">
                    <div class="d-flex flex-column align-items-center me-3" style="min-width: 50px;">
                        <div class="bg-${colorClass} text-white rounded-circle d-flex align-items-center justify-content-center shadow-sm" style="width: 32px; height: 32px; z-index:1;">
                            <i class="fas ${icon}" style="font-size: 0.8rem;"></i>
                        </div>
                        <div class="h-100 bg-light border-start border-2 mt-1" style="width: 0px;"></div>
                    </div>
                    <div class="card border-0 shadow-sm flex-grow-1" style="background-color: ${bgColor};">
                        <div class="card-body p-3">
                             <div class="d-flex justify-content-between align-items-center mb-2">
                                <span class="badge bg-${colorClass} bg-opacity-25 text-dark border border-${colorClass} border-opacity-25">${item.eventType}</span>
                                <small class="text-muted">${dateStr} &bull; ${timeStr}</small>
                            </div>
                            <div class="fw-bold text-dark">${item.summary}</div>
                            ${item.details ? `<div class="small mt-2 text-dark" style="white-space: pre-wrap;">${item.details}</div>` : ''}
                        </div>
                    </div>
                </div>`;
            }
        }).join('');

        container.innerHTML = `<div class="pt-2 pb-5">${html}</div>`;
    },
    
    // Simple Prompt for Note
    async openAddNoteModal() {
        if(!CRMService.currentLead) return;
        
        // We can do a sleek prompt or use a hidden modal in HTML. 
        // For simplicity and speed, a JS prompt acts as a functional v1.
        // A better UX would be to inject a textarea into the timeline top.
        
        // Let's create a dynamic modal on the fly to avoid cluttering index.html too much
        const note = prompt("Add a note to this timeline:");
        
        if(note && note.trim().length > 0) {
             // Show optimistic UI update or spinner?
             // We'll just reload the lead which triggers the spinner.
             
             try {
                await CRMService.addEvent(CRMService.currentLead.LeadId, "Note", "User Note", note);
                // Refresh
                this.loadLead(CRMService.currentLead.LeadId);
             } catch(e) {
                 alert("Failed to save note: " + e.message);
             }
        }
    }
};

// Start
document.addEventListener('DOMContentLoaded', () => CRMView.init());