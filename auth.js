// Microsoft Authentication Configuration
const msalConfig = {
    auth: {
        clientId: "fd222d3b-4c6d-4968-a33e-a7c124caacad",
        authority: "https://login.microsoftonline.com/common",
        redirectUri: window.location.origin,
    },
    cache: {
        cacheLocation: "sessionStorage",
        storeAuthStateInCookie: false,
    }
};

// MSAL instance
let msalInstance;

// MS Graph API scopes needed for accessing OneDrive files
const scopes = [
    "User.Read",
    "Files.Read.All"
];

// User account information
let userAccount = null;

// Initialize the MSAL auth module
function initializeAuth() {
    msalInstance = new msal.PublicClientApplication(msalConfig);
    
    // Check if there's already a logged in user in session
    const accounts = msalInstance.getAllAccounts();
    if (accounts.length > 0) {
        userAccount = accounts[0];
        updateUIForLoggedInUser();
        loadOneDriveFiles(); // Load the files when we find an existing login
    }
    
    // Handle redirect response if any
    msalInstance.handleRedirectPromise()
        .then(response => {
            if (response) {
                userAccount = response.account;
                updateUIForLoggedInUser();
                loadOneDriveFiles();
            }
        })
        .catch(error => {
            console.error("Error during authentication:", error);
        });
}

// Sign in function
function signIn() {
    msalInstance.loginPopup({ scopes })
        .then(response => {
            userAccount = response.account;
            updateUIForLoggedInUser();
            loadOneDriveFiles();
        })
        .catch(error => {
            console.error("Sign-in error:", error);
        });
}

// Sign out function
function signOut() {
    msalInstance.logout({
        onRedirectNavigate: () => {
            // Don't navigate away, just clear the state
            updateUIForLoggedOutUser();
            return false;
        }
    });
    userAccount = null;
}

// Get access token for MS Graph API calls
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
        // Silent token acquisition failed, try interactive
        console.log("Silent token acquisition failed, trying interactive method");
        if (error instanceof msal.InteractionRequiredAuthError) {
            try {
                const tokenResponse = await msalInstance.acquireTokenPopup({ scopes });
                return tokenResponse.accessToken;
            } catch (err) {
                console.error("Error acquiring token interactively:", err);
                throw err;
            }
        } else {
            console.error("Error acquiring token silently:", error);
            throw error;
        }
    }
}

// Update UI after successful login
function updateUIForLoggedInUser() {
    document.getElementById('loginContainer').style.display = 'none';
    document.getElementById('appContainer').style.display = 'block';
    
    // Display user name
    const displayName = userAccount.name || userAccount.username || "User";
    document.getElementById('userDisplayName').textContent = displayName;
}

// Update UI after logout
function updateUIForLoggedOutUser() {
    document.getElementById('appContainer').style.display = 'none';
    document.getElementById('loginContainer').style.display = 'flex';
    document.getElementById('fileListContainer').innerHTML = '';
    document.getElementById('tableContainer').style.display = 'none';
    document.getElementById('welcomeMessage').style.display = 'block';
}
