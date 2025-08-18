/**
 * codeConsole.js
 *
 * Rewritten for robust, programmatic modal control and improved structure.
 * This script manages the code console modal, including the CodeMirror editor,
 * log output, and the resizable divider.
 */
document.addEventListener('DOMContentLoaded', () => {

  // --- DOM Element References ---
  const codeModalEl = document.getElementById('codeModal');
  const openBtn = document.getElementById('openCodeBtn');
  const codeEditorEl = document.getElementById('codeEditor');
  const logEl = document.getElementById('codeLog');
  const runBtn = document.getElementById('runCodeBtn');
  const clearBtn = document.getElementById('clearLogBtn');
  const dragHandle = document.getElementById('dragHandle');

  // --- State Variables ---
  let cm; // Will hold the CodeMirror editor instance
  let bsModal; // Will hold the Bootstrap Modal instance

  // Exit if essential elements aren't found
  if (!codeModalEl || !openBtn) {
    console.error("Code Console modal or its trigger button not found. Aborting initialization.");
    return;
  }

  // --- Core Functions ---

  /**
   * Appends a message to the log output panel. Handles various data types.
   * @param {...(string|Object)} parts - The parts of the message to log.
   */
  function appendLog(...parts) {
    const line = document.createElement('div');
    line.className = 'log-line';
    // Convert objects to formatted JSON for readability
    line.textContent = parts.map(p => (typeof p === 'object' ? JSON.stringify(p, null, 2) : p)).join(' ');
    logEl.appendChild(line);
    logEl.scrollTop = logEl.scrollHeight; // Auto-scroll to the bottom
  }

  /**
   * Initializes the CodeMirror editor inside its container.
   * This is called only once when the modal is first shown.
   */
  function initCodeMirror() {
    if (cm) return; // Prevent re-initialization

    cm = CodeMirror(codeEditorEl, {
      mode: 'javascript',
      theme: 'dracula',
      lineNumbers: true,
      autoCloseBrackets: true,
      matchBrackets: true,
      lint: true, // Requires a linter script to be included
      gutters: ["CodeMirror-lint-markers"],
      value: `// Example: Find top 5 products by quantity on hand
const topProducts = dataStore.DB.dataframe
  .sort((a, b) => (b.QtyOnHand || 0) - (a.QtyOnHand || 0))
  .slice(0, 5)
  .map(p => ({ 
    SKU: p.PartNumber, 
    Description: p.Description, 
    Qty: p.QtyOnHand 
  }));

// console.table is great for viewing arrays of objects
console.table(topProducts);

// The console output below will appear in the log panel.`
    });

    // Refresh the editor after the modal animation is complete to ensure correct layout
    setTimeout(() => {
      cm.refresh();
      cm.focus();
    }, 200);
  }

  /**
   * Executes the code from the editor, capturing and redirecting console output.
   */
  function runCode() {
    const userCode = cm.getValue();
    appendLog('▶ Running…');

    // Temporarily override console methods to capture output
    const originalConsole = { ...console };
    const consoleMethods = {
      log: (...args) => appendLog(...args),
      warn: (...args) => appendLog('⚠️', ...args),
      error: (...args) => appendLog('❌', ...args.map(e => e.stack || e)),
      table: (data) => {
        if (!Array.isArray(data) || data.length === 0) {
          appendLog(JSON.stringify(data, null, 2));
          return;
        }
        // Basic ASCII table formatting for the log
        const headers = Object.keys(data[0]);
        let tableStr = '\n' + headers.join('\t|\t') + '\n';
        tableStr += '-'.repeat(headers.join('\t|\t').length * 1.5) + '\n';
        data.forEach(row => {
          tableStr += headers.map(h => row[h]).join('\t|\t') + '\n';
        });
        appendLog(tableStr);
      }
    };
    Object.assign(console, consoleMethods);

    try {
      // Execute code with app's global objects exposed
      const fn = new Function('dataStore', 'idbUtil', 'dataLoader', userCode);
      const result = fn(window.dataStore, window.idbUtil, window.dataLoader);
      if (result !== undefined) {
        appendLog('↩', result);
      }
    } catch (err) {
      console.error(err); // Use the overridden error logger
    } finally {
      Object.assign(console, originalConsole); // Restore original console methods
    }
  }

  // --- Event Listeners and Initialization ---

  // 1. Create a single, persistent Bootstrap Modal instance
  bsModal = new bootstrap.Modal(codeModalEl);

  // 2. Programmatically wire the "Open" button to show the modal
  openBtn.addEventListener('click', () => {
    bsModal.show();
  });

  // 3. Set up the editor only after the modal has been shown for the first time
  codeModalEl.addEventListener('shown.bs.modal', initCodeMirror, { once: true });

  // 4. Wire up the "Run" and "Clear" buttons
  runBtn.addEventListener('click', runCode);
  clearBtn.addEventListener('click', () => {
    logEl.innerHTML = '';
  });

  // --- Resizable Divider Logic ---
  let isDragging = false;
  dragHandle.addEventListener('mousedown', () => {
    isDragging = true;
    document.body.style.cursor = 'ns-resize';
    codeModalEl.style.userSelect = 'none';
  });

  document.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    const containerRect = codeModalEl.querySelector('.modal-body').getBoundingClientRect();
    const newEditorHeight = e.clientY - containerRect.top;

    // Set constraints for resizing (e.g., min 100px height for editor and log)
    if (newEditorHeight > 100 && newEditorHeight < containerRect.height - 100) {
      codeEditorEl.style.height = `${newEditorHeight}px`;
      if (cm) cm.setSize(null, newEditorHeight);
    }
  });

  document.addEventListener('mouseup', () => {
    if (isDragging) {
      isDragging = false;
      document.body.style.cursor = 'default';
      codeModalEl.style.userSelect = 'auto';
      if (cm) cm.refresh();
    }
  });
});
