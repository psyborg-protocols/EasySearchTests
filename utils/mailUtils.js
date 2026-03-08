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
     * Specialized function to send automated reminders for leads requiring action.
     * @param {Array} leads - Array of lead objects from CRMService.
     * @param {string} toEmail - The recipient (usually the current user).
     */
    async function sendLeadReminderEmail(leads, toEmail) {
        if (!leads || leads.length === 0) return;

        const leadListHtml = leads.map(l => 
            `<li style="margin-bottom: 10px;">
                <strong>${l.Title}</strong><br>
                <span style="color: #666;">Company: ${l.Company || 'N/A'}</span><br>
                <span style="color: #666;">Requested Part: ${l.PartNumber || 'N/A'} (Qty: ${l.Quantity || 0})</span><br>
             </li>`
        ).join('');

        const emailBody = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 8px; overflow: hidden;">
                <div style="background-color: #fee2e2; padding: 20px; text-align: center; border-bottom: 1px solid #fca5a5;">
                    <h2 style="color: #991b1b; margin: 0;">Action Required: Leads Pending</h2>
                </div>
                <div style="padding: 30px;">
                    <p>Hello,</p>
                    <p>You have <strong>${leads.length} lead(s)</strong> that currently require your attention. They have been waiting for a response.</p>
                    <ul style="padding-left: 20px; margin-top: 20px;">
                        ${leadListHtml}
                    </ul>
                    <p style="margin-top: 30px; font-size: 0.9em; color: #888;">
                        Please log into BrandyWise to review and update these leads.
                    </p>
                </div>
                <div style="background-color: #f8f9fa; padding: 15px; text-align: center; font-size: 0.8em; color: #aaa;">
                    BrandyWine Materials LLC
                </div>
            </div>
        `;

        return sendMail("Reminder: Action Required on Pending Leads", emailBody, toEmail);
    }

    /**
     * Specialized function to send automated reminders for overdue reports.
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
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 8px; overflow: hidden;">
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
                <div style="background-color: #f8f9fa; padding: 15px; text-align: center; font-size: 0.8em; color: #aaa;">
                    BrandyWine Materials LLC
                </div>
            </div>
        `;

        return sendMail("Reminder: You have pending reports", emailBody, toEmail);
    }

    window.mailUtils = {
        sendMail,
        getMessageBody,
        sendLeadReminderEmail,
        sendReportsReminderEmail
    };
})();