// ---------------------------------------------
// crmNewLead.js
// Handles the "Add New Lead" Modal UI, Autosuggest Logic, and Submission
// ---------------------------------------------

const CRMNewLead = {
    modalInstance: null,

    init() {
        // Wire up the button in index.html
        const btn = document.getElementById('crmAddLeadBtn');
        if (btn) {
            btn.addEventListener('click', () => this.open());
        }
    },

    open() {
        const modalEl = document.getElementById('crmNewLeadModal');
        const bodyEl = document.getElementById('crmNewLeadModalBody');
        if (!modalEl || !bodyEl) return;

        // Render the form HTML
        bodyEl.innerHTML = this.getFormHTML();
        
        // Inject styles specific to this form (converting Tailwind to scoped CSS)
        this.injectStyles();

        // Initialize Bootstrap Modal
        this.modalInstance = new bootstrap.Modal(modalEl);
        this.modalInstance.show();

        // Setup Logic
        this.setupStatusDropdown();
        this.setupPartsAutosuggest();
        this.setupCompanyAutosuggest();
        this.setupSubmitHandler();
    },

    getFormHTML() {
        return `
        <div class="flex flex-col overflow-hidden" style="background-color: #ffffff;">
            <!-- HEADER -->
            <div class="px-4 py-3 border-bottom bg-white d-flex justify-content-between items-center">
                <div class="position-relative">
                    <div id="nlStatusTrigger" class="status-trigger group d-flex align-items-center gap-2" style="cursor:pointer">
                        <span id="nlCurrentStatusText" class="fw-bold text-dark">New Lead</span>
                        <i class="fas fa-chevron-down text-muted small"></i>
                    </div>
                    
                    <!-- Custom Menu -->
                    <div id="nlStatusDropdownMenu" class="status-dropdown-menu" style="display:none;">
                        <div class="status-option active" data-value="New Lead" data-label="New Lead">
                            <div class="status-dot bg-success"></div> New Lead
                        </div>
                        <div class="status-option" data-value="Ready for Quote" data-label="Ready for Quote">
                            <div class="status-dot bg-info"></div> Ready for Quote
                        </div>
                    </div>
                </div>
                <div id="nlStatusDot" class="status-dot-lg bg-success shadow-sm"></div>
            </div>

            <div id="nlAlertBox" class="d-none mx-4 mt-3 alert alert-danger py-2 small mb-0"></div>

            <!-- FORM BODY -->
            <div class="flex-fill overflow-auto p-4">
                <form id="nlLeadForm" class="space-y-4">
                    <input type="hidden" id="nlLeadStatusValue" value="New Lead" />

                    <div>
                        <label class="section-label text-uppercase text-muted small fw-bold mb-2">Contact Details</label>
                        <div class="d-flex gap-3 mb-3">
                            <div class="input-group-custom w-50">
                                <input id="nlFirstName" type="text" class="field-custom with-icon" placeholder="First Name" />
                                <i class="fas fa-user input-icon"></i>
                            </div>
                            <div class="input-group-custom w-50">
                                <input id="nlLastName" type="text" class="field-custom" placeholder="Last Name" />
                            </div>
                        </div>
                        <div class="input-group-custom mb-3">
                            <input id="nlEmail" type="email" class="field-custom with-icon" placeholder="email@address.com" />
                            <i class="fas fa-envelope input-icon"></i>
                        </div>
                        <div class="input-group-custom mb-3 position-relative">
                            <input id="nlCompany" type="text" class="field-custom with-icon" placeholder="Company Name" autocomplete="off" />
                            <i class="fas fa-building input-icon"></i>
                            <div id="nlCompanyDropdown" class="autosuggest-dropdown"></div>
                        </div>
                        
                        <div class="d-flex gap-3">
                            <div class="input-group-custom w-75 position-relative">
                                <input id="nlPartNumber" type="text" class="field-custom with-icon" placeholder="Part #" autocomplete="off" />
                                <i class="fas fa-cube input-icon"></i>
                                <div id="nlPartsDropdown" class="autosuggest-dropdown"></div>
                            </div>
                            <div class="input-group-custom w-25">
                                <input id="nlQuantity" type="number" class="field-custom" placeholder="Qty" min="1" />
                            </div>
                        </div>
                    </div>

                    <div class="mt-4">
                        <label class="section-label text-uppercase text-muted small fw-bold mb-2">Context</label>
                        <div class="input-group-custom mb-3">
                            <input id="nlLeadSubject" type="text" class="field-custom with-icon fw-medium" placeholder="Subject Line" />
                            <i class="fas fa-heading input-icon"></i>
                        </div>
                        <div class="input-group-custom">
                            <textarea id="nlLeadMessage" rows="4" class="field-custom" style="min-height: 100px; padding-top: 10px;" placeholder="Add notes, requirements, or additional details..."></textarea>
                        </div>
                    </div>
                </form>
            </div>

            <!-- FOOTER -->
            <div class="p-4 border-top bg-light">
                <button id="nlSendBtn" type="button" class="btn btn-primary w-100 py-2 fw-medium shadow-sm d-flex align-items-center justify-content-center gap-2">
                    <span id="nlBtnText">Submit Lead</span>
                    <i id="nlBtnIcon" class="fa fa-plus"></i>
                    <div id="nlBtnSpinner" class="spinner-border spinner-border-sm text-white d-none" role="status"></div>
                </button>
                <div class="text-center mt-3"><span class="small text-muted fw-bold text-uppercase" style="font-size: 0.65rem; letter-spacing: 1px;">; ) HAVE A GREAT DAY</span></div>
            </div>
        </div>
        `;
    },

    injectStyles() {
        if (document.getElementById('nl-custom-styles')) return;
        const style = document.createElement('style');
        style.id = 'nl-custom-styles';
        style.innerHTML = `
            .input-group-custom { position: relative; }
            .input-icon {
                position: absolute; left: 12px; top: 50%; transform: translateY(-50%);
                color: #94a3b8; width: 16px; pointer-events: none; transition: color 0.2s; z-index: 5;
            }
            .field-custom {
                width: 100%; padding: 10px 12px; font-size: 0.9rem;
                color: #1e293b; background-color: #fff; border: 1px solid #e2e8f0;
                border-radius: 6px; transition: all 0.2s ease-in-out; outline: none;
            }
            .field-custom.with-icon { padding-left: 36px; }
            .field-custom:focus { border-color: #3b82f6; box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1); }
            .field-custom:focus + .input-icon { color: #3b82f6; }
            
            .status-dropdown-menu {
                position: absolute; top: 100%; left: 0; width: 180px; margin-top: 8px;
                background: white; border: 1px solid #e2e8f0; border-radius: 8px;
                box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1); z-index: 1050; overflow: hidden;
            }
            .status-option {
                padding: 10px 12px; font-size: 0.85rem; color: #334155;
                display: flex; align-items: center; gap: 10px; cursor: pointer;
            }
            .status-option:hover { background: #f8fafc; color: #0f172a; }
            .status-option.active { font-weight: 600; color: #2563eb; background: #eff6ff; }
            .status-dot { width: 8px; height: 8px; border-radius: 50%; }
            .status-dot-lg { width: 10px; height: 10px; border-radius: 50%; transition: background-color 0.3s; }
            
            .autosuggest-dropdown {
                display: none; position: absolute; top: 100%; left: 0; right: 0;
                max-height: 200px; overflow-y: auto; background: white; 
                border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 6px 6px;
                box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); z-index: 100;
            }
            .autosuggest-item {
                padding: 8px 12px; font-size: 0.85rem; cursor: pointer; border-bottom: 1px solid #f8fafc;
            }
            .autosuggest-item:hover { background-color: #f1f5f9; color: #2563eb; }
        `;
        document.head.appendChild(style);
    },

    setupStatusDropdown() {
        const trigger = document.getElementById("nlStatusTrigger");
        const menu = document.getElementById("nlStatusDropdownMenu");
        const options = document.querySelectorAll(".status-option");
        const hiddenInput = document.getElementById("nlLeadStatusValue");
        const textDisplay = document.getElementById("nlCurrentStatusText");
        const dot = document.getElementById("nlStatusDot");

        if (!trigger) return;

        trigger.onclick = (e) => {
            e.stopPropagation();
            menu.style.display = menu.style.display === 'block' ? 'none' : 'block';
        };

        // Close on outside click
        document.addEventListener('click', (e) => {
            if (menu && menu.style.display === 'block' && !trigger.contains(e.target)) {
                menu.style.display = 'none';
            }
        });

        options.forEach(opt => {
            opt.onclick = () => {
                const val = opt.getAttribute("data-value");
                const label = opt.getAttribute("data-label");
                
                hiddenInput.value = val;
                textDisplay.textContent = label;
                
                // Toggle classes
                options.forEach(o => o.classList.remove('active'));
                opt.classList.add('active');
                
                // Update header dot
                dot.className = val === 'New Lead' 
                    ? 'status-dot-lg bg-success shadow-sm' 
                    : 'status-dot-lg bg-info shadow-sm';
                
                menu.style.display = 'none';
            };
        });
    },

    setupPartsAutosuggest() {
        const input = document.getElementById("nlPartNumber");
        const dropdown = document.getElementById("nlPartsDropdown");
        const db = window.dataStore?.DB?.dataframe || [];

        const doFilter = () => {
            const val = input.value.trim().toLowerCase();
            if (val.length < 2) { dropdown.style.display = 'none'; return; }

            // Filter parts (limit 20)
            const matches = db.filter(p => 
                String(p.PartNumber).toLowerCase().includes(val) || 
                String(p.Description).toLowerCase().includes(val)
            ).slice(0, 20);

            if (matches.length > 0) {
                dropdown.innerHTML = matches.map(m => `
                    <div class="autosuggest-item" onclick="CRMNewLead.selectPart('${m.PartNumber}')">
                        <div class="fw-bold text-dark">${m.PartNumber}</div>
                        <div class="small text-muted text-truncate">${m.Description}</div>
                    </div>
                `).join('');
                dropdown.style.display = 'block';
            } else {
                dropdown.style.display = 'none';
            }
        };

        input.addEventListener('input', doFilter);
        input.addEventListener('focus', () => { if(input.value) doFilter(); });
        
        // Hide when clicking outside
        document.addEventListener('click', (e) => {
            if (!input.contains(e.target) && !dropdown.contains(e.target)) {
                dropdown.style.display = 'none';
            }
        });
    },

    selectPart(partNum) {
        document.getElementById("nlPartNumber").value = partNum;
        document.getElementById("nlPartsDropdown").style.display = 'none';
    },

    setupCompanyAutosuggest() {
        const input = document.getElementById("nlCompany");
        const dropdown = document.getElementById("nlCompanyDropdown");
        
        // Combine CompanyInfo keys and OrgContacts keys for source
        const contactsMap = window.dataStore?.OrgContacts || new Map();
        const infoMap = window.dataStore?.CompanyInfo?.dataframe || {};
        
        const companies = new Set([
            ...contactsMap.keys(),
            ...Object.keys(infoMap)
        ]);
        const companyList = Array.from(companies).sort();

        const doFilter = () => {
            const val = input.value.trim().toLowerCase();
            if (val.length < 2) { dropdown.style.display = 'none'; return; }

            const matches = companyList.filter(c => c.toLowerCase().includes(val)).slice(0, 10);
            
            if (matches.length > 0) {
                dropdown.innerHTML = matches.map(c => `
                    <div class="autosuggest-item text-capitalize" onclick="CRMNewLead.selectCompany('${c.replace(/'/g, "\\'")}')">
                        ${c}
                    </div>
                `).join('');
                dropdown.style.display = 'block';
            } else {
                dropdown.style.display = 'none';
            }
        };

        input.addEventListener('input', doFilter);
        document.addEventListener('click', (e) => {
            if (!input.contains(e.target) && !dropdown.contains(e.target)) {
                dropdown.style.display = 'none';
            }
        });
    },

    selectCompany(name) {
        document.getElementById("nlCompany").value = name; // Basic Title Case logic handled by CSS or backend
        document.getElementById("nlCompanyDropdown").style.display = 'none';

        // Attempt to auto-fill contact info from OrgContacts
        const contactsMap = window.dataStore?.OrgContacts;
        if (contactsMap && contactsMap.has(name.toLowerCase())) {
            const contacts = contactsMap.get(name.toLowerCase());
            // If there's exactly one contact, fill it
            if (contacts.length > 0) {
                const c = contacts[0];
                const fn = document.getElementById('nlFirstName');
                const ln = document.getElementById('nlLastName');
                const em = document.getElementById('nlEmail');
                
                // Only fill if empty
                if (!em.value && c.Email) em.value = c.Email;
                if ((!fn.value && !ln.value) && c.Name) {
                    const parts = c.Name.split(' ');
                    fn.value = parts[0];
                    if (parts.length > 1) ln.value = parts.slice(1).join(' ');
                }
            }
        }
    },

    setupSubmitHandler() {
        document.getElementById('nlSendBtn').onclick = async () => {
            const data = {
                firstName: document.getElementById('nlFirstName').value.trim(),
                lastName: document.getElementById('nlLastName').value.trim(),
                email: document.getElementById('nlEmail').value.trim(),
                company: document.getElementById('nlCompany').value.trim(),
                partNum: document.getElementById('nlPartNumber').value.trim(),
                qty: document.getElementById('nlQuantity').value.trim(),
                subject: document.getElementById('nlLeadSubject').value.trim(),
                message: document.getElementById('nlLeadMessage').value.trim(),
                status: document.getElementById('nlLeadStatusValue').value
            };

            const alertBox = document.getElementById('nlAlertBox');
            alertBox.classList.add('d-none');

            // Validation
            const missing = [];
            if (!data.company) missing.push("Company");
            if (!data.subject) missing.push("Subject");
            if (!data.partNum) missing.push("Part #");
            
            if (missing.length > 0) {
                alertBox.textContent = "Required: " + missing.join(", ");
                alertBox.classList.remove('d-none');
                return;
            }

            // Loading State
            const btn = document.getElementById('nlSendBtn');
            const txt = document.getElementById('nlBtnText');
            const spinner = document.getElementById('nlBtnSpinner');
            const icon = document.getElementById('nlBtnIcon');

            btn.disabled = true;
            txt.textContent = "Processing...";
            spinner.classList.remove('d-none');
            icon.classList.add('d-none');

            try {
                await CRMService.createNewLead(data);
                
                // Success
                this.modalInstance.hide();
                alert("Lead created successfully!");
                
                // Refresh list
                if (window.CRMView) window.CRMView.refreshList();

            } catch (err) {
                console.error(err);
                alertBox.textContent = "Error: " + err.message;
                alertBox.classList.remove('d-none');
            } finally {
                btn.disabled = false;
                txt.textContent = "Submit Lead";
                spinner.classList.add('d-none');
                icon.classList.remove('d-none');
            }
        };
    }
};

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => CRMNewLead.init());