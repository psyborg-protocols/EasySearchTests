// providers/ellsworthProvider.js
(function () {
  if (!window.MarketSearch) {
    throw new Error('MarketSearch not initialized.');
  }

  const { Provider, utils } = window.MarketSearch;

  function parsePackSize(packDesc) {
    const m = String(packDesc || '').match(/\((\d+)\s*\/\s*pk\)/i) || String(packDesc || '').match(/\b(\d+)\b/);
    const n = m ? Number(m[1]) : NaN;
    return Number.isFinite(n) ? n : undefined;
  }

  function parseMinQtyFromTier(qtyLabel) {
    const s = String(qtyLabel || '').trim();
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

    async findBySku(sku, opts = {}) {
      const { signal, pageSize = 250, maxPages = 12, manufacturer, catalogNodes = [] } = opts;
      const normSku = utils.normalizeSku(sku);

      const facets = [
        { facet: 'Keyword', search: [{ Text: sku, Value: sku }] },
        { facet: 'CatalogNodes', search: catalogNodes },
        { facet: 'Manufacturer', search: manufacturer ? [{ Text: manufacturer, Value: manufacturer }] : [] },
        { facet: 'Brand', search: [] }
      ];

      const rows = await this._fetchRowsPaged({ facets, encode: true, pageSize, maxPages, signal });
      const out = [];
      const seen = new Set();

      for (const row of rows) {
        const [title, internalSku1, internalSku2, priceStr, relativeUrl, , , priceBreaks, , , packDesc, displaySku, , inStockFlag, , , , , , brand, altSku] = row;
        const hay = [title, displaySku, internalSku1, internalSku2, brand, altSku].join(' ');
        if (!utils.includesSku(hay, normSku)) continue;

        const urlFull = relativeUrl ? `https://www.ellsworth.com${relativeUrl}` : 'https://www.ellsworth.com/';
        const inStock = (inStockFlag || '').toString().toLowerCase() === 'true';
        const baseSku = displaySku || internalSku1 || internalSku2 || sku;
        const packSize = parsePackSize(packDesc) || 1;

        const basePrice = utils.toNumOrUndef(String(priceStr || '').replace(/[^0-9.]/g, ''));
        if (basePrice) {
          const key = `${urlFull}|${basePrice}|1`;
          if (!seen.has(key)) {
            seen.add(key);
            out.push({
              retailer: 'ellsworth',
              sku: baseSku,
              title: (title || '').trim(),
              price: basePrice,
              qty: packSize,
              eachPrice: basePrice / packSize,
              url: urlFull,
              inStock,
              raw: row
            });
          }
        }

        if (typeof priceBreaks === 'string' && priceBreaks.trim().startsWith('[')) {
          try {
            const tiers = JSON.parse(priceBreaks);
            if (Array.isArray(tiers)) {
              for (const t of tiers) {
                const packPrice = utils.toNumOrUndef(String(t?.price ?? t?.Price ?? '').replace(/[^0-9.]/g, ''));
                const minPacks = parseMinQtyFromTier(t?.qty ?? t?.Qty);
                if (!Number.isFinite(packPrice) || !Number.isFinite(minPacks)) continue;

                const totalPieces = packSize * minPacks;
                const totalPrice = packPrice * minPacks;
                const eachPrice = totalPrice / totalPieces;
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
          } catch { /* ignore JSON issues */ }
        }
      }

      return out;
    }

    async _fetchRowsPaged({ facets, encode, pageSize, maxPages, signal }) {
      const rowsOut = [];
      const buildUrl = (start) => {
        const sSearch = encode ? encodeURIComponent(JSON.stringify(facets)) : JSON.stringify(facets);
        return `https://www.ellsworth.com/api/catalogSearch/search?sEcho=1&iColumns=1&iDisplayStart=${start}&iDisplayLength=${pageSize}&sSearch=${sSearch}&_=${Date.now()}`;
      };

      for (let page = 0; page < maxPages; page++) {
        const url = buildUrl(page * pageSize);
        const json = await utils.fetchJson(url, { signal }).catch(() => null);
        const rows = Array.isArray(json?.aaData) ? json.aaData : [];
        if (!rows.length) break;
        rowsOut.push(...rows);
        if (rows.length < pageSize) break;
      }

      return rowsOut;
    }
  }

  window.ellsworthProvider = new EllsworthProvider();
  window.MarketProviders = window.MarketProviders || {};
  window.MarketProviders.ellsworth = window.ellsworthProvider;
})();
