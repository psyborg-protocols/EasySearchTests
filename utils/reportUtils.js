// utils.js
window.ReportUtils = (() => {
  function parseDate(str) {
    if (!str) return null;
    const cleaned = str.trim()
                       .replace(/,/g, '')
                       .replace(/(\d{1,2})\/(\d{1,2})\/(\d{2})$/, '$1/$2/20$3');
    const ts = Date.parse(cleaned);
    return isNaN(ts) ? null : new Date(ts);
  }

  function parseNumber(val) {
    return parseFloat(String(val).replace(/[^0-9.\-]/g, '')) || 0;
  }

  function normalise(s) {
    return s.trim().toLowerCase().replace(/[^\w\s]/g, '');
  }

  return { parseDate, parseNumber, normalise };
})();
