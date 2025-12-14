// =====================================================
// app.js — Startup + cache + auth (auto-redirect ONCE)
// =====================================================

const APP_VERSION = "1.1.1";

function showAuthNudge(message) {
  const el = document.getElementById("authNudge");
  if (!el) return;
  el.textContent = message;
  el.classList.remove("d-none");
}

function hideAuthNudge() {
  const el = document.getElementById("authNudge");
  if (!el) return;
  el.classList.add("d-none");
}

document.addEventListener("DOMContentLoaded", async function () {
  // ------------------------------
  // VERSION CHECK
  // ------------------------------
  const currentVersion = localStorage.getItem("APP_VERSION");
  if (currentVersion !== APP_VERSION) {
    console.log(`[Version Check] ${currentVersion} → ${APP_VERSION}`);
    await idbUtil.clearDatasets();
    localStorage.setItem("APP_VERSION", APP_VERSION);
    location.reload();
    return;
  }

  // ------------------------------
  // AUTH INITIALIZATION
  // ------------------------------
  // IMPORTANT: this processes any MSAL redirect response first.
  await initializeAuth();

  // ------------------------------
  // LOAD CACHE FIRST (instant UI)
  // ------------------------------
  let isCacheLoaded = false;

  try {
    console.log("[Startup] Attempting to load cache...");

    const cachedDB = await idbUtil.getDataset("DBData");
    const cachedSales = await idbUtil.getDataset("SalesData");
    const cachedPricing = await idbUtil.getDataset("PricingData");
    const cachedEquivalents = await idbUtil.getDataset("EquivalentsData");
    const cachedPriceRaise = await idbUtil.getDataset("PriceRaiseData");
    const cachedCompanyInfo = await idbUtil.getDataset("CompanyInfoData");
    const cachedOrgContacts = await idbUtil.getDataset("OrgContactsData");
    const cachedOrders = await idbUtil.getDataset("OrdersData");
    const cachedSamples = await idbUtil.getDataset("SamplesData");

    if (cachedDB && cachedSales && cachedPricing) {
      window.dataStore["DB"] = cachedDB;
      window.dataStore["Sales"] = cachedSales;
      window.dataStore["Pricing"] = cachedPricing;
      window.dataStore["PriceRaise"] = cachedPriceRaise;

      if (cachedCompanyInfo) window.dataStore["CompanyInfo"] = cachedCompanyInfo;
      if (cachedEquivalents) window.dataStore["Equivalents"] = cachedEquivalents;
      if (cachedOrgContacts) {
        window.dataStore["OrgContacts"] = new Map(Object.entries(cachedOrgContacts));
      }
      if (cachedOrders) window.dataStore["Orders"] = cachedOrders;
      if (cachedSamples) window.dataStore["Samples"] = cachedSamples;

      console.log("[Startup] Cache loaded. UI active.");
      isCacheLoaded = true;

      window.reportsReady = true;
      document.dispatchEvent(new Event("reports-ready"));
    } else {
      console.warn("[Startup] Cache incomplete; full load required.");
    }
  } catch (err) {
    console.error("[Startup] Cache load error:", err);
  }

  // ------------------------------
  // BACKGROUND REFRESH
  // ------------------------------
  // Strategy:
  // - Try silent token.
  // - If interaction is required AND we have no usable cache, do ONE auto-redirect.
  // - Otherwise, show a gentle nudge and keep the cached UI.
  try {
    const token = await getAccessToken({
      autoRedirectOnce: !isCacheLoaded, // minimal interaction only when needed
      reason: "startup_background_refresh"
    });

    if (token) {
      hideAuthNudge();
      console.log("[Startup] Refreshing data in background...");
      await dataLoader.processFiles();

      if (!isCacheLoaded) {
        window.reportsReady = true;
        document.dispatchEvent(new Event("reports-ready"));
      }

      console.log("[Startup] Background refresh complete.");

      if (window.ReportManager) {
        await window.ReportManager.checkDueReportsAndTrackVisits();
      }
    } else {
      // Not logged in / session expired
      console.log("[Startup] Not signed in yet — skipping background refresh.");
      showAuthNudge("Session expired. Click ‘Sign in’ to refresh data.");
    }
  } catch (e) {
    console.error("[Startup] Error during background refresh:", e);
    showAuthNudge("Could not refresh right now. If this persists, sign in again.");
  }

  // ------------------------------
  // BUTTONS
  // ------------------------------
  const signInButton = document.getElementById("signInButton");
  if (signInButton) {
    signInButton.addEventListener("click", () => signIn());
  }

  const signOutButton = document.getElementById("signOutButton");
  if (signOutButton) {
    signOutButton.addEventListener("click", () => signOut());
  }

  // ------------------------------
  // FILE LINK POPULATION
  // ------------------------------
  const exposeFileLinks = () => {
    const { fileLinks = {} } = window.dataStore || {};
    const setLink = (id, url) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.href = url || "#";
      el.classList.toggle("d-none", !url);
    };
    setLink("salesFileLink", fileLinks.Sales);
    setLink("dbFileLink", fileLinks.DB);
    setLink("pricingFileLink", fileLinks.Pricing);
  };

  document.addEventListener("reports-ready", exposeFileLinks);
  exposeFileLinks();
});


// =====================================================
// auth.js — Redirect-based MSAL flow (auto-redirect ONCE)
// =====================================================

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

const SHARED_MAILBOX_ADDRESS = "reminders@brandywinematerials.com";

const contactUpdateScope = `api://${msalConfig.auth.clientId}/Contacts.Update`;
const companyResearchScope = `api://${msalConfig.auth.clientId}/Company.Research`;

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

      // Restore deep link if we saved one pre-login
      const postLoginUrl = sessionStorage.getItem("postLoginUrl");
      if (postLoginUrl) {
        sessionStorage.removeItem("postLoginUrl");
        window.location.replace(postLoginUrl);
        return;
      }

      authReady = true;
      return;
    }

    // 2) No new redirect result — restore an existing session
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

async function signIn() {
  if (!msalInstance || !authReady) {
    console.warn("[Auth] signIn called before auth ready; initializing now.");
    await initializeAuth();
  }

  console.log("[SignIn] Redirecting to Microsoft login...");

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
      return null;
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

async function sendMail(subject, htmlBody, toEmail) {
  // For user-triggered actions (send mail), we allow auto-redirect once.
  const token = await getAccessToken({ autoRedirectOnce: true, reason: "send_mail" });

  if (!token) {
    throw new Error("Not authenticated; please sign in before sending email.");
  }

  const mailData = {
    message: {
      subject,
      body: { contentType: "HTML", content: htmlBody },
      toRecipients: [{ emailAddress: { address: toEmail } }],
    },
    saveToSentItems: true,
  };

  let endpoint = `https://graph.microsoft.com/v1.0/users/${SHARED_MAILBOX_ADDRESS}/sendMail`;
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
