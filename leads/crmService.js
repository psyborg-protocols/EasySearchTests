// ---------------------------------------------
// crmService.js
// Abstraction layer for SharePoint Lists and Graph Email interactions
// With Delta Sync and Smart Status Batching
// ---------------------------------------------

const CRM_CONFIG = {
    SITE_ID: "brandywinematerialsllc.sharepoint.com,07a1465e-a31a-4437-aca2-0efe61b7f2c6,4b1abd1c-08c6-4574-b350-654376a1e954",
    LISTS: {
        LEADS: "28088675-4516-4e32-8766-ebb99cbb75e3",
        EVENTS: "fa306d38-3403-4c29-9db8-f73c4acd63b0",
        ANCHORS: "2af7b8ed-71c0-4bff-9d04-b3237d4dd388"
    },
    KEYS: {
        LEADS: "CRMLeadsData",
        ANCHORS: "CRMAnchorsData"
    },
    ZAPIER_WEBHOOK: "" // Add webhook URL here if needed
};

const CRMService = {
    // State
    leadsCache: [],
    anchorsCache: [], 
    deltaLink: null,
    anchorsDeltaLink: null,
    currentLead: null,

    // Synchronization Locks
    isInitialized: false,
    syncPromise: null,

    // --- 1. Centralized Initialization ---
    // Called by app.js on startup. Handles the "Cache First, Network Second" pattern.
    async init() {
        if (this.isInitialized) return;
        this.isInitialized = true;

        console.log("[CRM] Service initializing...");

        // Ensure msalInstance is available (it should be global from index.html)
        const account = msalInstance ? msalInstance.getActiveAccount() : null;
        
        // Store it on the service for easy access later
        this.currentUserEmail = account ? account.username : "";

        // A. Load Cache Immediately (Instant UI)
        await this._loadFromStorage(CRM_CONFIG.KEYS.LEADS, 'leadsCache', 'deltaLink');
        await this._loadFromStorage(CRM_CONFIG.KEYS.ANCHORS, 'anchorsCache', 'anchorsDeltaLink');
        
        // Notify View that cached data is ready to render (Badge check 1: Stale Data)
        window.dispatchEvent(new Event('crm-data-loaded'));

        // B. Trigger Background Sync (Fresh Data)
        this.getLeads()
            .then(() => {
                // SUCCESS: Fire event again so View updates badge with FRESH data (Badge check 2: Fresh Data)
                console.log("[CRM] Background sync complete. Refreshing UI.");
                window.dispatchEvent(new Event('crm-data-loaded'));
            })
            .catch(err => console.warn("[CRM] Background sync failed:", err));
    },

    // --- Business Logic / Calculations ---
    calculateLeadValue(partNumber, quantity) {
        const pn = (partNumber || "").trim();
        const qty = parseFloat(quantity) || 0;
        if (!pn || qty <= 0) return 0;

        let unitPrice = 0;
        const pricingData = window.dataStore?.["Pricing"]?.dataframe || [];
        const dbData = window.dataStore?.["DB"]?.dataframe || [];

        const pricingEntry = pricingData.find(row => String(row["Product"]).trim() === pn);
        if (pricingEntry) {
            unitPrice = parseFloat(pricingEntry["USER FB"]) || parseFloat(pricingEntry["USER HB"]) || 0;
        } 
        
        if (unitPrice === 0) {
            const dbEntry = dbData.find(row => String(row["PartNumber"]).trim() === pn);
            if (dbEntry) {
                const cost = parseFloat(dbEntry["UnitCost"]) || 0;
                unitPrice = cost * 1.4;
            }
        }

        return unitPrice * qty;
    },

    // --- Core Sync Operations with Promise Locking ---
    async getLeads() {
        // CASE 1: Sync is already running (e.g., triggered by init() or another tab click)
        // Return the EXISTING promise so the caller waits for the fresh result.
        if (this.syncPromise) {
            console.log("[CRM] Sync in progress... joining existing request.");
            return this.syncPromise; 
        }

        // CASE 2: Start new sync and save the promise (The Lock)
        this.syncPromise = (async () => {
            try {
                // Safety: Ensure cache is loaded if memory is empty
                if (this.leadsCache.length === 0) await this._loadFromStorage(CRM_CONFIG.KEYS.LEADS, 'leadsCache', 'deltaLink');
                if (this.anchorsCache.length === 0) await this._loadFromStorage(CRM_CONFIG.KEYS.ANCHORS, 'anchorsCache', 'anchorsDeltaLink');

                // 2. Sync with Graph (Delta)
                await Promise.allSettled([
                    this._syncWithGraph(CRM_CONFIG.LISTS.LEADS, 'leadsCache', 'deltaLink', CRM_CONFIG.KEYS.LEADS),
                    this._syncWithGraph(CRM_CONFIG.LISTS.ANCHORS, 'anchorsCache', 'anchorsDeltaLink', CRM_CONFIG.KEYS.ANCHORS)
                ]);

                // 3. Run Smart Check (Status updates based on emails)
                await this.runSmartStatusCheck().catch(err => console.error("[SmartStatus] Check failed:", err));

                return this.leadsCache;
            } finally {
                // UNLOCK: Clear the promise so next call can trigger a new sync
                this.syncPromise = null;
            }
        })();

        return this.syncPromise;
    },

    async _loadFromStorage(key, cacheProp, linkProp) {
        let stored = window.dataStore?.[key];
        if (!stored && window.idbUtil) stored = await idbUtil.getDataset(key);

        if (stored) {
            this[cacheProp] = stored.items || [];
            this[linkProp] = stored.deltaLink || null;
        }
    },

    async _syncWithGraph(listId, cacheProp, linkProp, storageKey) {
        const token = await getAccessToken();
        try {
            const { changes, deltaLink } = await spUtils.fetchListDelta(CRM_CONFIG.SITE_ID, listId, this[linkProp], token);

            if (changes.length > 0) {
                this._applyChanges(changes, cacheProp);
                if (deltaLink) this[linkProp] = deltaLink;
                await this._persistToStorage(storageKey, cacheProp, linkProp);
            }
        } catch (e) {
            if (e.message === "DELTA_EXPIRED") {
                this[linkProp] = null;
                this[cacheProp] = [];
                return this._syncWithGraph(listId, cacheProp, linkProp, storageKey);
            }
            throw e;
        }
    },

    _applyChanges(changes, cacheProp) {
        changes.forEach(item => {
            if (item["@removed"]) {
                this[cacheProp] = this[cacheProp].filter(l => l.itemId !== item.id);
            } else {
                const data = { itemId: item.id, ...item.fields };
                const index = this[cacheProp].findIndex(l => l.itemId === item.id);
                if (index > -1) this[cacheProp][index] = data;
                else this[cacheProp].push(data);
            }
        });
    },

    async _persistToStorage(key, cacheProp, linkProp) {
        if (!window.idbUtil) return;
        const payload = {
            items: this[cacheProp],
            deltaLink: this[linkProp],
            timestamp: new Date().toISOString()
        };
        if (!window.dataStore) window.dataStore = {};
        window.dataStore[key] = payload;
        await idbUtil.setDataset(key, payload);
    },

    // --- Smart Status Logic ---
    async runSmartStatusCheck() {
        console.log("[SmartStatus] Starting batch check...");
        const activeLeads = this.leadsCache;
        
        const batches = [];
        for (let i = 0; i < activeLeads.length; i += 20) {
            batches.push(activeLeads.slice(i, i + 20));
        }

        for (const batch of batches) {
            await this._processBatch(batch);
        }
    },

    async _processBatch(leads) {
        const token = await getAccessToken();
        const batchRequests = [];
        let batchUpdates = false; 

        // 1. Build Batch Requests to fetch emails
        leads.forEach((lead) => {
            // Skip smart status checks for leads that are already closed
            if (lead.Status === 'Closed') return;

            const anchors = this.anchorsCache.filter(a => a.LeadId === lead.LeadId);
            const emails = anchors
                .map(a => a.Email)
                .filter(e => e && e.includes('@'))
                .map(e => `participants:${e}`);

            if (emails.length === 0) return;

            const searchQuery = emails.join(' OR ');
            
            batchRequests.push({
                id: lead.LeadId,
                method: "GET",
                url: `/me/messages?$search="${searchQuery}"&$top=10&$select=receivedDateTime,from,toRecipients,sender,isDraft`,
                headers: { "Content-Type": "application/json" }
            });
        });

        if (batchRequests.length === 0) return;

        // 2. Execute Graph API Batch Request (Fetch latest emails)
        const result = await spUtils.executeGraphBatch(batchRequests, token);

        // 3. Process Responses
        if (result.responses) {
            for (const res of result.responses) {
                if (res.status !== 200) continue;

                const lead = this.leadsCache.find(l => l.LeadId === res.id);
                if (!lead) continue;

                const messages = res.body.value;
                if (!messages || messages.length === 0) continue;

                // Filter out draft emails
                const validMessages = messages.filter(m => m.isDraft !== true);
                if (validMessages.length === 0) continue;

                const latestMsg = validMessages[0]; 
                const msgDate = new Date(latestMsg.receivedDateTime);
                // Use existing Lead Date (fallback to 0 if null)
                const leadDate = new Date(lead.LastActivityAt || 0);

                // --- LOGIC START ---
                const myEmail = userAccount?.username?.toLowerCase() || "";
                const isMyEmail = (latestMsg.from?.emailAddress?.address || "").toLowerCase() === myEmail;

                let calculatedStatus = lead.Status; 
                let statusChanged = false;
                let dateChanged = false;
                
                // A) Did a NEW message arrive since last activity?
                if (msgDate > leadDate) {
                    lead.LastActivityAt = msgDate.toISOString(); 
                    dateChanged = true;
                    
                    // Set the base status based on who sent the latest email
                    calculatedStatus = isMyEmail ? 'Waiting On Contact' : 'Waiting On You'; 
                }

                // B) Escalation Logic (Streak-based)
                // Look back through the recent emails to find when the current sender's streak began
                let streakStartDate = msgDate;
                for (let i = 1; i < validMessages.length; i++) {
                    const msgSenderIsMe = (validMessages[i].from?.emailAddress?.address || "").toLowerCase() === myEmail;
                    if (msgSenderIsMe === isMyEmail) {
                        // Still the same sender, push the streak date further back
                        streakStartDate = new Date(validMessages[i].receivedDateTime);
                    } else {
                        // The other party replied, the streak ends here
                        break;
                    }
                }

                const now = new Date();
                const diffDays = (now - streakStartDate) / (1000 * 60 * 60 * 24);

                // Apply Escalation if the base status has been waiting longer than 7 days
                if ((calculatedStatus === 'Waiting On You' || calculatedStatus === 'Waiting On Contact') && diffDays > 7) {
                    calculatedStatus = 'Action Required';
                }

                // C) Apply Changes & Queue SharePoint Updates
                statusChanged = (lead.Status !== calculatedStatus);

                if (statusChanged || dateChanged) {
                    const spUpdates = {};

                    if (statusChanged) {
                        console.log(`[SmartStatus] Update for ${lead.Title}: ${lead.Status} -> ${calculatedStatus}`);
                        lead.Status = calculatedStatus; 
                        lead._isCalculated = true; // Sparkle icon applied ONLY on actual status change
                        spUpdates.Status = calculatedStatus;
                    }

                    if (dateChanged) {
                        spUpdates.LastActivityAt = lead.LastActivityAt;
                    }

                    // Queue the changes to push to SharePoint
                    batchRequests.push({
                        id: `update_${lead.LeadId}`,
                        method: "PATCH",
                        url: `/sites/${CRM_CONFIG.SITE_ID}/lists/${CRM_CONFIG.LISTS.LEADS}/items/${lead.itemId}`,
                        headers: { "Content-Type": "application/json" },
                        body: { fields: spUpdates }
                    });

                    batchUpdates = true;
                }
            } 
        }

        // 4. Trigger UI Update, execute SharePoint PATCH batch, and Save to Database ONCE
        if (batchUpdates) {
            // Execute the pending SharePoint updates
            const updateBatch = batchRequests.filter(req => req.id && String(req.id).startsWith('update_'));
            if (updateBatch.length > 0) {
                await spUtils.executeGraphBatch(updateBatch, token).catch(err => console.error("[SmartStatus] Failed to push batch to SharePoint:", err));
            }

            await this._persistToStorage(CRM_CONFIG.KEYS.LEADS, 'leadsCache', 'deltaLink');
            window.dispatchEvent(new Event('crm-smart-status-updated'));
        }
    },

    // --- Updates (Write Operations) ---
    async updateLeadActivity(leadId) {
        const lead = this.leadsCache.find(l => l.LeadId === leadId);
        if(!lead) return;
        const now = new Date().toISOString();
        const token = await getAccessToken();
        await spUtils.graphRequest(`https://graph.microsoft.com/v1.0/sites/${CRM_CONFIG.SITE_ID}/lists/${CRM_CONFIG.LISTS.LEADS}/items/${lead.itemId}`, "PATCH", {
            fields: { LastActivityAt: now }
        }, token);
        lead.LastActivityAt = now;
    },

    async updateLeadFields(leadId, updatedFields) {
        const lead = this.leadsCache.find(l => l.LeadId === leadId);
        if (!lead) return;

        const fieldsToUpdate = { ...updatedFields }; 
        const token = await getAccessToken();

        await spUtils.graphRequest(`https://graph.microsoft.com/v1.0/sites/${CRM_CONFIG.SITE_ID}/lists/${CRM_CONFIG.LISTS.LEADS}/items/${lead.itemId}`, "PATCH", { fields: fieldsToUpdate }, token);
        
        const summary = Object.keys(updatedFields).map(k => `${k}: ${updatedFields[k]}`).join(", ");
        await this.addEvent(leadId, "System", "Lead Updated", `Updated fields: ${summary}`);

        Object.assign(lead, fieldsToUpdate);
        await this._persistToStorage(CRM_CONFIG.KEYS.LEADS, 'leadsCache', 'deltaLink');
    },

    async updateStatus(leadId, newStatus) {
        const lead = this.leadsCache.find(l => l.LeadId === leadId);
        if (!lead) return;
        const now = new Date().toISOString();
        const token = await getAccessToken();

        // Check if we are re-opening a closed lead
        let eventType = "System";
        let summary = "Status Update";
        let details = `Status changed to: ${newStatus}`;

        if (lead.Status === 'Closed' && newStatus !== 'Closed') {
            summary = "Lead Re-opened";
            details = `Lead was re-opened and status set to: ${newStatus}`;
        }

        await spUtils.graphRequest(`https://graph.microsoft.com/v1.0/sites/${CRM_CONFIG.SITE_ID}/lists/${CRM_CONFIG.LISTS.LEADS}/items/${lead.itemId}`, "PATCH", {
            fields: { Status: newStatus, LastActivityAt: now }
        }, token);

        await this.addEvent(leadId, eventType, summary, details);

        lead.Status = newStatus;
        lead.LastActivityAt = now;
        delete lead._isCalculated;
        await this._persistToStorage(CRM_CONFIG.KEYS.LEADS, 'leadsCache', 'deltaLink');
    },

    /** Create New Lead logic
     * Handles both SharePoint record creation and Zapier webhook for "Ready for Quote" status
     */
    async createNewLead(data) {
        // Handle "Ready for Quote" via Zapier separately if needed
        if (data.status === "Ready for Quote") {
            await this._triggerZapierWorkflow(data);
            return;
        }

        await this._createSharePointLead(data);
    },

    async _createSharePointLead(data) {
        const token = await getAccessToken();
        const leadId = crypto.randomUUID(); // Browser native UUID
        const now = new Date().toISOString();
        const user = userAccount ? (userAccount.username) : "Unknown";

        // 1. Prepare Batch Requests
        const requests = [];

        // A. Create Lead Item
        requests.push({
            id: "1",
            method: "POST",
            url: `/sites/${CRM_CONFIG.SITE_ID}/lists/${CRM_CONFIG.LISTS.LEADS}/items`,
            headers: { "Content-Type": "application/json" },
            body: {
                fields: {
                    Title: data.subject,
                    LeadId: leadId,
                    Owner: user,
                    Company: data.company,
                    PartNumber: data.partNum,
                    Quantity: data.qty,
                    Status: data.status,
                    CreatedAt: now,
                    LastActivityAt: now
                }
            }
        });

        // B. Create Initial Event
        requests.push({
            id: "2",
            method: "POST",
            url: `/sites/${CRM_CONFIG.SITE_ID}/lists/${CRM_CONFIG.LISTS.EVENTS}/items`,
            headers: { "Content-Type": "application/json" },
            body: {
                fields: {
                    LeadId: leadId,
                    EventType: "System",
                    EventAt: now,
                    Summary: "Lead Created",
                    Details: data.message || `Manual Entry via App (Status: ${data.status})`
                }
            }
        });

        // C. Create Anchor (Contact Link) if email provided
        if (data.email) {
            requests.push({
                id: "3",
                method: "POST",
                url: `/sites/${CRM_CONFIG.SITE_ID}/lists/${CRM_CONFIG.LISTS.ANCHORS}/items`,
                headers: { "Content-Type": "application/json" },
                body: {
                    fields: {
                        Title: data.email,
                        LeadId: leadId,
                        Email: data.email,
                        FirstName: data.firstName || "",
                        LastName: data.lastName || "",
                        StartTrackingFrom: now
                    }
                }
            });
        }

        // 2. Execute Batch
        const result = await spUtils.executeGraphBatch(requests, token);
        
        const errors = result.responses.filter(r => r.status >= 400);
        if (errors.length > 0) {
            console.error("Batch creation failed:", errors);
            throw new Error("Failed to create lead records.");
        }

        // 3. Force Sync so it appears immediately
        await this.getLeads();
    },

    async _triggerZapierWorkflow(data) {
        if (!CRM_CONFIG.ZAPIER_WEBHOOK.includes('http')) return;
        
        const payload = {
            subject: `Quote Request: ${data.partNum} for ${data.company}`,
            company: data.company,
            partNumber: data.partNum,
            email: data.email,
            firstName: data.firstName,
            lastName: data.lastName,
            message: data.message,
            submittedAt: new Date().toISOString(),
            submittedBy: userAccount ? userAccount.username : "Unknown",
            status: data.status,
            source: "BrandyWise App"
        };

        // Fire and forget (Zapier catch hooks often return 200 immediately)
        try {
            await fetch(CRM_CONFIG.ZAPIER_WEBHOOK, {
                method: "POST",
                mode: "no-cors", // Likely needed for cross-origin webhooks
                headers: { "Content-Type": "text/plain" },
                body: JSON.stringify(payload)
            });
            console.log("Zapier webhook triggered.");
        } catch(e) {
            console.warn("Zapier trigger failed", e);
        }
    },

    /**
     * Checks for samples sent to companies with similar names.
     * Filters out any that have already been linked or dismissed in the timeline.
     */
    async checkSampleSuggestions(lead, currentTimelineEvents) {
        if (!lead || !lead.Company) return null;

        // 1. Get Samples from the data store defined in recentActivity.js
        const samples = window.dataStore?.["Samples"]?.dataframe || [];
        if (samples.length === 0) return null;

        // 2. Get unique company names from samples to match against
        // We set threshold to 0.4 (loose) to catch "Acme Corp" vs "Acme Inc"
        const uniqueCompanies = [...new Set(samples.map(s => s.Customer).filter(c => c))];
        const fuse = new Fuse(uniqueCompanies, { includeScore: true, threshold: 0.4 });
        
        // Search for the lead's company
        const matches = fuse.search(lead.Company);
        if (matches.length === 0) return null;

        // Take the best match
        const bestMatch = matches[0].item;
        
        // 3. CHECK HISTORY: Has this specific company been dismissed or linked before?
        // We look through the timeline events we just loaded for a "System" event marking this dismissal.
        const alreadyHandled = currentTimelineEvents.some(e => 
            e.eventType === 'System' && 
            (e.summary === 'Suggestion Dismissed' || e.summary === 'Sample Linked') &&
            e.details.includes(bestMatch) // The dismissal details will contain the company name
        );

        if (alreadyHandled) return null;

        // 4. Gather details for the suggestion card
        const companySamples = samples.filter(s => s.Customer === bestMatch);
        
        // Sort by date using the field name found in recentActivity.js
        companySamples.sort((a, b) => new Date(b["Customer order(date)"]) - new Date(a["Customer order(date)"]));
        
        const latest = companySamples[0];
        
        // Try to find a Product/Description field, fallback to generic if missing
        const product = latest["Product"] || latest["Item"] || latest["Description"] || "Unknown Item";

        return {
            company: bestMatch,
            count: companySamples.length,
            latestDate: latest["Customer order(date)"],
            latestProduct: product
        };
    },

    // Writes a persistent "System" event so the suggestion doesn't appear again
    async dismissSuggestion(leadId, companyName) {
        await this.addEvent(
            leadId, 
            "System", 
            "Suggestion Dismissed", 
            `Autosuggestion for samples to '${companyName}' was dismissed by user.`
        );
    },

    // Links the data via a Note
    async linkSample(leadId, suggestion) {
        await this.addEvent(
                leadId, 
                "SampleSent", 
                // Summary: Just the product name
                `Sample: ${suggestion.latestProduct}`, 
                // Details: Just the relevant fact (Date)
                `Sent on ${suggestion.latestDate}`
            );
    },


    // --- Timeline Data ---
    async getFullTimeline(lead) {
        this.currentLead = lead;
        const leadId = lead.LeadId;
        const token = await getAccessToken();

        // 1. Start the SharePoint Events Request immediately
        const eventsUrl = `https://graph.microsoft.com/v1.0/sites/${CRM_CONFIG.SITE_ID}/lists/${CRM_CONFIG.LISTS.EVENTS}/items?expand=fields&$filter=fields/LeadId eq '${leadId}'`;
        const eventsPromise = spUtils.graphRequest(eventsUrl, "GET", null, token);

        // 2. Start the Email Search Requests ONLY if the lead is active
        let emailPromises = [];
        
        if (lead.Status !== 'Closed') {
            const anchors = this.anchorsCache.filter(a => a.LeadId === leadId);
            
            emailPromises = anchors.map(async (a) => {
                if (!a.Email) return [];
                const email = a.Email.toLowerCase();
                const search = `participants:${email}`;
                const url = `https://graph.microsoft.com/v1.0/me/messages?$search="${search}"&$top=20&$select=id,subject,receivedDateTime,bodyPreview,from,isRead,conversationId,isDraft`;
                
                try {
                    const res = await spUtils.graphRequest(url, "GET", null, token);
                    return res.value
                        .filter(m => m.isDraft !== true)
                        .map(m => ({
                            type: "email",
                            date: new Date(m.receivedDateTime),
                            subject: m.subject,
                            preview: m.bodyPreview,
                            from: m.from?.emailAddress?.name || m.from?.emailAddress?.address || "Unknown",
                            isRead: m.isRead,
                            id: m.id,
                            conversationId: m.conversationId
                        }));
                } catch(e) { return []; }
            });
        }

        // 3. Await EVERYTHING together
        // We combine the events promise and the array of email promises
        const [eventsData, ...emailResults] = await Promise.all([
            eventsPromise,
            ...emailPromises
        ]);

        // 4. Process Events
        const timeline = eventsData.value.map(e => ({
            type: 'event',
            date: new Date(e.fields.EventAt),
            eventType: e.fields.EventType,
            summary: e.fields.Summary,
            details: e.fields.Details,
            id: e.id
        }));

        // 5. Process Emails (flatten the array of arrays)
        emailResults.forEach(arr => timeline.push(...arr));

        // 6. Sort and Dedupe
        const uniqueTimeline = Array.from(new Map(timeline.map(item => [item.id, item])).values());
        return uniqueTimeline.sort((a, b) => b.date - a.date);
    },

    async addEvent(leadId, type, summary, details) {
        const token = await getAccessToken();
        const payload = {
            fields: {
                LeadId: leadId,
                EventType: type,
                Summary: summary,
                Details: details || "",
                EventAt: new Date().toISOString()
            }
        };
        await spUtils.graphRequest(`https://graph.microsoft.com/v1.0/sites/${CRM_CONFIG.SITE_ID}/lists/${CRM_CONFIG.LISTS.EVENTS}/items`, "POST", payload, token);
    }
};