// ---------------------------------------------
// crmView.js
// Handles UI rendering for the CRM module with smooth inline editing and color-coded statuses
// ---------------------------------------------

const CRMView = {
    sortBy: 'recent', 
    currentTimelineItems: [], 
    currentEditCleanup: null, 

    SPARKLE_ICON: `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" fill="currentColor" class="bi bi-stars me-1 sparkle-anim" viewBox="0 0 16 16"><path d="M7.657 6.247c.11-.33.576-.33.686 0l.645 1.937a2.89 2.89 0 0 0 1.829 1.828l1.936.645c.33.11.33.576 0 .686l-1.937.645a2.89 2.89 0 0 0-1.828 1.829l-.645 1.936a.361.361 0 0 1-.686 0l-.645-1.937a2.89 2.89 0 0 0-1.828-1.828l-1.937-.645a.361.361 0 0 1 0-.686l1.937-.645a2.89 2.89 0 0 0 1.828-1.828l.645-1.937zM3.794 1.148a.217.217 0 0 1 .412 0l.387 1.162c.173.518.579.924 1.097 1.097l1.162.387a.217.217 0 0 1 0 .412l-1.162.387A1.734 1.734 0 0 0 4.593 5.69l-.387 1.162a.217.217 0 0 1-.412 0L3.407 5.69A1.734 1.734 0 0 0 2.31 4.593l-1.162-.387a.217.217 0 0 1 0-.412l1.162-.387A1.734 1.734 0 0 0 3.407 2.31l.387-1.162zM10.863.099a.145.145 0 0 1 .274 0l.258.774c.115.346.386.617.732.732l.774.258a.145.145 0 0 1 0 .274l-.774.258a1.156 1.156 0 0 0-.732.732l-.258.774a.145.145 0 0 1-.274 0l-.258-.774a1.156 1.156 0 0 0-.732-.732L9.1 2.137a.145.145 0 0 1 0-.274l.774-.258c.346-.115.617-.386.732-.732L10.863.1z"/></svg>`,

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

        document.addEventListener('mousedown', (e) => {
            const dd = document.getElementById('crmEditPartDropdown');
            if (dd && !e.target.closest('.crm-edit-dropdown') && !e.target.closest('#crmEditPartInput')) {
                dd.classList.remove('show');
            }
        });

        window.addEventListener('crm-smart-status-updated', () => {
            console.log("[View] Refreshing due to smart status update...");
            this.renderList();
            if (CRMService.currentLead) {
                const lead = CRMService.leadsCache.find(l => l.LeadId === CRMService.currentLead.LeadId);
                if (lead) this.renderHeaderActions(lead);
            }
        });
    },

    injectStyles() {
        if (document.getElementById('crm-custom-styles')) return;
        const style = document.createElement('style');
        style.id = 'crm-custom-styles';
        style.innerHTML = `
            .sparkle-anim { color: #fbbf24; }

            .crm-timeline-container { position: relative; padding-left: 20px; }
            .crm-timeline-container::before {
                content: ''; position: absolute; top: 0; bottom: 0; margin-top: 10px; margin-bottom: 80px;
                left: 35px; width: 0; border-left: 3.5px dotted #cbd5e1; z-index: 0;
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
            .crm-badge-waiting { background-color: #fef9c3 !important; color: #854d0e !important; } /* Waiting On Contact (Yellow) */
            .crm-badge-waiting-you { background-color: #fff7ed !important; color: #c2410c !important; border: 1px solid #fdba74 !important; } /* Waiting On You (Orange) */
            .crm-badge-action { background-color: #fee2e2 !important; color: #991b1b !important; } /* Action Required (Red) */
            .crm-badge-quotes { background-color: #e0f2fe !important; color: #0369a1 !important; }
            .crm-badge-closed { background-color: #f3f4f6 !important; color: #374151 !important; }

            .status-dropdown-item {
                display: flex; align-items: center; gap: 8px;
                padding: 8px 12px; font-weight: 500; font-size: 0.8rem;
                border-radius: 6px; margin: 2px 0; transition: background 0.2s;
            }
            .status-dropdown-item:hover { filter: brightness(0.95); }

            .lead-summary-field-box {
                position: relative; cursor: pointer; transition: all 0.2s;
                border: 1px solid #e2e8f0; border-radius: 6px; background: #f8fafc;
                min-height: 32px; display: flex; align-items: center;
                padding: 0 10px; font-weight: 600; color: #1e293b; font-size: 0.9rem;
            }
            .lead-summary-field-box:hover { border-color: #cbd5e1; background: #f1f5f9; }
            .lead-summary-field-box .edit-indicator {
                position: absolute; right: 8px; color: #94a3b8;
                font-size: 0.65rem; opacity: 0; transition: opacity 0.2s;
            }
            .lead-summary-field-box:hover .edit-indicator { opacity: 1; }

            .crm-edit-container {
                position: absolute; top: 0; left: 0; right: 0; bottom: 0;
                z-index: 10; background: white; border-radius: 6px;
                display: flex; align-items: center;
                box-shadow: 0 0 0 2px #3b82f6, 0 4px 6px -1px rgba(0,0,0,0.1);
            }
            .crm-edit-input-field {
                border: none; background: transparent; width: 100%; height: 100%;
                padding: 0 40px 0 10px; font-size: 0.9rem; font-weight: 600; outline: none;
            }
            #crmEditQtyInput::-webkit-outer-spin-button,
            #crmEditQtyInput::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
            #crmEditQtyInput { padding-right: 32px !important; }
            #crmEditQtyInput[type=number] { -moz-appearance: textfield; }            
            
            .crm-edit-actions { position: absolute; right: 5px; display: flex; gap: 2px; }
            .btn-crm-save, .btn-crm-cancel {
                border: none; background: none; padding: 4px; border-radius: 4px;
                cursor: pointer; transition: background 0.2s;
            }
            .btn-crm-save { color: #10b981; } .btn-crm-cancel { color: #ef4444; }
            .btn-crm-save:hover { background: #ecfdf5; } .btn-crm-cancel:hover { background: #fef2f2; }

            .crm-edit-dropdown {
                position: absolute; top: 100%; left: 0; right: 0;
                background: white; border: 1px solid #e2e8f0;
                border-radius: 8px; box-shadow: 0 10px 15px -3px rgba(0,0,0,0.1);
                z-index: 100; max-height: 220px; overflow-y: auto;
                margin-top: 5px; display: none;
            }
            .crm-edit-dropdown.show { display: block; }
            .crm-edit-dropdown .dropdown-item {
                padding: 10px 12px; font-size: 0.75rem; border-bottom: 1px solid #f1f5f9; cursor: pointer;
            }
            .crm-edit-dropdown .dropdown-item:hover { background: #f8fafc; }
            
            .recent-update-card {
                position: relative; background: #fffbeb; border-left: 4px solid #f6e05e !important;
                transition: all 0.2s ease; line-height: 1.6; padding-right: 40px !important;
            }
            .recent-update-summary { font-weight: 600; color: #1e293b; margin-bottom: 8px; font-size: 0.9rem; }
            .recent-update-details { color: #475569; font-size: 0.85rem; line-height: 1.6; }

            .note-composer {
                background: white; border: 2px solid #3b82f6; border-radius: 8px;
                padding: 12px; margin-bottom: 15px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); display: none;
            }
            .note-composer input {
                border: 1px solid #e2e8f0; border-radius: 6px; width: 100%;
                padding: 8px 10px; font-size: 0.85rem; outline: none; margin-bottom: 8px; font-weight: 600;
            }
            .note-composer textarea {
                border: 1px solid #e2e8f0; border-radius: 6px; width: 100%;
                resize: vertical; font-size: 0.85rem; outline: none; min-height: 70px; padding: 8px 10px;
            }

            .btn-add-note-ghost {
                position: absolute; top: 8px; right: 8px; width: 38px; height: 38px;
                cursor: pointer; display: flex; align-items: center; justify-content: center;
                border: none; outline: none; z-index: 10;
                background: transparent; border-radius: 8px; transition: all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
            }
            .btn-add-note-ghost:hover { background: white; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); transform: translateY(-1px); }

            .note-icon-stack { position: relative; display: flex; align-items: center; justify-content: center; width: 20px; height: 20px; pointer-events: none; }
            .note-icon-stack .fa-sticky-note { font-size: 1.4rem; color: #fbbf24; transition: color 0.2s; }
            .blocky-plus {
                position: absolute; top: -5px; right: -6px; width: 14px; height: 14px;
                background: #fffbeb;
                clip-path: polygon(35% 0%, 65% 0%, 65% 35%, 100% 35%, 100% 65%, 65% 65%, 65% 100%, 35% 100%, 35% 65%, 0% 65%, 0% 35%, 35% 35%);
                display: flex; align-items: center; justify-content: center; z-index: 2; transition: background 0.2s;
            }
            .btn-add-note-ghost:hover .blocky-plus { background: white; }
            .blocky-plus::after {
                content: ''; position: absolute; width: 10px; height: 10px; background: #f59e0b;
                clip-path: polygon(35% 0%, 65% 0%, 65% 35%, 100% 35%, 100% 65%, 65% 65%, 65% 100%, 35% 100%, 35% 65%, 0% 65%, 0% 35%, 35% 35%);
            }

            .quotes-btn-responsive { transition: transform 0.2s, opacity 0.2s; padding: 4px; border-radius: 6px; }
            .quotes-btn-responsive:active { transform: scale(0.95); opacity: 0.7; }

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
            
            // --- STATUS COLOR LOGIC ---
            let badgeClass = 'crm-badge-new';
            if (l.Status === 'Waiting On Contact') badgeClass = 'crm-badge-waiting';
            else if (l.Status === 'Waiting On You') badgeClass = 'crm-badge-waiting-you'; // New Orange Status
            else if (l.Status === 'Action Required') badgeClass = 'crm-badge-action';
            else if (l.Status === 'Sent To Quotes') badgeClass = 'crm-badge-quotes';
            else if (l.Status === 'Closed') badgeClass = 'crm-badge-closed';
            
            let statusIcon = '';
            let tooltip = '';
            if (l._isCalculated) {
                statusIcon = this.SPARKLE_ICON;
                tooltip = 'title="Status updated automatically" data-bs-toggle="tooltip"';
            }

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
                        <div class="d-flex gap-2 align-items-center">
                            <span class="badge ${badgeClass} text-uppercase d-flex align-items-center" ${tooltip} style="font-size: 0.6rem; padding: 4px 4px; border-radius: 8px;">
                                ${statusIcon}${l.Status}
                            </span>
                            <span class="text-muted" style="font-size: 0.65rem;">${l.PartNumber || ''}</span>
                        </div>
                        <span class="text-muted" style="font-size: 0.65rem;">${this.getRelativeTime(new Date(l.LastActivityAt))}</span>
                    </div>
                </div>
            </div>`;
        }).join('');
        
        document.querySelectorAll('[data-bs-toggle="tooltip"]').forEach(el => new bootstrap.Tooltip(el));
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

            // 2. Run the smart check
            // We pass 'items' so it can see if a dismissal event exists
            const suggestion = await CRMService.checkSampleSuggestions(lead, items);

            this.renderTimeline(items, suggestion);
            this.renderLeadSummary(lead, items);
        } catch (e) {
            document.getElementById('crmTimeline').innerHTML = `<div class="alert alert-danger m-4">${e.message}</div>`;
        }
    },

    renderLeadSummary(lead, timelineItems) {
        if (this.currentEditCleanup) {
            this.currentEditCleanup();
            this.currentEditCleanup = null;
        }

        const container = document.getElementById('crmLeadSummary');
        if (!container) return;

        const partNumber = (lead.PartNumber || "").trim();
        const estimatedValue = CRMService.calculateLeadValue(partNumber, lead.Quantity);
        const fmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
        
        let recentSummaryTitle = "No notes yet";
        let recentBodyMessage = "No specific notes found.";

        const latestNote = timelineItems.find(item => item.type === 'event' && item.eventType === 'Note');

        if (latestNote) {
            recentSummaryTitle = latestNote.summary;
            recentBodyMessage = latestNote.details;
        } else {
            const leadCreated = timelineItems.find(item => item.summary === 'Lead Created');
            recentSummaryTitle = "Lead Created";
            recentBodyMessage = leadCreated?.details || "Lead initialized.";
        }

        const linkedContacts = CRMService.anchorsCache.filter(a => a.LeadId === lead.LeadId);
        const contactsHtml = linkedContacts.length > 0 
            ? linkedContacts.map(c => {
                const email = c.Email || "Unknown";
                const initial = email.charAt(0).toUpperCase();
                const subject = encodeURIComponent(`Regarding: ${lead.Title}`);
                const outlookLink = `https://outlook.office.com/mail/deeplink/compose?to=${email}&subject=${subject}`;

                return `
                <div class="d-flex align-items-center justify-content-between p-2 mb-1 bg-white border rounded shadow-sm">
                    <div class="d-flex align-items-center overflow-hidden">
                        <div class="avatar-circle me-2 bg-light border" style="width: 24px; height: 24px; font-size: 0.65rem; color: #64748b;">
                            ${initial}
                        </div>
                        <span class="text-truncate small fw-medium text-dark" style="font-size: 0.85rem;" title="${email}">${email}</span>
                    </div>
                    <a href="${outlookLink}" target="_blank" class="btn btn-sm btn-link text-primary p-0 ms-2" title="Compose in Outlook Web">
                        <i class="fas fa-envelope"></i>
                    </a>
                </div>`;
            }).join('')
            : `<div class="text-muted small fst-italic px-1 mb-2">No linked contacts found.</div>`;


        container.innerHTML = `
            <div class="p-3">
                <div id="crmNoteComposer" class="note-composer fade-in-up">
                    <input type="text" id="crmNoteSummary" placeholder="Note title (optional)" value="User Note">
                    <textarea id="crmNoteInput" placeholder="Type your note here..."></textarea>
                    <div class="d-flex justify-content-end gap-2 mt-2">
                        <button class="btn btn-sm btn-link text-muted" onclick="CRMView.toggleNoteComposer(false)">Cancel</button>
                        <button class="btn btn-sm btn-primary px-3" id="crmSaveNoteBtn">
                            <i class="fas fa-check me-1"></i>Save Note
                        </button>
                    </div>
                </div>

                <div class="mb-4">
                    <div class="d-flex justify-content-between align-items-center mb-2">
                        <label class="small text-muted mb-0 d-block text-uppercase fw-bold" style="font-size:0.85rem;">Most Recent Update</label>
                    </div>
                    <div class="p-3 rounded shadow-sm recent-update-card">
                        <button class="btn-add-note-ghost" onclick="CRMView.toggleNoteComposer(true)" title="Add Note">
                            <div class="note-icon-stack">
                                <i class="fas fa-sticky-note"></i>
                                <div class="blocky-plus"></div>
                            </div>
                        </button>
                        
                        <div class="recent-update-summary">${latestNote ? latestNote.summary : 'No notes yet'}</div>
                        <div class="recent-update-details">${recentBodyMessage}</div>
                    </div>
                </div>

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

                <div class="mb-3">
                    <label class="small text-muted mb-1 d-block">Linked Contacts</label>
                    ${contactsHtml}
                </div>

                <div class="mt-4 pt-3 border-top">
                    <div class="d-flex justify-content-between align-items-center">
                        <small class="text-muted">Owner</small>
                        <small class="fw-semibold">${lead.Owner || 'Unassigned'}</small>
                    </div>
                </div>
            </div>
        `;

        const saveBtn = document.getElementById('crmSaveNoteBtn');
        if (saveBtn) {
            saveBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.submitInlineNote(e, lead.LeadId);
            });
        }
    },

    enterEditMode(leadId, field) {
        if (this.currentEditCleanup) {
            this.currentEditCleanup();
            this.currentEditCleanup = null;
        }

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

        const outsideClickHandler = (e) => {
            if (!e.target.closest('.crm-edit-container')) {
                this.renderLeadSummary(lead, this.currentTimelineItems);
            }
        };

        document.addEventListener('mousedown', outsideClickHandler);

        this.currentEditCleanup = () => {
            document.removeEventListener('mousedown', outsideClickHandler);
        };
    },

    async saveEdit(leadId, field) {
        if (this.currentEditCleanup) {
            this.currentEditCleanup();
            this.currentEditCleanup = null;
        }

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
            const container = document.getElementById(containerId);
            if(container) container.innerHTML = `<div class="p-2 text-center w-100"><div class="spinner-border spinner-border-sm text-primary"></div></div>`;
            
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
        
        // --- UPDATED STATUS BADGE MAPPING ---
        let badgeClass = 'crm-badge-new';
        if (lead.Status === 'Waiting On Contact') badgeClass = 'crm-badge-waiting';
        else if (lead.Status === 'Waiting On You') badgeClass = 'crm-badge-waiting-you';
        else if (lead.Status === 'Action Required') badgeClass = 'crm-badge-action';
        else if (lead.Status === 'Sent To Quotes') badgeClass = 'crm-badge-quotes';
        else if (lead.Status === 'Closed') badgeClass = 'crm-badge-closed';

        let statusIcon = '';
        if (lead._isCalculated) {
             statusIcon = this.SPARKLE_ICON;
        }

        actionContainer.innerHTML = `
            <div class="dropdown">
                <button class="badge ${badgeClass} dropdown-toggle text-uppercase px-3 py-2 rounded-pill fw-bold border-0 d-flex align-items-center" type="button" data-bs-toggle="dropdown">
                    ${statusIcon}${lead.Status}
                </button>
                <ul class="dropdown-menu dropdown-menu-end shadow-lg border-0 p-2" style="border-radius: 12px; min-width: 150px;">
                    <li><a class="dropdown-item status-dropdown-item crm-badge-new" onclick="CRMView.updateStatus('${lead.LeadId}', 'New Lead')">New Lead</a></li>
                    <li><a class="dropdown-item status-dropdown-item crm-badge-waiting-you" onclick="CRMView.updateStatus('${lead.LeadId}', 'Waiting On You')">Waiting On You</a></li>
                    <li><a class="dropdown-item status-dropdown-item crm-badge-waiting" onclick="CRMView.updateStatus('${lead.LeadId}', 'Waiting On Contact')">Waiting On Contact</a></li>
                    <li><a class="dropdown-item status-dropdown-item crm-badge-action" onclick="CRMView.updateStatus('${lead.LeadId}', 'Action Required')">Action Required</a></li>
                    <li><hr class="dropdown-divider"></li>
                    <li><a class="dropdown-item status-dropdown-item text-danger" onclick="CRMView.closeLeadConfirm('${lead.LeadId}')">Close Lead</a></li>
                </ul>
            </div>
            <button class="quotes-btn-responsive btn" onclick="CRMView.updateStatus('${lead.LeadId}', 'Sent To Quotes')" title="Send to Quotes">
                <img src="/EasySearchTests/static/leads-icon.png" style="width:24px; height:24px;">
            </button>
        `;
    },

    toggleNoteComposer(show) {
        const composer = document.getElementById('crmNoteComposer');
        if (!composer) return;
        composer.style.display = show ? 'block' : 'none';
        if (show) {
            document.getElementById('crmNoteInput').focus();
            const summaryInput = document.getElementById('crmNoteSummary');
            if (summaryInput) {
                setTimeout(() => summaryInput.select(), 50);
            }
        } else {
            document.getElementById('crmNoteSummary').value = 'User Note';
            document.getElementById('crmNoteInput').value = '';
        }
    },

    async submitInlineNote(event, leadId) {
        const summaryInput = document.getElementById('crmNoteSummary');
        const detailsInput = document.getElementById('crmNoteInput');
        
        const summary = summaryInput?.value.trim() || 'User Note';
        const details = detailsInput?.value.trim();
        
        if (!details) {
            alert('Please enter note details');
            return;
        }

        const btn = event?.currentTarget;
        const originalHTML = btn?.innerHTML;

        if (btn) {
            btn.disabled = true;
            btn.innerHTML = `<span class="spinner-border spinner-border-sm"></span>`;
        }

        try {
            await CRMService.addEvent(leadId, "Note", summary, details);
            this.toggleNoteComposer(false);
            this.loadLead(leadId); 
        } catch (e) {
            alert("Failed to save note: " + e.message);
            if (btn) {
                btn.disabled = false;
                if (originalHTML != null) btn.innerHTML = originalHTML;
            }
        }
    },

    async updateStatus(lId, s) { await CRMService.updateStatus(lId, s); this.loadLead(lId); this.renderList(); },
    async closeLeadConfirm(lId) { if (confirm("Close lead?")) this.updateStatus(lId, 'Closed'); },

    renderTimeline(items, suggestion = null) {
        const container = document.getElementById('crmTimeline');
        
        // --- 1. FILTER: Hide 'Suggestion Dismissed' events from view ---
        // We keep them in the database for logic, but hide them from the UI
        const visibleItems = items.filter(item => 
            !(item.eventType === 'System' && item.summary === 'Suggestion Dismissed')
        );

        let html = '';

        // --- 2. Render Smart Suggestion Card (if exists) ---
        if (suggestion) {
            const safeComp = suggestion.company.replace(/'/g, "\\'");
            const safeProd = suggestion.latestProduct.replace(/'/g, "\\'");
            const safeDate = suggestion.latestDate;
            const safeCount = suggestion.count;
            const leadId = CRMService.currentLead.LeadId;

            html += `
            <div class="fade-in-up mb-4">
                <div class="card border-primary" style="background-color: #f0f9ff; border: 1px dashed #3b82f6;">
                    <div class="card-body p-3">
                        <div class="d-flex gap-3">
                            <div class="text-primary pt-1">${this.SPARKLE_ICON}</div>
                            <div class="flex-grow-1">
                                <h6 class="fw-bold text-primary mb-1">Found ${safeCount} Samples for "${suggestion.company}"</h6>
                                <p class="small text-muted mb-2">
                                    Should this lead be linked to this history? <br>
                                    Last sample: <strong>${safeProd}</strong> on ${safeDate}.
                                </p>
                                <div class="d-flex gap-2">
                                    <button class="btn btn-sm btn-primary px-3" 
                                        onclick="CRMView.handleSuggestion('${leadId}', '${safeComp}', 'link', '${safeProd}', '${safeDate}', '${safeCount}')">
                                        <i class="fas fa-link me-1"></i> Link History
                                    </button>
                                    <button class="btn btn-sm btn-outline-secondary" 
                                        onclick="CRMView.handleSuggestion('${leadId}', '${safeComp}', 'dismiss')">
                                        Dismiss
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>`;
        }

        // --- 3. Check for Empty State (using visibleItems) ---
        if (visibleItems.length === 0 && !suggestion) { 
            container.innerHTML = `<div class="text-center mt-5 opacity-50"><h5>Start the conversation</h5></div>`; 
            return; 
        }

        // --- 4. Render Visible Timeline Items ---
        html += visibleItems.map((item, idx) => {
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
                                    <div class="p-2 bg-light small border-start border-primary text-break" style="border-width: 4px !important;">${item.preview || ""}</div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>`;
            } else {
                const isSys = item.eventType === 'System';
                const isSample = item.eventType === 'SampleSent'; // <--- Detect new type

                let icon = 'fa-sticky-note';
                let colorClass = 'text-warning'; 
                let bgClass = 'background:#fffbeb';

                if (isSys) {
                    icon = 'fa-cog';
                    colorClass = 'text-secondary';
                    bgClass = '';
                } else if (isSample) {
                    // --- NEW SAMPLE STYLING ---
                    icon = 'fa-vial'; // 'fa-vial' or 'fa-flask'
                    colorClass = 'text-info'; // Blue icon
                    bgClass = 'background:#f0f9ff; border: 1px solid #bae6fd;'; // Blue card
                }
                
                return `
                <div class="d-flex mb-4 fade-in-up">
                    <div class="me-3 flex-shrink-0" style="width: 34px;">
                        <div class="bg-white border rounded-circle p-2 ${colorClass} d-flex align-items-center justify-content-center" style="width: 34px; height: 34px; box-shadow: 0 2px 4px rgba(0,0,0,0.05);">
                            <i class="fas ${icon}"></i>
                        </div>
                    </div>
                    <div class="flex-grow-1">
                        <div class="card border-0 shadow-sm ${isSys ? 'bg-light' : ''}" style="${bgClass}">
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

    async handleSuggestion(leadId, company, action, prod, date, count) {
        const timelineContainer = document.getElementById('crmTimeline');
        timelineContainer.style.opacity = '0.5';

        try {
            if (action === 'dismiss') {
                await CRMService.dismissSuggestion(leadId, company);
                await this.loadLead(leadId); 
            } else {
                // 1. Send to server
                await CRMService.linkSample(leadId, { 
                    company, latestProduct: prod, latestDate: date, count 
                });

                // 2. OPTIMISTIC UPDATE (Instant Feedback)
                // We force this event into the top of the list immediately
                const fakeEvent = {
                    type: 'event',
                    eventType: 'SampleSent',
                    date: new Date(), // Set to NOW so it appears at the top as a "newly discovered" record
                    summary: `Sample: ${prod}`,
                    details: `Sent on ${date}`, // The text body contains the historical date
                    id: 'temp_' + Date.now()
                };

                this.currentTimelineItems.unshift(fakeEvent);
                
                // Re-render immediately (pass null to hide the suggestion card)
                this.renderTimeline(this.currentTimelineItems, null);
            }
        } catch (e) {
            console.error(e);
            alert("Action failed.");
        } finally {
            timelineContainer.style.opacity = '1';
        }
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