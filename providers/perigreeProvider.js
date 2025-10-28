// providers/perigeeProvider.js
(function () {
  if (!window.MarketSearch) {
    throw new Error('MarketSearch not initialized: include providers/provider.js first.');
  }
  const { Provider, utils } = window.MarketSearch;

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
          const url = `https://www.perigeedirect.com/collections/${encodeURIComponent(handle)}/products.json?limit=${pageSize}&page=${page}`;
          const json = await utils.fetchJson(url, { signal });
          const products = Array.isArray(json?.products) ? json.products : [];
          if (products.length === 0) break; // end of pages

          for (const p of products) {
            const variants = (p.variants ?? []).map(v => (v?.sku || '').trim()).filter(Boolean);
            const hay = [p.title || '', p.body_html || '', ...variants].join(' ');
            if (!utils.includesSku(hay, normSku)) continue;

            const listing = {
              retailer: this.id,
              sku: utils.pickSku(variants, p.body_html) ?? sku,
              title: p.title,
              price: utils.toNumOrUndef(p.variants?.[0]?.price),
              url: `https://www.perigeedirect.com/products/${p.handle}`,
              inStock: p.variants?.[0]?.available ?? undefined,
              raw: p
            };

            results.push(listing);
            if (stopOnFirstMatch) return results;
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
