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
  
  function clearDatasets() {
    return new Promise(async (resolve, reject) => {
      try {
        const db = await openIndexedDB();
        const tx = db.transaction("datasets", "readwrite");
        const store = tx.objectStore("datasets");
        const request = store.clear();
        request.onsuccess = () => resolve();
        request.onerror = () => reject("Error clearing datasets");
      } catch (error) {
        reject(error);
      }
    });
  }
  
  // Expose functions globally so they can be used by other modules.
  window.idbUtil = {
    openIndexedDB,
    setDataset,
    getDataset,
    clearDatasets
  };
  