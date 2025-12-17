// providers/chemicalConceptsProvider.js
(function () {
  if (!window.MarketSearch) {
    throw new Error('MarketSearch not initialized: include providers/provider.js first.');
  }

  const { Provider, utils } = window.MarketSearch;

  class ChemicalConceptsProvider extends Provider {
    get id() { return 'chemical_concepts'; }

    /**
     * Finds products on Chemical Concepts.
     * Strategies:
     * 1. If manufacturer is Medmix/Nordson, scrape the specific category page (high fidelity).
     * 2. Fallback: Search the ElasticPress API (general search).
     * * @param {string} sku 
     * @param {Object} opts 
     */
    async findBySku(sku, opts = {}) {
      const { signal, manufacturer } = opts;
      const normSku = utils.normalizeSku(sku);
      const mfg = (manufacturer || '').toLowerCase();

      // 1. Determine Strategy
      let targetUrl = null;
      let isApiFallback = false;

      // Manufacturer specific URLs (Preferred: server-side rendered, detailed data)
      if (mfg.includes('medmix') || mfg.includes('sulzer') || mfg.includes('mixpac')) {
        targetUrl = 'https://www.chemical-concepts.com/product-category/dispensers-mixers-nozzles-3/?_manufacturer=medmix&alg_wc_products_per_page=-1';
      } else if (mfg.includes('nordson') || mfg.includes('efd') || mfg.includes('tah')) {
        targetUrl = 'https://www.chemical-concepts.com/product-category/dispensers-mixers-nozzles-3/?_manufacturer=nordson&alg_wc_products_per_page=-1';
      }

      const results = [];

      // 2. Execute Primary Strategy (Scraping)
      if (targetUrl) {
        try {
          const listings = await this.scrapeCategoryPage(targetUrl, normSku, signal);
          results.push(...listings);
        } catch (err) {
          console.warn(`Chemical Concepts scraping failed for ${targetUrl}:`, err);
        }
      }

      // 3. Execute Fallback Strategy (API) if needed
      // If we didn't search a specific list, or if the specific list returned 0 results, try the API.
      if (results.length === 0) {
        isApiFallback = true;
        try {
          const apiListings = await this.searchElasticApi(sku, signal);
          // Deduplicate in case API returns same items (unlikely if we only run this when scrape matches nothing)
          for (const item of apiListings) {
            // Simple dedupe based on URL
            if (!results.find(r => r.url === item.url)) {
              results.push(item);
            }
          }
        } catch (err) {
          console.warn('Chemical Concepts API fallback failed:', err);
        }
      }

      return results;
    }

    /**
     * Scrapes a WooCommerce category page looking for SKU matches.
     * Utilizes the "gtm4wp_productdata" hidden data for accuracy.
     */
    async scrapeCategoryPage(url, normSku, signal) {
      const response = await fetch(url, { signal });
      if (!response.ok) throw new Error(`Fetch failed: ${response.status}`);
      const html = await response.text();
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');

      const productNodes = doc.querySelectorAll('.product.type-product');
      const out = [];

      for (const node of productNodes) {
        let data = {};

        // A. Try extracting GTM JSON (Best Data)
        const gtmSpan = node.querySelector('.gtm4wp_productdata');
        if (gtmSpan && gtmSpan.dataset.gtm4wp_product_data) {
          try {
            const json = JSON.parse(gtmSpan.dataset.gtm4wp_product_data);
            data = {
              sku: json.item_id || json.sku,
              title: json.item_name,
              price: json.price, // GTM price is usually raw number
              url: json.productlink,
              stockStatus: json.stockstatus
            };
          } catch (e) { /* ignore parse error */ }
        }

        // B. Fallback to DOM elements if GTM missing/incomplete
        if (!data.sku) {
          const skuEl = node.querySelector('.sku');
          if (skuEl) data.sku = skuEl.textContent.replace(/^SKU\s+/i, '').trim();
        }
        if (!data.title) {
          const titleEl = node.querySelector('.woocommerce-loop-product__title');
          if (titleEl) data.title = titleEl.textContent.trim();
        }
        if (!data.url) {
          const linkEl = node.querySelector('a.woocommerce-LoopProduct-link');
          if (linkEl) data.url = linkEl.href;
        }
        if (!data.price) {
          // Extract from "$ 123.45"
          const priceEl = node.querySelector('.price .amount bdi') || node.querySelector('.price .amount');
          if (priceEl) {
            data.price = utils.toNumOrUndef(priceEl.textContent.replace(/[^0-9.]/g, ''));
          }
        }

        // C. Match Logic
        // Combine Title + SKU for loose searching
        const haystack = (data.sku + ' ' + data.title).toLowerCase();
        // Check if our search SKU is inside the haystack
        if (utils.includesSku(haystack, normSku)) {
          
          // Determine Stock
          // GTM 'stockstatus' is usually "instock" or "onbackorder"
          // DOM classes: 'instock', 'onbackorder', 'outofstock'
          let inStock = false;
          if (data.stockStatus) {
            inStock = data.stockStatus === 'instock';
          } else {
            inStock = !node.classList.contains('outofstock') && !node.classList.contains('onbackorder');
          }

          out.push({
            retailer: this.id,
            sku: data.sku || 'N/A',
            title: data.title,
            price: data.price,
            url: data.url,
            inStock: inStock
          });
        }
      }
      return out;
    }

    /**
     * Queries the ElasticPress API.
     */
    async searchElasticApi(sku, signal) {
      // Endpoint provided by user
      const baseUrl = 'https://wpe-chemicalconc-m2uq1jgb.us-east-2.wpe.clients.hosted-elasticpress.io/api/v1/search/posts/wpe-chemicalconc-m2uq1jgb--chemicalconceptscom-post-1';
      
      // Construct Query Params
      const params = new URLSearchParams({
        highlight: 'mark',
        offset: '0',
        orderby: 'relevance',
        order: 'desc',
        per_page: '12',
        post_type: 'product',
        search: sku,
        relation: 'and'
      });

      const response = await fetch(`${baseUrl}?${params.toString()}`, { signal });
      if (!response.ok) throw new Error(`API failed: ${response.status}`);
      
      const json = await response.json();
      
      // The API structure for ElasticPress usually returns { posts: [...] } or just [...]
      // We handle both just in case.
      const posts = Array.isArray(json) ? json : (json.posts || []);

      return posts.map(post => {
        // Map API fields to Listing object
        // Note: API might not return price/stock directly in the root object.
        // We often get 'meta' or have to rely on visiting the page. 
        // For now, we return what we have.
        
        // Attempt to find price in meta if available (varies by EP config)
        let price = undefined;
        // Sometimes price is in meta._price or similar, but often not exposed publicly.
        
        return {
          retailer: this.id,
          sku: post.ID.toString(), // Use ID as temp SKU if real SKU missing
          title: post.post_title, // or post.title.rendered
          price: price, // Likely undefined from this API
          url: post.permalink, // or post.link
          inStock: true // Assume true for search results unless indicated otherwise
        };
      });
    }
  }

  // Register the provider
  window.chemicalConceptsProvider = new ChemicalConceptsProvider();
  window.MarketProviders = window.MarketProviders || {};
  window.MarketProviders.chemical_concepts = window.chemicalConceptsProvider;
})();