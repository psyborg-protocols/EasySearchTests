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
    async _graphRequest(url, method = "GET", body = null) {
        const token = await getAccessToken({ reason: "crm_data" }); 
        const headers = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };
        if(method === "GET") headers['Prefer'] = 'HonorNonIndexedQueriesWarningMayFailRandomly'; // Helps with SP lists
        
        const opts = { method, headers };
        if (body) opts.body = JSON.stringify(body);
        
        const resp = await fetch(url, opts);
        if (!resp.ok) {
            const errorText = await resp.text();
            console.error(`CRM Graph Error (${method} ${url}):`, errorText);
            throw new Error(errorText);
        }
        return resp.json();
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

    // --- Timeline Data (The "Secret Sauce") ---
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
        // Note: Graph won't let us search other users' mailboxes easily without Application permissions.
        // We assume the logged-in user wants to see emails in THEIR mailbox related to this lead.
        
        if (anchorsData.value.length > 0) {
            const emailPromises = anchorsData.value.map(async (anchor) => {
                const a = anchor.fields;
                // Construct Graph Filter
                // Logic: (From address matches) OR (ConversationId matches)
                // AND ReceivedTime >= StartTrackingFrom
                
                let filter = `receivedDateTime ge ${a.StartTrackingFrom}`;
                
                // We construct the query carefully. 
                // Note: Complex OR clauses with dates can sometimes be tricky in Graph. 
                // We prioritze ConversationID if available.
                
                if (a.ConversationId) {
                    filter += ` and conversationId eq '${a.ConversationId}'`;
                } else if (a.Email) {
                    // Search for emails FROM them or TO them involving the user
                    filter += ` and (from/emailAddress/address eq '${a.Email}' or toRecipients/any(t:t/emailAddress/address eq '${a.Email}'))`;
                }
                
                const url = `https://graph.microsoft.com/v1.0/me/messages?$select=subject,receivedDateTime,bodyPreview,from,isRead&$top=25&$filter=${filter}`;
                try {
                    const mailData = await this._graphRequest(url);
                    return mailData.value.map(m => ({
                        type: 'email',
                        date: new Date(m.receivedDateTime),
                        subject: m.subject,
                        preview: m.bodyPreview,
                        from: m.from.emailAddress.name || m.from.emailAddress.address,
                        isRead: m.isRead,
                        id: m.id
                    }));
                } catch (e) {
                    console.warn("Error fetching emails for anchor", e);
                    return [];
                }
            });

            const emailResults = await Promise.all(emailPromises);
            // Flatten array of arrays
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