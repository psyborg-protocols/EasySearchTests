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

      const payload = {
        "from": 0,
        "size": 20, 
        "post_filter": {
          "bool": {
            "must": [
              { "terms": { "post_type.raw": ["product"] } },
              { "terms": { "post_status": ["publish"] } }
            ]
          }
        },
        "query": {
          "bool": {
            "should": [
              {
                "bool": {
                  "must": [{
                    "bool": {
                      "should": [
                        { "multi_match": { "query": sku, "type": "phrase", "fields": ["post_title^80", "meta._sku.value^40"], "boost": 4 } },
                        { "multi_match": { "query": sku, "fields": ["meta._sku.value^40"], "boost": 2, "fuzziness": 0, "operator": "and" } }
                      ]
                    }
                  }],
                  "filter": [{ "match": { "post_type.raw": "product" } }]
                }
              }
            ]
          }
        }
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
      const results = [];

      // Process each hit found in ElasticPress
      for (const hit of hits) {
        const src = hit._source;
        if (!src) continue;

        const meta = src.meta || {};
        const rawSku = meta._sku?.[0]?.value || '';
        
        const normResult = utils.normalizeSku(rawSku);
        if (!normResult.includes(normSearch)) continue;

        const title = src.post_title || '';
        const permalink = src.permalink || '';
        let priceStr = meta._price?.[0]?.value || meta._regular_price?.[0]?.value;
        const eachPrice = utils.toNumOrUndef(priceStr);
        const stockStatus = meta._stock_status?.[0]?.value; 
        const inStock = (stockStatus === 'instock');

        // --- STEP 2: Fetch Quantity Rules from WP-JSON ---
        let packQty = 1;
        try {
          const postId = hit._id; // WordPress Post ID from ElasticPress
          if (postId) {
            const wpRes = await fetch(`https://www.chemical-concepts.com/wp-json/wp/v2/product/${postId}`, { signal });
            if (wpRes.ok) {
              const wpData = await wpRes.json();
              
              // Extract quantity constraints verified by your test script
              const minQty = Number(wpData.min_quantity) || 0;
              const groupQty = Number(wpData.group_of_quantity) || 0;
              const tieredMin = Number(wpData.tiered_pricing_minimum_quantity) || 0;

              // Use the highest requirement found
              packQty = Math.max(1, minQty, groupQty, tieredMin);
            }
          }
        } catch (err) {
          console.warn(`[Chemical Concepts] WP-JSON fetch failed for ID ${hit._id}, defaulting to Qty 1`, err);
        }

        results.push({
          retailer: this.id,
          sku: rawSku, 
          title: title.trim(),
          eachPrice,
          price: eachPrice ? eachPrice * packQty : undefined,
          qty: packQty,
          url: permalink,
          inStock,
          raw: hit
        });
      }

      return results;
    }
  }

  window.chemicalConceptsProvider = new ChemicalConceptsProvider();
  window.MarketProviders = window.MarketProviders || {};
  window.MarketProviders.chemical_concepts = window.chemicalConceptsProvider;
})();