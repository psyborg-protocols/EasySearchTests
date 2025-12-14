// ---------------------------------------------
// auth.js — Redirect-based MSAL flow (auto-redirect ONCE)
// ---------------------------------------------

const msalConfig = {
  auth: {
    clientId: "26f834bc-3365-486c-95ff-1a45a24488b5",
    authority: "https://login.microsoftonline.com/b4b6e20e-14bd-4419-bf0a-c7d2c948c513",
    redirectUri: "https://psyborg-protocols.github.io/EasySearchTests/",
  },
  cache: {
    cacheLocation: "localStorage",
    storeAuthStateInCookie: true,
  },
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
  "Mail.Send.Shared",
];

let msalInstance = null;
let userAccount = null;
let authReady = false;

const AUTOLOGIN_FLAG = "msal_autologin_attempted";

// ------------------------------
// Helpers
// ------------------------------

function isInAuthRedirectCallback() {
  const h = window.location.hash || "";
  // code/state/error show up in the hash for redirect responses in SPAs
  return h.includes("code=") || h.includes("state=") || h.includes("error=");
}

function setActiveAccount(account) {
  userAccount = account || null;
  if (msalInstance && userAccount) {
    msalInstance.setActiveAccount(userAccount);
  }
}

function handleLoginResponse(account) {
  setActiveAccount(account);

  if (
    userAccount &&
    window.UIrenderer &&
    typeof UIrenderer.updateUIForLoggedInUser === "function"
  ) {
    UIrenderer.updateUIForLoggedInUser();
  }
}

// ------------------------------
// Initialization
// ------------------------------

async function initializeAuth() {
  msalInstance = new msal.PublicClientApplication(msalConfig);

  try {
    // 1) Always finish redirect processing first
    const response = await msalInstance.handleRedirectPromise();

    if (response?.account) {
      console.log("[Auth] Completed redirect login.");
      handleLoginResponse(response.account);

      // Success: clear the auto-login guard
      sessionStorage.removeItem(AUTOLOGIN_FLAG);

      // Restore original deep link if we saved one pre-login
      const postLoginUrl = sessionStorage.getItem("postLoginUrl");
      if (postLoginUrl) {
        sessionStorage.removeItem("postLoginUrl");
        window.location.replace(postLoginUrl);
        return;
      }

      authReady = true;
      return;
    }

    // 2) No fresh redirect result — try to restore an existing session
    const accounts = msalInstance.getAllAccounts();
    if (accounts.length > 0) {
      console.log("[Auth] Existing account restored.");
      handleLoginResponse(accounts[0]);
    } else {
      console.log("[Auth] No existing account; waiting for user to sign in.");
    }

    authReady = true;
  } catch (error) {
    console.error("[Auth] Error during redirect processing:", error);
    authReady = true; // allow app to continue; user can click sign-in
  }
}

// ------------------------------
// Sign-in / Sign-out
// ------------------------------

async function signIn() {
  if (!msalInstance || !authReady) {
    console.warn("[Auth] signIn called before auth ready; initializing now.");
    await initializeAuth();
  }

  console.log("[SignIn] Redirecting to Microsoft login...");

  // Save current URL (supports deep links with hash/query)
  try {
    sessionStorage.setItem("postLoginUrl", window.location.href);
  } catch (e) {
    console.warn("[Auth] Could not persist post-login URL:", e);
  }

  // User-initiated login should reset the guard
  sessionStorage.removeItem(AUTOLOGIN_FLAG);

  await msalInstance.loginRedirect({ scopes: graphScopes });
}

function signOut() {
  if (!msalInstance) return;

  const accounts = msalInstance.getAllAccounts();
  const accountToLogout = userAccount || (accounts.length > 0 ? accounts[0] : null);

  if (
    window.UIrenderer &&
    typeof UIrenderer.updateUIForLoggedOutUser === "function"
  ) {
    UIrenderer.updateUIForLoggedOutUser();
  }

  if (accountToLogout) {
    msalInstance.logoutRedirect({
      account: accountToLogout,
      postLogoutRedirectUri: msalConfig.auth.redirectUri,
    });
  } else {
    console.log("[Auth] No account to log out.");
  }
}

// ------------------------------
// Token acquisition (auto-redirect ONCE)
// ------------------------------

async function getScopedAccessToken(scopes, opts = {}) {
  const { autoRedirectOnce = false, reason = "unspecified" } = opts;

  if (!msalInstance) {
    console.warn("[Token] msalInstance not initialized.");
    return null;
  }

  if (!authReady) {
    console.warn("[Token] Auth not ready yet; returning null.");
    return null;
  }

  // Ensure we know the active account
  if (!userAccount) {
    const accounts = msalInstance.getAllAccounts();
    if (accounts.length > 0) {
      setActiveAccount(accounts[0]);
    } else {
      console.log("[Token] No logged-in user; returning null.");
      return null; // <- no redirect here
    }
  }

  try {
    const tokenResponse = await msalInstance.acquireTokenSilent({
      scopes,
      account: userAccount,
    });

    // Success: clear auto-login guard
    sessionStorage.removeItem(AUTOLOGIN_FLAG);

    return tokenResponse.accessToken;
  } catch (error) {
    console.warn("[Token] Silent acquisition failed.", { reason, error });

    if (error instanceof msal.InteractionRequiredAuthError) {
      // Prevent redirect loops:
      // - never redirect while processing a redirect response
      // - only redirect once per page-load/session
      if (autoRedirectOnce) {
        const attempted = sessionStorage.getItem(AUTOLOGIN_FLAG) === "1";
        if (!attempted && !isInAuthRedirectCallback()) {
          console.log(
            `[Token] Interaction required; auto-redirecting ONCE (reason=${reason}).`
          );
          sessionStorage.setItem(AUTOLOGIN_FLAG, "1");

          try {
            sessionStorage.setItem("postLoginUrl", window.location.href);
          } catch (_) {}

          await msalInstance.loginRedirect({ scopes });
          return null; // navigation happens
        }
      }

      console.log(
        "[Token] Interaction required; returning null so caller/UI can decide what to do."
      );
      return null;
    }

    throw error;
  }
}

// Convenience wrappers
async function getAccessToken(opts) {
  return getScopedAccessToken(graphScopes, opts);
}

async function getApiAccessToken(opts) {
  return getScopedAccessToken([contactUpdateScope], opts);
}

async function getLLMAccessToken(opts) {
  return getScopedAccessToken([companyResearchScope], opts);
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
  const token = await getAccessToken({ autoRedirectOnce: true, reason: "send_mail" });

  if (!token) {
    throw new Error("Not authenticated; please sign in before sending email.");
  }

  const mailData = {
    message: {
      subject: subject,
      body: {
        contentType: "HTML",
        content: htmlBody,
      },
      toRecipients: [
        {
          emailAddress: {
            address: toEmail,
          },
        },
      ],
    },
    saveToSentItems: true,
  };

  // Try sending from shared mailbox first
  let endpoint = `https://graph.microsoft.com/v1.0/users/${SHARED_MAILBOX_ADDRESS}/sendMail`;

  // Fallback logic for development environments where the constant might not be set
  if (!SHARED_MAILBOX_ADDRESS.includes("brandywinematerials.com")) {
    endpoint = `https://graph.microsoft.com/v1.0/me/sendMail`;
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(mailData),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Email Send Failed: ${errorText}`);
  }
}