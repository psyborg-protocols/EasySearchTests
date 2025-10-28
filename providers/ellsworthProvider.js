// providers/ellsworthProvider.js
(function () {
  if (!window.MarketSearch) {
    throw new Error('MarketSearch not initialized: include providers/provider.js first.');
  }
  const { Provider, utils } = window.MarketSearch;

  const BASE = 'https://www.ellsworth.com';
  const API  = `${BASE}/api/catalogSearch/search`;

  // --------- helpers specific to Ellsworth ---------
  function toAbsUrl(u) {
    if (!u) return BASE + '/';
    if (/^https?:\/\//i.test(u)) return u;
    return BASE + (u.startsWith('/') ? u : `/${u}`);
  }

  function parseMoney(s) {
    if (typeof s !== 'string') return undefined;
    const m = s.replace(/[, ]/g, '').match(/\$?(-?\d+(\.\d+)?)/);
    return m ? Number(m[1]) : undefined;
  }

  function looksLikeSku(s) {
    return typeof s === 'string' && /[A-Za-z0-9]/.test(s) && /[A-Za-z]/.test(s) && /[\- ]/.test(s);
  }

  function extractInStock(cells) {
    const joined = cells.join(' ');
    if (/discontinued/i.test(joined)) return false;
    if (/available inventory:\s*(\d+)/i.test(joined)) {
      const n = Number(RegExp.$1);
      if (Number.isFinite(n)) return n > 0;
    }
    if (/\btrue\b/i.test(joined)) return true;
    if (/\bfalse\b/i.test(joined)) return false;
    if (/in\s*stock/i.test(joined)) return true;
    return undefined;
  }

  function cellContainsSku(cell, normSku) {
    return utils.includesSku(String(cell || ''), normSku);
  }

  // Row can be an array (common) or an object (sometimes)
  function parseRow(row, normSku) {
    // Normalize to an array of strings for heuristic scanning
    let cells = [];
    if (Array.isArray(row)) {
      cells = row.map(x => (x == null ? '' : String(x)));
    } else if (row && typeof row === 'object') {
      // Try common object keys
      const candidateKeys = [
        'Name','Title','DisplayName','ShortDescription','MfrPart','ManufacturerPart',
        'PartNumber','SKU','Sku','Price','UnitPrice','Url','URL','Slug','ProductUrl'
      ];
      cells = candidateKeys.map(k => row[k]).filter(v => v != null).map(String);
    } else {
      return null;
    }

    // Title usually sits at cell[0]
    const title = cells[0] || (row?.Title || row?.Name || 'Product');
    // URL: first cell that looks like a path
    const urlCell = cells.find(c => typeof c === 'string' && (c.startsWith('/') || /^https?:\/\//i.test(c)));
    const url = toAbsUrl(urlCell || row?.Url || row?.URL || row?.ProductUrl || row?.Slug);
    // Price: first cell that looks like $123.45
    const priceCell = cells.find(c => /\$\s*\d/.test(c));
    const price = parseMoney(priceCell || row?.Price || row?.UnitPrice || row?.CustomerPrice);
    // SKU: try common columns then heuristic fallback
    let sku =
      row?.SKU ||
      row?.Sku ||
      row?.MfrPart ||
      row?.ManufacturerPart ||
      row?.PartNumber ||
      cells[1] || cells[2];

    // Heuristic: prefer the cell that actually contains the normSku
    const containingCell = cells.find(c => cellContainsSku(c, normSku));
    if (containingCell && containingCell.length < (sku?.length ?? Infinity)) {
      sku = containingCell;
    }
    // Fallback: the “most SKU-ish” cell
    if (!sku) {
      const maybe = cells.find(looksLikeSku);
      if (maybe) sku = maybe;
    }

    const inStock = extractInStock(cells);

    return {
      retailer: 'ellsworth',
      sku: sku || '',          // we’ll filter by normSku outside
      title,
      price,
      url,
      inStock,
      raw: row
    };
  }

  function buildFacets({ sku, catalogNodes = [], manufacturer = null, brand = null }) {
    const facets = [
      { facet: 'Keyword',       search: [{ Text: sku, Value: sku }] },
      { facet: 'CatalogNodes',  search: catalogNodes.map(({ Text, Value }) => ({ Text, Value })) },
      { facet: 'Manufacturer',  search: manufacturer ? [{ Text: manufacturer, Value: manufacturer }] : [] },
      { facet: 'Brand',         search: brand ? [{ Text: brand, Value: brand }] : [] },
    ];
    return JSON.stringify(facets);
  }

  async function fetchPage({ sku, start, length, signal, defaultNode, facetsJson }) {
    const params = new URLSearchParams({
      sEcho: '1',
      iColumns: '1',
      sColumns: '',
      iDisplayStart: String(start),
      iDisplayLength: String(length),
      mDataProp_0: '',
      sSearch_0: '',
      bRegex_0: 'false',
      bSearchable_0: 'true',
      bSortable_0: 'true',
      sSearch: facetsJson,
      bRegex: 'false',
      iSortCol_0: '0',
      sSortDir_0: 'asc',
      iSortingCols: '1',
      DefaultCatalogNode: defaultNode || 'Dispensing-Equipment-Supplies',
      _: String(Date.now())
    });
    const url = `${API}?${params.toString()}`;
    // Reuse MarketSearch.utils.fetchJson for standard fetch+retry
    return await utils.fetchJson(url, { signal });
  }

  class EllsworthProvider extends Provider {
    get id() { return 'ellsworth'; }

    /**
     * @param {string} sku
     * @param {{
     *   signal?: AbortSignal,
     *   pageSize?: number,              // iDisplayLength
     *   maxPages?: number,              // safety cap
     *   defaultCatalogNode?: string,    // Ellsworth's DefaultCatalogNode
     *   catalogNodes?: Array<{Text:string,Value:string}>, // optional facet filter(s)
     *   manufacturer?: string|null,     // optional facet
     *   brand?: string|null,            // optional facet
     *   stopOnFirstMatch?: boolean
     * }} opts
     * @returns {Promise<Listing[]>}
     */
    async findBySku(sku, opts = {}) {
      const {
        signal,
        pageSize = 50,
        maxPages = 5,
        defaultCatalogNode = 'Dispensing-Equipment-Supplies',
        catalogNodes = [],            // e.g. [{Text:'Cartridges Accessories', Value:'Dispensing-Equipment-Supplies-Cartridges-Accessories'}]
        manufacturer = null,
        brand = null,
        stopOnFirstMatch = true
      } = opts;

      const normSku = utils.normalizeSku(sku);
      const facetsJson = buildFacets({ sku, catalogNodes, manufacturer, brand });

      const out = [];
      let start = 0;
      let pages = 0;
      let total = Infinity; // we’ll update from response

      while (start < total && pages < maxPages) {
        const payload = await fetchPage({
          sku, start, length: pageSize, signal,
          defaultNode: defaultCatalogNode,
          facetsJson
        });

        // Total from response (strings in their API)
        const totalStr = payload?.iTotalDisplayRecords || payload?.iTotalRecords || '0';
        const thisTotal = Number(totalStr);
        if (Number.isFinite(thisTotal)) total = thisTotal;

        // Rows can be under aaData (array rows) or data (object rows)
        let rows = [];
        if (Array.isArray(payload?.aaData)) rows = payload.aaData;
        else if (Array.isArray(payload?.data)) rows = payload.data;

        for (const row of rows) {
          const listing = parseRow(row, normSku);
          if (!listing) continue;

          // Keep only rows that *actually* contain the SKU in raw text, to avoid broad keyword matches
          const rawText = JSON.stringify(listing.raw || '').toLowerCase().replace(/[\s\-_.]/g, '');
          if (!rawText.includes(normSku)) continue;

          // Ensure URL and title exist
          if (!listing.url) continue;

          // Fill fallback sku if parser missed
          if (!listing.sku) listing.sku = sku;

          out.push(listing);
          if (stopOnFirstMatch) return out;
        }

        // pagination advance
        start += pageSize;
        pages += 1;

        // If this page returned fewer than requested, we've likely exhausted
        if (!rows || rows.length < pageSize) break;
      }

      return out;
    }
  }

  // expose + register
  window.ellsworthProvider = new EllsworthProvider();
  window.MarketProviders = window.MarketProviders || {};
  window.MarketProviders.ellsworth = window.ellsworthProvider;
})();
