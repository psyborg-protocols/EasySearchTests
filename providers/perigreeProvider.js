// providers/perigeeProvider.js
(function () {
  if (!window.MarketSearch) {
    throw new Error('MarketSearch not initialized: include providers/provider.js first.');
  }
  const { Provider, utils } = window.MarketSearch;

  // --- helpers ---
  // Primary: exact "x-Pack" (with hyphen). Fallback: allow "x Pack" if you ever encounter it.
  const PACK_RE_PRIMARY = /(\d+)\s*-\s*Pack\b/i;
  const PACK_RE_FALLBACK = /(\d+)\s*Pack\b/i;

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
     * @param {string} sku
     * @param {{
     *   signal?: AbortSignal,
     *   pageSize?: number,
     *   maxPages?: number,
     *   stopOnFirstMatch?: boolean,
     *   collections?: string[]
     * }} opts
     * @returns {Promise<Listing[]>}
     */
    async findBySku(sku, opts = {}) {
      const {
        signal,
        pageSize = 250,
        maxPages = 10,
        stopOnFirstMatch = true,
        collections = ['mixpac']   // default collection handle
      } = opts;

      const normSku = utils.normalizeSku(sku);
      const results = [];

      for (const handle of collections) {
        let page = 1;
        while (page <= maxPages) {
          const url = `https://www.perigeedirect.com/collections/${encodeURIComponent(handle)}/products.json?limit=${pageSize}&page=${page}?currency=USD`;
          const json = await utils.fetchJson(url, { signal });
          const products = Array.isArray(json?.products) ? json.products : [];
          if (products.length === 0) break; // end of pages

          for (const p of products) {
            const variants = Array.isArray(p.variants) ? p.variants : [];

            // match by variant SKU first; fallback to product text if needed
            const productHay = [p.title || '', p.body_html || ''].join(' ');
            const matchingVariants = variants.filter(v => {
              const vSku = (v?.sku || '').trim();
              return vSku ? utils.includesSku(vSku, normSku) : false;
            });
            const chosen = matchingVariants.length
              ? matchingVariants
              : (utils.includesSku(productHay, normSku) ? variants.slice(0, 1) : []);

            for (const v of chosen) {
              const rawSku = (v?.sku || '').trim()
                           || utils.pickSku(variants.map(x => x.sku), p.body_html)
                           || sku;

              const qty = extractQtyFromVariant(v);    // <- from "x-Pack" markers, default 1
              const price = utils.toNumOrUndef(v?.price);
              const eachPrice = computeEach(price, qty);

              results.push({
                retailer: this.id,
                sku: rawSku,                           // no parenthetical to strip here
                title: p.title,
                price,
                qty,
                eachPrice,
                url: `https://www.perigeedirect.com/products/${p.handle}`,
                inStock: v?.available ?? undefined,
                raw: { product: p, variant: v }
              });

              if (stopOnFirstMatch) return results;
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
