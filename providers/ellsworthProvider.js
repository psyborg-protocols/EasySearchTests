// providers/ellsworthProvider.js
(function () {
  if (!window.MarketSearch) {
    throw new Error('MarketSearch not initialized: include providers/provider.js first.');
  }

  const { Provider, utils } = window.MarketSearch;

  class EllsworthProvider extends Provider {
    get id() { return 'ellsworth'; }

    /**
     * Server-side SKU search (no full catalog pull).
     * - Uses Keyword facet with the provided SKU to narrow results.
     * - Aggregates all pages (no short-circuit).
     * - Locally filters with includesSku to catch site-side variants (qty suffixes, alt SKUs).
     * - Expands price breaks into per-qty listings.
     * - De-dupes by (url|normSku|qty).
     *
     * @param {string} sku
     * @param {{
     *   signal?: AbortSignal,
     *   pageSize?: number,         // default 250
     *   maxPages?: number,         // safety cap
     *   manufacturer?: string,     // e.g. "medmix" (optional but helps)
     *   catalogNodes?: {Text:string, Value:string}[]
     * }} opts
     * @returns {Promise<Listing[]>}
     */
    async findBySku(sku, opts = {}) {
      const {
        signal,
        pageSize = 250,
        maxPages = 12,
        manufacturer,
        catalogNodes = []
      } = opts;

      const normSku = utils.normalizeSku(sku);

      // --- Build facets WITH server-side keyword search ---
      // Keep it tight: Keyword narrows the result set on Ellsworth's side.
      const facets = [
        { facet: 'Keyword',      search: [{ Text: sku, Value: sku }] },
        { facet: 'CatalogNodes', search: catalogNodes },
      ];

      // Manufacturer filter can further reduce noise and missed matches
      if (manufacturer) {
        facets.push({ facet: 'Manufacturer', search: [{ Text: manufacturer, Value: manufacturer }] });
      } else {
        facets.push({ facet: 'Manufacturer', search: [] });
      }

      facets.push({ facet: 'Brand', search: [] });

      // Single strategy (encoded sSearch). Running both raw+encoded caused duplicate rows.
      const rows = await this._fetchRowsPaged({ facets, encode: true, pageSize, maxPages, signal });

      // ---- Local filtering + expansion + de-dupe ----
      const out = [];
      const seen = new Set(); // url|normSku|qty

      for (const row of rows) {
        // Known columns from Ellsworth search API:
        // [0]=title, [1]=internalSku1, [2]=internalSku2, [3]=priceStr, [4]=relativeUrl,
        // [5]=image, [6]=category, [7]=priceBreaks(JSON), [8]=empty, [9]=eachPriceStr,
        // [10]=packDesc, [11]=displaySku, [12]=?, [13]=inStockFlag, [14..]=..., [19]=brand, [20]=altSku
        const title         = row[0];
        const internalSku1  = row[1];
        const internalSku2  = row[2];
        const priceStr      = row[3];
        const relativeUrl   = row[4];
        const priceBreaks   = row[7];
        const eachPriceStr  = row[9];
        const packDesc      = row[10];
        const displaySku    = row[11];
        const inStockFlag   = row[13];
        const brand         = row[19];
        const altSku        = row[20];

        // Local match is still useful because site SKUs often carry qty suffixes.
        const hay = [title, displaySku, internalSku1, internalSku2, brand, altSku].join(' ');
        if (!utils.includesSku(hay, normSku)) continue;

        const urlFull = relativeUrl ? `https://www.ellsworth.com${relativeUrl}` : 'https://www.ellsworth.com/';
        const inStock = (inStockFlag || '').toString().toLowerCase() === 'true';
        const baseSku = displaySku || internalSku1 || internalSku2 || sku;

        const pushUnique = ({ price, qty, eachPrice }) => {
          const key = `${urlFull}|${normSku}|${qty || ''}`;
          if (seen.has(key)) return;
          seen.add(key);
          out.push({
            retailer: 'ellsworth',
            sku: baseSku,
            title: (title || '').trim(),
            price,
            qty,
            eachPrice,
            url: urlFull,
            inStock,
            raw: row
          });
        };

        // Base visible price/each
        const price     = utils.toNumOrUndef(String(priceStr || '').replace(/[^0-9.]/g, ''));
        const eachPrice = utils.toNumOrUndef(String(eachPriceStr || '').replace(/[^0-9.]/g, ''));

        // Try to infer qty from pack description like "Sold as a pack (25/pk)."
        const qtyFromPack = (() => {
          const m = (packDesc || '').match(/\b(\d+)\b/);
          const q = m ? Number(m[1]) : NaN;
          return Number.isFinite(q) ? q : undefined;
        })();

        // Push base row
        pushUnique({ price, qty: qtyFromPack, eachPrice });

        // Expand price break tiers like [{Qty:"25", Price:"$12.34"}, ...]
        if (typeof priceBreaks === 'string' && priceBreaks.trim().startsWith('[')) {
          try {
            const tiers = JSON.parse(priceBreaks);
            if (Array.isArray(tiers)) {
              for (const t of tiers) {
                const tQtyRaw   = String(t?.Qty ?? t?.qty ?? '');
                const tPriceRaw = String(t?.Price ?? t?.price ?? '');
                const tQty      = utils.toNumOrUndef(tQtyRaw);
                const tPrice    = utils.toNumOrUndef(tPriceRaw.replace(/[^0-9.]/g, ''));
                const tEach     = (Number.isFinite(tPrice) && Number.isFinite(tQty) && tQty)
                  ? tPrice / tQty
                  : undefined;

                if (Number.isFinite(tQty) && Number.isFinite(tPrice)) {
                  pushUnique({ price: tPrice, qty: tQty, eachPrice: tEach });
                }
              }
            }
          } catch {
            // ignore bad JSON in price breaks
          }
        }
      }

      return out;
    }

    // Pull *only* the paged search results for the given Keyword/manufacturer facets.
    async _fetchRowsPaged({ facets, encode, pageSize, maxPages, signal }) {
      const rowsOut = [];

      const buildUrl = (start) => {
        const sSearch = encode
          ? encodeURIComponent(JSON.stringify(facets))
          : JSON.stringify(facets);

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
          const t = Number(json?.iTotalDisplayRecords ?? json?.iTotalRecords ?? 0);
          total = Number.isFinite(t) ? t : 0;
        }

        const rows = Array.isArray(json?.aaData) ? json.aaData : [];
        if (!rows.length) break;

        rowsOut.push(...rows);

        // Exit when done (either end-of-total, or short page)
        if (total != null && start + rows.length >= total) break;
        if (rows.length < pageSize) break;
      }

      return rowsOut;
    }
  }

  // Register in your global structure (no ES modules)
  window.ellsworthProvider = new EllsworthProvider();
  window.MarketProviders = window.MarketProviders || {};
  window.MarketProviders.ellsworth = window.ellsworthProvider;
})();
