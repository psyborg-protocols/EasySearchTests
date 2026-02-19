/**
 * Utility functions for contact matching and management.
 */
const ContactUtils = {
    findPotentialMatches: function(customerName, orgContacts=window.dataStore.orgContacts, limit = 3) {
        if (!orgContacts || orgContacts.size === 0) {
            return [];
        }

        const normalizeName = (name) => {
            return name.toLowerCase()
                    // 1. Normalize ampersands to "and" so "A&B" matches "A and B"
                    .replace(/&/g, ' and ')
                    
                    // 2. Replace all punctuation with a space to preserve word boundaries
                    // (e.g., "Chase-Corp" -> "Chase Corp", not "ChaseCorp")
                    .replace(/[^\w\s]/g, ' ')
                    
                    // 3. Remove corporate suffixes AND common noise words ("the", "and", "of")
                    .replace(/\b(corporation|corpor|corp|incorporated|inc|llc|ltd|limited|company|co|the|and|of)\b/g, '')
                    
                    // 4. Collapse multiple spaces into a single space and trim edges
                    .replace(/\s+/g, ' ')
                    .trim();
        };

        const rawSearchKey = customerName.trim().toLowerCase();
        const normalizedSearchKey = normalizeName(rawSearchKey);
        const searchKey = normalizedSearchKey.length > 0 ? normalizedSearchKey : rawSearchKey;

        const allCompanyNames = Array.from(orgContacts.keys()).map(name => ({
            original: name,
            searchable: normalizeName(name) || name
        }));
        
        const options = {
            includeScore: true,
            threshold: 0.4,
            ignoreLocation: true, // Crucial for finding substrings buried deep in a long name
            keys: [
                { name: 'searchable', weight: 2 },
                { name: 'original', weight: 1 }
            ]
        };
        
        const fuse = new Fuse(allCompanyNames, options);
        let rawResults = fuse.search(searchKey);

        // --- NEW: Substring Priority Boost ---
        rawResults.forEach(result => {
            const targetRaw = result.item.original.toLowerCase();
            const targetNorm = result.item.searchable;
            
            // Check if the search term is a complete substring of the target (or vice versa)
            // We check both the raw inputs and the normalized inputs to be safe
            const isSubstring = targetRaw.includes(rawSearchKey) || 
                                rawSearchKey.includes(targetRaw) ||
                                targetNorm.includes(searchKey) ||
                                searchKey.includes(targetNorm);

            if (isSubstring) {
                // Artificially improve the score (closer to 0 is better)
                // This guarantees it will jump ahead of partial/fuzzy typo matches
                result.score = result.score * 0.1; 
            }
        });

        // Re-sort the array based on the newly adjusted scores
        rawResults.sort((a, b) => a.score - b.score);
        
        // Map back to the expected output format
        const results = rawResults.map(result => ({
            item: result.item.original,
            refIndex: result.refIndex,
            score: result.score
        }));
        
        return results.slice(0, limit);
    }
};

window.ContactUtils = ContactUtils;