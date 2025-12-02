/**
 * idbUtil.js
 * Utility functions for interacting with IndexedDB.
 */

function openIndexedDB() {
  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open("DataViewerDB", 2); // Increment version for schema changes
    request.onerror = (event) => {
      console.error("Error opening IndexedDB", event);
      reject("Error opening IndexedDB");
    };
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains("datasets")) {
        db.createObjectStore("datasets");
      }
      // New store for report settings (interval, lastRun, etc.)
      if (!db.objectStoreNames.contains("reportSettings")) {
        db.createObjectStore("reportSettings");
      }
    };
    request.onsuccess = (event) => {
      resolve(event.target.result);
    };
  });
}
  
function setDataset(key, data) {
  return new Promise(async (resolve, reject) => {
    try {
      const db = await openIndexedDB();
      const tx = db.transaction("datasets", "readwrite");
      const store = tx.objectStore("datasets");
      const request = store.put(data, key);
      request.onsuccess = () => resolve();
      request.onerror = (event) => {
        console.error("Error saving dataset", event);
        reject("Error saving dataset " + key);
      };
    } catch (error) {
      reject(error);
    }
  });
}

function getDataset(key) {
  return new Promise(async (resolve, reject) => {
    try {
      const db = await openIndexedDB();
      const tx = db.transaction("datasets", "readonly");
      const store = tx.objectStore("datasets");
      const request = store.get(key);
      request.onsuccess = (event) => resolve(event.target.result);
      request.onerror = (event) => {
        console.error("Error retrieving dataset", event);
        reject("Error retrieving dataset " + key);
      };
    } catch (error) {
      reject(error);
    }
  });
}

// --- Report Settings Specific Methods ---

function saveReportMeta(reportId, metaObj) {
  return new Promise(async (resolve, reject) => {
    try {
      const db = await openIndexedDB();
      const tx = db.transaction("reportSettings", "readwrite");
      const store = tx.objectStore("reportSettings");
      const request = store.put(metaObj, reportId);
      request.onsuccess = () => resolve();
      request.onerror = (e) => reject(e);
    } catch (e) { reject(e); }
  });
}

function getReportMeta(reportId) {
  return new Promise(async (resolve, reject) => {
    try {
      const db = await openIndexedDB();
      const tx = db.transaction("reportSettings", "readonly");
      const store = tx.objectStore("reportSettings");
      const request = store.get(reportId);
      request.onsuccess = (e) => resolve(e.target.result || null);
      request.onerror = (e) => reject(e);
    } catch (e) { reject(e); }
  });
}

async function getAllReportMeta() {
    try {
      const db = await openIndexedDB();
      return new Promise((resolve, reject) => {
          const tx = db.transaction("reportSettings", "readonly");
          const store = tx.objectStore("reportSettings");
          const request = store.getAll(); // Get values, keys not needed if ID is inside
          request.onsuccess = (e) => resolve(e.target.result || []);
          request.onerror = (e) => reject(e);
      });
    } catch (e) { return []; }
}

async function clearDatasets() {
  const db = await openIndexedDB();                   
  const tx = db.transaction("datasets", "readwrite");
  tx.objectStore("datasets").clear();                 
  await new Promise((res, rej) => {
    tx.oncomplete = () => res();                      
    tx.onerror    = () => rej(tx.error || "IDB error while clearing");
  });
  console.log("[IndexedDB] datasets store cleared.");
}

// Expose functions globally
window.idbUtil = {
  openIndexedDB,
  setDataset,
  getDataset,
  clearDatasets,
  saveReportMeta,
  getReportMeta,
  getAllReportMeta
};