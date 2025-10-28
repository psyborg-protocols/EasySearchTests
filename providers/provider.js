// providers/provider.js
(function () {
  /**
   * @typedef {Object} Listing
   * @property {string} retailer   // source identifier
   * @property {string} sku        // SKU found on the product
   * @property {string} title      // product title
   * @property {number=} price     // optional numeric price
   * @property {number=} eachPrice // optional per-unit price
   * @property {string} url        // product page
   * @property {boolean=} inStock  // optional in-stock flag
   * @property {any} raw           // original payload (debugging)
   */

  /**
   * Base Provider (documentation-only “interface”).
   * Implementations should override `id` and `findBySku`.
   */
  class Provider {
    /** @returns {string} unique id */
    get id() { throw new Error('Provider.id getter not implemented'); }
    /** @param {string} _sku */
    supportsSku(_sku) { return true; }
    /**
     * @param {string} _sku
     * @param {{ signal?: AbortSignal }} _opts
     * @returns {Promise<Listing[]>}
     */
    async findBySku(_sku, _opts = {}) { throw new Error('Provider.findBySku not implemented'); }
  }

  // ---------- tiny shared utils (kept here so all providers can reuse) ----------
  const utils = {
    normalizeSku(s) {
      return (s || '').replace(/[\s\-_.]/g, '').toLowerCase();
    },
    toNumOrUndef(x) {
      const n = Number(x);
      return Number.isFinite(n) ? n : undefined;
    },
    includesSku(haystack, normSku) {
      return (haystack || '').replace(/[\s\-_.]/g, '').toLowerCase().includes(normSku);
    },
    pickSku(variants = [], html) {
      const first = variants.find(Boolean);
      if (first) return first;
      const m = typeof html === 'string' ? html.match(/SKU[:\s]*([A-Za-z0-9\-_.]+)/i) : null;
      return m?.[1];
    },
    /**
     * GET JSON with tiny retry+backoff. Don’t set headers to keep it cache-friendly.
     * @param {string} url
     * @param {{signal?: AbortSignal, retries?: number}} param1
     */
    async fetchJson(url, { signal, retries = 2 } = {}) {
      let attempt = 0;
      while (true) {
        try {
          const res = await fetch(url, { signal });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return await res.json();
        } catch (err) {
          attempt++;
          if (signal?.aborted) throw err;
          if (attempt > retries) throw err;
          await new Promise(r => setTimeout(r, 300 * attempt)); // 300ms, 600ms
        }
      }
    }
  };

  // single namespace for market search bits
  window.MarketSearch = window.MarketSearch || {};
  window.MarketSearch.Provider = Provider;
  window.MarketSearch.utils = utils;

  // optional registry (providers can self-register here)
  window.MarketProviders = window.MarketProviders || {};

// ---------- aggregator service (call all registered providers) ----------
/**
 * Call every registered provider’s `findBySku` in parallel.
 * @param {string} sku
 * @param {{ timeoutMs?: number }} [opts]
 * @returns {Promise<Listing[]>}
 */
window.MarketSearch.searchAllProvidersBySku = async function (sku, { timeoutMs = 8000 } = {}) {
  const providers = Object.values(window.MarketProviders || {});
  if (!providers.length) {
    console.warn('No MarketProviders registered.');
    return [];
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort('timeout'), timeoutMs);
  try {
    // Run all providers in parallel; tolerate partial failures
    const settled = await Promise.allSettled(
      providers.map(p => p.findBySku(sku, { signal: controller.signal }))
    );
    const results = settled.flatMap(r => (r.status === 'fulfilled' ? r.value : []));
    const deduped = [];
    const seen = new Set();
    for (const item of results) {
      const key = `${item.retailer}:${item.sku}:${item.url}`;
      if (seen.has(key)) continue;
      seen.add(key);
      deduped.push(item);
    }
    return deduped;
  } finally {
    clearTimeout(timer);
  }
};

})();
