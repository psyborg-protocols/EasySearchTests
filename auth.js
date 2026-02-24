// ---------------------------------------------
// auth.js — Redirect-based MSAL flow (safe auto-login-once)
// Goals:
//  - No infinite redirect loops
//  - Minimal user interaction: auto-redirect once when a token is needed
//  - Keep deep-link restore behavior
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
        cacheLocation: "localStorage",
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
    "Sites.ReadWrite.All",
    "OrgContact.Read.All",
    "Mail.Send.Shared",
    "Mail.Read"
];

let msalInstance = null;
let userAccount = null;
let authReady = false;

// Guards to prevent infinite redirect loops
const AUTOLOGIN_TIMESTAMP_KEY = "msal_autologin_timestamp_v2"; // Renamed for clarity
const REDIRECT_IN_PROGRESS_KEY = "msal_redirect_in_progress_v1";

// How long (in ms) to block a retry after an attempt. 
// 30 seconds is enough to detect a tight loop, but short enough to allow 
// legitimate re-tries after a failed attempt settled.
const LOOP_PROTECTION_WINDOW = 30000; 

// ------------------------------
// Small helpers
// ------------------------------

function isRedirectCallbackUrl() {
    const h = window.location.hash || "";
    return h.includes("code=") || h.includes("state=") || h.includes("error=");
}

function setActiveAccount(account) {
    userAccount = account || null;
    if (msalInstance && userAccount && typeof msalInstance.setActiveAccount === "function") {
        msalInstance.setActiveAccount(userAccount);
    }
    if (userAccount && window.UIrenderer && typeof UIrenderer.updateUIForLoggedInUser === "function") {
        UIrenderer.updateUIForLoggedInUser();
    }
}

function clearAutoLoginGuardsOnSuccess() {
    try {
        sessionStorage.removeItem(AUTOLOGIN_TIMESTAMP_KEY);
        sessionStorage.removeItem(REDIRECT_IN_PROGRESS_KEY);
    } catch (_) {}
}

function markRedirectInProgress() {
    try {
        sessionStorage.setItem(REDIRECT_IN_PROGRESS_KEY, "1");
    } catch (_) {}
}

function clearRedirectInProgress() {
    try {
        sessionStorage.removeItem(REDIRECT_IN_PROGRESS_KEY);
    } catch (_) {}
}

/**
 * Checks if we recently tried to auto-redirect.
 * Returns TRUE if we are in a tight loop (attempted < 30s ago).
 * Returns FALSE if it's been a while (e.g., overnight), allowing the retry.
 */
function hasTriedAutoLoginRecently() {
    try {
        const lastAttempt = sessionStorage.getItem(AUTOLOGIN_TIMESTAMP_KEY);
        if (!lastAttempt) return false;
        
        const now = Date.now();
        const diff = now - parseInt(lastAttempt, 10);
        
        // If diff is NaN or negative (clock skew), allow retry
        if (isNaN(diff) || diff < 0) return false;

        // If attempted recently (within window), BLOCK it.
        return diff < LOOP_PROTECTION_WINDOW; 
    } catch (_) {
        return false;
    }
}

function markTriedAutoLogin() {
    try {
        // Store the current timestamp
        sessionStorage.setItem(AUTOLOGIN_TIMESTAMP_KEY, Date.now().toString());
    } catch (_) {}
}

function isRedirectInProgress() {
    try {
        return sessionStorage.getItem(REDIRECT_IN_PROGRESS_KEY) === "1";
    } catch (_) {
        return false;
    }
}

// ------------------------------
// Initialization
// ------------------------------

async function initializeAuth() {
    if (authReady && msalInstance) return;

    msalInstance = new msal.PublicClientApplication(msalConfig);

    // Always process redirect first.
    try {
        const response = await msalInstance.handleRedirectPromise();

        // We have returned from a redirect round trip (success or failure)
        clearRedirectInProgress();

        if (response && response.account) {
            console.log("[Auth] Completed redirect login.");
            setActiveAccount(response.account);

            // Restore original deep link if we saved one pre-login
            const postLoginUrl = sessionStorage.getItem("postLoginUrl");
            if (postLoginUrl) {
                sessionStorage.removeItem("postLoginUrl");
                // Replace so we don't clutter history
                window.location.replace(postLoginUrl);
                return;
            }

            clearAutoLoginGuardsOnSuccess();
        } else {
            // No fresh redirect result — try to restore an existing session
            const accounts = msalInstance.getAllAccounts();
            if (accounts.length > 0) {
                console.log("[Auth] Existing account restored.");
                setActiveAccount(accounts[0]);
            } else {
                console.log("[Auth] No existing account; waiting for sign-in.");
            }
        }
    } catch (error) {
        // If redirect failed, clear in-progress so we don't get stuck.
        clearRedirectInProgress();
        console.error("[Auth] Error during redirect processing:", error);
    } finally {
        authReady = true;
    }
}

