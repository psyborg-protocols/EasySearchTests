// providers/ellsworthProvider.js
(function () {
  if (!window.MarketSearch) {
    throw new Error('MarketSearch not initialized: include providers/provider.js first.');
  }

  const { Provider, utils } = window.MarketSearch;

  function parsePackSize(packDesc) {
    const m = String(packDesc || '').match(/\(([\d,]+)\s*\/\s*pk\)/i)
          || String(packDesc || '').match(/\b([\d,]+)\b/);
    const n = m ? Number(m[1].replace(/,/g, '')) : NaN;
    return Number.isFinite(n) ? n : undefined;
  }


  function tierMinFromLabel(qtyLabel) {
    // "1-2" -> 1, "3-13" -> 3, "14+" -> 14, "6" -> 6
    const s = String(qtyLabel || '').trim();
    if (!s) return undefined;
    const plus = s.match(/^(\d+)\s*\+$/);
    if (plus) return Number(plus[1]);
    const range = s.match(/^(\d+)\s*-\s*(\d+)$/);
    if (range) return Number(range[1]);
    const single = s.match(/^(\d+)$/);
    if (single) return Number(single[1]);
    return undefined;
  }

  class EllsworthProvider extends Provider {
    get id() { return 'ellsworth'; }

    /**
     * Server-side SKU search with tier expansion.
     * For each tier:
     *  - qty (pieces)   = minPacks * packSize
     *  - price (total)  = minPacks * pricePerPack
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

      // Keep the picky URL shape unchanged — we only vary facets.
      const facets = [
        { facet: 'Keyword',      search: [{ Text: sku, Value: sku }] },
        { facet: 'CatalogNodes', search: catalogNodes },
        { facet: 'Manufacturer', search: manufacturer ? [{ Text: manufacturer, Value: manufacturer }] : [] },
        { facet: 'Brand',        search: [] }
      ];

      // Single encoded search avoids duplicates.
      const rows = await this._fetchRowsPaged({ facets, encode: true, pageSize, maxPages, signal });

      const out = [];
      const seen = new Set(); // url|normSku|qty|price

      const pushUnique = (base, { price, qty, eachPrice }) => {
        const key = `${base.url}|${normSku}|${qty ?? ''}|${price ?? ''}`;
        if (seen.has(key)) return;
        seen.add(key);
        out.push({
          retailer: 'ellsworth',
          sku: base.sku,
          title: base.title,
          price,          // total $ for the tier bundle (minPacks * pricePerPack) OR base
          qty,            // total pieces for the tier bundle (minPacks * packSize) OR base pack pieces
          eachPrice,      // price per piece (if computable)
          url: base.url,
          inStock: base.inStock,
          raw: base.raw
        });
      };

      for (const row of rows) {
        // Column map (per your sample payload)
        const title         = row[0];
        const internalSku1  = row[1];
        const internalSku2  = row[2];
        const priceStr      = row[3];
        const relativeUrl   = row[4];
        const priceBreaks   = row[7];  // JSON string with tiers
        const eachPriceStr  = row[9];
        const packDesc      = row[10]; // e.g., "(50/pk)"
        const displaySku    = row[11];
        const inStockFlag   = row[13];
        const brand         = row[19] || '';
        const altSku        = row[20] || '';

        // Local match so qty-suffixed site SKUs still match clean sku
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

        const packSize = parsePackSize(packDesc); // pieces per pack
        const pricePerPack_visible = utils.toNumOrUndef(String(priceStr || '').replace(/[^0-9.]/g, ''));
        const eachVisible = utils.toNumOrUndef(String(eachPriceStr || '').replace(/[^0-9.]/g, ''));

        let tiersAdded = 0;

        // Expand tiers -> compute minPacks, multiply into total price & total qty
        if (typeof priceBreaks === 'string' && priceBreaks.trim().startsWith('[')) {
          try {
            const tiers = JSON.parse(priceBreaks);
            if (Array.isArray(tiers) && tiers.length) {
              for (const t of tiers) {
                const minPacks = tierMinFromLabel(t?.qty ?? t?.Qty);
                const perPack  = utils.toNumOrUndef(String(t?.price ?? t?.Price ?? '').replace(/[^0-9.]/g, ''));
                if (!Number.isFinite(minPacks) || !Number.isFinite(perPack)) continue;

                const totalPrice = perPack * minPacks;
                const totalQty   = Number.isFinite(packSize) ? packSize * minPacks : undefined;
                const each = (Number.isFinite(totalPrice) && Number.isFinite(totalQty) && totalQty)
                  ? totalPrice / totalQty
                  : (Number.isFinite(packSize) && packSize ? perPack / packSize : undefined);

                pushUnique(base, { price: totalPrice, qty: totalQty ?? undefined, eachPrice: each });
                tiersAdded++;
              }
            }
          } catch {
            // ignore bad JSON
          }
        }

        // If no valid tiers parsed, fallback to the visible/base pack
        if (tiersAdded === 0) {
          const qtyPieces = Number.isFinite(packSize) ? packSize : undefined;
          const each = (Number.isFinite(pricePerPack_visible) && Number.isFinite(packSize) && packSize)
            ? pricePerPack_visible / packSize
            : eachVisible;
          pushUnique(base, { price: pricePerPack_visible, qty: qtyPieces, eachPrice: each });
        }
      }

      return out;
    }

    // Paged fetch (URL format kept exactly as Ellsworth expects)
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

  // Global registration
  window.ellsworthProvider = new EllsworthProvider();
  window.MarketProviders = window.MarketProviders || {};
  window.MarketProviders.ellsworth = window.ellsworthProvider;
})();
