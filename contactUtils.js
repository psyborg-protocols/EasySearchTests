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
    findPotentialMatches: function(customerName, orgContacts, limit = 3) {
        if (!orgContacts || orgContacts.size === 0) {
            return [];
        }

        const companyKey = customerName.trim().toLowerCase();
        const allCompanyNames = Array.from(orgContacts.keys());
        
        // Configure Fuse options
        const options = {
            includeScore: true,
            threshold: 0.4
        };
        
        const fuse = new Fuse(allCompanyNames, options);
        const results = fuse.search(companyKey);
        
        return results.slice(0, limit);
    }
};


window.ContactUtils = ContactUtils;

