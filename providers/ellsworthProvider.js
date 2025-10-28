// providers/ellsworthProvider.js
(function () {
  if (!window.MarketSearch) {
    throw new Error('MarketSearch not initialized: include providers/provider.js first.');
  }

  const { Provider, utils } = window.MarketSearch;

  function parsePackSize(packDesc) {
    // e.g., "Sold as a pack (50/pk)." -> 50
    const m = String(packDesc || '').match(/\((\d+)\s*\/\s*pk\)/i) || String(packDesc || '').match(/\b(\d+)\b/);
    const n = m ? Number(m[1]) : NaN;
    return Number.isFinite(n) ? n : undefined;
  }

  function parseTierLabelToRange(qtyLabel) {
    // "1-2" -> {min:1, max:2}, "3-13" -> {min:3,max:13}, "14+" -> {min:14,max:Infinity}
    const s = String(qtyLabel || '').trim();
    if (!s) return { min: undefined, max: undefined, label: '' };
    const plus = s.match(/^(\d+)\s*\+$/);
    if (plus) return { min: Number(plus[1]), max: Infinity, label: s };
    const range = s.match(/^(\d+)\s*-\s*(\d+)$/);
    if (range) return { min: Number(range[1]), max: Number(range[2]), label: s };
    const single = s.match(/^(\d+)$/);
    if (single) return { min: Number(single[1]), max: Number(single[1]), label: s };
    return { min: undefined, max: undefined, label: s };
  }

  class EllsworthProvider extends Provider {
    get id() { return 'ellsworth'; }

    /**
     * Server-side SKU search with full tier expansion (no short-circuit).
     *
     * @param {string} sku
     * @param {{
     *   signal?: AbortSignal,
     *   pageSize?: number,         // default 250
     *   maxPages?: number,         // safety cap
     *   manufacturer?: string,     // optional but helpful
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

      // Build facets WITH server-side keyword match (narrow server set)
      const facets = [
        { facet: 'Keyword',      search: [{ Text: sku, Value: sku }] },
        { facet: 'CatalogNodes', search: catalogNodes },
        { facet: 'Manufacturer', search: manufacturer ? [{ Text: manufacturer, Value: manufacturer }] : [] },
        { facet: 'Brand',        search: [] }
      ];

      // Single encoded search to avoid duplicate rows
      const rows = await this._fetchRowsPaged({ facets, encode: true, pageSize, maxPages, signal });

      const out = [];
      const seen = new Set(); // key: url|normSku|qtyPieces|price

      const pushUnique = (base, { price, qtyPieces, eachPrice, tierMeta }) => {
        const key = `${base.url}|${normSku}|${qtyPieces || ''}|${price || ''}`;
        if (seen.has(key)) return;
        seen.add(key);

        out.push({
          retailer: 'ellsworth',
          sku: base.sku,
          title: base.title,
          price,                       // price per PACK
          qty: qtyPieces,              // number of PIECES per pack (e.g., 50)
          eachPrice,                   // price per PIECE (price / qtyPieces)
          url: base.url,
          inStock: base.inStock,
          // keep the raw row and include optional tier metadata
          raw: base.raw,
          tierMinPacks: tierMeta?.min,
          tierMaxPacks: tierMeta?.max,
          tierLabel: tierMeta?.label
        });
      };

      for (const row of rows) {
        // Column notes:
        // [0]=title, [1]=internalSku1, [2]=internalSku2, [3]=priceStr, [4]=relativeUrl,
        // [7]=priceBreaks(JSON), [9]=eachPriceStr, [10]=packDesc, [11]=displaySku,
        // [13]=inStockFlag, [19]=brand, [20]=altSku (your dump shows brand/alt swapped sometimes)
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

        const hay = [title, displaySku, internalSku1, internalSku2, brand, altSku].join(' ');
        if (!utils.includesSku(hay, normSku)) continue;

        const urlFull = relativeUrl ? `https://www.ellsworth.com${relativeUrl}` : 'https://www.ellsworth.com/';
        const inStock = (inStockFlag || '').toString().toLowerCase() === 'true';
        const baseSku = displaySku || internalSku1 || internalSku2 || sku;
        const base = {
          url: urlFull,
          sku: baseSku,
          title: (title || '').trim(),
          inStock,
          raw: row
        };

        const packSize = parsePackSize(packDesc); // e.g., 50
        const basePrice  = utils.toNumOrUndef(String(priceStr || '').replace(/[^0-9.]/g, ''));
        const baseEach   = (Number.isFinite(basePrice) && Number.isFinite(packSize) && packSize)
          ? basePrice / packSize
          : utils.toNumOrUndef(String(eachPriceStr || '').replace(/[^0-9.]/g, ''));

        // Push the visible/base price row (usually corresponds to first tier)
        pushUnique(base, {
          price: basePrice,
          qtyPieces: packSize,
          eachPrice: baseEach,
          tierMeta: undefined
        });

        // Expand the tiered prices correctly:
        if (typeof priceBreaks === 'string' && priceBreaks.trim().startsWith('[')) {
          try {
            const tiers = JSON.parse(priceBreaks);
            if (Array.isArray(tiers)) {
              for (const t of tiers) {
                // t.qty like "1-2", "3-13", "14+"
                const { min, max, label } = parseTierLabelToRange(t?.qty ?? t?.Qty);
                const pricePack = utils.toNumOrUndef(String(t?.price ?? t?.Price ?? '').replace(/[^0-9.]/g, ''));
                if (!Number.isFinite(pricePack)) continue;

                const eachPerPiece = (Number.isFinite(packSize) && packSize)
                  ? pricePack / packSize
                  : undefined;

                pushUnique(base, {
                  price: pricePack,           // PER PACK
                  qtyPieces: packSize,        // pieces per pack stays the same (e.g., 50)
                  eachPrice: eachPerPiece,    // PER PIECE
                  tierMeta: { min, max, label }
                });
              }
            }
          } catch {
            // ignore JSON parse issues
          }
        }
      }

      return out;
    }

    // Paged fetch with encoded sSearch to avoid duplicate pass
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

        if (total != null && start + rows.length >= total) break;
        if (rows.length < pageSize) break;
      }

      return rowsOut;
    }
  }

  window.ellsworthProvider = new EllsworthProvider();
  window.MarketProviders = window.MarketProviders || {};
  window.MarketProviders.ellsworth = window.ellsworthProvider;
})();