// ------------------------------
// Sign-in / Sign-out
// ------------------------------

async function signIn() {
    if (!msalInstance || !authReady) {
        console.warn("[Auth] signIn called before initializeAuth; initializing now.");
        await initializeAuth();
    }

    console.log("[SignIn] Redirecting to Microsoft login...");

    // Save current URL (supports deep links with hash/query)
    try {
        sessionStorage.setItem("postLoginUrl", window.location.href);
    } catch (e) {
        console.warn("[Auth] Could not persist post-login URL:", e);
    }

    markRedirectInProgress();
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
// Token acquisition (Updated to use new time-based guard)
// ------------------------------

async function getScopedAccessToken(scopes, options = {}) {
    const {
        autoRedirectOnce = true,       
        redirectScopes = scopes,       
        reason = "token"               
    } = options;

    if (!msalInstance || !authReady) {
        console.warn("[Token] Auth not ready; initializing.");
        await initializeAuth();
    }

    if (!msalInstance) return null;

    let account = (typeof msalInstance.getActiveAccount === "function" ? msalInstance.getActiveAccount() : null) 
                  || userAccount 
                  || (msalInstance.getAllAccounts()[0] || null);

    // If no account, we MUST interact.
    if (!account) {
        console.log("[Token] No logged-in user found.");
        if (autoRedirectOnce) {
            await maybeAutoRedirect(redirectScopes, reason);
        }
        return null;
    }

    if (!userAccount || (userAccount.homeAccountId !== account.homeAccountId)) {
        setActiveAccount(account);
    }

    try {
        // Force refresh if we suspect the token is stale? 
        // MSAL usually handles this, but with the 24h limit, silent fails hard.
        const tokenResponse = await msalInstance.acquireTokenSilent({
            scopes,
            account
        });
        return tokenResponse.accessToken;
    } catch (error) {
        console.warn(`[Token] Silent acquisition failed (${reason}).`, error);

        // Check for specific InteractionRequired errors OR the invalid_grant 24h issue
        if (error instanceof msal.InteractionRequiredAuthError || 
            error.message.includes("interaction_required") ||
            error.message.includes("invalid_grant") || 
            error.message.includes("AADSTS700084")) {
            
            console.log("[Token] Interaction required (Session expired or invalid).");
            
            if (autoRedirectOnce) {
                await maybeAutoRedirect(redirectScopes, reason);
            }
            return null;
        }

        throw error;
    }
}

async function maybeAutoRedirect(scopesForRedirect, reason) {
    if (isRedirectCallbackUrl() || isRedirectInProgress()) {
        console.log(`[Token] Suppressing auto-redirect (${reason}): redirect callback/in-progress.`);
        return;
    }

    if (hasTriedAutoLoginRecently()) {
        console.warn(`[Token] Suppressing auto-redirect (${reason}): detected tight loop (attempted recently).`);
        return;
    }

    markTriedAutoLogin();

    try {
        sessionStorage.setItem("postLoginUrl", window.location.href);
    } catch (e) {}

    console.log(`[Token] Auto-redirecting to sign-in (${reason})...`);
    markRedirectInProgress();
    
    // Use the active account's login hint to make the redirect smoother
    const account = msalInstance.getActiveAccount();
    const request = {
        scopes: scopesForRedirect,
        loginHint: account ? account.username : undefined
    };

    await msalInstance.loginRedirect(request);
}

// Convenience wrappers
async function getAccessToken(options = {}) {
    return getScopedAccessToken(graphScopes, { ...options, redirectScopes: graphScopes });
}

async function getApiAccessToken(options = {}) {
    return getScopedAccessToken([contactUpdateScope], { ...options, redirectScopes: [contactUpdateScope] });
}

async function getLLMAccessToken(options = {}) {
    return getScopedAccessToken([companyResearchScope], { ...options, redirectScopes: [companyResearchScope] });
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
    const token = await getAccessToken({ autoRedirectOnce: true, reason: "sendMail" });

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
