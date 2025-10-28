// providers/ellsworthProvider.js
(function () {
  if (!window.MarketSearch) {
    throw new Error('MarketSearch not initialized: include providers/provider.js first.');
  }

  const { Provider, utils } = window.MarketSearch;

  class EllsworthProvider extends Provider {
    get id() { return 'ellsworth'; }

    /**
     * Search Ellsworth catalog for a SKU (case-insensitive substring match).
     *
     * @param {string} sku
     * @param {{
     *   signal?: AbortSignal,
     *   pageSize?: number,
     *   maxPages?: number,
     *   stopOnFirstMatch?: boolean
     * }} opts
     * @returns {Promise<Listing[]>}
     */
    async findBySku(sku, opts = {}) {
      const {
        signal,
        pageSize = 250,
        maxPages = 20,
        stopOnFirstMatch = true,
      } = opts;

      const normSku = utils.normalizeSku(sku);
      const results = [];

      // The Ellsworth endpoint behaves like a paginated table (iDisplayStart / iDisplayLength)
      // We’ll increment iDisplayStart by pageSize until empty
      for (let page = 0; page < maxPages; page++) {
        const start = page * pageSize;

        // Ellsworth’s API expects a large query string with embedded JSON
        const searchParam = encodeURIComponent(JSON.stringify([
          { facet: "Keyword", search: [{ Text: null, Value: null }] },
          { facet: "CatalogNodes", search: [{ Text: "Cartridges Accessories", Value: "Dispensing-Equipment-Supplies-Cartridges-Accessories" }] },
          { facet: "Manufacturer", search: [] },
          { facet: "Brand", search: [] }
        ]));

        const url = `https://www.ellsworth.com/api/catalogSearch/search?sEcho=1&iColumns=1&sColumns=&iDisplayStart=${start}&iDisplayLength=${pageSize}&mDataProp_0=&sSearch_0=&bRegex_0=false&bSearchable_0=true&bSortable_0=true&sSearch=${searchParam}&bRegex=false&iSortCol_0=0&sSortDir_0=asc&iSortingCols=1&DefaultCatalogNode=Dispensing-Equipment-Supplies&_=${Date.now()}`;

        let json;
        try {
          json = await utils.fetchJson(url, { signal });
        } catch (err) {
          console.warn('Ellsworth fetch failed', err);
          break;
        }

        const rows = Array.isArray(json?.aaData) ? json.aaData : [];
        if (rows.length === 0) break;

        for (const row of rows) {
          try {
            // Map fields by column index (stable structure)
            const [
              title, internalSku1, internalSku2, priceStr, relativeUrl,
              imageUrl, category, priceBreaks, , eachPrice, packDesc, displaySku,
              , inStockFlag, , , , , , brand, altSku
            ] = row;

            const hay = [title, displaySku, internalSku1, internalSku2, brand].join(' ');
            if (!utils.includesSku(hay, normSku)) continue;

            const price = utils.toNumOrUndef((priceStr || '').replace(/[^0-9.]/g, ''));
            const inStock = (inStockFlag || '').toString().toLowerCase() === 'true';
            const fullUrl = `https://www.ellsworth.com${relativeUrl}`;

            const listing = {
              retailer: this.id,
              sku: displaySku || internalSku1 || sku,
              title: title?.trim() || '',
              price: price,
              url: fullUrl,
              inStock,
              raw: row
            };

            results.push(listing);
            if (stopOnFirstMatch) return results;
          } catch (err) {
            console.warn('Ellsworth parse error', err);
          }
        }

        if (rows.length < pageSize) break; // done
      }

      return results;
    }
  }

  // Attach globally
  window.ellsworthProvider = new EllsworthProvider();
  window.MarketProviders = window.MarketProviders || {};
  window.MarketProviders.ellsworth = window.ellsworthProvider;
})();
