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

    window.mailUtils = {
        sendMail,
        getMessageBody
    };
})();