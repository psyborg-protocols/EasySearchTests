/**
 * quoteCalculator.js
 * Handles logic for dynamic B2B/B2C margins, Nordson/Medmix tiers, and grid layout shifting.
 */

const quoteCalculator = {
  manualTierOverride: false, // Tracks if the user manually clicked the tier toggle
  
  // Default Settings Matrix
  settings: {
    Nordson: {
      Full: { userMargin: 40, b2bDiscount: 10 },
      Half: { userMargin: 45, b2bDiscount: 10 },
      Less: { userMargin: 50, b2bDiscount: 10 }
    },
    MedmixMixers: {
      Full: { userMargin: 45, b2bDiscount: 10 },
      Half: { userMargin: 55, b2bDiscount: 15 },
      Less: { userMargin: 60, b2bDiscount: 18 }
    },
    MedmixCartridges: {
      Full: { userMargin: 42, b2bDiscount: 10 },
      Half: { userMargin: 55, b2bDiscount: 12 },
      Less: { userMargin: 60, b2bDiscount: 15 }
    },
    MedmixDMA: {
      Full: { userMargin: 40, b2bDiscount: 10 },
      Half: { userMargin: 55, b2bDiscount: 12 },
      Less: { userMargin: 60, b2bDiscount: 15 }
    },
    MedmixOther: {
      // Mapped to qty tiers for UI compatibility: Full (5 unit), Half (3 unit), Less (1 unit)
      Full: { userMargin: 36, b2bDiscount: 8 },
      Half: { userMargin: 40, b2bDiscount: 9 },
      Less: { userMargin: 45, b2bDiscount: 10 }
    }
  },

  toastShown: false, // Prevent spamming the warning toast

  init: function() {
    this.bindEvents();
    this.renderSettingsModal();
  },

  openSettings: function(event) {
    if (event) {
      event.preventDefault();
      event.stopPropagation(); // Stops the accordion from noticing the click
    }
    
    const modalEl = document.getElementById('marginSettingsModal');
    if (modalEl) {
      // Get the modal instance or create it if it doesn't exist yet
      const modalInstance = bootstrap.Modal.getOrCreateInstance(modalEl);
      modalInstance.show();
    } else {
      console.error("marginSettingsModal not found in the DOM.");
    }
  },

  bindEvents: function() {
    // Listen for Category Dropdown Change
    const categorySelect = document.getElementById('calcCategorySelect');
    if (categorySelect) {
      categorySelect.addEventListener('change', () => this.recalculateAllRows());
    }

    // Listen for Type Toggle Changes (B2C/B2B)
    document.querySelectorAll('input[name="calcTypeToggle"]').forEach(el => {
      el.addEventListener('change', () => this.recalculateAllRows());
    });

    // Listen for Tier Toggle Changes (FB/HB/LTB)
    document.querySelectorAll('input[name="calcTierToggle"]').forEach(el => {
      el.addEventListener('change', () => {
        this.manualTierOverride = true; 
        this.recalculateAllRows();
      });
    });

    // Horizontal Stretch Logic
    const accordion = document.getElementById('quoteCalculatorCollapse');
    const wrapper = document.getElementById('quoteCalculatorRow');

    if (accordion && wrapper) {
      accordion.addEventListener('show.bs.collapse', () => wrapper.classList.add('expanded-full-width'));
      accordion.addEventListener('hide.bs.collapse', () => wrapper.classList.remove('expanded-full-width'));
    }
  },

  getNumeric: function(rowElement, selector) {
    const el = rowElement.querySelector(`[data-col="${selector}"]`);
    if (!el) return 0;
    const sanitized = el.textContent.replace(/[^0-9.-]/g, '');
    const num = parseFloat(sanitized);
    return isFinite(num) ? num : 0;
  },

  /**
   * Main entry point for any manual edits in the table
   * @param {HTMLElement} rowElement 
   * @param {string} overrideSource - 'price', 'margin', or null (defaults to standard auto-calc)
   * @param {boolean} isRecalc - true if triggered by a toggle instead of a direct cell edit
   */
  onInputUpdate: function(rowElement, overrideSource = null, isRecalc = false) {
    if (rowElement.classList.contains('placeholder-row')) {
      rowElement.classList.remove('placeholder-row');
    }

    // If user types directly in Qty/Cost/FBQ, clear the manual tier override to auto-sync again
    if (!isRecalc && !overrideSource) {
      this.manualTierOverride = false;
    }

    const qty = this.getNumeric(rowElement, 'quantity');
    const fbq = this.getNumeric(rowElement, 'fbq');
    const unitCost = this.getNumeric(rowElement, 'unitcost');
    
    let price = this.getNumeric(rowElement, 'price');
    let marginStr = rowElement.querySelector('[data-col="margin"]').textContent;
    let margin = parseFloat(marginStr.replace(/[^0-9.-]/g, '')) || 0;

    let tooltipHtml = "";

    // --- TIER DETECTION & SYNC ---
    let activeTier = 'Less';
    
    if (this.manualTierOverride) {
      // Use the forced toggle value
      const checkedTier = document.querySelector('input[name="calcTierToggle"]:checked');
      if (checkedTier) activeTier = checkedTier.value;
    } else {
      // Auto-calculate based on qty
      if (fbq > 0) {
        if (qty >= fbq) activeTier = 'Full';
        else if (qty >= (fbq / 2)) activeTier = 'Half';
      }
      
      // Sync the UI toggle to match this row's auto-tier
      const tierInput = document.querySelector(`input[name="calcTierToggle"][value="${activeTier}"]`);
      if (tierInput && !tierInput.checked) {
        tierInput.checked = true;
      }
    }

    // --- LOGIC GATE ---
    if (overrideSource === 'margin') {
      // User typed a specific margin, calculate price
      if (margin < 100) {
        price = unitCost / (1 - (margin / 100));
      }
      tooltipHtml = `
        <div class="text-start" style="font-size: 0.85rem; min-width: 160px;">
          <div class="fw-bold border-bottom border-secondary pb-1 mb-1">
            <i class="fas fa-edit me-1"></i>Manual Margin Override
          </div>
          <div class="d-flex justify-content-between"><span>Unit Cost:</span> <strong>$${unitCost.toFixed(2)}</strong></div>
          <div class="d-flex justify-content-between"><span>Target Margin:</span> <strong>${margin.toFixed(1)}%</strong></div>
          <div class="border-top border-secondary pt-1 mt-1 text-muted" style="font-size: 0.75rem;">
            <em>Formula: Cost / (1 - Margin)</em>
          </div>
        </div>`;
        
    } else if (overrideSource === 'price') {
      // User typed a specific price, calculate margin
      margin = (price > 0) ? ((price - unitCost) / price) * 100 : 0;
      tooltipHtml = `
        <div class="text-start" style="font-size: 0.85rem; min-width: 160px;">
          <div class="fw-bold border-bottom border-secondary pb-1 mb-1">
            <i class="fas fa-edit me-1"></i>Manual Price Override
          </div>
          <div class="d-flex justify-content-between"><span>Unit Cost:</span> <strong>$${unitCost.toFixed(2)}</strong></div>
          <div class="d-flex justify-content-between"><span>Set Price:</span> <strong>$${price.toFixed(2)}</strong></div>
          <div class="border-top border-secondary pt-1 mt-1 text-muted" style="font-size: 0.75rem;">
            <em>Formula: (Price - Cost) / Price</em>
          </div>
        </div>`;
        
    } else {
      // Auto-calculate based on Toggles and Tiers
      const brand = document.getElementById('calcCategorySelect').value;
      const type = document.querySelector('input[name="calcTypeToggle"]:checked').value;

      // Use the activeTier we established above
      const rule = this.settings[brand][activeTier];
      
      // Calculate User Price first (always the baseline)
      let userPrice = unitCost / (1 - (rule.userMargin / 100));
      
      if (type === 'B2B') {
        price = userPrice * (1 - (rule.b2bDiscount / 100));
      } else {
        price = userPrice;
      }

      // Re-derive the actual margin hitting the books
      margin = (price > 0) ? ((price - unitCost) / price) * 100 : 0;
      
      // Build explanation waterfall
      tooltipHtml = `
        <div class="text-start" style="font-size: 0.85rem; min-width: 200px;">
          <div class="fw-bold border-bottom border-secondary pb-1 mb-1">
            <i class="fas fa-calculator me-1"></i>${brand} (${activeTier} Box)
          </div>
          <div class="d-flex justify-content-between"><span>Unit Cost:</span> <strong>$${unitCost.toFixed(2)}</strong></div>
          <div class="d-flex justify-content-between"><span>Base Margin:</span> <strong>${rule.userMargin}%</strong></div>
          <div class="d-flex justify-content-between"><span>Base Price:</span> <strong>$${userPrice.toFixed(2)}</strong></div>
      `;

      if (type === 'B2B') {
        tooltipHtml += `
          <div class="d-flex justify-content-between text-warning mt-1">
            <span>B2B Discount:</span> <strong>-${rule.b2bDiscount}%</strong>
          </div>
        `;
      }

      tooltipHtml += `
          <div class="border-top border-secondary pt-1 mt-2 d-flex justify-content-between fw-bold text-info">
            <span>Effective Margin:</span> <span>${margin.toFixed(1)}%</span>
          </div>
        </div>`;
    }

    const orderTotal = qty * price;
    const totalProfit = (price - unitCost) * qty;

    // Update UI Cells (prevent overwriting price if the user is actively typing in it)
    if (overrideSource !== 'price') {
      rowElement.querySelector('[data-col="price"]').textContent = price.toFixed(2);
    }
    
    rowElement.querySelector('[data-col="ordertotal"]').textContent = moneyFmt.format(orderTotal);
    rowElement.querySelector('[data-col="totalprofit"]').textContent = moneyFmt.format(totalProfit);
    
    // Update Margin Cell
    const marginCell = rowElement.querySelector('[data-col="margin"]');
    
    // Only overwrite the text if we aren't actively typing in it 
    if (overrideSource !== 'margin') {
      marginCell.textContent = margin.toFixed(1) + '%';
    }
    
    marginCell.style.cursor = 'help'; // Visual cue
    
    // --- The Bootstrap 5 Tooltip Fix ---
    let tooltipInstance = bootstrap.Tooltip.getInstance(marginCell);
    
    if (!tooltipInstance) {
      // First time initialization
      marginCell.setAttribute('title', tooltipHtml);
      marginCell.setAttribute('data-bs-html', 'true');
      tooltipInstance = new bootstrap.Tooltip(marginCell);
    } else {
      // Update existing tooltip's internal cache
      marginCell.setAttribute('data-bs-original-title', tooltipHtml);
      
      // If the tooltip is currently visible on the screen, force it to live-update
      if (typeof tooltipInstance.setContent === 'function') {
         tooltipInstance.setContent({ '.tooltip-inner': tooltipHtml });
      }
    }

    this.checkHighValueWarning(orderTotal);
    this.updatePriceDifferenceIndicator();
  },

  recalculateAllRows: function() {
    const tableBody = document.getElementById('quoteCalculatorBody');
    Array.from(tableBody.rows).forEach(row => {
      if (!row.classList.contains('placeholder-row') && this.getNumeric(row, 'quantity') > 0) {
        this.onInputUpdate(row, null, true); // True indicates it's a mass recalculation (won't clear manual override)
      }
    });
  },

  checkHighValueWarning: function(total) {
    if (total > 3000 && !this.toastShown) {
      const toastEl = document.getElementById('highValueToast');
      const toast = new bootstrap.Toast(toastEl);
      toast.show();
      this.toastShown = true; // Prevent spamming
      
      // Reset flag when toast is hidden
      toastEl.addEventListener('hidden.bs.toast', () => {
        this.toastShown = false;
      }, { once: true });
    }
  },

  populate: function(productInfo) {
    if (!productInfo || !productInfo.PartNumber) return;
    
    this.manualTierOverride = false; // Reset manual override for new products

    const tableBody = document.getElementById('quoteCalculatorBody');
    const firstRow = tableBody.rows[0];
    const secondRow = tableBody.rows[1];

    const unitCost = toNumber(productInfo.UnitCost);
    const hasOrder = productInfo.Quantity !== undefined && productInfo.Price !== undefined;
    
    // Attempt to guess brand from string (fallback to Nordson)
    const desc = productInfo.Description ? productInfo.Description.toLowerCase() : '';
    const categorySelect = document.getElementById('calcCategorySelect');
    
    if (desc.includes('medmix')) {
      if (desc.includes('mixer') || desc.includes('nozzle')) {
        categorySelect.value = 'MedmixMixers';
      } else if (desc.includes('cartridge')) {
        categorySelect.value = 'MedmixCartridges';
      } else if (desc.includes('dma') || desc.includes('dmb')) {
        categorySelect.value = 'MedmixDMA';
      } else {
        categorySelect.value = 'MedmixOther';
      }
    } else {
      categorySelect.value = 'Nordson';
    }

    // Populate Row 1
    const firstProdCell = firstRow.querySelector('[data-col="product"]');
    if (firstProdCell.tagName === 'INPUT') firstProdCell.value = productInfo.PartNumber;
    else firstProdCell.textContent = productInfo.PartNumber;
    
    firstRow.querySelector('[data-col="unitcost"]').textContent = unitCost.toFixed(2);
    firstRow.querySelector('[data-col="fbq"]').textContent = productInfo.FullBoxQty || 0;

    if (hasOrder) {
      firstRow.querySelector('[data-col="quantity"]').textContent = productInfo.Quantity;
      firstRow.querySelector('[data-col="price"]').textContent = toNumber(productInfo.Price).toFixed(2);
      this.onInputUpdate(firstRow, 'price'); // Override with historical price
    } else {
      ['quantity', 'price', 'ordertotal', 'margin', 'totalprofit'].forEach(c =>
        firstRow.querySelector(`[data-col="${c}"]`).textContent = ''
      );
    }

    // Populate Row 2
    secondRow.classList.add('placeholder-row');
    secondRow.querySelector('[data-col="product"]').textContent = productInfo.PartNumber;
    secondRow.querySelector('[data-col="unitcost"]').textContent = unitCost.toFixed(2);
    secondRow.querySelector('[data-col="fbq"]').textContent = productInfo.FullBoxQty || 0;
    
    secondRow.querySelector('[data-col="quantity"]').textContent = hasOrder ? productInfo.Quantity : '';
    secondRow.querySelector('[data-col="price"]').textContent = hasOrder ? toNumber(productInfo.Price).toFixed(2) : '';

    ['ordertotal', 'margin', 'totalprofit'].forEach(c =>
        secondRow.querySelector(`[data-col="${c}"]`).textContent = ''
    );
  },

  updatePriceDifferenceIndicator: function () {
    const tableBody = document.getElementById('quoteCalculatorBody');
    if (tableBody.rows.length < 2) return;

    const firstRow = tableBody.rows[0];
    const secondRow = tableBody.rows[1];
    const priceCellSecondRow = secondRow.querySelector('[data-col="price"]');

    const existingIndicator = priceCellSecondRow.querySelector('.price-diff-indicator');
    if (existingIndicator) existingIndicator.remove();

    const price1 = this.getNumeric(firstRow, 'price');
    const price2 = this.getNumeric(secondRow, 'price');

    if (price1 > 0 && price2 > 0 && price1 !== price2) {
      const diff = ((price2 - price1) / price1) * 100;
      const indicator = document.createElement('div');
      indicator.className = 'price-diff-indicator';
      const sign = diff > 0 ? '+' : '';
      indicator.textContent = `${sign}${diff.toFixed(1)}%`;
      indicator.style.color = diff > 0 ? 'green' : 'red';
      indicator.style.fontSize = '0.75rem';
      indicator.style.fontWeight = 'bold';
      indicator.style.textAlign = 'center';
      indicator.style.marginTop = '4px';
      priceCellSecondRow.appendChild(indicator);
    }
  },

  // --- Settings UI Logic ---
  renderSettingsModal: function() {
    const container = document.getElementById('marginSettingsFormContainer');
    if (!container) return;
    
    let html = '';
    for (const [brand, tiers] of Object.entries(this.settings)) {
      html += `<h6 class="mt-3 mb-2 text-dark border-bottom pb-1">${brand} Margins</h6>`;
      for (const [tier, values] of Object.entries(tiers)) {
        html += `
          <div class="row g-2 align-items-center mb-2">
            <div class="col-4 fw-bold">${tier} Box</div>
            <div class="col-4">
              <div class="input-group input-group-sm">
                <span class="input-group-text bg-light">User %</span>
                <input type="number" class="form-control" id="set_${brand}_${tier}_user" value="${values.userMargin}">
              </div>
            </div>
            <div class="col-4">
              <div class="input-group input-group-sm">
                <span class="input-group-text bg-light">B2B %</span>
                <input type="number" class="form-control" id="set_${brand}_${tier}_b2b" value="${values.b2bDiscount}">
              </div>
            </div>
          </div>
        `;
      }
    }
    container.innerHTML = html;
  },

  saveSettings: function() {
    for (const [brand, tiers] of Object.entries(this.settings)) {
      for (const tier of Object.keys(tiers)) {
        const userVal = parseFloat(document.getElementById(`set_${brand}_${tier}_user`).value);
        const b2bVal = parseFloat(document.getElementById(`set_${brand}_${tier}_b2b`).value);
        if (!isNaN(userVal)) this.settings[brand][tier].userMargin = userVal;
        if (!isNaN(b2bVal)) this.settings[brand][tier].b2bDiscount = b2bVal;
      }
    }
    this.recalculateAllRows();
  }
};

// Initialize listeners on load
document.addEventListener('DOMContentLoaded', () => {
  quoteCalculator.init();
});

// Expose globally
window.quoteCalculator = quoteCalculator;