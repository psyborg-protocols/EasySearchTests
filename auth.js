// ---------------------------------------------
// auth.js — Improved redirect-based MSAL flow
// ---------------------------------------------

const msalConfig = {
    auth: {
        clientId: "26f834bc-3365-486c-95ff-1a45a24488b5",
        authority: "https://login.microsoftonline.com/b4b6e20e-14bd-4419-bf0a-c7d2c948c513",
        redirectUri: "https://psyborg-protocols.github.io/EasySearchTests/",
    },
    cache: {
        cacheLocation: "sessionStorage",
        storeAuthStateInCookie: true
    }
};

// Custom API scopes
const contactUpdateScope = `api://${msalConfig.auth.clientId}/Contacts.Update`;
const companyResearchScope = `api://${msalConfig.auth.clientId}/Company.Research`;

// Graph scopes
const graphScopes = [
    "User.Read",
    "Files.ReadWrite.All",
    "Sites.Read.All",
    "OrgContact.Read.All"
];

let msalInstance = null;
let userAccount = null;

// Update UI on login
function handleLoginResponse(account) {
    userAccount = account;
    if (userAccount) {
        UIrenderer.updateUIForLoggedInUser();
    }
}

// Updated initialization logic
function initializeAuth() {
    msalInstance = new msal.PublicClientApplication(msalConfig);

    // First process the redirect result BEFORE checking accounts
    msalInstance.handleRedirectPromise()
        .then(async (response) => {
            if (response && response.account) {
                console.log("[Auth] Completed redirect login.");
                handleLoginResponse(response.account);

                // After a redirect login, acquire a fresh token + start data load
                try {
                    const token = await getAccessToken();
                    console.log("[Auth] Token acquired after redirect login.");
                    await dataLoader.processFiles();
                    window.reportsReady = true;
                    document.dispatchEvent(new Event("reports-ready"));
                } catch (err) {
                    console.error("[Auth] Failed token request after redirect login:", err);
                }
                return;
            }

            // No redirect happened — normal startup
            const accounts = msalInstance.getAllAccounts();
            if (accounts.length > 0) {
                console.log("[Auth] Existing account restored.");
                handleLoginResponse(accounts[0]);
            } else {
                console.log("[Auth] No existing account; waiting for user to sign in.");
            }
        })
        .catch((error) => {
            console.error("Error during redirect processing:", error);
        });
}

/**
 * Sign-in using redirect
 */
async function signIn() {
    console.log("[SignIn] Redirecting to Microsoft login...");
    await msalInstance.loginRedirect({ scopes: graphScopes });
}

/**
 * Sign-out using redirect
 */
function signOut() {
    if (!msalInstance) return;

    const accounts = msalInstance.getAllAccounts();
    const accountToLogout = userAccount || (accounts.length > 0 ? accounts[0] : null);

    clearMSALStorage();
    UIrenderer.updateUIForLoggedOutUser();

    if (accountToLogout) {
        msalInstance.logoutRedirect({
            account: accountToLogout,
            postLogoutRedirectUri: msalConfig.auth.redirectUri
        });
    }
}

function clearMSALStorage() {
    sessionStorage.clear();
    localStorage.clear();

    Object.keys(sessionStorage)
        .filter(k => k.includes("msal"))
        .forEach(k => sessionStorage.removeItem(k));

    Object.keys(localStorage)
        .filter(k => k.includes("msal"))
        .forEach(k => localStorage.removeItem(k));
}

/**
 * Generic token acquisition: silent → redirect required
 */
async function getScopedAccessToken(scopes) {
    // Ensure we know the active account
    if (!userAccount) {
        const accounts = msalInstance.getAllAccounts();
        if (accounts.length > 0) {
            userAccount = accounts[0];
        } else {
            console.log("[Token] No user account found — redirecting to login...");
            msalInstance.loginRedirect({ scopes });
            return; // Browser leaves this page
        }
    }

    try {
        const tokenResponse = await msalInstance.acquireTokenSilent({
            scopes,
            account: userAccount
        });
        return tokenResponse.accessToken;
    } catch (error) {
        console.warn("[Token] Silent acquisition failed — likely token expired.", error);

        if (error instanceof msal.InteractionRequiredAuthError) {
            console.log("[Token] Redirecting for reauthentication...");
            msalInstance.acquireTokenRedirect({
                scopes,
                account: userAccount
            });
            return; // Browser redirects
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
