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
        storeAuthStateInCookie: false,
    }
};

// MS Graph API scopes needed for accessing OneDrive files
const scopes = [
    "User.Read",
    "Files.ReadWrite.All",
    "Sites.Read.All",
    "OrgContact.Read.All",
    "api://26f834bc-3365-486c-95ff-1a45a24488b5/Contacts.Update"
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

// Sign in using a popup window
async function signIn() {
    try {
        const response = await msalInstance.loginPopup({ scopes });
        handleLoginResponse(response.account);
        return response.account; // Ensure the caller can wait for authentication
    } catch (error) {
        console.error("Sign-in error:", error);
        throw error;
    }
}


// Sign out and clear the user session
function signOut() {
    if (msalInstance) {
      const accounts = msalInstance.getAllAccounts();
  
      if (accounts.length > 0) {
        // Explicitly remove accounts from MSAL cache
        accounts.forEach(account => {
          msalInstance.logoutPopup({
            account: account,
            postLogoutRedirectUri: msalConfig.auth.redirectUri,
            mainWindowRedirectUri: msalConfig.auth.redirectUri
          }).then(() => {
            console.log(`[signOut] Successfully logged out: ${account.username}`);
            clearMSALStorage();
            UIrenderer.updateUIForLoggedOutUser();
          }).catch(error => {
            console.error('[signOut] Error logging out via popup:', error);
          });
        });
      } else {
        console.log('[signOut] No accounts found to log out.');
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
  
    // Clears both sessionStorage and localStorage used by MSAL
    sessionStorage.clear();
    localStorage.clear();
  
    // Double-check for any MSAL-specific keys that might linger
    Object.keys(sessionStorage)
      .filter(key => key.includes('msal'))
      .forEach(key => sessionStorage.removeItem(key));
  
    Object.keys(localStorage)
      .filter(key => key.includes('msal'))
      .forEach(key => localStorage.removeItem(key));
  
    console.log("[clearMSALStorage] All MSAL storage cleared.");
  }
  

// Acquire an access token for MS Graph API calls
async function getAccessToken() {
    if (!userAccount) {
        throw new Error("User not logged in");
    }

    try {
        // Try to get token silently
        const tokenResponse = await msalInstance.acquireTokenSilent({
            scopes,
            account: userAccount
        });
        return tokenResponse.accessToken;
    } catch (error) {
        console.log("Silent token acquisition failed, forcing reauthentication...");
        
        // If silent token fails, force an interactive login
        try {
            const tokenResponse = await msalInstance.acquireTokenPopup({ 
                scopes, 
                forceRefresh: true 
            });
            return tokenResponse.accessToken;
        } catch (err) {
            console.error("Error acquiring token interactively:", err);
            throw err;
        }
    }
}
