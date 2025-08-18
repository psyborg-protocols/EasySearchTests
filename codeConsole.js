/* codeConsole.js */

// --- DOM elements ---
const codeModalEl = document.getElementById('codeModal');
const codeEditorEl = document.getElementById('codeEditor');
const logEl = document.getElementById('codeLog');
const runBtn = document.getElementById('runCodeBtn');
const clearBtn = document.getElementById('clearLogBtn');
const dragHandle = document.getElementById('dragHandle');

// --- State ---
let cm; // CodeMirror instance
let bsModal; // Bootstrap Modal instance

/**
 * Appends a message to the log output.
 * @param {...(string|Object)} parts - The parts of the message to log.
 */
function appendLog(...parts) {
  const line = document.createElement('div');
  line.className = 'log-line';
  line.textContent = parts.map(p => (typeof p === 'object' ? JSON.stringify(p, null, 2) : p)).join(' ');
  logEl.appendChild(line);
  logEl.scrollTop = logEl.scrollHeight;
}

/**
 * Initializes the CodeMirror editor.
 */
function initCodeMirror() {
  if (cm) return; // Already initialized

  cm = CodeMirror(codeEditorEl, {
    mode: 'javascript',
    theme: 'dracula', // A more modern theme
    lineNumbers: true,
    autoCloseBrackets: true,
    matchBrackets: true,
    lint: true,
    gutters: ["CodeMirror-lint-markers"],
    value: `// Example: Find the top 5 products by quantity on hand
const topProducts = dataStore.DB.dataframe
  .sort((a, b) => b.QtyOnHand - a.QtyOnHand)
  .slice(0, 5)
  .map(p => ({ 
    SKU: p.PartNumber, 
    Description: p.Description, 
    Qty: p.QtyOnHand 
  }));

// console.table is great for viewing arrays of objects
console.table(topProducts);

// You can access dataStore, idbUtil, and dataLoader objects directly.
// The console output below will appear in the log panel.`
  });

  // Use a small delay to ensure the editor is fully rendered in the modal
  setTimeout(() => {
    cm.refresh();
    cm.focus();
  }, 200);
}

/**
 * Handles the logic for running the user's code.
 */
function runCode() {
  const userCode = cm.getValue();
  appendLog('▶ Running…');

  // --- Capture console.log, .warn, .error, and .table ---
  const originalConsole = { ...console };
  const consoleMethods = {
    log: (...args) => appendLog(...args),
    warn: (...args) => appendLog('⚠️', ...args),
    error: (...args) => appendLog('❌', ...args),
    table: (data) => {
        if (typeof data !== 'object' || data === null) {
            appendLog(data);
            return;
        }
        const headers = Object.keys(data[0] || {});
        let tableStr = '\n';
        // Header
        tableStr += headers.join('\t|\t') + '\n';
        tableStr += '-'.repeat(headers.join('\t|\t').length) + '\n';
        // Rows
        data.forEach(row => {
            tableStr += headers.map(h => row[h]).join('\t|\t') + '\n';
        });
        appendLog(tableStr);
    }
  };

  // Temporarily override console methods
  Object.assign(console, consoleMethods);

  try {
    // Expose globals to the function scope
    const fn = new Function('dataStore', 'idbUtil', 'dataLoader', userCode);
    const result = fn(window.dataStore, window.idbUtil, window.dataLoader);
    if (result !== undefined) {
      appendLog('↩', result);
    }
  } catch (err) {
    console.error(err.stack); // Use the overridden error logger
  } finally {
    // Restore original console methods
    Object.assign(console, originalConsole);
  }
}

/**
 * Initializes event listeners for the modal and its components.
 */
function initializeConsole() {
  if (!codeModalEl) return;
  
  // The error was caused by event listeners being attached to a non-existent modal instance.
  // This ensures we have a valid Bootstrap modal instance to work with.
  bsModal = bootstrap.Modal.getOrCreateInstance(codeModalEl);

  // Initialize CodeMirror when the modal is about to be shown
  codeModalEl.addEventListener('shown.bs.modal', initCodeMirror);

  runBtn.addEventListener('click', runCode);
  clearBtn.addEventListener('click', () => {
    logEl.innerHTML = '';
  });

  // --- Resizable Divider Logic ---
  let isDragging = false;
  dragHandle.addEventListener('mousedown', (e) => {
    isDragging = true;
    document.body.style.cursor = 'ns-resize'; // Vertical resize cursor
    logEl.style.userSelect = 'none'; // Prevent text selection while dragging
    codeEditorEl.style.pointerEvents = 'none';
  });

  document.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    const containerRect = codeModalEl.querySelector('.modal-body').getBoundingClientRect();
    const newEditorHeight = e.clientY - containerRect.top - dragHandle.offsetHeight / 2;
    
    // Set constraints for resizing
    if (newEditorHeight > 100 && newEditorHeight < containerRect.height - 80) {
      codeEditorEl.style.height = `${newEditorHeight}px`;
      cm.setSize(null, newEditorHeight);
    }
  });

  document.addEventListener('mouseup', () => {
    if (isDragging) {
      isDragging = false;
      document.body.style.cursor = 'default';
      logEl.style.userSelect = 'auto';
      codeEditorEl.style.pointerEvents = 'auto';
      cm.refresh();
    }
  });
}

// Initialize when the DOM is fully loaded.
document.addEventListener('DOMContentLoaded', initializeConsole);