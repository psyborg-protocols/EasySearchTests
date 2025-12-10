// ---------------------------------------------
// auth.js — Simple redirect-based MSAL flow
// (no auto-login, no aggressive storage clearing)
// ---------------------------------------------

const msalConfig = {
    auth: {
        clientId: "26f834bc-3365-486c-95ff-1a45a24488b5",
        authority:
            "https://login.microsoftonline.com/b4b6e20e-14bd-4419-bf0a-c7d2c948c513",
        redirectUri: "https://psyborg-protocols.github.io/EasySearchTests/",
        // navigateToLoginRequestUrl defaults to true; we also do our own deep-link restore
    },
    cache: {
        cacheLocation: "sessionStorage",
        storeAuthStateInCookie: true
    }
};

// Update this to your actual shared mailbox address
const SHARED_MAILBOX_ADDRESS = "reminders@brandywinematerials.com";

// Custom API scopes
const contactUpdateScope = `api://${msalConfig.auth.clientId}/Contacts.Update`;
const companyResearchScope = `api://${msalConfig.auth.clientId}/Company.Research`;

// Graph scopes - includes Mail.Send for shared mailbox
const graphScopes = [
    "User.Read",
    "Files.ReadWrite.All",
    "Sites.Read.All",
    "OrgContact.Read.All",
    "Mail.Send.Shared"
];

let msalInstance = null;
let userAccount = null;

// ------------------------------
// UI helpers
// ------------------------------

function handleLoginResponse(account) {
    userAccount = account;
    if (userAccount && window.UIrenderer &&
        typeof UIrenderer.updateUIForLoggedInUser === "function") {
        UIrenderer.updateUIForLoggedInUser();
    }
}

// ------------------------------
// Initialization
// ------------------------------

function initializeAuth() {
    msalInstance = new msal.PublicClientApplication(msalConfig);

    // Process redirect result first, then restore existing accounts
    return msalInstance
        .handleRedirectPromise()
        .then((response) => {
            if (response && response.account) {
                console.log("[Auth] Completed redirect login.");
                handleLoginResponse(response.account);

                // Restore original deep link if we saved one pre-login
                const postLoginUrl = sessionStorage.getItem("postLoginUrl");
                if (postLoginUrl) {
                    sessionStorage.removeItem("postLoginUrl");
                    // Replace so we don't clutter history
                    window.location.replace(postLoginUrl);
                    return;
                }

                return;
            }

            // No fresh redirect result — try to restore an existing session
            const accounts = msalInstance.getAllAccounts();
            if (accounts.length > 0) {
                console.log("[Auth] Existing account restored.");
                handleLoginResponse(accounts[0]);
            } else {
                console.log(
                    "[Auth] No existing account; waiting for user to sign in."
                );
            }
        })
        .catch((error) => {
            console.error("[Auth] Error during redirect processing:", error);
        });
}

// ------------------------------
// Sign-in / Sign-out
// ------------------------------

async function signIn() {
    if (!msalInstance) {
        console.warn("[Auth] signIn called before initializeAuth; initializing now.");
        initializeAuth();
    }

    console.log("[SignIn] Redirecting to Microsoft login...");

    // Save current URL (supports deep links with hash/query)
    try {
        sessionStorage.setItem("postLoginUrl", window.location.href);
    } catch (e) {
        console.warn("[Auth] Could not persist post-login URL:", e);
    }

    await msalInstance.loginRedirect({ scopes: graphScopes });
}

function signOut() {
    if (!msalInstance) return;

    const accounts = msalInstance.getAllAccounts();
    const accountToLogout =
        userAccount || (accounts.length > 0 ? accounts[0] : null);

    if (window.UIrenderer &&
        typeof UIrenderer.updateUIForLoggedOutUser === "function") {
        UIrenderer.updateUIForLoggedOutUser();
    }

    if (accountToLogout) {
        msalInstance.logoutRedirect({
            account: accountToLogout,
            postLogoutRedirectUri: msalConfig.auth.redirectUri
        });
    } else {
        console.log("[Auth] No account to log out.");
    }
}

// ------------------------------
// Token acquisition (passive)
// ------------------------------

async function getScopedAccessToken(scopes) {
    if (!msalInstance) {
        console.warn("[Token] msalInstance not initialized.");
        return null;
    }

    // Ensure we know the active account
    if (!userAccount) {
        const accounts = msalInstance.getAllAccounts();
        if (accounts.length > 0) {
            userAccount = accounts[0];
        } else {
            console.log("[Token] No logged-in user; returning null.");
            return null; // <- no redirect here
        }
    }

    try {
        const tokenResponse = await msalInstance.acquireTokenSilent({
            scopes,
            account: userAccount
        });
        return tokenResponse.accessToken;
    } catch (error) {
        console.warn("[Token] Silent acquisition failed.", error);

        if (error instanceof msal.InteractionRequiredAuthError) {
            console.log(
                "[Token] Interaction required; returning null so caller can decide what to do."
            );
            return null; // caller can prompt user to click "Sign In"
        }

        throw error;
    }
}

// Convenience wrappers
async function getAccessToken() {
    return getScopedAccessToken(graphScopes);
}

async function getApiAccessToken() {
    return getScopedAccessToken([contactUpdateScope]);
}

async function getLLMAccessToken() {
    return getScopedAccessToken([companyResearchScope]);
}

// ------------------------------
// Graph email helper
// ------------------------------

/**
 * Sends an email via Microsoft Graph API.
 * Uses the shared mailbox path if user has permissions,
 * otherwise defaults to 'me'.
 */
async function sendMail(subject, htmlBody, toEmail) {
    const token = await getAccessToken();

    if (!token) {
        throw new Error(
            "Not authenticated; please sign in before sending email."
        );
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
