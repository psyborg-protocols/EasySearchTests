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
    }
};

const CRMService = {
    leadsCache: [],
    anchorsCache: [], // Cache for email anchors
    deltaLink: null,
    anchorsDeltaLink: null,
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

    // --- Core Sync Operations ---
    async getLeads() {
        if (this.leadsCache.length === 0) await this._loadFromStorage(CRM_CONFIG.KEYS.LEADS, 'leadsCache', 'deltaLink');
        if (this.anchorsCache.length === 0) await this._loadFromStorage(CRM_CONFIG.KEYS.ANCHORS, 'anchorsCache', 'anchorsDeltaLink');

        // Sync both
        await Promise.allSettled([
            this._syncWithGraph(CRM_CONFIG.LISTS.LEADS, 'leadsCache', 'deltaLink', CRM_CONFIG.KEYS.LEADS),
            this._syncWithGraph(CRM_CONFIG.LISTS.ANCHORS, 'anchorsCache', 'anchorsDeltaLink', CRM_CONFIG.KEYS.ANCHORS)
        ]);

        // After sync, run the Smart Status Check in the background
        this.runSmartStatusCheck().catch(err => console.error("[SmartStatus] Check failed:", err));

        return this.leadsCache;
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
        let nextUrl = this[linkProp];
        if (!nextUrl) nextUrl = `https://graph.microsoft.com/v1.0/sites/${CRM_CONFIG.SITE_ID}/lists/${listId}/items/delta?expand=fields`;

        let changes = [];
        let newDeltaLink = null;
        let hasMore = true;

        try {
            while (hasMore) {
                const data = await this._graphRequest(nextUrl);
                changes.push(...data.value);

                if (data["@odata.deltaLink"]) {
                    newDeltaLink = data["@odata.deltaLink"];
                    hasMore = false;
                } else if (data["@odata.nextLink"]) {
                    nextUrl = data["@odata.nextLink"];
                } else {
                    hasMore = false;
                }
            }
        } catch (e) {
            if (e.message === "DELTA_EXPIRED") {
                this[linkProp] = null;
                this[cacheProp] = [];
                return this._syncWithGraph(listId, cacheProp, linkProp, storageKey);
            }
            throw e;
        }

        if (changes.length > 0) {
            this._applyChanges(changes, cacheProp);
            if (newDeltaLink) this[linkProp] = newDeltaLink;
            await this._persistToStorage(storageKey, cacheProp, linkProp);
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
        const activeLeads = this.leadsCache.filter(l => l.Status !== 'Closed');
        
        // Group leads into batches of 20 (Graph Batch Limit)
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

        leads.forEach((lead) => {
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
                // CHANGED: Added 'isDraft' to $select
                url: `/me/messages?$search="${searchQuery}"&$top=10&$select=receivedDateTime,from,toRecipients,sender,isDraft`,
                headers: { "Content-Type": "application/json" }
            });
        });

        if (batchRequests.length === 0) return;

        const response = await fetch("https://graph.microsoft.com/v1.0/$batch", {
            method: "POST",
            headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
            body: JSON.stringify({ requests: batchRequests })
        });
        const result = await response.json();

        if (result.responses) {
            for (const res of result.responses) {
                if (res.status !== 200) continue;

                const lead = this.leadsCache.find(l => l.LeadId === res.id);
                if (!lead) continue;

                const messages = res.body.value;
                if (messages && messages.length > 0) {
                    // CHANGED: Filter out drafts before picking the latest message
                    const validMessages = messages.filter(m => m.isDraft !== true);
                    
                    if (validMessages.length > 0) {
                        const latestMsg = validMessages[0]; // Assuming Graph returns newest first (default rank), otherwise sort
                        const msgDate = new Date(latestMsg.receivedDateTime);
                        const leadDate = new Date(lead.LastActivityAt || 0);

                        // If message is NEWER than the last known CRM activity/status
                        if (msgDate > leadDate) {
                            const myEmail = userAccount?.username?.toLowerCase() || "";
                            const sender = (latestMsg.from?.emailAddress?.address || "").toLowerCase();
                            
                            let newStatus = null;

                            if (sender === myEmail) {
                                if (lead.Status !== 'Waiting On Contact') newStatus = 'Waiting On Contact';
                            } else {
                                if (lead.Status !== 'Action Required') newStatus = 'Action Required';
                            }

                            if (newStatus && lead.Status !== newStatus) {
                                console.log(`[SmartStatus] Calculated update for ${lead.Title}: ${newStatus}`);
                                lead.Status = newStatus; 
                                lead._isCalculated = true; 
                                batchUpdates = true;
                            }
                        }
                    }
                }
            }
        }

        // 4. Trigger UI Update
        if (batchUpdates) {
            window.dispatchEvent(new Event('crm-smart-status-updated'));
        }
    },

    // --- Updates (Write Operations) ---
    async updateLeadActivity(leadId) {
        const lead = this.leadsCache.find(l => l.LeadId === leadId);
        if(!lead) return;
        const now = new Date().toISOString();
        await this._graphRequest(`https://graph.microsoft.com/v1.0/sites/${CRM_CONFIG.SITE_ID}/lists/${CRM_CONFIG.LISTS.LEADS}/items/${lead.itemId}`, "PATCH", {
            fields: { LastActivityAt: now }
        });
        lead.LastActivityAt = now;
    },

    async updateLeadFields(leadId, updatedFields) {
        const lead = this.leadsCache.find(l => l.LeadId === leadId);
        if (!lead) return;

        const fieldsToUpdate = { ...updatedFields }; 

        await this._graphRequest(`https://graph.microsoft.com/v1.0/sites/${CRM_CONFIG.SITE_ID}/lists/${CRM_CONFIG.LISTS.LEADS}/items/${lead.itemId}`, "PATCH", { fields: fieldsToUpdate });
        
        const summary = Object.keys(updatedFields).map(k => `${k}: ${updatedFields[k]}`).join(", ");
        await this.addEvent(leadId, "System", "Lead Updated", `Updated fields: ${summary}`);

        Object.assign(lead, fieldsToUpdate);
        await this._persistToStorage(CRM_CONFIG.KEYS.LEADS, 'leadsCache', 'deltaLink');
    },

    async updateStatus(leadId, newStatus) {
        const lead = this.leadsCache.find(l => l.LeadId === leadId);
        if (!lead) return;
        const now = new Date().toISOString();

        await this._graphRequest(`https://graph.microsoft.com/v1.0/sites/${CRM_CONFIG.SITE_ID}/lists/${CRM_CONFIG.LISTS.LEADS}/items/${lead.itemId}`, "PATCH", {
            fields: { Status: newStatus, LastActivityAt: now }
        });

        await this.addEvent(leadId, "System", "Status Update", `Status changed to: ${newStatus}`);

        lead.Status = newStatus;
        lead.LastActivityAt = now;
        // If user manually updates status, clear the calculation flag
        delete lead._isCalculated;
        await this._persistToStorage(CRM_CONFIG.KEYS.LEADS, 'leadsCache', 'deltaLink');
    },

    // --- Timeline Data ---
    async getFullTimeline(lead) {
        this.currentLead = lead;
        const leadId = lead.LeadId;

        const eventsUrl = `https://graph.microsoft.com/v1.0/sites/${CRM_CONFIG.SITE_ID}/lists/${CRM_CONFIG.LISTS.EVENTS}/items?expand=fields&$filter=fields/LeadId eq '${leadId}'`;
        const eventsPromise = this._graphRequest(eventsUrl);
        const [eventsData] = await Promise.all([eventsPromise]);

        const timeline = eventsData.value.map(e => ({
            type: 'event',
            date: new Date(e.fields.EventAt),
            eventType: e.fields.EventType,
            summary: e.fields.Summary,
            details: e.fields.Details,
            id: e.id
        }));

        const anchors = this.anchorsCache.filter(a => a.LeadId === leadId);
        
        if (anchors.length > 0) {
const emailPromises = anchors.map(async (a) => {
                if (!a.Email) return [];
                const email = a.Email.toLowerCase();
                
                const search = `participants:${email}`;
                // CHANGED: Added 'isDraft' to $select
                const url = `https://graph.microsoft.com/v1.0/me/messages?$search="${search}"&$top=20&$select=id,subject,receivedDateTime,bodyPreview,from,isRead,conversationId,isDraft`;
                
                try {
                    const res = await this._graphRequest(url);
                    // CHANGED: Filter m.isDraft !== true
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
    }
};