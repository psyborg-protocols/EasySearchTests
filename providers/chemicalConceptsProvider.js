// providers/chemicalConceptsProvider.js
(function () {
  if (!window.MarketSearch) {
    throw new Error('MarketSearch not initialized: include providers/provider.js first.');
  }
  const { Provider, utils } = window.MarketSearch;

  class ChemicalConceptsProvider extends Provider {
    get id() { return 'chemical-concepts'; }

    async findBySku(sku, { signal } = {}) {
      const url = 'https://wpe-chemicalconc-m2uq1jgb.us-east-2.wpe.clients.hosted-elasticpress.io/wpe-chemicalconc-m2uq1jgb--chemicalconceptscom-post-1/autosuggest';
      const normSearch = utils.normalizeSku(sku);

      // ... [Payload logic remains exactly the same] ...
      const payload = { /* ... keep your existing payload ... */ 
        "from": 0, "size": 12, 
        /* ... */ 
      };

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal
      });

      if (!response.ok) throw new Error(`ChemicalConcepts error: ${response.status}`);
      const json = await response.json();
      const hits = json?.hits?.hits || [];
      
      // 1. First pass: Filter irrelevant hits to avoid wasting fetches
      const candidates = hits.map(hit => {
        const src = hit._source || {};
        const meta = src.meta || {};
        const rawSku = meta._sku?.[0]?.value || '';
        const normResult = utils.normalizeSku(rawSku);
        
        // Strict filtering: if it doesn't match, return null
        if (!normResult.includes(normSearch)) return null;

        return { hit, src, meta, rawSku };
      }).filter(c => c !== null);

      // 2. Second pass: Fetch details for candidates in parallel
      const results = await Promise.all(candidates.map(async (c) => {
        const { hit, src, meta, rawSku } = c;
        const permalink = src.permalink;

        let qty = 1;

        // --- THE NEW COMPLEXITY ---
        if (permalink) {
          try {
            // Fetch the HTML page
            const pageRes = await fetch(permalink, { signal });
            const pageText = await pageRes.text();

            // Parse HTML to find <span class="quantity-note__num">
            const parser = new DOMParser();
            const doc = parser.parseFromString(pageText, 'text/html');
            const qtyNode = doc.querySelector('.quantity-note__num');
            
            if (qtyNode) {
              const qVal = parseInt(qtyNode.textContent.trim(), 10);
              if (!isNaN(qVal) && qVal > 0) {
                qty = qVal;
              }
            }
          } catch (err) {
            console.warn(`Failed to fetch/parse details for ${rawSku}`, err);
            // Fallback: keep qty = 1
          }
        }
        // --------------------------

        const title = src.post_title || '';
        let priceStr = meta._price?.[0]?.value || meta._regular_price?.[0]?.value;
        const eachPrice = utils.toNumOrUndef(priceStr); // The site lists per-unit price
        
        // Calculate total price based on the scraped quantity
        const price = (eachPrice && qty) ? (eachPrice * qty) : undefined;

        const stockStatus = meta._stock_status?.[0]?.value; 
        const inStock = (stockStatus === 'instock');

        return {
          retailer: this.id,
          sku: rawSku,
          title: title.trim(),
          price: 'See Link',
          eachPrice,  // Unit Price (From API)
          qty: 'See Link',
          url: permalink,
          inStock,
          raw: hit
        };
      }));

      return results;
    }
  }

  // Register the provider
  window.chemicalConceptsProvider = new ChemicalConceptsProvider();
  window.MarketProviders = window.MarketProviders || {};
  window.MarketProviders.chemical_concepts = window.chemicalConceptsProvider;
})();