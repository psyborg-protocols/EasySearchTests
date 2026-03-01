/**
 * Utility functions for contact matching and management.
 */

function findPotentialMatches(customerName, orgContacts=window.dataStore.orgContacts, limit = 3) {
    if (!orgContacts || orgContacts.size === 0) {
        return [];
    }

    const normalizeName = (name) => {
        return name.toLowerCase()
                .replace(/&/g, ' and ')
                .replace(/[^\w\s]/g, ' ')
                .replace(/\b(corporation|corpor|corp|incorporated|inc|llc|ltd|limited|company|co|the|and|of)\b/g, '')
                .replace(/\s+/g, ' ')
                .trim();
    };

    const rawSearchKey = customerName.trim().toLowerCase();
    const normalizedSearchKey = normalizeName(rawSearchKey);
    const searchKey = normalizedSearchKey.length > 0 ? normalizedSearchKey : rawSearchKey;

    const allCompanyNames = Array.from(orgContacts.keys()).map(name => ({
        original: name,
        searchable: normalizeName(name) || name
    }));
    
    const options = {
        includeScore: true,
        threshold: 0.4,
        ignoreLocation: true,
        keys: [
            { name: 'searchable', weight: 2 },
            { name: 'original', weight: 1 }
        ]
    };
    
    const fuse = new Fuse(allCompanyNames, options);
    let rawResults = fuse.search(searchKey);

    rawResults.forEach(result => {
        const targetRaw = result.item.original.toLowerCase();
        const targetNorm = result.item.searchable;
        
        const isSubstring = targetRaw.includes(rawSearchKey) || 
                            rawSearchKey.includes(targetRaw) ||
                            targetNorm.includes(searchKey) ||
                            searchKey.includes(targetNorm);

        if (isSubstring) {
            result.score = result.score * 0.1; 
        }
    });

    rawResults.sort((a, b) => a.score - b.score);
    
    const results = rawResults.map(result => ({
        item: result.item.original,
        refIndex: result.refIndex,
        score: result.score
    }));
    
    return results.slice(0, limit);
}

/**
 * Merges contacts from a mismatched company into the correct company and updates the backend.
 */
async function mergeOrganizationContacts(correctCompanyName, mismatchedCompanyName) {
    const orgContacts = window.dataStore.OrgContacts;
    const contactsToUpdate = orgContacts.get(mismatchedCompanyName) || [];

    if (contactsToUpdate.length === 0) return;

    // 1. Call the backend API for each contact
    const updatePromises = contactsToUpdate.map(contact =>
        updateContactCompany(contact.Email, correctCompanyName) 
    );
    await Promise.all(updatePromises);

    // 2. Update in-memory data store
    const correctKey = correctCompanyName.trim().toLowerCase();
    const correctContactsList = orgContacts.get(correctKey) || [];

    contactsToUpdate.forEach(contact => {
      if (!correctContactsList.some(c => c.Email.toLowerCase() === contact.Email.toLowerCase())) {
        correctContactsList.push(contact);
      }
    });

    orgContacts.set(correctKey, correctContactsList);
    orgContacts.delete(mismatchedCompanyName);

    // 3. Write through to IndexedDB
    if (window.idbUtil) {
        await idbUtil.setDataset("OrgContactsData", Object.fromEntries(orgContacts));
    }
}

/**
 * Fetches organizational contacts using a delta query for efficiency.
 */
