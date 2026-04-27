// ---------------------------------------------
// auth.js — Refactored to MSAL Popup Flow & Native Events
// ---------------------------------------------

// Force HTTPS to prevent localStorage partitioning mismatch on custom domains
if (window.location.protocol === "http:" && window.location.hostname !== "localhost") {
    window.location.replace(window.location.href.replace("http:", "https:"));
}

if (window !== window.parent) {
    console.warn("[Startup] Iframe execution detected. Halting script to prevent MSAL race conditions.");
    throw new Error("Iframe execution halted intentionally."); 
}

const msalConfig = {
    auth: {
        clientId: "26f834bc-3365-486c-95ff-1a45a24488b5",
        authority: "https://login.microsoftonline.com/b4b6e20e-14bd-4419-bf0a-c7d2c948c513",
        redirectUri: window.location.origin + "/",
        navigateToLoginRequestUrl: true // Natively handles deep-linking routing
    },
    cache: {
        cacheLocation: "localStorage",
        storeAuthStateInCookie: true
    },
    system: {
        loggerOptions: {
            loggerCallback: (level, message, containsPii) => {
                if (containsPii) return;
                console.log(`[MSAL] ${message}`);
            },
            logLevel: msal.LogLevel.Warning,
            piiLoggingEnabled: false
        }
    }
};

// Scopes
const contactUpdateScope = `api://${msalConfig.auth.clientId}/Contacts.Update`;
const companyResearchScope = `api://${msalConfig.auth.clientId}/Company.Research`;
const graphScopes = [
    "User.Read", "Files.ReadWrite.All", "Sites.ReadWrite.All", 
    "OrgContact.Read.All", "Mail.Send.Shared", "Mail.Read", "User.ReadBasic.All"
];

let msalInstance = null;
let userAccount = null;
let authReady = false;

function setActiveAccount(account) {
    userAccount = account || null;
    if (msalInstance && userAccount) {
        msalInstance.setActiveAccount(userAccount);
    }
}

// ------------------------------
// Initialization & Event System
// ------------------------------

async function initializeAuth() {
    if (authReady && msalInstance) return;

    msalInstance = new msal.PublicClientApplication(msalConfig);

    // 1. Leverage MSAL's Native Event System for UI State
    msalInstance.addEventCallback((message) => {
        
        // A. Initial Login Success (User just used the Popup)
        if (message.eventType === msal.EventType.LOGIN_SUCCESS) {
            if (message.payload && message.payload.account) {
                console.log("[Auth] Login Success Event Fired.");
                setActiveAccount(message.payload.account);
                
                if (window.UIrenderer) UIrenderer.updateUIForLoggedInUser();
                
                // Trigger fresh data ONLY on explicit login
                if (window.loadFreshAppData) window.loadFreshAppData();
            }
        }
        
        // B. Silent Token Refresh (Background Heartbeat)
        if (message.eventType === msal.EventType.ACQUIRE_TOKEN_SUCCESS) {
            if (message.payload && message.payload.account) {
                // Ensure the account stays active, but DO NOT trigger a data reload
                setActiveAccount(message.payload.account);
            }
        }
        
        // C. Logout Success
        if (message.eventType === msal.EventType.LOGOUT_SUCCESS) {
            console.log("[Auth] Logout Success Event Fired.");
            setActiveAccount(null);
            if (window.UIrenderer) UIrenderer.updateUIForLoggedOutUser();
        }
    });

    try {
        // Just in case the user previously used a redirect or falls back
        await msalInstance.handleRedirectPromise();
    } catch (error) {
        console.error("[Auth] Redirect handling error:", error);
    }

    // 2. Restore active account from cache on load
    const accounts = msalInstance.getAllAccounts();
    if (accounts.length > 0) {
        console.log("[Auth] Existing account restored from cache.");
        setActiveAccount(accounts[0]);
        if (window.UIrenderer) UIrenderer.updateUIForLoggedInUser();
    }

    authReady = true;
}

// ------------------------------
// Sign-in / Sign-out (Popup Flow)
// ------------------------------

async function signIn() {
    if (!msalInstance || !authReady) await initializeAuth();
    console.log("[SignIn] Initiating Microsoft Popup Login...");
    try {
        // MSAL Event System handles the UI rendering upon success
        await msalInstance.loginPopup({ scopes: graphScopes });
    } catch (error) {
        console.error("[Auth] Popup Login failed or was cancelled:", error);
    }
}

function signOut() {
    if (!msalInstance) return;
    const accountToLogout = msalInstance.getActiveAccount() || msalInstance.getAllAccounts()[0];
    
    if (accountToLogout) {
        msalInstance.logoutPopup({ account: accountToLogout });
    } else {
        if (window.UIrenderer) UIrenderer.updateUIForLoggedOutUser();
    }
}

// ------------------------------
// Centralized Fetch Interceptor
// ------------------------------

/**
 * A centralized wrapper around `fetch` that automatically acquires and attaches
 * the MSAL Bearer token, and handles 401 Unauthorized retries seamlessly.
 */
async function authenticatedFetch(url, options = {}, scopes = graphScopes) {
    let token = await getAccessToken(scopes);
    
    if (!token) {
        throw new Error("Authentication required to make this request.");
    }

    const headers = new Headers(options.headers || {});
    headers.set("Authorization", `Bearer ${token}`);
    
    let fetchOptions = { ...options, headers };
    let response = await fetch(url, fetchOptions);

    // If the token was subtly rejected by the backend, force a refresh and retry once
    if (response.status === 401) {
        console.warn(`[Fetch Interceptor] 401 Unauthorized on ${url}. Forcing token refresh...`);
        token = await getAccessToken(scopes, true); // Force refresh bypassing cache
        
        if (token) {
            headers.set("Authorization", `Bearer ${token}`);
            fetchOptions = { ...options, headers };
            response = await fetch(url, fetchOptions);
        }
    }

    return response;
}

// ------------------------------
// Token Acquisition
// ------------------------------

async function getScopedAccessToken(scopes, forceRefresh = false) {
    if (!msalInstance || !authReady) await initializeAuth();

    const account = msalInstance.getActiveAccount() || msalInstance.getAllAccounts()[0];
    if (!account) return null;

    try {
        // 1. Try silent acquisition first (hidden iframe / cache)
        const response = await msalInstance.acquireTokenSilent({
            scopes,
            account,
            forceRefresh
        });
        return response.accessToken;
    } catch (error) {
        console.warn("[Token] Silent acquisition failed.", error);
        
        // 2. If silent fails, elegantly fallback to Popup
        if (error instanceof msal.InteractionRequiredAuthError) {
            console.log("[Token] Interaction required. Opening popup...");
            try {
                const popupResponse = await msalInstance.acquireTokenPopup({
                    scopes,
                    account
                });
                return popupResponse.accessToken;
            } catch (popupError) {
                console.error("[Token] Popup acquisition failed or cancelled.", popupError);
                return null;
            }
        }
        throw error;
    }
}

// Legacy wrappers kept for backwards compatibility with the rest of your app
async function getAccessToken() { return getScopedAccessToken(graphScopes); }
async function getApiAccessToken() { return getScopedAccessToken([contactUpdateScope]); }
async function getLLMAccessToken() { return getScopedAccessToken([companyResearchScope]); }

// Export interceptor for global use
window.authenticatedFetch = authenticatedFetch;