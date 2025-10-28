// providers/gluegunProvider.js
(function () {
  if (!window.MarketSearch) {
    throw new Error('MarketSearch not initialized: include providers/provider.js first.');
  }
  const { Provider, utils } = window.MarketSearch;

  class GluegunProvider extends Provider {
    get id() { return 'gluegun'; }

    /**
     * Paginated search for a SKU across one or more Gluegun collections.
     *
     * @param {string} sku
     * @param {{
     *   signal?: AbortSignal,
     *   pageSize?: number,          // default 250 (Shopify max)
     *   maxPages?: number,          // safety cap per collection
     *   stopOnFirstMatch?: boolean, // return early when found
     *   collections?: string[]      // collection handles to scan
     * }} opts
     * @returns {Promise<Listing[]>}
     */
    async findBySku(sku, opts = {}) {
      const {
        signal,
        pageSize = 250,
        maxPages = 10,
        stopOnFirstMatch = true,
        collections = ['sulzer'] // your example handle; add more as needed
      } = opts;

      const normSku = utils.normalizeSku(sku);
      const out = [];

      for (const handle of collections) {
        let page = 1;
        while (page <= maxPages) {
          const url = `https://gluegun.com/collections/${encodeURIComponent(handle)}/products.json?limit=${pageSize}&page=${page}`;
          const json = await utils.fetchJson(url, { signal });
          const products = Array.isArray(json?.products) ? json.products : [];
          if (products.length === 0) break; // exhausted

          for (const p of products) {
            const variants = (p.variants ?? []).map(v => (v?.sku || '').trim()).filter(Boolean);
            const hay = [p.title || '', p.body_html || '', ...variants].join(' ');
            if (!utils.includesSku(hay, normSku)) continue;

            const listing = {
              retailer: this.id,
              sku: utils.pickSku(variants, p.body_html) ?? sku,
              title: p.title,
              price: utils.toNumOrUndef(p.variants?.[0]?.price),
              url: `https://gluegun.com/products/${p.handle}`,
              inStock: p.variants?.[0]?.available ?? undefined,
              raw: p
            };
            out.push(listing);

            if (stopOnFirstMatch) return out; // fast path
          }

          if (products.length < pageSize) break; // last page
          page++;
        }
      }

      return out;
    }
  }

  // expose instance globally and register
  window.gluegunProvider = new GluegunProvider();
  window.MarketProviders = window.MarketProviders || {};
  window.MarketProviders.gluegun = window.gluegunProvider;
})();
