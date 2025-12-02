// auth.js

// Microsoft Authentication Configuration
const msalConfig = {
    auth: {
        clientId: "26f834bc-3365-486c-95ff-1a45a24488b5",
        authority: "https://login.microsoftonline.com/b4b6e20e-14bd-4419-bf0a-c7d2c948c513",
        redirectUri: "https://psyborg-protocols.github.io/EasySearchTests/",
    },
    cache: {
        cacheLocation: "sessionStorage",
        storeAuthStateInCookie: true,
    }
};

// --- API Configuration ---
const contactUpdateScope = `api://${msalConfig.auth.clientId}/Contacts.Update`;
const companyResearchScope = `api://${msalConfig.auth.clientId}/Company.Research`; // NEW: Scope for the LLM feature

// MS Graph API scopes needed for accessing OneDrive files
const graphScopes = [
    "User.Read",
    "Files.ReadWrite.All",
    "Sites.Read.All",
    "OrgContact.Read.All"
];

// Global variables for the MSAL instance and user account
let msalInstance;
let userAccount = null;

// Consolidated function to update UI and load OneDrive files after a successful login
function handleLoginResponse(account) {
    userAccount = account;
    if (userAccount) {
        UIrenderer.updateUIForLoggedInUser();
    }
}

// Initialize the MSAL authentication module
function initializeAuth() {
    msalInstance = new msal.PublicClientApplication(msalConfig);

    // Check if there's an already logged-in user
    const accounts = msalInstance.getAllAccounts();
    if (accounts.length > 0) {
        handleLoginResponse(accounts[0]);
    }

    // Process any redirect response
    msalInstance.handleRedirectPromise()
        .then(response => {
            if (response) {
                handleLoginResponse(response.account);
            }
        })
        .catch(error => {
            console.error("Error during authentication:", error);
        });
}

// Sign in using redirect
async function signIn() {
    try {
        // Use loginRedirect instead of loginPopup
        await msalInstance.loginRedirect({ scopes: graphScopes });
        // The page will now reload, so no code below this line needs to run
    } catch (error) {
        console.error("Sign-in error:", error);
        throw error;
    }
}


// Sign out and clear the user session
function signOut() {
    if (msalInstance) {
        const accounts = msalInstance.getAllAccounts();
        
        // 1. Determine which account to sign out. 
        //    Use the global userAccount if set, otherwise fallback to the first account found.
        const accountToLogout = userAccount || (accounts.length > 0 ? accounts[0] : null);

        if (accountToLogout) {
            console.log(`[signOut] Initiating logoutRedirect for: ${accountToLogout.username}`);
            
            // 2. Clear local storage/session data immediately
            clearMSALStorage();
            UIrenderer.updateUIForLoggedOutUser();

            // 3. Redirect the browser to the Microsoft logout endpoint
            //    This replaces the 'logoutPopup' loop.
            msalInstance.logoutRedirect({
                account: accountToLogout,
                postLogoutRedirectUri: msalConfig.auth.redirectUri
            });
        } else {
            // Edge case: No MSAL accounts found, just clean up locally
            console.log('[signOut] No MSAL accounts found to log out. Cleaning local storage.');
            clearMSALStorage();
            UIrenderer.updateUIForLoggedOutUser();
        }
    } else {
        console.warn("[signOut] MSAL instance was not initialized.");
    }

    userAccount = null;
}
  
function clearMSALStorage() {
    console.log("[clearMSALStorage] Clearing MSAL caches and storages.");
    sessionStorage.clear();
    localStorage.clear();
    Object.keys(sessionStorage)
      .filter(key => key.includes('msal'))
      .forEach(key => sessionStorage.removeItem(key));
  
    Object.keys(localStorage)
      .filter(key => key.includes('msal'))
      .forEach(key => localStorage.removeItem(key));
  
    console.log("[clearMSALStorage] All MSAL storage cleared.");
}
  
/**
 * Acquires an access token for a specific set of scopes.
 * @param {string[]} scopes - An array of scopes to request for the token.
 * @returns {Promise<string>} The access token.
 */
async function getScopedAccessToken(scopes) {
    if (!userAccount) {
        const accounts = msalInstance.getAllAccounts();
        if (accounts.length > 0) {
            userAccount = accounts[0];
        } else {
            throw new Error("User not logged in. Cannot acquire token.");
        }
    }

    // Try to get the token silently
    try {
        const tokenResponse = await msalInstance.acquireTokenSilent({
            scopes,
            account: userAccount
        });
        return tokenResponse.accessToken;
    } catch (error) {
        console.warn("[getScopedAccessToken] Silent token acquisition failed.", error);
            
        if (error instanceof msal.InteractionRequiredAuthError) {
            // This error means the user needs to sign in again explicitly
            throw error;
        }
        
        throw error;
    }
}

/**
 * Acquires an access token specifically for the Microsoft Graph API.
 * @returns {Promise<string>} The access token for MS Graph.
 */
async function getAccessToken() {
    return getScopedAccessToken(graphScopes);
}

/**
 * Acquires an access token for updating contacts via our backend API.
 * @returns {Promise<string>} The access token for the backend API.
 */
async function getApiAccessToken() {
    return getScopedAccessToken([contactUpdateScope]);
}

/**
 * NEW: Acquires an access token for the LLM proxy via our backend API.
 * @returns {Promise<string>} The access token for the backend LLM feature.
 */
async function getLLMAccessToken() {
    return getScopedAccessToken([companyResearchScope]);
}
