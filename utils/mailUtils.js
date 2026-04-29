// ---------------------------------------------
// utils/mailUtils.js
// Handles Microsoft Graph API interactions for Mail operations.
// ---------------------------------------------

(function () {
    // Update this to your actual shared mailbox address
    const SHARED_MAILBOX_ADDRESS = "reminders@brandywinematerials.com";

    /**
     * Sends an email via Microsoft Graph API.
     * Uses the shared mailbox path if user has permissions,
     * otherwise defaults to 'me'.
     */
    async function sendMail(subject, htmlBody, toEmail) {
        // getAccessToken is defined globally in auth.js
        const token = await window.getAccessToken({ autoRedirectOnce: true, reason: "sendMail" });

        if (!token) {
            throw new Error("Not authenticated; please sign in and try again.");
        }

        const mailData = {
            message: {
                subject: subject,
                body: {
                    contentType: "HTML",
                    content: htmlBody
                },
                toRecipients: [
                    {
                        emailAddress: {
                            address: toEmail
                        }
                    }
                ]
            },
            saveToSentItems: true
        };

        // Try sending from shared mailbox first
        let endpoint = `https://graph.microsoft.com/v1.0/users/${SHARED_MAILBOX_ADDRESS}/sendMail`;

        // Fallback logic for development environments where the constant might not be set
        if (!SHARED_MAILBOX_ADDRESS.includes("brandywinematerials.com")) {
            endpoint = `https://graph.microsoft.com/v1.0/me/sendMail`;
        }

        try {
            const response = await fetch(endpoint, {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${token}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(mailData)
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Email Send Failed: ${errorText}`);
            }
        } catch (error) {
            console.error("Error sending email:", error);
            throw error;
        }
    }

    /**
     * Fetches the HTML content of a specific message
     */
    async function getMessageBody(messageId) {
        const token = await window.getAccessToken({ autoRedirectOnce: true, reason: "getMessageBody" });

        if (!token) {
            throw new Error("Not authenticated; please sign in and try again.");
        }

        const response = await fetch(`https://graph.microsoft.com/v1.0/me/messages/${messageId}?$select=body`, {
            method: "GET",
            headers: {
                "Authorization": `Bearer ${token}`,
                "Accept": "application/json"
            }
        });

        if (!response.ok) {
            const text = await response.text().catch(() => "");
            throw new Error(`[Graph] ${response.status} ${response.statusText} :: ${text}`);
        }

        const data = await response.json();
        return data.body?.content || "<p>No content available.</p>";
    }

    /**
     * Notify a user when a lead is assigned to them.
     * @param {Object} lead - Single lead object from CRMService.
     * @param {string} toEmail - The recipient (the new owner).
     */
    async function sendLeadAssignmentEmail(lead, toEmail) {
        if (!lead || !toEmail) return;

        // Construct the deep link to the leads tab
        const leadsUrl = `${window.location.origin}${window.location.pathname}?tab=leads`;

        const emailBody = `
           
            <div style="font-family: Arial, sans-serif; background-color: #ffffff; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 8px; overflow: hidden;">
                <div style="background-color: #e0f2fe; padding: 20px; text-align: center; border-bottom: 1px solid #bae6fd;">
                    <h2 style="color: #0369a1; margin: 0;">New Lead Assigned</h2>
                </div>
                <div style="padding: 30px;">
                    <p>Hello,</p>
                    <p>A lead has been assigned to you and is ready for your review.</p>
                    
                    <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 15px; margin-top: 20px;">
                        <h3 style="margin-top: 0; color: #0f172a; font-size: 1.1em;">${lead.Title || 'New Lead'}</h3>
                        <p style="margin: 5px 0; color: #475569;"><strong>Company:</strong> ${lead.Company || 'N/A'}</p>
                        <p style="margin: 5px 0; color: #475569;"><strong>Requested Part:</strong> ${lead.PartNumber || 'N/A'} (Qty: ${lead.Quantity || 0})</p>
                    </div>
                    
                    <div style="text-align: center; margin-top: 35px;">
                        <a href="${leadsUrl}" 
                           style="background-color: #0284c7; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block;">
                           View in Dashboard →
                        </a>
                    </div>

                    <p style="margin-top: 30px; font-size: 0.9em; color: #888; text-align: center;">
                        Please log into BrandyWise to begin tracking this lead.
                    </p>
                </div>
                <div style="background-color: #f8f9fa; padding: 15px; text-align: center; font-size: 0.8em; color: #aaa; border-top: 1px solid #e0e0e0;">
                    BrandyWine Materials LLC
                </div>
                <div style="font-size: 8px; color: #f8f9fa; text-align: center; margin-top: 10px;">
                    Ref: BrandyWiseLeadId:${lead.LeadId ||  ''}
                </div>
            </div>
        `;

        return sendMail(`New Lead Assigned: ${lead.Company || lead.Title}`, emailBody, toEmail);
    }

    /**
     * Send automated reminders for leads requiring action.
     * @param {Array} leads - Array of lead objects from CRMService.
     * @param {string} toEmail - The recipient (usually the current user).
     */
    async function sendLeadReminderEmail(leads, toEmail) {
        if (!leads || leads.length === 0) return;

        const now = new Date();

        const leadListHtml = leads.map(l => {
            // Calculate how long it has been waiting
            let daysText = "a while";
            if (l.LastActivityAt) {
                const diffTime = Math.abs(now - new Date(l.LastActivityAt));
                const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
                daysText = `${diffDays} day${diffDays === 1 ? '' : 's'}`;
            }

            return `<li style="margin-bottom: 15px; border-bottom: 1px solid #eee; padding-bottom: 10px;">
                <strong>${l.Title}</strong><br>
                <span style="color: #666;">Company: ${l.Company || 'N/A'}</span><br>
                <span style="color: #666;">Requested Part: ${l.PartNumber || 'N/A'} (Qty: ${l.Quantity || 0})</span><br>
                <span style="color: #d97706; font-size: 0.9em; font-weight: bold;">Inactive for: ${daysText}</span>
             </li>`;
        }).join('');

        // Construct the deep link to the leads tab
        const leadsUrl = `${window.location.origin}${window.location.pathname}?tab=leads`;

        const emailBody = `
            <div style="font-family: Arial, sans-serif; background-color: #ffffff; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 8px; overflow: hidden;">
                <div style="background-color: #fee2e2; padding: 20px; text-align: center; border-bottom: 1px solid #fca5a5;">
                    <h2 style="color: #991b1b; margin: 0;">Action Required: Leads Pending</h2>
                </div>
                <div style="padding: 30px;">
                    <p>Hello,</p>
                    <p>You have <strong>${leads.length} lead(s)</strong> that currently require your attention. They have been waiting for a response.</p>
                    <ul style="padding-left: 0; margin-top: 20px; list-style-type: none;">
                        ${leadListHtml}
                    </ul>
                    
                    <div style="text-align: center; margin-top: 35px;">
                        <a href="${leadsUrl}" 
                           style="background-color: #991b1b; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block;">
                           Review Leads Dashboard →
                        </a>
                    </div>

                    <p style="margin-top: 30px; font-size: 0.9em; color: #888; text-align: center;">
                        Please log into BrandyWise to review and update these leads.
                    </p>
                </div>
                <div style="background-color: #f8f9fa; padding: 15px; text-align: center; font-size: 0.8em; color: #aaa;border-top: 1px solid #e0e0e0;">
                    BrandyWine Materials LLC
                </div>
            </div>
        `;

        return sendMail("Reminder: Action Required on Pending Leads", emailBody, toEmail);
    }

    /**
     * Send automated reminders for overdue reports.
     * @param {Array} dueReports - Array of report module objects from ReportManager.
     * @param {string} toEmail - The recipient (usually the current user).
     */
    async function sendReportsReminderEmail(dueReports, toEmail) {
        if (!dueReports || dueReports.length === 0) return;

        const reportListHtml = dueReports.map(r => 
            `<li style="margin-bottom: 10px;">
                <strong>${r.title}</strong><br>
                <span style="color: #666;">${r.desc}</span><br>
                <a href="${window.location.origin}${window.location.pathname}?runReport=${r.id}" 
                   style="color: #0d6efd; text-decoration: none; font-weight: bold;">
                   Open Report →
                </a>
             </li>`
        ).join('');

        const emailBody = `
            <div style="font-family: Arial, sans-serif; background-color: #ffffff; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 8px; overflow: hidden;">
                <div style="background-color: #f8f9fa; padding: 20px; text-align: center; border-bottom: 1px solid #e0e0e0;">
                    <h2 style="color: #2D2A32; margin: 0;">BrandyWise Reports Due</h2>
                </div>
                <div style="padding: 30px;">
                    <p>Hello,</p>
                    <p>We noticed you have <strong>${dueReports.length} reports</strong> that are currently due for review based on your scheduled preferences.</p>
                    <ul style="padding-left: 20px; margin-top: 20px;">
                        ${reportListHtml}
                    </ul>
                    <p style="margin-top: 30px; font-size: 0.9em; color: #888;">
                        Clicking a link above will take you directly to the dashboard to generate the report.
                    </p>
                </div>
                <div style="background-color: #f8f9fa; padding: 15px; text-align: center; font-size: 0.8em; color: #aaa;border-top: 1px solid #e0e0e0;">
                    BrandyWine Materials LLC
                </div>
            </div>
        `;

        return sendMail("Reminder: You have pending reports", emailBody, toEmail);
    }

    /**
     * Forwards a specific Graph API message to a new owner, injecting the assignment HTML as a comment.
     * @param {Object} lead - The lead object.
     * @param {string} toEmail - The recipient (new owner).
     * @param {string} messageId - The Microsoft Graph ID of the email to forward.
     */
    async function forwardLeadHistory(lead, toEmail, messageId) {
        if (!lead || !toEmail || !messageId) return;

        const token = await window.getAccessToken({ autoRedirectOnce: true, reason: "forwardMail" });
        if (!token) throw new Error("Not authenticated.");

        const leadsUrl = `${window.location.origin}${window.location.pathname}?tab=leads`;

        const emailBody = `
            
            <div style="font-family: Arial, sans-serif; background-color: #ffffff; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 8px; overflow: hidden;">
                <div style="background-color: #e0f2fe; padding: 20px; text-align: center; border-bottom: 1px solid #bae6fd;">
                    <h2 style="color: #0369a1; margin: 0;">Lead Transferred to You</h2>
                </div>
                <div style="padding: 30px;">
                    <p>Hello,</p>
                    <p>A lead has been transferred to you. The most recent email thread is included below for context.</p>
                    
                    <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 15px; margin-top: 20px;">
                        <h3 style="margin-top: 0; color: #0f172a; font-size: 1.1em;">${lead.Title || 'Lead Transfer'}</h3>
                        <p style="margin: 5px 0; color: #475569;"><strong>Company:</strong> ${lead.Company || 'N/A'}</p>
                        <p style="margin: 5px 0; color: #475569;"><strong>Requested Part:</strong> ${lead.PartNumber || 'N/A'} (Qty: ${lead.Quantity || 0})</p>
                    </div>
                    
                    <div style="text-align: center; margin-top: 35px;">
                        <a href="${leadsUrl}" 
                           style="background-color: #0284c7; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block;">
                           View in Dashboard →
                        </a>
                    </div>
                </div>
                <div style="background-color: #f8f9fa; padding: 15px; text-align: center; font-size: 0.8em; color: #aaa; border-top: 1px solid #e0e0e0;">
                    BrandyWine Materials LLC
                </div>
                <div style="font-size: 8px; color: #f8f9fa; text-align: center; margin-top: 10px;">
                    Ref: BrandyWiseLeadId:${lead.LeadId ||  ''}
                </div>
            </div>
            <br><hr><br>
        `;

        const mailData = {
            Comment: emailBody, 
            ToRecipients: [{ EmailAddress: { address: toEmail } }]
        };

        const endpoint = `https://graph.microsoft.com/v1.0/me/messages/${messageId}/forward`;

        const response = await fetch(endpoint, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify(mailData)
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Graph Forward Failed: ${errorText}`);
        }
    }

    window.mailUtils = {
        sendMail,
        getMessageBody,
        sendLeadReminderEmail,
        sendReportsReminderEmail,
        sendLeadAssignmentEmail,
        forwardLeadHistory
    };
})();