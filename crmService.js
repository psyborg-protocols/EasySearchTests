// ---------------------------------------------
// crmService.js
// Abstraction layer for SharePoint Lists and Graph Email interactions
// ---------------------------------------------

const CRM_CONFIG = {
    SITE_ID: "brandywinematerialsllc.sharepoint.com,07a1465e-a31a-4437-aca2-0efe61b7f2c6,4b1abd1c-08c6-4574-b350-654376a1e954",
    LISTS: {
        LEADS: "28088675-4516-4e32-8766-ebb99cbb75e3",
        EVENTS: "fa306d38-3403-4c29-9db8-f73c4acd63b0",
        ANCHORS: "2af7b8ed-71c0-4bff-9d04-b3237d4dd388"
    }
};

const CRMService = {
    leadsCache: [],
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

        if (!res.ok) {
            const text = await res.text().catch(() => "");
            throw new Error(`[Graph] ${res.status} ${res.statusText} :: ${text}`);
        }
        return await res.json();
    },

    // --- Business Logic / Calculations ---
    
    /**
     * Calculates the estimated value of a lead based on SKU and Quantity.
     * Logic: 
     * 1. Try Pricing file for 'USER FB' price.
     * 2. Fallback to DB UnitCost x 1.4.
     */
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
    async getLeads() {
        const endpoint = `https://graph.microsoft.com/v1.0/sites/${CRM_CONFIG.SITE_ID}/lists/${CRM_CONFIG.LISTS.LEADS}/items?expand=fields`;
        const data = await this._graphRequest(endpoint);
        
        this.leadsCache = data.value.map(item => ({
            itemId: item.id, 
            ...item.fields
        }));
        return this.leadsCache;
    },

    async updateLeadActivity(leadId) {
        const lead = this.leadsCache.find(l => l.LeadId === leadId);
        if(!lead) return;

        const url = `https://graph.microsoft.com/v1.0/sites/${CRM_CONFIG.SITE_ID}/lists/${CRM_CONFIG.LISTS.LEADS}/items/${lead.itemId}`;
        await this._graphRequest(url, "PATCH", {
            fields: { LastActivityAt: new Date().toISOString() }
        });
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

        // Log the change in the events list
        await this.addEvent(leadId, "System", "Status Update", `Status changed to: ${newStatus}`);

        // Update local cache
        lead.Status = newStatus;
        lead.LastActivityAt = timestamp;
    },

    // --- Timeline Data ---
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