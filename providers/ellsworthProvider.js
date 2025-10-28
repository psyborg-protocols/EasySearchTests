// providers/ellsworthProvider.js
(function () {
  if (!window.MarketSearch) {
    throw new Error('MarketSearch not initialized: include providers/provider.js first.');
  }

  const { Provider, utils } = window.MarketSearch;

  function parsePackSize(desc) {
    // Prefer "(50/pk)"; fallback to first integer in string
    const m = String(desc || '').match(/\((\d+)\s*\/\s*pk\)/i) || String(desc || '').match(/\b(\d+)\b/);
    const n = m ? Number(m[1]) : NaN;
    return Number.isFinite(n) ? n : undefined;
  }

  function minPacksFromTierLabel(label) {
    const s = String(label || '').trim();
    const plus = s.match(/^(\d+)\s*\+$/);
    if (plus) return Number(plus[1]);
    const range = s.match(/^(\d+)\s*-\s*\d+$/);
    if (range) return Number(range[1]);
    const single = s.match(/^(\d+)$/);
    if (single) return Number(single[1]);
    return undefined;
  }

  class EllsworthProvider extends Provider {
    get id() { return 'ellsworth'; }

    /**
     * Server-side SKU search with full tier expansion.
     * Returns one entry per tier, where:
     *   qty   = packSize * minPacks
     *   price = packPrice * minPacks
     * eachPrice is per-piece (price / qty)
     */
    async findBySku(sku, opts = {}) {
      const {
        signal,
        pageSize = 250,
        maxPages = 12,
        manufacturer = 'medmix',            // optional but recommended to reduce noise
        catalogNodes = []
      } = opts;

      const normSku = utils.normalizeSku(sku);

      // Build facets (keep Keyword on server side)
      const baseFacets = [
        { facet: 'Keyword',      search: [{ Text: sku, Value: sku }] },
        { facet: 'CatalogNodes', search: catalogNodes },
        { facet: 'Manufacturer', search: manufacturer ? [{ Text: manufacturer, Value: manufacturer }] : [] },
        { facet: 'Brand',        search: [] }
      ];

      // Try encoded first (works most of the time); if it fails, fall back to raw
      const strategies = [
        { encode: true,  facets: baseFacets },
        { encode: false, facets: baseFacets }
      ];

      // fetch all rows across pages (first strategy that returns rows wins; if 0 rows, try next)
      let rows = [];
      for (const strat of strategies) {
        rows = await this._fetchRowsPaged({ facets: strat.facets, encode: strat.encode, pageSize, maxPages, signal });
        if (rows.length) break;
      }

      const out = [];
      // De-dupe at the tier-entry level:
      // key = url | packPrice | minPacks
      const seen = new Set();

      for (const row of rows) {
        // columns (based on your sample payload):
        //  0 title
        //  1 internalSku1
        //  2 internalSku2
        //  3 priceStr (pack price shown)
        //  4 relativeUrl
        //  7 priceBreaks (JSON array)
        //  9 eachPriceStr (string like "($1.80 each)")
        // 10 packDesc ("Sold as a pack (50/pk).")
        // 11 displaySku
        // 13 inStockFlag ("true"/"false")
        // 19 brand (sometimes empty)
        // 20 altSku (sometimes brand appears here depending on feed version)
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
        const brand         = row[19] || '';
        const altSku        = row[20] || '';

        // Local match remains necessary (site SKUs often have qty suffixes)
        const hay = [title, displaySku, internalSku1, internalSku2, brand, altSku].join(' ');
        if (!utils.includesSku(hay, normSku)) continue;

        const urlFull = relativeUrl ? `https://www.ellsworth.com${relativeUrl}` : 'https://www.ellsworth.com/';
        const inStock = (inStockFlag || '').toString().toLowerCase() === 'true';
        const baseSku = displaySku || internalSku1 || internalSku2 || sku;
        const packSize = parsePackSize(packDesc) || 1;

        // Base/visible price row -> treat as minPacks = 1
        const basePackPrice = utils.toNumOrUndef(String(priceStr || '').replace(/[^0-9.]/g, ''));
        if (Number.isFinite(basePackPrice)) {
          const minPacks = 1;
          const totalPieces = packSize * minPacks;
          const totalPrice  = basePackPrice * minPacks;
          const eachPrice   = totalPrice / totalPieces;
          const key = `${urlFull}|${basePackPrice}|${minPacks}`;
          if (!seen.has(key)) {
            seen.add(key);
            out.push({
              retailer: 'ellsworth',
              sku: baseSku,
              title: (title || '').trim(),
              price: totalPrice,     // per tier
              qty: totalPieces,      // pieces (packSize * minPacks)
              eachPrice,
              url: urlFull,
              inStock,
              raw: row
            });
          }
        }

        // Expand all tiers from priceBreaks
        if (typeof priceBreaks === 'string' && priceBreaks.trim().startsWith('[')) {
          try {
            const tiers = JSON.parse(priceBreaks);
            if (Array.isArray(tiers)) {
              for (const t of tiers) {
                const packPrice = utils.toNumOrUndef(String(t?.price ?? t?.Price ?? '').replace(/[^0-9.]/g, ''));
                const minPacks  = minPacksFromTierLabel(t?.qty ?? t?.Qty);
                if (!Number.isFinite(packPrice) || !Number.isFinite(minPacks)) continue;

                const totalPieces = packSize * minPacks;
                const totalPrice  = packPrice * minPacks;
                const eachPrice   = totalPrice / totalPieces;

                const key = `${urlFull}|${packPrice}|${minPacks}`;
                if (seen.has(key)) continue;
                seen.add(key);

                out.push({
                  retailer: 'ellsworth',
                  sku: baseSku,
                  title: (title || '').trim(),
                  price: totalPrice,
                  qty: totalPieces,
                  eachPrice,
                  url: urlFull,
                  inStock,
                  raw: row
                });
              }
            }
          } catch {
            // ignore malformed priceBreaks
          }
        }
      }

      return out;
    }

    async _fetchRowsPaged({ facets, encode, pageSize, maxPages, signal }) {
      const rowsOut = [];

      const buildUrl = (start) => {
        const sSearch = encode ? encodeURIComponent(JSON.stringify(facets))
                               : JSON.stringify(facets);

        // Full parameter set — Ellsworth breaks without these
        return `https://www.ellsworth.com/api/catalogSearch/search` +
               `?sEcho=1` +
               `&iColumns=1` +
               `&sColumns=` +
               `&iDisplayStart=${start}` +
               `&iDisplayLength=${pageSize}` +
               `&mDataProp_0=` +
               `&sSearch_0=` +
               `&bRegex_0=false` +
               `&bSearchable_0=true` +
               `&bSortable_0=true` +
               `&sSearch=${sSearch}` +
               `&bRegex=false` +
               `&iSortCol_0=0` +
               `&sSortDir_0=asc` +
               `&iSortingCols=1` +
               `&DefaultCatalogNode=Dispensing-Equipment-Supplies` +
               `&_=${Date.now()}`;
      };

      let total = null;

      for (let page = 0; page < maxPages; page++) {
        const start = page * pageSize;
        const url = buildUrl(start);

        let json;
        try {
          json = await utils.fetchJson(url, { signal });
        } catch (err) {
          // if encoded failed on the first page, just stop and let caller try raw strategy
          if (page === 0) return rowsOut;
          break;
        }

        if (total == null) {
          const t = Number(json?.iTotalDisplayRecords ?? json?.iTotalRecords ?? 0);
          total = Number.isFinite(t) ? t : 0;
        }

        const rows = Array.isArray(json?.aaData) ? json.aaData : [];
        if (!rows.length) break;

        rowsOut.push(...rows);

        if (total != null && start + rows.length >= total) break;
        if (rows.length < pageSize) break;
      }

      return rowsOut;
    }
  }

  // Register globally
  window.ellsworthProvider = new EllsworthProvider();
  window.MarketProviders = window.MarketProviders || {};
  window.MarketProviders.ellsworth = window.ellsworthProvider;
})();
