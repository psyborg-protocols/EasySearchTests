// providers/perigeeProvider.js
(function () {
  if (!window.MarketSearch) {
    throw new Error('MarketSearch not initialized: include providers/provider.js first.');
  }
  const { Provider, utils } = window.MarketSearch;

  // --- helpers ---
  // Primary: exact "x-Pack". Fallback: allow "x-Box" if encountered.
  const PACK_RE_PRIMARY = /(\d+)\s*-\s*Pack\b/i;
  const PACK_RE_FALLBACK = /(\d+)\s*-\s*Box\b/i;

  function extractQtyFromVariant(variant) {
    // Check variant.title and option1/2/3 for "x-Pack"
    const fields = [
      (variant?.title || '').trim(),
      (variant?.option1 || '').trim(),
      (variant?.option2 || '').trim(),
      (variant?.option3 || '').trim(),
    ];

    for (const f of fields) {
      if (!f) continue;
      let m = f.match(PACK_RE_PRIMARY);
      if (!m) m = f.match(PACK_RE_FALLBACK); // optional robustness
      if (m) {
        const n = Number(m[1]);
        if (Number.isFinite(n) && n > 0) return n;
      }
    }
    return 1; // default single-unit if no pack marker
  }

  function computeEach(price, qty) {
    const p = Number(price);
    const q = Number(qty);
    if (!Number.isFinite(p) || !Number.isFinite(q) || q <= 0) return undefined;
    const v = p / q;
    return Math.round(v * 100) / 100; // round to 2 decimals
  }

  class PerigeeProvider extends Provider {
    get id() { return 'perigee'; }

    /**
     * Return ALL matching variants (no short-circuit).
     * Each quantity tier on Perigee has its own distinct variant SKU.
     *
     * @param {string} sku
     * @param {{
     *   signal?: AbortSignal,
     *   pageSize?: number,
     *   maxPages?: number,
     *   collections?: string[]
     * }} opts
     * @returns {Promise<Listing[]>}
     */
    async findBySku(sku, opts = {}) {
      const {
        signal,
        pageSize = 250,
        maxPages = 10,
        collections = ['mixpac']   // default collection handle
      } = opts;

      const normSku = utils.normalizeSku(sku);
      const results = [];
      const seen = new Set(); // de-dupe by handle + rawSku across pages/collections

      for (const handle of collections) {
        let page = 1;
        while (page <= maxPages) {
          const url = `https://www.perigeedirect.com/collections/${encodeURIComponent(handle)}/products.json?limit=${pageSize}&page=${page}&currency=USD`;
          const json = await utils.fetchJson(url, { signal });
          const products = Array.isArray(json?.products) ? json.products : [];
          if (products.length === 0) break; // end of pages

          for (const p of products) {
            const variants = Array.isArray(p.variants) ? p.variants : [];

            // Prefer exact variant SKU matches; if product text matches, include ALL variants
            const productHay = [p.title || '', p.body_html || ''].join(' ');
            const matchingVariants = variants.filter(v => {
              const vSku = (v?.sku || '').trim();
              return vSku ? utils.includesSku(vSku, normSku) : false;
            });
            const chosen = matchingVariants.length
              ? matchingVariants
              : (utils.includesSku(productHay, normSku) ? variants : []);

            for (const v of chosen) {
              const rawSku = (v?.sku || '').trim()
                          || utils.pickSku(variants.map(x => x.sku), p.body_html)
                          || sku;

              const qty = extractQtyFromVariant(v);
              const price = utils.toNumOrUndef(v?.price);
              const eachPrice = computeEach(price, qty);

              const priceKey = Number.isFinite(price) ? price.toFixed(2) : 'undef';
              const dedupeKey = `${priceKey}|${qty}`;
              if (seen.has(dedupeKey)) continue;
              seen.add(dedupeKey);

              results.push({
                retailer: this.id,
                sku: rawSku,
                title: p.title?.trim() || '',
                price,
                qty,
                eachPrice,
                url: `https://www.perigeedirect.com/products/${p.handle}`,
                inStock: v?.available ?? undefined,
                raw: { product: p, variant: v }
              });
            }
          }

          if (products.length < pageSize) break; // last page
          page++;
        }
      }

      return results;
    }
  }

  // Register globally
  window.perigeeProvider = new PerigeeProvider();
  window.MarketProviders = window.MarketProviders || {};
  window.MarketProviders.perigee = window.perigeeProvider;
})();
