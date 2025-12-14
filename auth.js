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
    "Sites.Read.All",
    "OrgContact.Read.All",
    "Mail.Send.Shared"
];

let msalInstance = null;
let userAccount = null;
let authReady = false;

// One-per-tab guards to prevent redirect loops
const AUTOLOGIN_ATTEMPTED_KEY = "msal_autologin_attempted_v1";
const REDIRECT_IN_PROGRESS_KEY = "msal_redirect_in_progress_v1";

// ------------------------------
// Small helpers
// ------------------------------

function isRedirectCallbackUrl() {
    // If the URL has an auth response in the hash, we're in the middle of the redirect round-trip.
    const h = window.location.hash || "";
    return h.includes("code=") || h.includes("state=") || h.includes("error=");
}

function setActiveAccount(account) {
    userAccount = account || null;

    if (msalInstance && userAccount && typeof msalInstance.setActiveAccount === "function") {
        msalInstance.setActiveAccount(userAccount);
    }

    if (userAccount && window.UIrenderer &&
        typeof UIrenderer.updateUIForLoggedInUser === "function") {
        UIrenderer.updateUIForLoggedInUser();
    }
}

function clearAutoLoginGuardsOnSuccess() {
    try {
        sessionStorage.removeItem(AUTOLOGIN_ATTEMPTED_KEY);
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

function hasTriedAutoLogin() {
    try {
        return sessionStorage.getItem(AUTOLOGIN_ATTEMPTED_KEY) === "1";
    } catch (_) {
        return false;
    }
}

function markTriedAutoLogin() {
    try {
        sessionStorage.setItem(AUTOLOGIN_ATTEMPTED_KEY, "1");
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
// Token acquisition
//  - By default, will auto-redirect ONCE per tab session if interaction is required.
//  - This prevents the "stuck" state without causing infinite loops.
// ------------------------------

async function getScopedAccessToken(scopes, options = {}) {
    const {
        autoRedirectOnce = true,       // minimal interaction
        redirectScopes = scopes,       // what to request interactively
        reason = "token"               // for logging
    } = options;

    if (!msalInstance || !authReady) {
        console.warn("[Token] Auth not ready; initializing.");
        await initializeAuth();
    }

    if (!msalInstance) {
        console.warn("[Token] msalInstance not initialized.");
        return null;
    }

    // Determine account
    let account =
        (typeof msalInstance.getActiveAccount === "function" ? msalInstance.getActiveAccount() : null) ||
        userAccount ||
        (msalInstance.getAllAccounts()[0] || null);

    if (!account) {
        console.log("[Token] No logged-in user.");
        if (autoRedirectOnce) {
            await maybeAutoRedirect(redirectScopes, reason);
        }
        return null;
    }

    // Keep active account aligned
    if (!userAccount || (userAccount.homeAccountId !== account.homeAccountId)) {
        setActiveAccount(account);
    }

    try {
        const tokenResponse = await msalInstance.acquireTokenSilent({
            scopes,
            account
        });
        return tokenResponse.accessToken;
    } catch (error) {
        console.warn("[Token] Silent acquisition failed.", error);

        if (error instanceof msal.InteractionRequiredAuthError) {
            console.log("[Token] Interaction required.");
            if (autoRedirectOnce) {
                await maybeAutoRedirect(redirectScopes, reason);
            }
            return null;
        }

        throw error;
    }
}

async function maybeAutoRedirect(scopesForRedirect, reason) {
    // Never redirect if we are already in the callback hash or a redirect is already underway.
    if (isRedirectCallbackUrl() || isRedirectInProgress()) {
        console.log(`[Token] Suppressing auto-redirect (${reason}): redirect callback/in-progress.`);
        return;
    }

    // Only once per tab session, to prevent loops.
    if (hasTriedAutoLogin()) {
        console.log(`[Token] Suppressing auto-redirect (${reason}): already attempted once this session.`);
        return;
    }

    markTriedAutoLogin();

    // Save deep link and redirect
    try {
        sessionStorage.setItem("postLoginUrl", window.location.href);
    } catch (e) {
        console.warn("[Auth] Could not persist post-login URL:", e);
    }

    console.log(`[Token] Auto-redirecting to sign-in (${reason})...`);
    markRedirectInProgress();
    await msalInstance.loginRedirect({ scopes: scopesForRedirect });
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
