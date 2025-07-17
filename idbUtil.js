/**
 * idbUtil.js
 * Utility functions for interacting with IndexedDB.
 */

function openIndexedDB() {
  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open("DataViewerDB", 1);
    request.onerror = (event) => {
      console.error("Error opening IndexedDB", event);
      reject("Error opening IndexedDB");
    };
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains("datasets")) {
        db.createObjectStore("datasets");
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

async function clearDatasets() {
  const db = await openIndexedDB();                   // open or create DB
  const tx = db.transaction("datasets", "readwrite");
  tx.objectStore("datasets").clear();                 // schedule clear
  await new Promise((res, rej) => {
    tx.oncomplete = () => res();                      // resolves when tx done
    tx.onerror    = () => rej(tx.error || "IDB error while clearing");
  });
  console.log("[IndexedDB] datasets store cleared.");
}

// Expose functions globally so they can be used by other modules.
window.idbUtil = {
  openIndexedDB,
  setDataset,
  getDataset,
  clearDatasets
};
  