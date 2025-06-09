/* ---------- Code-Console boot-strap ---------- */
let cm;                                     // CodeMirror instance
const logEl = id('codeLog');

function id(x){ return document.getElementById(x); }

function appendLog(...parts){
  logEl.textContent += parts.join(' ') + '\n';
  logEl.scrollTop = logEl.scrollHeight;
}

// Set up the editor once the modal is first shown
document.getElementById('codeModal').addEventListener('shown.bs.modal', () => {
  if (!cm){
    cm = CodeMirror(id('codeEditor'), {
      mode:      'javascript',
      theme:     'default',
      lineNumbers:true,
      value:`// Example: list inventory SKUs with <10 on hand\n
const lowStock = dataStore.DB.dataframe.filter(r => r.QtyOnHand - r.QtyCommited < 10);\n
console.table(lowStock.slice(0,20));`
    });
  }
  cm.refresh();   // fix sizing quirk inside Bootstrap modal
  cm.focus();
});

// Clear log
id('clearLogBtn').onclick = () => { logEl.textContent = ''; };

// Run code with console capture
id('runCodeBtn').onclick = () => {
  const userCode = cm.getValue();
  appendLog('▶ Running…');
  const original  = console.log;
  console.log     = (...args) => { original(...args); appendLog(...args); };

  try{
    /* expose whatever globals you want here */
    const fn = new Function('dataStore','idbUtil','dataLoader', userCode);
    const res = fn(window.dataStore, window.idbUtil, window.dataLoader);
    if (res !== undefined) appendLog('↩', res);
  }catch(err){
    appendLog('⚠', err);
  }finally{
    console.log = original;
  }
};
