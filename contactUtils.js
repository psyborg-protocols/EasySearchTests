/**
 * Utility functions for contact matching and management.
 */
const ContactUtils = {
    /**
     * Finds potential matches for a company name within an organization's contacts using fuzzy search.
     * @param {string} customerName - The name of the customer to find matches for.
     * @param {Map} orgContacts - A Map of organization contacts where keys are company names.
     * @param {number} [limit=3] - The maximum number of matches to return.
     * @returns {Array} An array of match objects from Fuse.js.
     */
    findPotentialMatches: function(customerName, orgContacts=window.dataStore.orgContacts, limit = 3) {
        if (!orgContacts || orgContacts.size === 0) {
            return [];
        }

        // Helper: Strips common business suffixes and punctuation to extract the "core" name
        const normalizeName = (name) => {
            return name.toLowerCase()
                       // Remove common corporate suffixes
                       .replace(/\b(corporation|corpor|corp|incorporated|inc|llc|ltd|limited|company|co)\b\.?/gi, '')
                       // Remove punctuation
                       .replace(/[^\w\s]/g, '')
                       // Collapse multiple spaces
                       .replace(/\s+/g, ' ')
                       .trim();
        };

        const rawSearchKey = customerName.trim().toLowerCase();
        const normalizedSearchKey = normalizeName(rawSearchKey);
        
        // If normalization strips everything (e.g., they literally searched "Corp"), fallback to the raw input
        const searchKey = normalizedSearchKey.length > 0 ? normalizedSearchKey : rawSearchKey;

        // Map contacts to an object so Fuse can search a clean version but return the original
        const allCompanyNames = Array.from(orgContacts.keys()).map(name => ({
            original: name,
            searchable: normalizeName(name) || name
        }));
        
        // Configure Fuse options
        const options = {
            includeScore: true,
            threshold: 0.4,
            ignoreLocation: true, // Helps match "chase" even if it's buried in a longer string
            keys: [
                { name: 'searchable', weight: 2 }, // Prioritize the core name match
                { name: 'original', weight: 1 }    // Fallback to the full string
            ]
        };
        
        const fuse = new Fuse(allCompanyNames, options);
        const rawResults = fuse.search(searchKey);
        
        // Map the results back to the flat format the rest of your app expects
        const results = rawResults.map(result => ({
            item: result.item.original,
            refIndex: result.refIndex,
            score: result.score
        }));
        
        return results.slice(0, limit);
    }
};

window.ContactUtils = ContactUtils;