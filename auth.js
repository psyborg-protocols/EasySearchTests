// auth.js

// Microsoft Authentication Configuration
const msalConfig = {
    auth: {
        clientId: "fd222d3b-4c6d-4968-a33e-a7c124caacad",
        authority: "https://login.microsoftonline.com/common",
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
    // TODO: this is for business accounts "Files.Read.All"
    "Files.Read"
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
    msalInstance.logout({
        onRedirectNavigate: () => {
            UIrenderer.updateUIForLoggedOutUser();
            return false; // Prevent redirect navigation
        }
    });
    userAccount = null;
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
