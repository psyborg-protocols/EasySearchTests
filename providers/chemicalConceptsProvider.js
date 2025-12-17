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
      
      // 1. Prepare normalized search term for client-side filtering
      const normSearch = utils.normalizeSku(sku);

      const payload = {
        "from": 0,
        "size": 20, // Increased fetch size slightly to allow for client-side filtering
        "post_filter": {
          "bool": {
            "must": [
              { "terms": { "post_type.raw": ["ipf_join_team", "ipf_literature", "ipf_resource", "ipf_sds-tds", "ipf_team", "ipf_testimonials", "ipf_videos", "page", "post", "product"] } },
              { "terms": { "post_status": ["acf-disabled", "publish"] } },
              { "bool": { "must_not": [{ "terms": { "meta.ep_exclude_from_search.raw": ["1"] } }] } },
              { "terms": { "post_type.raw": ["product"] } }
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
                        { "multi_match": { "query": sku, "type": "phrase", "fields": ["post_title^1", "post_content^1"], "boost": 4 } },
                        { "multi_match": { "query": sku, "fields": ["post_title^1", "post_content^1"], "boost": 2, "fuzziness": 0, "operator": "and" } },
                        { "multi_match": { "fields": ["post_title^1", "post_content^1", "post_title.suggest^1"], "query": sku, "fuzziness": "auto" } }
                      ]
                    }
                  }],
                  "filter": [{ "match": { "post_type.raw": "page" } }]
                }
              },
              {
                "bool": {
                  "must": [{
                    "bool": {
                      "should": [
                        { "multi_match": { "query": sku, "type": "phrase", "fields": ["post_title^1", "post_content^1", "terms.category.name^1"], "boost": 4 } },
                        { "multi_match": { "query": sku, "fields": ["post_title^1", "post_content^1", "terms.category.name^1"], "boost": 2, "fuzziness": 0, "operator": "and" } },
                        { "multi_match": { "fields": ["post_title^1", "post_content^1", "terms.category.name^1", "post_title.suggest^1", "term_suggest^1"], "query": sku, "fuzziness": "auto" } }
                      ]
                    }
                  }],
                  "filter": [{ "match": { "post_type.raw": "post" } }]
                }
              },
              {
                "bool": {
                  "must": [{
                    "bool": {
                      "should": [
                        { "multi_match": { "query": sku, "type": "phrase", "fields": ["post_title^80", "post_content^1", "meta._sku.value^40", "meta._variations_skus.value^1", "terms.product_brand.name^15"], "boost": 4 } },
                        { "multi_match": { "query": sku, "fields": ["post_title^80", "post_content^1", "meta._sku.value^40", "meta._variations_skus.value^1", "terms.product_brand.name^15"], "boost": 2, "fuzziness": 0, "operator": "and" } },
                        { "multi_match": { "fields": ["post_title^80", "post_content^1", "meta._sku.value^40", "meta._variations_skus.value^1", "terms.product_brand.name^15", "post_title.suggest^1", "term_suggest^14"], "query": sku, "fuzziness": "auto" } }
                      ]
                    }
                  }],
                  "filter": [{ "match": { "post_type.raw": "product" } }]
                }
              }
            ]
          }
        },
        "sort": [{ "_score": { "order": "desc" } }]
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

      for (const hit of hits) {
        const src = hit._source;
        if (!src) continue;

        const meta = src.meta || {};
        const rawSku = meta._sku?.[0]?.value || '';
        
        // 2. Client-side filtering: Remove irrelevant garbage
        // We ensure the Result SKU contains the Search SKU (normalized).
        // e.g. Search "MS 10-24T" -> "MS1024T"
        //      Result "CON-MS-10-24T" -> "CONMS1024T" -> Match (Contains)
        //      Result "MS 10-24 Mixer" -> "MS1024MIXER" -> No Match
        const normResult = utils.normalizeSku(rawSku);
        if (!normResult.includes(normSearch)) {
            continue; 
        }

        const title = src.post_title || '';
        const permalink = src.permalink || '';
        let priceStr = meta._price?.[0]?.value || meta._regular_price?.[0]?.value;
        const price = utils.toNumOrUndef(priceStr);
        const stockStatus = meta._stock_status?.[0]?.value; 
        const inStock = (stockStatus === 'instock');

        results.push({
          retailer: this.id,
          sku: rawSku, 
          title: title.trim(),
          price,
          qty: 1, 
          url: permalink,
          inStock,
          raw: hit
        });
      }

      return results;
    }
  }

  // Register the provider
  window.chemicalConceptsProvider = new ChemicalConceptsProvider();
  window.MarketProviders = window.MarketProviders || {};
  window.MarketProviders.chemical_concepts = window.chemicalConceptsProvider;
})();