// providers/gluegunProvider.js
(function () {
  if (!window.MarketSearch) {
    throw new Error('MarketSearch not initialized: include providers/provider.js first.');
  }
  const { Provider, utils } = window.MarketSearch;

  // --- helpers ---
  function extractQtyFromSku(sku) {
    // e.g., "SULZER MEFX 06-18T (1700)" -> 1700; if none -> 1 (single unit)
    if (!sku) return 1;
    const m = sku.match(/\((\d{1,7})\)\s*$/);
    return m ? Number(m[1]) : 1;
  }
  function stripQtyFromSku(sku) {
    if (!sku) return sku;
    return sku.replace(/\s*\(\d{1,7}\)\s*$/, '').trim();
  }
  function computeEach(price, qty) {
    const p = Number(price);
    const q = Number(qty);
    if (!Number.isFinite(p) || !Number.isFinite(q) || q <= 0) return undefined;
    const v = p / q;
    return Math.round(v * 100) / 100; // 2 decimals
  }

  class GluegunProvider extends Provider {
    get id() { return 'gluegun'; }

    /**
     * Return ALL variants that match the clean SKU (tiers are separate variants with their own SKUs).
     *
     * @param {string} sku
     * @param {{ signal?: AbortSignal, pageSize?: number, maxPages?: number, collections?: string[] }} opts
     * @returns {Promise<Listing[]>}
     */
    async findBySku(sku, opts = {}) {
      const {
        signal,
        pageSize = 250,
        maxPages = 10,
        collections = ['sulzer'] // add more collection handles if needed
      } = opts;

      const normSku = utils.normalizeSku(sku);
      const out = [];
      const seen = new Set(); // de-dupe by product.handle + rawSku (NOT cleanSku)

      for (const handle of collections) {
        let page = 1;
        while (page <= maxPages) {
          const url = `https://gluegun.com/collections/${encodeURIComponent(handle)}/products.json?limit=${pageSize}&page=${page}`;
          const json = await utils.fetchJson(url, { signal });
          const products = Array.isArray(json?.products) ? json.products : [];
          if (products.length === 0) break;

          for (const p of products) {
            const variants = Array.isArray(p.variants) ? p.variants : [];
            const productHay = [p.title || '', p.body_html || ''].join(' ');

            // Prefer direct variant SKU matches; if product text matches, include ALL variants
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

              const key = `${p.handle}|${rawSku}`;  // <-- preserves different-qty SKUs
              if (seen.has(key)) continue;
              seen.add(key);

              const qty = extractQtyFromSku(rawSku);   // default 1 if none
              const cleanSku = stripQtyFromSku(rawSku);
              const price = utils.toNumOrUndef(v?.price);
              const eachPrice = computeEach(price, qty);

              out.push({
                retailer: this.id,
                sku: cleanSku,                 // human-friendly; rawSku still in .raw
                title: p.title?.trim() || '',
                price,
                qty,
                eachPrice,
                url: `https://gluegun.com/products/${p.handle}`,
                inStock: v?.available ?? undefined,
                raw: { product: p, variant: v, rawSku }
              });
            }
          }

          if (products.length < pageSize) break;
          page++;
        }
      }

      return out;
    }
  }

  window.gluegunProvider = new GluegunProvider();
  window.MarketProviders = window.MarketProviders || {};
  window.MarketProviders.gluegun = window.gluegunProvider;
})();