async function fetchAndProcessOrgContacts(token) {
  let cachedContactsMap = window.dataStore.OrgContacts || new Map();
  const metadata = await idbUtil.getDataset("OrgContactsMetadata") || {};
  let nextLink = metadata.deltaLink;

  if (nextLink) {
    console.log("Found deltaLink. Fetching changes for organizational contacts...");
  } else {
    console.log("No deltaLink found. Performing full sync for organizational contacts...");
    nextLink = 'https://graph.microsoft.com/v1.0/contacts/delta?$select=displayName,companyName,jobTitle,mail';
  }

  try {
    let changes = [];
    while (nextLink) {
      const response = await fetch(nextLink, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!response.ok) throw new Error(`Graph API request failed: ${response.statusText}`);
      const data = await response.json();
      changes = changes.concat(data.value);

      if (data['@odata.deltaLink']) {
        metadata.deltaLink = data['@odata.deltaLink'];
        nextLink = null;
      } else {
        nextLink = data['@odata.nextLink'];
      }
    }

    console.log(`Successfully fetched ${changes.length} changes for contacts.`);

    if (changes.length > 0) {
      for (const contact of changes) {
        const company = (contact.companyName || 'Unknown').trim().toLowerCase();

        if (contact['@removed']) {
          if (cachedContactsMap.has(company)) {
            const companyContacts = cachedContactsMap.get(company).filter(c => c.id !== contact.id);
            if (companyContacts.length > 0) {
              cachedContactsMap.set(company, companyContacts);
            } else {
              cachedContactsMap.delete(company);
            }
          }
        } else {
          const newContact = {
            id: contact.id,
            Name: contact.displayName,
            Title: contact.jobTitle,
            Email: contact.mail
          };
          if (!cachedContactsMap.has(company)) {
            cachedContactsMap.set(company, []);
          }
          const existingContacts = cachedContactsMap.get(company);
          const index = existingContacts.findIndex(c => c.id === newContact.id);
          if (index > -1) {
            existingContacts[index] = newContact;
          } else {
            existingContacts.push(newContact);
          }
        }
      }
      console.log("Applied changes to in-memory contact list.");
    }

    await idbUtil.setDataset("OrgContactsData", Object.fromEntries(cachedContactsMap));
    await idbUtil.setDataset("OrgContactsMetadata", metadata);

    return cachedContactsMap;

  } catch (error) {
    console.error("Error fetching or processing organizational contacts:", error);
    if (metadata.deltaLink) {
      metadata.deltaLink = null;
      await idbUtil.setDataset("OrgContactsMetadata", metadata);
      console.warn("DeltaLink expired; cleared to force full sync.");
    }
    return cachedContactsMap;
  }
}

function normaliseCompanyInfo(frame) {
  const map = {};
  for (const row of frame) {
    const company = String(row.Company || "").trim().replace(/\s+/g, " ").toLowerCase();
    if (!company) continue;

    map[company] = {
      company: row.Company,
      location: row.Location || "",
      business: row.Business || "",
      type: row.Type || "",
      remarks: row.Remarks || "",
      website: row.Website || ""
    };
  }
  return map;
}

function getCustomerDetails(company) {
  const key = company.trim().replace(/\s+/g, " ").toLowerCase();
  return (window.dataStore.CompanyInfo?.dataframe || {})[key] || null;
}

async function updateContactCompany(email, newCompanyName) {
  try {
    const payload = {
      action: 'updateCompany',
      email: email,
      companyName: newCompanyName
    };

    const contactUrl = `${window.BW_CONFIG.BW_BACKEND_BASE_URL}/ContactSync?code=${window.BW_CONFIG.BW_BACKEND_CODE}`;

    const response = await fetch(contactUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API Error: ${response.status} - ${errorText}`);
    }

    const result = await response.text();
    console.log('Successfully sent update request:', result);
    return result;

  } catch (error) {
    console.error('Error in updateContactCompany:', error);
    throw error;
  }
}

async function getCompanyResearch(companyName) {
  const llmProxyUrl = `${window.BW_CONFIG.BW_BACKEND_BASE_URL}/llm-proxy?code=${window.BW_CONFIG.BW_BACKEND_CODE}`;

  try {
    const payload = {
      action: 'llmProxy',
      companyName: companyName
    };

    const response = await fetch(llmProxyUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Company research failed: ${errorText}`);
    }

    const { model_data, citations } = await response.json();

    let note = "These results are retrieved by AI and could contain errors.";

    const modelWebsite = model_data.website;
    const citationUrls = (citations || []).map(citation => citation.url);
    const isUrlVerified = citationUrls.includes(modelWebsite);

    if (!isUrlVerified) {
      note = "Unable to verify URL. " + note;
    }

    return {
      ...model_data,
      note: note
    };

  } catch (error) {
    console.error('Error getting company research:', error);
    throw error;
  }
}

async function updateCustomerDetails(customerName, updatedDetails) {
  const key = customerName.trim().replace(/\s+/g, " ").toLowerCase();

  // 1. Update in-memory dataStore
  if (window.dataStore.CompanyInfo && window.dataStore.CompanyInfo.dataframe) {
    window.dataStore.CompanyInfo.dataframe[key] = updatedDetails;
    console.log(`[updateCustomerDetails] In-memory datastore updated for "${customerName}".`);

    if (window.idbUtil) {
        try {
            await window.idbUtil.setDataset("CompanyInfoData", window.dataStore.CompanyInfo);
            console.log(`[updateCustomerDetails] IndexedDB updated for "${customerName}".`);
        } catch (err) {
            console.error("[updateCustomerDetails] Failed to write to IndexedDB:", err);
        }
    }
  } else {
    console.error("[updateCustomerDetails] CompanyInfo dataframe not found in dataStore.");
    return; 
  }

  // 2. Write back to the Excel file on SharePoint
  await writeCustomerDetailsToSharePoint(customerName, updatedDetails);
}

