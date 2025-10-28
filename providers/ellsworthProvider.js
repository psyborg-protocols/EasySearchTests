// providers/ellsworthProvider.js
(function () {
  if (!window.MarketSearch) {
    throw new Error('MarketSearch not initialized: include providers/provider.js first.');
  }

  const { Provider, utils } = window.MarketSearch;

  class EllsworthProvider extends Provider {
    get id() { return 'ellsworth'; }

    /**
     * @param {string} sku
     * @param {{
     *   signal?: AbortSignal,
     *   pageSize?: number,          // default 250
     *   maxPages?: number,          // safety cap
     *   stopOnFirstMatch?: boolean,
     *   manufacturer?: string,      // e.g., "medmix"
     *   catalogNodes?: { Text:string, Value:string }[] // optional, usually leave empty
     * }} opts
     * @returns {Promise<Listing[]>}
     */
    async findBySku(sku, opts = {}) {
      const {
        signal,
        pageSize = 250,
        maxPages = 20,
        manufacturer = "medmix", // default to medmix products
        catalogNodes = [] // keep empty unless you want to *narrow* results
      } = opts;

      const normSku = utils.normalizeSku(sku);
      const allResults = [];

      // Build facet payloads (we’ll try two: raw sSearch then encoded sSearch)
      const baseFacets = [
        { facet: "Keyword",      search: [{ Text: sku, Value: sku }] },
        { facet: "CatalogNodes", search: catalogNodes },
        { facet: "Manufacturer", search: manufacturer ? [{ Text: manufacturer, Value: manufacturer }] : [] },
        { facet: "Brand",        search: [] }
      ];

      const strategies = [
        { encode: false, facets: baseFacets },
        { encode: true,  facets: baseFacets }
      ];

      for (const strat of strategies) {
        const pageResults = await this._runPagedQuery({
          facets: strat.facets,
          encode: strat.encode,
          normSku,
          sku,
          pageSize,
          maxPages,
          signal
        });

        allResults.push(...pageResults);

        if (pageResults.length >= pageSize) break;
      }

      return allResults;
    }

    async _runPagedQuery({ facets, encode, normSku, sku, pageSize, maxPages, signal }) {
      const out = [];

      // Helper: build URL with either raw or encoded sSearch
      const buildUrl = (start) => {
        const sSearch = encode ? encodeURIComponent(JSON.stringify(facets))
                               : JSON.stringify(facets);

        // IMPORTANT: keep DefaultCatalogNode but don’t force CatalogNodes unless provided
        return `https://www.ellsworth.com/api/catalogSearch/search` +
               `?sEcho=1&iColumns=1&sColumns=&iDisplayStart=${start}&iDisplayLength=${pageSize}` +
               `&mDataProp_0=&sSearch_0=&bRegex_0=false&bSearchable_0=true&bSortable_0=true` +
               `&sSearch=${sSearch}` +
               `&bRegex=false&iSortCol_0=0&sSortDir_0=asc&iSortingCols=1` +
               `&DefaultCatalogNode=Dispensing-Equipment-Supplies&_=${Date.now()}`;
      };

      let total = null;

      for (let page = 0; page < maxPages; page++) {
        const start = page * pageSize;
        const url = buildUrl(start);

        let json;
        try {
          json = await utils.fetchJson(url, { signal });
        } catch (err) {
          console.warn('Ellsworth fetch failed', err);
          break;
        }

        if (total == null) {
          // These come back as strings sometimes
          const t = Number(json?.iTotalDisplayRecords ?? json?.iTotalRecords ?? 0);
          total = Number.isFinite(t) ? t : 0;
        }

        const rows = Array.isArray(json?.aaData) ? json.aaData : [];
        if (!rows.length) break;

        for (const row of rows) {
          // Safely index by known positions
          const title         = row[0];
          const internalSku1  = row[1];
          const internalSku2  = row[2];
          const priceStr      = row[3];
          const relativeUrl   = row[4];
          // row[5] image
          // row[6] category
          // row[7] price breaks (JSON string)
          // row[8] empty
          const eachPriceStr     = row[9];   // not used, but available
          const packDesc      = row[10];  // e.g., "Sold as a pack (25/pk)."
          const displaySku    = row[11];
          const inStockFlag   = row[13];
          const brand         = row[19];  // often present
          const altSku        = row[20];  // alt sku copy

          const hay = [title, displaySku, internalSku1, internalSku2, brand, altSku].join(' ');
          if (!utils.includesSku(hay, normSku)) continue;

          const price   = utils.toNumOrUndef((priceStr || '').replace(/[^0-9.]/g, ''));
          const qty = packDesc ? Number((packDesc.match(/\d+/) || [])[0]) : NaN;
          const eachPrice = utils.toNumOrUndef((eachPriceStr || '').replace(/[^0-9.]/g, ''));
          const inStock = (inStockFlag || '').toString().toLowerCase() === 'true';
          const urlFull = relativeUrl ? `https://www.ellsworth.com${relativeUrl}` : 'https://www.ellsworth.com/';

          out.push({
            retailer: 'ellsworth',
            sku: displaySku || internalSku1 || internalSku2 || sku,
            title: (title || '').trim(),
            price,
            qty,
            eachPrice,
            url: urlFull,
            inStock,
            raw: row
          });

        }

        // Stop if we’ve fetched all reported records
        if (total != null && start + rows.length >= total) break;
        if (rows.length < pageSize) break; // last partial page
      }

      return out;
    }
  }

  // Register globally
  window.ellsworthProvider = new EllsworthProvider();
  window.MarketProviders = window.MarketProviders || {};
  window.MarketProviders.ellsworth = window.ellsworthProvider;
})();
