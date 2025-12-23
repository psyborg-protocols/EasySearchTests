// ---------------------------------------------
// crmService.js
// Abstraction layer for SharePoint Lists and Graph Email interactions
// Now with Delta Query support for efficient syncing
// ---------------------------------------------

const CRM_CONFIG = {
    SITE_ID: "brandywinematerialsllc.sharepoint.com,07a1465e-a31a-4437-aca2-0efe61b7f2c6,4b1abd1c-08c6-4574-b350-654376a1e954",
    LISTS: {
        LEADS: "28088675-4516-4e32-8766-ebb99cbb75e3",
        EVENTS: "fa306d38-3403-4c29-9db8-f73c4acd63b0",
        ANCHORS: "2af7b8ed-71c0-4bff-9d04-b3237d4dd388"
    },
    STORAGE_KEY: "CRMLeadsData"
};

const CRMService = {
    leadsCache: [],
    deltaLink: null,
    currentLead: null,

    // --- Helpers ---
    async _graphRequest(url, method = "GET", body = null, extraHeaders = null) {
        const token = await getAccessToken(); 
        const headers = {
            "Authorization": `Bearer ${token}`,
            "Accept": "application/json",
        };

        if (body != null) headers["Content-Type"] = "application/json";
        if (extraHeaders) Object.assign(headers, extraHeaders);

        const res = await fetch(url, {
            method,
            headers,
            body: body != null ? JSON.stringify(body) : undefined
        });

        // Handle Delta Link Expiry (410 Gone)
        if (res.status === 410) {
            console.warn("[CRM] Delta token expired. Forcing full resync.");
            throw new Error("DELTA_EXPIRED");
        }

        if (!res.ok) {
            const text = await res.text().catch(() => "");
            throw new Error(`[Graph] ${res.status} ${res.statusText} :: ${text}`);
        }
        return await res.json();
    },

    // --- Business Logic / Calculations ---
    calculateLeadValue(partNumber, quantity) {
        const pn = (partNumber || "").trim();
        const qty = parseFloat(quantity) || 0;
        if (!pn || qty <= 0) return 0;

        let unitPrice = 0;
        const pricingData = window.dataStore?.["Pricing"]?.dataframe || [];
        const dbData = window.dataStore?.["DB"]?.dataframe || [];

        // 1. Check Pricing Data
        const pricingEntry = pricingData.find(row => String(row["Product"]).trim() === pn);
        if (pricingEntry) {
            unitPrice = parseFloat(pricingEntry["USER FB"]) || parseFloat(pricingEntry["USER HB"]) || 0;
        } 
        
        // 2. Fallback to DB UnitCost x 1.4 markup
        if (unitPrice === 0) {
            const dbEntry = dbData.find(row => String(row["PartNumber"]).trim() === pn);
            if (dbEntry) {
                const cost = parseFloat(dbEntry["UnitCost"]) || 0;
                unitPrice = cost * 1.4;
            }
        }

        return unitPrice * qty;
    },

    // --- Leads Operations ---
    
    /**
     * Primary method to get leads. 
     * 1. Loads from cache if available.
     * 2. Triggers a delta sync with Microsoft Graph.
     * 3. Updates cache and persists to IDB.
     */
    async getLeads() {
        // 1. Load from IDB/Global Store if memory is empty
        if (this.leadsCache.length === 0) {
            await this._loadFromStorage();
        }

        // 2. Perform Delta Sync
        try {
            await this._syncWithGraph();
        } catch (error) {
            console.error("[CRM] Sync failed:", error);
            // If sync fails (e.g., network), we still return the cached data we have
        }

        return this.leadsCache;
    },

    /**
     * Loads the initial state from IndexedDB (via window.dataStore if populated by app.js, or directly)
     */
    async _loadFromStorage() {
        // Check if app.js already populated dataStore
        let stored = window.dataStore?.[CRM_CONFIG.STORAGE_KEY];
        
        // If not in memory, try fetching from IDB directly
        if (!stored && window.idbUtil) {
            stored = await idbUtil.getDataset(CRM_CONFIG.STORAGE_KEY);
        }

        if (stored) {
            this.leadsCache = stored.items || [];
            this.deltaLink = stored.deltaLink || null;
            console.log(`[CRM] Loaded ${this.leadsCache.length} leads from cache.`);
        }
    },

    /**
     * Executes the Delta Query loop
     */
    async _syncWithGraph() {
        let nextUrl = this.deltaLink;
        
        // If no delta link, start a fresh delta query
        if (!nextUrl) {
            nextUrl = `https://graph.microsoft.com/v1.0/sites/${CRM_CONFIG.SITE_ID}/lists/${CRM_CONFIG.LISTS.LEADS}/items/delta?expand=fields`;
            console.log("[CRM] Starting full sync (no delta token)...");
        } else {
            console.log("[CRM] Starting delta sync...");
        }

        let changes = [];
        let newDeltaLink = null;
        let hasMore = true;

        try {
            while (hasMore) {
                // Determine if we need to add headers (only for initial request if not using a nextLink/deltaLink)
                // Actually, delta links encode the headers, so we just call the URL.
                const data = await this._graphRequest(nextUrl);

                changes.push(...data.value);

                if (data["@odata.deltaLink"]) {
                    newDeltaLink = data["@odata.deltaLink"];
                    hasMore = false;
                } else if (data["@odata.nextLink"]) {
                    nextUrl = data["@odata.nextLink"];
                } else {
                    // Should not happen in standard delta flow, but safety break
                    hasMore = false;
                }
            }
        } catch (e) {
            if (e.message === "DELTA_EXPIRED") {
                this.deltaLink = null;
                this.leadsCache = []; // Clear cache to prevent duplicates on full resync
                return this._syncWithGraph(); // Recursive retry (Fresh Sync)
            }
            throw e;
        }

        if (changes.length > 0) {
            this._applyChanges(changes);
            console.log(`[CRM] Synced ${changes.length} changes.`);
        } else {
            console.log("[CRM] No changes found.");
        }

        // Save new state
        if (newDeltaLink) {
            this.deltaLink = newDeltaLink;
            await this._persistToStorage();
        }
    },

    /**
     * Merges changes into the local cache
     */
    _applyChanges(changes) {
        changes.forEach(item => {
            if (item["@removed"]) {
                // Remove item from cache
                this.leadsCache = this.leadsCache.filter(l => l.itemId !== item.id);
            } else {
                // Map Graph item to our flat structure
                // Note: 'fields' contains the custom columns
                const leadData = {
                    itemId: item.id,
                    ...item.fields
                };

                // Upsert (Update or Insert)
                const index = this.leadsCache.findIndex(l => l.itemId === item.id);
                if (index > -1) {
                    this.leadsCache[index] = leadData;
                } else {
                    this.leadsCache.push(leadData);
                }
            }
        });
    },

    async _persistToStorage() {
        if (!window.idbUtil) return;
        
        const payload = {
            items: this.leadsCache,
            deltaLink: this.deltaLink,
            timestamp: new Date().toISOString()
        };

        // Update Global Store
        if (!window.dataStore) window.dataStore = {};
        window.dataStore[CRM_CONFIG.STORAGE_KEY] = payload;

        // Persist to IDB
        await idbUtil.setDataset(CRM_CONFIG.STORAGE_KEY, payload);
    },

    // --- Updates (Write Operations) ---
    // These methods update the server AND the local cache immediately to maintain UI responsiveness

    async updateLeadActivity(leadId) {
        const lead = this.leadsCache.find(l => l.LeadId === leadId);
        if(!lead) return;

        const url = `https://graph.microsoft.com/v1.0/sites/${CRM_CONFIG.SITE_ID}/lists/${CRM_CONFIG.LISTS.LEADS}/items/${lead.itemId}`;
        await this._graphRequest(url, "PATCH", {
            fields: { LastActivityAt: new Date().toISOString() }
        });
        // We don't necessarily need to re-fetch here; the next sync will catch the timestamp update if needed.
        // But updating local cache keeps UI fresh:
        lead.LastActivityAt = new Date().toISOString();
    },

    async updateLeadFields(leadId, updatedFields) {
        const lead = this.leadsCache.find(l => l.LeadId === leadId);
        if (!lead) return;

        const url = `https://graph.microsoft.com/v1.0/sites/${CRM_CONFIG.SITE_ID}/lists/${CRM_CONFIG.LISTS.LEADS}/items/${lead.itemId}`;
        const timestamp = new Date().toISOString();
        
        const fieldsToUpdate = { 
            ...updatedFields,
            LastActivityAt: timestamp
        };

        await this._graphRequest(url, "PATCH", { fields: fieldsToUpdate });

        // Log the change
        const summary = Object.keys(updatedFields).map(k => `${k}: ${updatedFields[k]}`).join(", ");
        await this.addEvent(leadId, "System", "Lead Updated", `Updated fields: ${summary}`);

        // Update local cache immediately
        Object.assign(lead, fieldsToUpdate);
        await this._persistToStorage(); // Save changes to IDB so they survive reload
    },

    async updateStatus(leadId, newStatus) {
        const lead = this.leadsCache.find(l => l.LeadId === leadId);
        if (!lead) return;

        const url = `https://graph.microsoft.com/v1.0/sites/${CRM_CONFIG.SITE_ID}/lists/${CRM_CONFIG.LISTS.LEADS}/items/${lead.itemId}`;
        const timestamp = new Date().toISOString();
        
        await this._graphRequest(url, "PATCH", {
            fields: { 
                Status: newStatus,
                LastActivityAt: timestamp
            }
        });

        await this.addEvent(leadId, "System", "Status Update", `Status changed to: ${newStatus}`);

        lead.Status = newStatus;
        lead.LastActivityAt = timestamp;
        await this._persistToStorage();
    },

    // --- Timeline Data (Existing Logic) ---
    async getFullTimeline(lead) {
        this.currentLead = lead;
        const leadId = lead.LeadId;

        const eventsUrl = `https://graph.microsoft.com/v1.0/sites/${CRM_CONFIG.SITE_ID}/lists/${CRM_CONFIG.LISTS.EVENTS}/items?expand=fields&$filter=fields/LeadId eq '${leadId}'`;
        const eventsPromise = this._graphRequest(eventsUrl);

        const anchorsUrl = `https://graph.microsoft.com/v1.0/sites/${CRM_CONFIG.SITE_ID}/lists/${CRM_CONFIG.LISTS.ANCHORS}/items?expand=fields&$filter=fields/LeadId eq '${leadId}'`;
        const anchorsPromise = this._graphRequest(anchorsUrl);

        const [eventsData, anchorsData] = await Promise.all([eventsPromise, anchorsPromise]);

        const timeline = eventsData.value.map(e => ({
            type: 'event',
            date: new Date(e.fields.EventAt),
            eventType: e.fields.EventType,
            summary: e.fields.Summary,
            details: e.fields.Details,
            id: e.id
        }));
        
        if (anchorsData.value.length > 0) {
            const toLower = (s) => (s || "").toLowerCase();
            const addrList = (recips) =>
                (Array.isArray(recips) ? recips : [])
                .map(r => toLower(r?.emailAddress?.address))
                .filter(Boolean);

            const fetchAllPages = async (firstUrl, extraHeaders = null, maxPages = 4) => {
                const out = [];
                let url = firstUrl;
                for (let page = 0; url && page < maxPages; page++) {
                const data = await this._graphRequest(url, "GET", null, extraHeaders);
                out.push(...(data?.value || []));
                url = data?.["@odata.nextLink"] || null;
                }
                return out;
            };

            const emailPromises = anchorsData.value.map(async (anchor) => {
                const a = anchor.fields;
                const fetchPromises = [];

                if (a.ConversationId) {
                    const filter = `conversationId eq '${a.ConversationId}'`;
                    const url = `https://graph.microsoft.com/v1.0/me/messages?$select=id,subject,receivedDateTime,bodyPreview,from,isRead,conversationId&$top=25&$filter=${encodeURIComponent(filter)}`;
                    fetchPromises.push(this._graphRequest(url).then(d => d.value || []).catch(() => []));
                }

                if (a.Email) {
                    const thirdParty = toLower(a.Email);
                    let startDate = a.StartTrackingFrom ? new Date(a.StartTrackingFrom) : null;
                    if (!startDate || isNaN(startDate.getTime())) {
                        startDate = new Date();
                        startDate.setDate(startDate.getDate() - 30);
                    }
                    const sinceIso = startDate.toISOString();

                    // Inbox
                    const inboxFilter = `receivedDateTime ge ${sinceIso} and from/emailAddress/address eq '${thirdParty}'`;
                    fetchPromises.push(fetchAllPages(`https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages?$select=id,subject,receivedDateTime,bodyPreview,from,toRecipients,ccRecipients,isRead,conversationId&$orderby=receivedDateTime desc&$top=50&$filter=${encodeURIComponent(inboxFilter)}`).catch(() => []));

                    // Sent
                    const sentFilter = `receivedDateTime ge ${sinceIso}`;
                    fetchPromises.push(fetchAllPages(`https://graph.microsoft.com/v1.0/me/mailFolders/sentitems/messages?$select=id,subject,receivedDateTime,bodyPreview,from,toRecipients,ccRecipients,isRead,conversationId&$orderby=receivedDateTime desc&$top=50&$filter=${encodeURIComponent(sentFilter)}`)
                        .then(sentAll => sentAll.filter(m => {
                            const to = addrList(m.toRecipients);
                            const cc = addrList(m.ccRecipients);
                            return to.includes(thirdParty) || cc.includes(thirdParty);
                        }))
                        .catch(() => []));
                }

                const results = await Promise.all(fetchPromises);
                const rawMessages = results.flat();
                const byId = new Map();
                for (const m of rawMessages) if (m?.id) byId.set(m.id, m);
                
                return [...byId.values()].map(m => ({
                    type: "email",
                    date: new Date(m.receivedDateTime),
                    subject: m.subject,
                    preview: m.bodyPreview,
                    from: m.from?.emailAddress?.name || m.from?.emailAddress?.address || "Unknown",
                    isRead: m.isRead,
                    id: m.id,
                    conversationId: m.conversationId
                }));
            });

            const emailResults = await Promise.all(emailPromises);
            emailResults.forEach(arr => timeline.push(...arr));
        }

        const uniqueTimeline = Array.from(new Map(timeline.map(item => [item.id, item])).values());
        return uniqueTimeline.sort((a, b) => b.date - a.date);
    },

    async addEvent(leadId, type, summary, details) {
        const payload = {
            fields: {
                LeadId: leadId,
                EventType: type,
                Summary: summary,
                Details: details || "",
                EventAt: new Date().toISOString()
            }
        };
        await this._graphRequest(`https://graph.microsoft.com/v1.0/sites/${CRM_CONFIG.SITE_ID}/lists/${CRM_CONFIG.LISTS.EVENTS}/items`, "POST", payload);
        await this.updateLeadActivity(leadId);
    }
};