async function writeCustomerDetailsToSharePoint(customerName, updatedDetails) {
  console.log(`[Write-Back] Initiating update for "${customerName}"...`);
  try {
    // Utilize dataLoader's loadConfig via the window object to prevent circular dependencies
    const config = (await window.dataLoader.loadConfig()).find(c => c.dataKey === 'CompanyInfo');
    if (!config) throw new Error("CompanyInfo configuration not found.");

    const metadata = window.dataStore.CompanyInfo?.metadata;
    if (!metadata || !metadata.parentReference?.driveId || !metadata.id) {
      throw new Error("File metadata for CompanyInfo is missing.");
    }
    const { driveId } = metadata.parentReference;
    const itemId = metadata.id;
    const { sheetName, columns, skipRows } = config;

    // getAccessToken is available globally from auth.js
    const token = await getAccessToken();
    const authHeader = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };

    const rangeUrl = `https://graph.microsoft.com/v1.0/drives/${driveId}/items/${itemId}/workbook/worksheets('${sheetName}')/usedRange(valuesOnly=true)`;
    const rangeResponse = await fetch(rangeUrl, { headers: authHeader });
    if (!rangeResponse.ok) throw new Error(`Failed to get worksheet data: ${await rangeResponse.text()}`);
    const rangeData = await rangeResponse.json();
    const allRows = rangeData.values || [];

    if (allRows.length === 0) {
      throw new Error(`Worksheet "${sheetName}" appears to be empty.`);
    }

    const companyColumnIndex = columns.indexOf("Company");
    if (companyColumnIndex === -1) {
      throw new Error("'Company' column not defined in config.json.");
    }

    let rowIndex = -1;
    for (let i = skipRows; i < allRows.length; i++) {
      if (allRows[i][companyColumnIndex]?.toString().trim().toLowerCase() === customerName.trim().toLowerCase()) {
        rowIndex = i;
        break;
      }
    }

    const numColumns = columns.length;
    const endColumn = XLSX.utils.encode_col(numColumns - 1);
    let targetExcelRow;
    let originalValues;

    if (rowIndex !== -1) {
      targetExcelRow = rowIndex + 1;
      originalValues = allRows[rowIndex];
      console.log(`[Write-Back] Found "${customerName}" at Excel row ${targetExcelRow}. Merging changes.`);
    } else {
      targetExcelRow = allRows.length + 1;
      originalValues = [];
      console.log(`[Write-Back] Customer "${customerName}" not found. Adding as new Excel row ${targetExcelRow}.`);
    }

    const newValues = new Array(numColumns).fill("");
    for (let i = 0; i < numColumns; i++) {
      const colName = columns[i];
      const originalValue = originalValues[i] || "";

      switch (colName) {
        case "Company": newValues[i] = customerName; break;
        case "Location": newValues[i] = updatedDetails.location ?? originalValue; break;
        case "Business": newValues[i] = updatedDetails.business ?? originalValue; break;
        case "Type": newValues[i] = updatedDetails.type ?? originalValue; break;
        case "Remarks": newValues[i] = updatedDetails.remarks ?? originalValue; break;
        case "Website": newValues[i] = updatedDetails.website ?? originalValue; break;
        default: newValues[i] = originalValue; break;
      }
    }

    const updateAddress = `A${targetExcelRow}:${endColumn}${targetExcelRow}`;
    const updateUrl = `https://graph.microsoft.com/v1.0/drives/${driveId}/items/${itemId}/workbook/worksheets('${sheetName}')/range(address='${updateAddress}')`;
    const updateResponse = await fetch(updateUrl, {
      method: 'PATCH',
      headers: authHeader,
      body: JSON.stringify({ values: [newValues] })
    });

    if (!updateResponse.ok) {
      const errorBody = await updateResponse.text();
      console.error("[Write-Back] API Error Body:", errorBody);
      throw new Error(`API Error during sheet update: ${errorBody}`);
    }

    console.log(`[Write-Back] Successfully updated sheet for "${customerName}" at range ${updateAddress}.`);
    return await updateResponse.json();

  } catch (error) {
    console.error("[Write-Back] Failed to write customer details to SharePoint:", error);
    throw error;
  }
}

// Export mapping
window.contactUtils = {
    findPotentialMatches,
    normaliseCompanyInfo,
    getCustomerDetails,
    updateContactCompany,
    getCompanyResearch,
    updateCustomerDetails,
    writeCustomerDetailsToSharePoint,
    fetchAndProcessOrgContacts,
    mergeOrganizationContacts
};