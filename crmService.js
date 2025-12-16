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

    // --- Leads Operations ---
    async getLeads() {
        // Fetch all leads. Filtering happens client-side for speed.
        const endpoint = `https://graph.microsoft.com/v1.0/sites/${CRM_CONFIG.SITE_ID}/lists/${CRM_CONFIG.LISTS.LEADS}/items?expand=fields`;
        const data = await this._graphRequest(endpoint);
        
        this.leadsCache = data.value.map(item => ({
            itemId: item.id, // SharePoint Item ID (needed for patches)
            ...item.fields
        }));
        return this.leadsCache;
    },

    async updateLeadActivity(leadId) {
        // Find SP Item ID from cache
        const lead = this.leadsCache.find(l => l.LeadId === leadId);
        if(!lead) return;

        const url = `https://graph.microsoft.com/v1.0/sites/${CRM_CONFIG.SITE_ID}/lists/${CRM_CONFIG.LISTS.LEADS}/items/${lead.itemId}`;
        await this._graphRequest(url, "PATCH", {
            fields: { LastActivityAt: new Date().toISOString() }
        });
    },

    // --- Timeline Data ---
    async getFullTimeline(lead) {
        this.currentLead = lead;
        const leadId = lead.LeadId;

        // 1. Fetch SP Events (Explicit notes, status changes)
        const eventsUrl = `https://graph.microsoft.com/v1.0/sites/${CRM_CONFIG.SITE_ID}/lists/${CRM_CONFIG.LISTS.EVENTS}/items?expand=fields&$filter=fields/LeadId eq '${leadId}'`;
        const eventsPromise = this._graphRequest(eventsUrl);

        // 2. Fetch Anchors (To know what emails to hunt for)
        const anchorsUrl = `https://graph.microsoft.com/v1.0/sites/${CRM_CONFIG.SITE_ID}/lists/${CRM_CONFIG.LISTS.ANCHORS}/items?expand=fields&$filter=fields/LeadId eq '${leadId}'`;
        const anchorsPromise = this._graphRequest(anchorsUrl);

        const [eventsData, anchorsData] = await Promise.all([eventsPromise, anchorsPromise]);

        // 3. Normalize SP Events into Timeline Objects
        const timeline = eventsData.value.map(e => ({
            type: 'event',
            date: new Date(e.fields.EventAt),
            eventType: e.fields.EventType,
            summary: e.fields.Summary,
            details: e.fields.Details,
            id: e.id
        }));
        
        // 4. Fetch Emails (Only if user owns the lead, per privacy/access logic)

        if (anchorsData.value.length > 0) {
        const safeArr = (v) => Array.isArray(v) ? v : [];
        const toLower = (s) => (s || "").toLowerCase();
        const addrList = (recips) =>
            safeArr(recips)
            .map(r => toLower(r?.emailAddress?.address))
            .filter(Boolean);

        // Optional paging helper (keeps concurrency; avoids missing results if >$top)
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

            // A) Fetch by ConversationId (keep as-is)
            if (a.ConversationId) {
            const filter = `conversationId eq '${a.ConversationId}'`;
            const url =
                `https://graph.microsoft.com/v1.0/me/messages` +
                `?$select=id,subject,receivedDateTime,bodyPreview,from,isRead,conversationId` +
                `&$top=25&$filter=${encodeURIComponent(filter)}`;

            fetchPromises.push(
                this._graphRequest(url)
                .then(d => d.value || [])
                .catch(e => {
                    console.warn(`[CRM] Error fetching emails by ConversationId`, e);
                    return [];
                })
            );
            }

            // B) Fetch by 3rd-party Email + Date Window (no $search; $filter + client-side recipient match)
            if (a.Email) {
            const thirdParty = toLower(a.Email);

            let startDate = a.StartTrackingFrom ? new Date(a.StartTrackingFrom) : null;
            if (!startDate || isNaN(startDate.getTime())) {
                startDate = new Date();
                startDate.setDate(startDate.getDate() - 30);
            }
            const sinceIso = startDate.toISOString();

            // B1) Inbox: server-side filter on FROM + date
            {
                const filter =
                `receivedDateTime ge ${sinceIso} and ` +
                `from/emailAddress/address eq '${thirdParty}'`;

                const url =
                `https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages` +
                `?$select=id,subject,receivedDateTime,bodyPreview,from,toRecipients,ccRecipients,isRead,conversationId` +
                `&$orderby=receivedDateTime desc` +
                `&$top=50&$filter=${encodeURIComponent(filter)}`;

                fetchPromises.push(
                fetchAllPages(url, null, 4).catch(e => {
                    console.warn(`[CRM] Error fetching inbox emails by from/date filter`, e);
                    return [];
                })
                );
            }

            // B2) Sent Items: server-side date only; client-side filter on TO/CC contains 3rd-party
            {
                const filter = `receivedDateTime ge ${sinceIso}`;

                const url =
                `https://graph.microsoft.com/v1.0/me/mailFolders/sentitems/messages` +
                `?$select=id,subject,receivedDateTime,bodyPreview,from,toRecipients,ccRecipients,isRead,conversationId` +
                `&$orderby=receivedDateTime desc` +
                `&$top=50&$filter=${encodeURIComponent(filter)}`;

                fetchPromises.push(
                fetchAllPages(url, null, 4)
                    .then(sentAll =>
                    sentAll.filter(m => {
                        const to = addrList(m.toRecipients);
                        const cc = addrList(m.ccRecipients);
                        return to.includes(thirdParty) || cc.includes(thirdParty);
                    })
                    )
                    .catch(e => {
                    console.warn(`[CRM] Error fetching sent emails by date (client-side recipient filter)`, e);
                    return [];
                    })
                );
            }
            }

            // Wait for all parallel requests for this anchor
            const results = await Promise.all(fetchPromises);
            const rawMessages = results.flat();

            // De-dupe (ConversationId fetch can overlap with inbox/sent)
            const byId = new Map();
            for (const m of rawMessages) if (m?.id) byId.set(m.id, m);
            const deduped = [...byId.values()];

            // Normalize
            return deduped.map(m => ({
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


        // 5. Sort DESC (Newest first)
        // Deduplication could be added here if multiple anchors catch the same email
        const uniqueTimeline = Array.from(new Map(timeline.map(item => [item.id, item])).values());
        
        return uniqueTimeline.sort((a, b) => b.date - a.date);
    },

    // --- Actions ---
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
        
        // Update parent LastActivity so it floats to top of list
        await this.updateLeadActivity(leadId);
    }
};