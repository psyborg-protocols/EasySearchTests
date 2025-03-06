// auth.js

// Microsoft Authentication Configuration
const msalConfig = {
    auth: {
        clientId: "fd222d3b-4c6d-4968-a33e-a7c124caacad",
        authority: "https://login.microsoftonline.com/cde644c0-38fe-42e2-a23f-1c5221e61d72",
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
    "Files.Read.All"
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
function signIn() {
    msalInstance.loginPopup({ scopes })
        .then(response => {
            handleLoginResponse(response.account);
        })
        .catch(error => {
            console.error("Sign-in error:", error);
        });
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
        const tokenResponse = await msalInstance.acquireTokenSilent({
            scopes,
            account: userAccount
        });
        return tokenResponse.accessToken;
    } catch (error) {
        console.log("Silent token acquisition failed, trying interactive method");
        try {
            const tokenResponse = await msalInstance.acquireTokenPopup({ scopes });
            return tokenResponse.accessToken;
        } catch (err) {
            console.error("Error acquiring token interactively:", err);
            throw err;
        }
    }
}
