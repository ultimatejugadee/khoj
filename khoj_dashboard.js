class KhojDashboard {
  constructor(element, options = {}) {
    this.container = element;
    this.uniqueId = 'kd_' + Math.random().toString(36).substr(2, 9);
    
    // Auto-detect prefix from element classes (e.g., class="khoj-dashboard turnover_")
    this.prefix = null;
    this.container.classList.forEach(cls => {
      if (cls !== 'khoj-dashboard' && cls.endsWith('_')) {
        this.prefix = cls.toLowerCase();
      }
    });
    
    if (!this.prefix) {
      console.warn('KhojDashboard: No data prefix class (ending with _) found on container. Defaulting to "turnover_".');
      this.prefix = 'turnover_';
    }

    // Configuration options with defaults
    this.options = Object.assign({
      dailyFile: 'bhavcopy_daily.csv',
      monthlyFile: 'bhavcopy_monthly.csv',
      masterFile: 'company_master.csv',
      controlFile: 'control_menu.csv',
      tagFile: 'tag_menu.csv',
      definitionsFile: 'variable_and_schema_definition.xml',
      filingsFile: 'corporate_filings.json'
    }, options);

    // Read options from data attributes if present
    if (this.container.dataset.daily) this.options.dailyFile = this.container.dataset.daily;
    if (this.container.dataset.monthly) this.options.monthlyFile = this.container.dataset.monthly;
    if (this.container.dataset.master) this.options.masterFile = this.container.dataset.master;
    if (this.container.dataset.control) this.options.controlFile = this.container.dataset.control;
    if (this.container.dataset.tag) this.options.tagFile = this.container.dataset.tag;
    if (this.container.dataset.definitions) this.options.definitionsFile = this.container.dataset.definitions;
    if (this.container.dataset.filings) this.options.filingsFile = this.container.dataset.filings;

    // State localized to this dashboard instance
    this.state = {
      currentMode: 'daily', // 'daily' or 'monthly'
      currentAggDimension: 'default', // 'default' or a dimension field name
      currentTimeGrouping: 'default',
      numericSystem: 'indian', // 'indian' or 'western'
      activeRange: { minIdx: 0, maxIdx: 100 },
      dateList: [],
      rawFiles: {
        daily: null,
        monthly: null,
        master: null,
        control: null,
        tag: null
      },
      parsedData: {
        daily: [],
        monthly: [],
        master: [],
        control: [],
        tag: []
      },
      masterLookup: {},
      dynamicFilters: {},
      expandedRows: new Set(),
      expandedSubRows: new Set(),
      chartInstance: null,
      selectedYAxes: ['turnover'],
      secondaryYAxes: [],
      lineYAxes: [],
      showChartLabels: false,
      corporateFilings: null,
      variableDefinitions: {}
    };

    // Keep track of dynamically generated element IDs/references
    this.els = {};

    this.init();
  }

  init() {
    // 0. Synchronize theme early on container and body
    const savedTheme = localStorage.getItem('theme') || 'dark';
    const isLight = (savedTheme === 'light');
    this.container.classList.toggle('light-theme', isLight);
    document.body.classList.toggle('light-theme', isLight);

    // 1. Inject DOM structure
    this.container.innerHTML = this.buildHTMLTemplate();
    this.cacheElements();
    this.setupEvents();
    
    // Sync theme icons
    this.syncThemeIcons(isLight);
    
    // 2. Load Variable definitions and start data fetch
    this.fetchVariableDefinitions();
    this.autoFetchFiles();
    this.container.dataset.initialized = "true";
  }

  // Generate unique IDs for internal elements to avoid collision between multiple dashboards
  id(suffix) {
    return `${suffix}-${this.uniqueId}`;
  }

  buildHTMLTemplate() {
    return `
      <!-- Loader Overlay Screen -->
      <div id="${this.id('loader-screen')}" class="loader-overlay">
        <div id="${this.id('loader-spinner')}" class="spinner"></div>
        <div id="${this.id('loader-main-text')}" class="loader-text">Loading Dashboard Configuration...</div>
        <div id="${this.id('loader-sub-text')}" class="loader-sub">Initializing database connections and components...</div>
        
        <!-- Manual Dropzone fallback -->
        <div id="${this.id('dropzone')}" class="dropzone-container hidden">
          <div class="dropzone-title">Select or Drag Files Here</div>
          <div class="dropzone-desc">Please select the 5 required data files (bhavcopy_daily, bhavcopy_monthly, company_master, control_menu, tag_menu) to load the dashboard.</div>
          <button class="download-btn" id="${this.id('btn-trigger-upload')}">Select Files</button>
          <input type="file" id="${this.id('file-inputs-raw')}" multiple accept=".csv">
          <div id="${this.id('file-status-board')}" class="file-status-list"></div>
        </div>
      </div>

      <!-- Main Layout -->
      <!-- Top Controls Bar -->
      <div class="top-controls-bar">
        <div class="row-flex">
          
          <!-- Mode Selector -->
          <div class="d-flex flex-column gap-2">
            <div class="control-label">Mode Selector</div>
            <div class="btn-group" id="${this.id('mode-btn-group')}">
              <button class="btn-group-btn active" data-mode="daily">Daily Data</button>
              <button class="btn-group-btn" data-mode="monthly">Monthly Data</button>
            </div>
          </div>

          <!-- Dynamic Aggregation Dimension Button Group -->
          <div class="d-flex flex-column gap-2">
            <div class="control-label">Aggregation Dimension</div>
            <div class="btn-group" id="${this.id('agg-btn-group')}">
              <button class="btn-group-btn active" id="${this.id('btn-agg-default')}">Company (Default)</button>
              <!-- Dinamically loaded buttons from control_menu -->
            </div>
          </div>

          <!-- Time-based Aggregation buttons -->
          <div class="d-flex flex-column gap-2">
            <div class="control-label">Time Grouping</div>
            <div class="btn-group" id="${this.id('time-group-btn-group')}">
              <!-- Dynamically populated depending on mode -->
            </div>
          </div>

          <!-- Numeric Scale Selector -->
          <div class="d-flex flex-column gap-2">
            <div class="control-label">Numeric Scale</div>
            <div class="btn-group" id="${this.id('scale-btn-group')}">
              <button class="btn-group-btn active" data-scale="indian">Crore / Lakh</button>
              <button class="btn-group-btn" data-scale="western">Billion / Million</button>
            </div>
          </div>

          <!-- Export Button -->
          <div class="d-flex flex-column gap-2">
            <div class="control-label">Export Data</div>
            <button class="download-btn" id="${this.id('btn-download-csv')}" title="Download current filtered data as CSV">
              <svg class="download-icon" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Download CSV
            </button>
          </div>

          <!-- Theme Toggle -->
          <div class="d-flex flex-column gap-2" style="align-self: flex-end;">
            <div class="control-label">Appearance</div>
            <button id="${this.id('theme-toggle-btn')}" class="theme-toggle-btn" title="Toggle Theme" aria-label="Toggle Theme" style="margin-left: 0; width: 38px; height: 38px; display: flex; align-items: center; justify-content: center; padding: 0; border-radius: 8px;">
              <!-- Moon Icon -->
              <svg class="theme-icon moon-icon" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
              </svg>
              <!-- Sun Icon -->
              <svg class="theme-icon sun-icon hidden" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707m0-12.728l.707.707m12.728 12.728l.707.707M12 8a4 4 0 100 8 4 4 0 000-8z" />
              </svg>
            </button>
          </div>

        </div>

        <div style="border-top: 1px solid rgba(255,255,255,0.05); margin: 15px 0 5px 0;"></div>

        <!-- Date Range Slider -->
        <div class="slider-container">
          <div class="slider-labels">
            <span>Date Range Slider:</span>
            <span id="${this.id('slider-range-text')}" style="font-weight: 600; color: var(--accent-secondary);">Loading dates...</span>
          </div>
          <div class="slider-wrapper">
            <div class="slider-track" id="${this.id('slider-track')}"></div>
            <input type="range" class="slider-input" id="${this.id('slider-min')}">
            <input type="range" class="slider-input" id="${this.id('slider-max')}">
          </div>
        </div>

      </div>

      <!-- Dashboard Grid -->
      <div class="dashboard-grid">
        
        <!-- Chart Card -->
        <div class="card">
          <div class="card-header">
            <div class="card-title">Trend Visualization</div>
            <div class="chart-controls">
              
              <!-- X Axis Selector -->
              <div class="d-flex gap-2" style="align-items: center;">
                <span style="font-size: 0.8rem; color: var(--text-muted);">X Axis:</span>
                <select id="${this.id('chart-x-axis')}" class="filter-select" style="padding: 4px 8px; width: 140px; font-size: 0.8rem;">
                  <option value="time">Time Period</option>
                </select>
              </div>

              <!-- Y Axis Selector -->
              <div class="d-flex gap-2" style="align-items: center; position: relative;">
                <span style="font-size: 0.8rem; color: var(--text-muted);">Y Axis:</span>
                <div class="custom-multiselect" id="${this.id('multiselect-y-axis')}" style="width: 155px;">
                  <button class="multiselect-trigger" id="${this.id('trigger-y-axis')}" style="padding: 4px 8px; font-size: 0.8rem; height: 28px;">
                    <span class="trigger-text" id="${this.id('multiselect-text-y-axis')}">Turnover</span>
                    <svg class="chevron-icon" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" style="width: 12px; height: 12px;">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  <div class="multiselect-options hidden" id="${this.id('options-y-axis')}" style="width: 320px; right: 0; left: auto; padding: 4px 0;">
                    
                    <div class="multiselect-option" style="display: flex; justify-content: space-between; align-items: center; gap: 8px;">
                      <label class="d-flex align-items-center gap-2" style="flex-grow: 1; cursor: pointer; user-select: none; margin: 0;">
                        <input type="checkbox" class="chk-y-axis-item" value="turnover" checked>
                        <span class="multiselect-option-label">Turnover (Cr ₹)</span>
                      </label>
                      <div class="y-axis-actions">
                        <button class="action-btn secondary-axis-btn" id="${this.id('btn-sec-turnover')}" title="Move to Secondary Axis">
                          <svg class="action-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <line x1="18" y1="4" x2="18" y2="20"></line>
                            <line x1="18" y1="8" x2="15" y2="8"></line>
                            <line x1="18" y1="12" x2="15" y2="12"></line>
                            <line x1="18" y1="16" x2="15" y2="16"></line>
                            <path d="M4 12h8m-8-4h6m-6 8h4"></path>
                          </svg>
                        </button>
                        <button class="action-btn show-as-line-btn" id="${this.id('btn-line-turnover')}" title="Show as Line">
                          <svg class="action-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M3 3v18h18"></path>
                            <path d="M18.7 8l-5.1 5.2-2.8-2.7L7 14.3"></path>
                          </svg>
                        </button>
                      </div>
                    </div>
                    
                    <div class="multiselect-option" style="display: flex; justify-content: space-between; align-items: center; gap: 8px;">
                      <label class="d-flex align-items-center gap-2" style="flex-grow: 1; cursor: pointer; user-select: none; margin: 0;">
                        <input type="checkbox" class="chk-y-axis-item" value="volume">
                        <span class="multiselect-option-label">Traded Volume</span>
                      </label>
                      <div class="y-axis-actions">
                        <button class="action-btn secondary-axis-btn" id="${this.id('btn-sec-volume')}" title="Move to Secondary Axis">
                          <svg class="action-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <line x1="18" y1="4" x2="18" y2="20"></line>
                            <line x1="18" y1="8" x2="15" y2="8"></line>
                            <line x1="18" y1="12" x2="15" y2="12"></line>
                            <line x1="18" y1="16" x2="15" y2="16"></line>
                            <path d="M4 12h8m-8-4h6m-6 8h4"></path>
                          </svg>
                        </button>
                        <button class="action-btn show-as-line-btn" id="${this.id('btn-line-volume')}" title="Show as Line">
                          <svg class="action-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M3 3v18h18"></path>
                            <path d="M18.7 8l-5.1 5.2-2.8-2.7L7 14.3"></path>
                          </svg>
                        </button>
                      </div>
                    </div>
                    
                    <div class="multiselect-option" style="display: flex; justify-content: space-between; align-items: center; gap: 8px;">
                      <label class="d-flex align-items-center gap-2" style="flex-grow: 1; cursor: pointer; user-select: none; margin: 0;">
                        <input type="checkbox" class="chk-y-axis-item" value="price">
                        <span class="multiselect-option-label">Avg Close Price</span>
                      </label>
                      <div class="y-axis-actions">
                        <button class="action-btn secondary-axis-btn" id="${this.id('btn-sec-price')}" title="Move to Secondary Axis">
                          <svg class="action-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <line x1="18" y1="4" x2="18" y2="20"></line>
                            <line x1="18" y1="8" x2="15" y2="8"></line>
                            <line x1="18" y1="12" x2="15" y2="12"></line>
                            <line x1="18" y1="16" x2="15" y2="16"></line>
                            <path d="M4 12h8m-8-4h6m-6 8h4"></path>
                          </svg>
                        </button>
                        <button class="action-btn show-as-line-btn" id="${this.id('btn-line-price')}" title="Show as Line">
                          <svg class="action-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M3 3v18h18"></path>
                            <path d="M18.7 8l-5.1 5.2-2.8-2.7L7 14.3"></path>
                          </svg>
                        </button>
                      </div>
                    </div>

                  </div>
                </div>
              </div>

              <!-- Show Labels Toggle -->
              <div class="d-flex gap-2" style="align-items: center; margin-left: 8px;">
                <span style="font-size: 0.8rem; color: var(--text-muted);">Labels:</span>
                <label class="d-flex align-items-center gap-1" style="font-size: 0.8rem; color: var(--text-main); cursor: pointer; user-select: none; margin: 0;">
                  <input type="checkbox" id="${this.id('chart-show-labels')}" style="accent-color: var(--accent-primary); cursor: pointer;">
                  Show
                </label>
              </div>

            </div>
          </div>

          <!-- Dynamic Filter Dropdowns -->
          <div class="chart-filters-row" id="${this.id('dynamic-filters-box')}">
            <!-- Dynamic filters added on config load -->
          </div>

          <div style="height: 380px; position: relative; width: 100%;">
            <canvas id="${this.id('analyticsChart')}"></canvas>
          </div>
        </div>

        <!-- Table Card -->
        <div class="card">
          <div class="card-header">
            <div class="card-title" id="${this.id('table-card-title')}">Turnover Aggregations</div>
            <div style="font-size: 0.8rem; color: var(--text-muted);" id="${this.id('table-row-count')}">Showing 0 rows</div>
          </div>
          <div class="table-container">
            <table id="${this.id('main-data-table')}">
              <thead>
                <tr id="${this.id('table-headers')}">
                  <!-- Dynamic Headers -->
                </tr>
              </thead>
              <tbody id="${this.id('table-body')}">
                <!-- Dynamic Content -->
              </tbody>
            </table>
          </div>
        </div>

      </div>

      <!-- Variable Info Tooltip -->
      <div id="${this.id('variable-tooltip')}" class="variable-tooltip hidden"></div>

      <!-- Variable Info Popup Modal -->
      <div id="${this.id('variable-popup-overlay')}" class="variable-popup-overlay hidden">
        <div class="variable-popup-content">
          <button class="popup-close-btn" id="${this.id('btn-close-var-popup')}" aria-label="Close popup">&times;</button>
          <div id="${this.id('popup-body')}"></div>
        </div>
      </div>

      <!-- Dimension Details Popup Modal -->
      <div id="${this.id('details-popup-overlay')}" class="variable-popup-overlay hidden">
        <div class="variable-popup-content" style="max-width: 900px; width: 95%;">
          <button class="popup-close-btn" id="${this.id('btn-close-details-popup')}" aria-label="Close popup">&times;</button>
          <div id="${this.id('details-popup-title')}" class="popup-title">Dimension Details</div>
          <div id="${this.id('details-popup-subtitle')}" style="font-size: 0.85rem; color: var(--text-muted); margin-top: -12px; margin-bottom: 20px;">Active Selection Range</div>
          
          <div class="popup-grid" style="display: flex; flex-direction: column; gap: 24px;">
            
            <!-- Section 1: Peer Group Standings -->
            <div class="popup-section">
              <h4 id="${this.id('details-popup-peer-title')}" style="font-size: 0.9rem; font-weight: 600; color: var(--accent-secondary); margin-bottom: 10px; text-transform: uppercase; letter-spacing: 0.5px;">
                Peer Group Comparison
              </h4>
              <div class="table-container" style="max-height: 180px; overflow-y: auto; border: 1px solid var(--border-line-subtle); border-radius: 8px;">
                <table style="width: 100%;">
                  <thead>
                    <tr>
                      <th style="width: 70px;">Rank</th>
                      <th id="${this.id('details-popup-peer-th')}">Peer Group</th>
                      <th class="number-col">Total Turnover</th>
                      <th class="number-col" style="width: 150px;">Company Count</th>
                    </tr>
                  </thead>
                  <tbody id="${this.id('details-popup-peer-table-body')}">
                    <!-- Peer groups list goes here -->
                  </tbody>
                </table>
              </div>
            </div>

            <!-- Section 2: Companies List inside peer group -->
            <div class="popup-section">
              <h4 id="${this.id('details-popup-company-title')}" style="font-size: 0.9rem; font-weight: 600; color: var(--accent-primary); margin-bottom: 10px; text-transform: uppercase; letter-spacing: 0.5px;">
                Company Standings
              </h4>
              <div class="table-container" style="max-height: 250px; overflow-y: auto; border: 1px solid var(--border-line-subtle); border-radius: 8px;">
                <table style="width: 100%;">
                  <thead>
                    <tr>
                      <th style="width: 70px;">Rank</th>
                      <th>Company Info</th>
                      <th class="number-col">Turnover</th>
                      <th class="number-col">Volume</th>
                      <th class="number-col">Avg Price</th>
                      <th class="number-col" style="width: 140px;">Market Cap</th>
                    </tr>
                  </thead>
                  <tbody id="${this.id('details-popup-table-body')}">
                    <!-- Dynamic rows go here -->
                  </tbody>
                </table>
              </div>
            </div>
            
          </div>
        </div>
      </div>

      <!-- Corporate Filings Popup Modal -->
      <div id="${this.id('filings-popup-overlay')}" class="variable-popup-overlay hidden">
        <div class="variable-popup-content" style="max-width: 750px; width: 92%;">
          <button class="popup-close-btn" id="${this.id('btn-close-filings-popup')}" aria-label="Close popup">&times;</button>
          <div id="${this.id('filings-popup-title')}" class="popup-title">Corporate Filings</div>
          <div id="${this.id('filings-popup-company')}" style="font-size: 0.9rem; color: var(--accent-secondary); margin-top: -12px; margin-bottom: 16px; font-weight: 600;">Company Details</div>
          <div class="filings-scroll-container" id="${this.id('filings-popup-list')}" style="max-height: 420px; overflow-y: auto; padding-right: 8px; display: flex; flex-direction: column;">
            <!-- Dynamic filings list goes here -->
          </div>
        </div>
      </div>
    `;
  }

  cacheElements() {
    const list = [
      'loader-screen', 'loader-spinner', 'loader-main-text', 'loader-sub-text',
      'dropzone', 'btn-trigger-upload', 'file-inputs-raw', 'file-status-board',
      'mode-btn-group', 'agg-btn-group', 'btn-agg-default', 'time-group-btn-group',
      'scale-btn-group', 'btn-download-csv', 'slider-range-text', 'slider-track',
      'slider-min', 'slider-max', 'chart-x-axis', 'multiselect-y-axis', 'trigger-y-axis',
      'multiselect-text-y-axis', 'options-y-axis', 'chart-show-labels', 'dynamic-filters-box',
      'analyticsChart', 'table-card-title', 'table-row-count', 'main-data-table',
      'table-headers', 'table-body', 'variable-tooltip', 'variable-popup-overlay',
      'btn-close-var-popup', 'popup-body', 'details-popup-overlay', 'btn-close-details-popup',
      'details-popup-title', 'details-popup-subtitle', 'details-popup-peer-title',
      'details-popup-peer-th', 'details-popup-peer-table-body', 'details-popup-company-title',
      'details-popup-table-body', 'filings-popup-overlay', 'btn-close-filings-popup',
      'filings-popup-title', 'filings-popup-company', 'filings-popup-list', 'theme-toggle-btn'
    ];

    list.forEach(item => {
      this.els[item] = this.container.querySelector('#' + this.id(item));
    });

    // Special selectors within nested menus
    this.els.btnSecTurnover = this.container.querySelector('#' + this.id('btn-sec-turnover'));
    this.els.btnLineTurnover = this.container.querySelector('#' + this.id('btn-line-turnover'));
    this.els.btnSecVolume = this.container.querySelector('#' + this.id('btn-sec-volume'));
    this.els.btnLineVolume = this.container.querySelector('#' + this.id('btn-line-volume'));
    this.els.btnSecPrice = this.container.querySelector('#' + this.id('btn-sec-price'));
    this.els.btnLinePrice = this.container.querySelector('#' + this.id('btn-line-price'));
  }

  setupEvents() {
    // Mode Buttons
    this.els['mode-btn-group'].addEventListener('click', (e) => {
      const btn = e.target.closest('button');
      if (btn && btn.dataset.mode) {
        this.setMode(btn.dataset.mode);
      }
    });

    // Scale Buttons
    this.els['scale-btn-group'].addEventListener('click', (e) => {
      const btn = e.target.closest('button');
      if (btn && btn.dataset.scale) {
        this.setNumericSystem(btn.dataset.scale);
      }
    });

    // Default aggregation button click
    this.els['btn-agg-default'].addEventListener('click', () => {
      this.setAggDimension('default');
    });

    // Export Button Click
    this.els['btn-download-csv'].addEventListener('click', () => {
      this.downloadCSV();
    });

    // Range Sliders
    this.els['slider-min'].addEventListener('input', () => this.slideMin());
    this.els['slider-max'].addEventListener('input', () => this.slideMax());

    // X Axis Dropdown Change
    this.els['chart-x-axis'].addEventListener('change', () => this.updateChart());

    // Show labels toggle change
    this.els['chart-show-labels'].addEventListener('change', (e) => {
      this.toggleChartLabels(e.target.checked);
    });

    // Close buttons for modals
    this.els['btn-close-var-popup'].addEventListener('click', () => this.closeVarPopup());
    this.els['variable-popup-overlay'].addEventListener('click', (e) => {
      if (e.target === this.els['variable-popup-overlay']) this.closeVarPopup();
    });

    this.els['btn-close-details-popup'].addEventListener('click', () => this.closeDetailsPopup());
    this.els['details-popup-overlay'].addEventListener('click', (e) => {
      if (e.target === this.els['details-popup-overlay']) this.closeDetailsPopup();
    });

    this.els['btn-close-filings-popup'].addEventListener('click', () => this.closeFilingsPopup());
    this.els['filings-popup-overlay'].addEventListener('click', (e) => {
      if (e.target === this.els['filings-popup-overlay']) this.closeFilingsPopup();
    });

    // Dropzone Upload events
    this.els['btn-trigger-upload'].addEventListener('click', () => this.els['file-inputs-raw'].click());
    this.els['file-inputs-raw'].addEventListener('change', (e) => this.handleFileSelection(e));

    this.els['dropzone'].addEventListener('dragover', (e) => {
      e.preventDefault();
      this.els['dropzone'].classList.add('dragover');
    });
    this.els['dropzone'].addEventListener('dragleave', () => {
      this.els['dropzone'].classList.remove('dragover');
    });
    this.els['dropzone'].addEventListener('drop', (e) => {
      e.preventDefault();
      this.els['dropzone'].classList.remove('dragover');
      const files = e.dataTransfer.files;
      if (files && files.length > 0) {
        this.readUploadedFiles(files);
      }
    });

    // Custom Multiselect Y Axis Trigger Click
    this.els['trigger-y-axis'].addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleMultiselectDropdown('y-axis');
    });

    // Y Axis checkboxes and axis styling triggers
    const chkYAxes = this.els['options-y-axis'].querySelectorAll('.chk-y-axis-item');
    chkYAxes.forEach(chk => {
      chk.addEventListener('change', (e) => this.handleYAxisCheckboxChange(e));
    });

    this.els.btnSecTurnover.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleSecondaryAxis('turnover');
    });
    this.els.btnLineTurnover.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleShowAsLine('turnover');
    });

    this.els.btnSecVolume.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleSecondaryAxis('volume');
    });
    this.els.btnLineVolume.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleShowAsLine('volume');
    });

    this.els.btnSecPrice.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleSecondaryAxis('price');
    });
    this.els.btnLinePrice.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleShowAsLine('price');
    });

    // Global document click to close dropdowns
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.custom-multiselect')) {
        this.closeAllMultiselectDropdowns();
      }
    });

    // Handle global theme changes to redraw charts
    window.addEventListener('themechange', () => {
      this.updateChart();
    });

    // Theme Toggle Button
    if (this.els['theme-toggle-btn']) {
      this.els['theme-toggle-btn'].addEventListener('click', () => {
        this.toggleTheme();
      });
    }
  }

  // XML Fetch variables definitions
  fetchVariableDefinitions() {
    fetch(this.options.definitionsFile)
      .then(res => {
        if (!res.ok) throw new Error(`Status ${res.status}`);
        return res.text();
      })
      .then(xmlText => {
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlText, "application/xml");
        
        if (xmlDoc.querySelector('parsererror')) {
          throw new Error('XML parsing error');
        }

        this.state.variableDefinitions = {};
        const variables = xmlDoc.getElementsByTagName('variable');
        for (let i = 0; i < variables.length; i++) {
          const node = variables[i];
          const id = node.getAttribute('id');
          const name = node.getElementsByTagName('name')[0]?.textContent || '';
          const definition = node.getElementsByTagName('definition')[0]?.textContent || '';
          const methodology = node.getElementsByTagName('methodology')[0]?.textContent || '';
          
          this.state.variableDefinitions[id] = {
            name: name.trim(),
            definition: definition.trim(),
            methodology: methodology.trim()
          };
        }
      })
      .catch(err => {
        console.warn('Failed to load variable_and_schema_definition.xml. Using local fallback definitions.', err);
        this.setupFallbackVariableDefinitions();
      });
  }

  setupFallbackVariableDefinitions() {
    this.state.variableDefinitions = {
      turnover: {
        name: "Total Turnover",
        definition: "Total Turnover represents the total monetary value of all shares traded during the specified time period.",
        methodology: "<strong>Methodology:</strong><br/>Turnover is calculated as:<br/><code>Turnover = Sum of (Trade Price * Quantity Traded)</code> for all transactions.<br/><br/><strong>Display formats:</strong><br/>• <em>Indian System:</em> Displayed in Crores (₹ Cr) where 1 Crore = 10,000,000.<br/>• <em>Western System:</em> Displayed in Billions (₹ B) or Millions (₹ M) depending on the scale."
      },
      volume: {
        name: "Traded Volume",
        definition: "Traded Volume represents the total number of shares transacted (bought and sold) during the specified time period.",
        methodology: "<strong>Methodology:</strong><br/>Volume is the cumulative sum of shares traded:<br/><code>Volume = Sum of (Quantity Traded)</code> across all trades.<br/><br/><strong>Display formats:</strong><br/>• <em>Indian System:</em> Displayed in Crores (Cr) or Lakhs (L) depending on the value.<br/>• <em>Western System:</em> Displayed in Billions (B), Millions (M), or Thousands (K)."
      },
      closePrice: {
        name: "Avg Close Price",
        definition: "Average Close Price is the average closing price of the stock(s), weighted by traded volume if aggregated over multiple records.",
        methodology: "<strong>Methodology:</strong><br/>For a single stock on a single day, this is the official closing price (ClsPric).<br/>For aggregated rows (e.g. across multiple companies or dates), this is the Volume-Weighted Average Price:<br/><code>Weighted Price = Sum of (Close Price * Volume) / Sum of (Volume)</code>.<br/><br/><strong>Display formats:</strong><br/>• Displayed as absolute currency in Indian Rupees (₹) rounded to 2 decimal places."
      },
      companyCount: {
        name: "Company Count",
        definition: "The count of unique companies or stock symbols represented within the aggregated group.",
        methodology: "<strong>Methodology:</strong><br/>Calculated by counting the unique occurrences of company tickers/symbols:<br/><code>Count = Size of Set(SYMBOL)</code> within the active filter scope."
      }
    };
  }

  showLoadingText(text) {
    this.els['loader-main-text'].innerText = text;
  }

  autoFetchFiles() {
    this.showLoadingText('Fetching dataset files from directory...');
    
    const REQUIRED_FILES = {
      daily: this.options.dailyFile,
      monthly: this.options.monthlyFile,
      master: this.options.masterFile,
      control: this.options.controlFile,
      tag: this.options.tagFile
    };

    const fetchPromises = Object.entries(REQUIRED_FILES).map(([key, filename]) => {
      return fetch(filename)
        .then(res => {
          if (!res.ok) throw new Error(`Status ${res.status}`);
          return res.text();
        })
        .then(text => {
          this.state.rawFiles[key] = text;
        });
    });

    Promise.all(fetchPromises)
      .then(() => {
        this.showLoadingText('Parsing data files...');
        setTimeout(() => this.processAndInitialize(), 150);
      })
      .catch(err => {
        console.warn('Auto-fetch failed. Activating manual upload fallback.', err);
        this.activateManualUploadFallback();
      });
  }

  activateManualUploadFallback() {
    this.els['loader-spinner'].classList.add('hidden');
    this.els['loader-main-text'].innerText = 'Local File Access Restricted';
    this.els['loader-sub-text'].innerHTML = 
      'Browsers restrict loading local files directly via relative HTTP requests (CORS).<br>Please select or drag-and-drop the files from this folder to load them:';
    this.els['dropzone'].classList.remove('hidden');
    this.updateFileStatusBoard();
  }

  updateFileStatusBoard() {
    this.els['file-status-board'].innerHTML = '';

    const files = {
      'Daily Bhavcopy': this.options.dailyFile,
      'Monthly Bhavcopy': this.options.monthlyFile,
      'Company Master': this.options.masterFile,
      'Control Menu': this.options.controlFile,
      'Tag Menu': this.options.tagFile
    };

    Object.entries(files).forEach(([name, filename]) => {
      const isLoaded = this.state.rawFiles[filename.includes('daily') ? 'daily' : (filename.includes('monthly') ? 'monthly' : (filename.includes('master') ? 'master' : (filename.includes('control') ? 'control' : 'tag')))] !== null;
      const item = document.createElement('div');
      item.className = 'file-status-item';
      item.innerHTML = `
        <span>${filename}</span>
        <span class="${isLoaded ? 'file-status-ok' : 'file-status-missing'}">
          ${isLoaded ? '✓ Loaded' : '✗ Missing'}
        </span>
      `;
      this.els['file-status-board'].appendChild(item);
    });
  }

  handleFileSelection(e) {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    this.readUploadedFiles(files);
  }

  readUploadedFiles(files) {
    let filesToRead = Array.from(files);
    let loadedCount = 0;

    this.showLoadingText('Reading uploaded files...');

    filesToRead.forEach(file => {
      const name = file.name.toLowerCase();
      let targetKey = null;

      if (name.includes('bhavcopy_daily') || name.includes('daily')) targetKey = 'daily';
      else if (name.includes('bhavcopy_monthly') || name.includes('monthly')) targetKey = 'monthly';
      else if (name.includes('company_master') || name.includes('master')) targetKey = 'master';
      else if (name.includes('control_menu') || name.includes('control')) targetKey = 'control';
      else if (name.includes('tag_menu') || name.includes('tag')) targetKey = 'tag';

      if (targetKey) {
        const reader = new FileReader();
        reader.onload = (evt) => {
          this.state.rawFiles[targetKey] = evt.target.result;
          loadedCount++;
          this.updateFileStatusBoard();

          if (this.hasAllFiles()) {
            this.els['dropzone'].classList.add('hidden');
            this.els['loader-spinner'].classList.remove('hidden');
            this.showLoadingText('All files loaded. Parsing data...');
            setTimeout(() => this.processAndInitialize(), 200);
          }
        };
        reader.readAsText(file);
      }
    });
  }

  hasAllFiles() {
    return Object.values(this.state.rawFiles).every(content => content !== null);
  }

  processAndInitialize() {
    try {
      // Parse CSVs using PapaParse
      Object.entries(this.state.rawFiles).forEach(([key, rawText]) => {
        const parsed = Papa.parse(rawText, {
          header: true,
          skipEmptyLines: true
        });
        this.state.parsedData[key] = parsed.data;
      });

      this.cleanHeadersAndValues();

      // Prefix check: Keep only items where File_Name starts with current prefix (e.g. 'turnover_')
      this.state.parsedData.control = this.state.parsedData.control.filter(row => {
        const fn = (row.File_Name || '').toLowerCase().trim();
        return fn && this.prefix.includes(fn);
      });

      this.state.parsedData.tag = this.state.parsedData.tag.filter(row => {
        const fn = (row.File_Name || '').toLowerCase().trim();
        return fn && this.prefix.includes(fn);
      });

      this.buildMasterLookup();

      // Map Bhavcopy records to Master metadata
      this.mapBhavcopyToMaster(this.state.parsedData.daily);
      this.mapBhavcopyToMaster(this.state.parsedData.monthly);

      // Create filter containers dynamically
      this.initializeFiltersAndControls();

      // Hide Loader Screen
      this.els['loader-screen'].classList.add('hidden');

      // Start Dashboard view
      this.setMode('daily');

    } catch (err) {
      console.error('Initial parsing/processing failed', err);
      this.showLoadingText('Fatal Error: Failed to parse files correctly.');
      this.els['loader-spinner'].classList.add('hidden');
      this.els['loader-sub-text'].innerHTML = `<span style="color:var(--danger)">Error: ${err.message}. Please refresh and check your files.</span>`;
    }
  }

  cleanHeadersAndValues() {
    const cleanKeys = (obj) => {
      const newObj = {};
      Object.entries(obj).forEach(([k, v]) => {
        newObj[k.trim()] = (v || '').trim();
      });
      return newObj;
    };

    this.state.parsedData.master = this.state.parsedData.master.map(cleanKeys);
    this.state.parsedData.daily = this.state.parsedData.daily.map(cleanKeys);
    this.state.parsedData.monthly = this.state.parsedData.monthly.map(cleanKeys);
    this.state.parsedData.control = this.state.parsedData.control.map(cleanKeys);
    this.state.parsedData.tag = this.state.parsedData.tag.map(cleanKeys);
  }

  buildMasterLookup() {
    this.state.masterLookup = {};
    
    this.state.parsedData.master.forEach(row => {
      const isin = row.ISIN;
      const nse = row.NSE_symb || row.NSE_Symbol;
      const bse = row.BSE_symb || row.BSE_Symbol;
      
      const info = Object.assign({
        companyName: row['Company name'] || row['Company Name'] || 'Unknown Company',
        isin: isin,
        nseSymb: nse,
        bseSymb: bse
      }, row);

      // Add fallbacks for generic columns if missing in CSV
      if (!info.Category) info.Category = 'Others';
      if (!info.Industry_Classification) info.Industry_Classification = 'Others';
      if (!info.Issuer_Type) info.Issuer_Type = 'Others';
      if (!info.Corporate_Office_City) info.Corporate_Office_City = 'Others';
      if (!info.Zone) info.Zone = 'Others';

      // Index mappings
      if (isin && isin !== 'NA' && isin !== 'nan') this.state.masterLookup[isin.toUpperCase()] = info;
      if (nse && nse !== 'NA' && nse !== 'nan') this.state.masterLookup[nse.toUpperCase()] = info;
      if (bse && bse !== 'NA' && bse !== 'nan') this.state.masterLookup[bse.toUpperCase()] = info;
    });

    // Default unclassified company
    this.state.masterLookup['OTHERS'] = {
      companyName: 'Others / Unclassified',
      isin: 'Others',
      nseSymb: 'Others',
      bseSymb: 'Others',
      Category: 'Small Cap',
      Industry_Classification: 'Others',
      Issuer_Type: 'Others',
      Corporate_Office_City: 'Others',
      Zone: 'Others'
    };
  }

  mapBhavcopyToMaster(dataset) {
    dataset.forEach(row => {
      const isin = (row.ISIN || '').trim().toUpperCase();
      const symbol = (row.SYMBOL || '').trim().toUpperCase();

      let match = null;
      if (isin && this.state.masterLookup[isin]) match = this.state.masterLookup[isin];
      else if (symbol && this.state.masterLookup[symbol]) match = this.state.masterLookup[symbol];
      else if (symbol && this.state.masterLookup[symbol]) match = this.state.masterLookup[symbol];
      else if (isin && this.state.masterLookup[isin]) match = this.state.masterLookup[isin];

      if (!match) {
        if (symbol.includes('OTHERS') || isin.includes('OTHERS')) {
          match = this.state.masterLookup['OTHERS'];
        } else {
          match = {
            companyName: row.SYMBOL || 'Unknown Company',
            isin: row.ISIN || 'NA',
            nseSymb: row.SYMBOL || 'NA',
            bseSymb: 'NA',
            Category: 'Small Cap',
            Industry_Classification: 'Others',
            Issuer_Type: 'Others',
            Corporate_Office_City: 'Others',
            Zone: 'Others'
          };
        }
      }

      // Dynamic copying of metadata columns
      Object.assign(row, match);
      row.companyName = match.companyName; // ensure companyName is always set correctly

      // Parse volume, turnover, close price
      row.turnover = parseFloat(row.TtlTrfVal) || 0;
      row.volume = parseFloat(row.TtlTradgVol) || 0;
      row.closePrice = parseFloat(row.ClsPric) || 0;
      
      const parts = row.TradDt.split('-');
      if (parts.length === 3) {
        row.parsedDateObj = new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
        row.timestamp = row.parsedDateObj.getTime();
      } else {
        row.timestamp = 0;
      }
    });
  }

  initializeFiltersAndControls() {
    const filtersBox = this.els['dynamic-filters-box'];
    filtersBox.innerHTML = '';

    const aggBtnGroup = this.els['agg-btn-group'];
    const defaultBtn = this.els['btn-agg-default'];
    aggBtnGroup.innerHTML = '';
    aggBtnGroup.appendChild(defaultBtn);

    const chartXSelect = this.els['chart-x-axis'];
    chartXSelect.innerHTML = '<option value="time">Time Period</option>';

    this.state.parsedData.control.forEach(ctrl => {
      const fieldName = ctrl.Menu_List; // Column name, e.g. "Category"
      const label = ctrl.Labels;         // Visual label, e.g. "Category"

      // Create filter element
      const filterWrapper = document.createElement('div');
      filterWrapper.className = 'control-section';
      filterWrapper.innerHTML = `
        <div class="control-label">Filter ${label}</div>
        <div class="custom-multiselect" id="${this.id('multiselect-' + fieldName)}">
          <button class="multiselect-trigger" id="${this.id('trigger-' + fieldName)}">
            <span class="trigger-text" id="${this.id('multiselect-text-' + fieldName)}">All ${label}s</span>
            <svg class="chevron-icon" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          <div class="multiselect-options hidden" id="${this.id('options-' + fieldName)}">
            <!-- Checkboxes go here -->
          </div>
        </div>
      `;
      filtersBox.appendChild(filterWrapper);
      
      this.state.dynamicFilters[fieldName] = ['All'];

      // Attach trigger handler
      const trigger = filterWrapper.querySelector('#' + this.id('trigger-' + fieldName));
      trigger.addEventListener('click', (e) => {
        e.stopPropagation();
        this.toggleMultiselectDropdown(fieldName);
      });

      // Aggregation Button
      const btn = document.createElement('button');
      btn.className = 'btn-group-btn';
      btn.innerText = label;
      btn.id = this.id(`btn-agg-${fieldName}`);
      btn.addEventListener('click', () => this.setAggDimension(fieldName));
      aggBtnGroup.appendChild(btn);

      // X Axis options
      const option = document.createElement('option');
      option.value = fieldName;
      option.innerText = label;
      chartXSelect.appendChild(option);
    });

    this.populateFilterOptions();
  }

  populateFilterOptions() {
    const uniqueValues = {};
    
    // Initialize empty sets
    this.state.parsedData.control.forEach(ctrl => {
      uniqueValues[ctrl.Menu_List] = new Set();
    });

    // Extract unique values
    this.state.parsedData.master.forEach(row => {
      Object.keys(uniqueValues).forEach(field => {
        if (row[field]) uniqueValues[field].add(row[field].trim());
      });
    });

    // Populate DOM dropdown checkboxes
    Object.entries(uniqueValues).forEach(([field, set]) => {
      const optionsBox = this.els['dynamic-filters-box'].querySelector('#' + this.id('options-' + field));
      if (!optionsBox) return;

      optionsBox.innerHTML = '';

      // "Select All" Option
      const selectAllDiv = document.createElement('div');
      selectAllDiv.className = 'multiselect-option';
      selectAllDiv.innerHTML = `
        <input type="checkbox" id="${this.id('chk-' + field + '-all')}" checked>
        <span class="multiselect-option-label" style="font-weight: 600;">Select All</span>
      `;
      optionsBox.appendChild(selectAllDiv);

      const allChk = selectAllDiv.querySelector('input');
      allChk.addEventListener('change', (e) => {
        this.handleSelectAllChange(field, e.target.checked);
      });

      // Sort and render items
      const sortedVals = Array.from(set).sort();
      sortedVals.forEach(val => {
        if (val && val !== 'NA') {
          const optionDiv = document.createElement('div');
          optionDiv.className = 'multiselect-option';
          optionDiv.innerHTML = `
            <input type="checkbox" class="chk-${field}-item" data-value="${val}" checked>
            <span class="multiselect-option-label">${val}</span>
          `;
          
          const chk = optionDiv.querySelector('input');
          chk.addEventListener('change', () => this.handleOptionCheckboxChange(field));

          optionDiv.addEventListener('click', (e) => {
            if (e.target.tagName !== 'INPUT') {
              chk.checked = !chk.checked;
              chk.dispatchEvent(new Event('change'));
            }
          });

          optionsBox.appendChild(optionDiv);
        }
      });

      this.updateMultiselectTriggerText(field);
    });
  }

  // Multiselect dropdown managers
  toggleMultiselectDropdown(field) {
    const container = this.container.querySelector('#' + this.id(field === 'y-axis' ? 'multiselect-y-axis' : 'multiselect-' + field));
    const options = this.container.querySelector('#' + this.id(field === 'y-axis' ? 'options-y-axis' : 'options-' + field));
    
    if (!container || !options) return;

    const isHidden = options.classList.contains('hidden');
    this.closeAllMultiselectDropdowns();

    if (isHidden) {
      container.classList.add('open');
      options.classList.remove('hidden');
    }
  }

  closeAllMultiselectDropdowns() {
    this.container.querySelectorAll('.custom-multiselect').forEach(dd => {
      dd.classList.remove('open');
    });
    this.container.querySelectorAll('.multiselect-options').forEach(box => {
      box.classList.add('hidden');
    });
  }

  handleSelectAllChange(field, checked) {
    const itemCheckboxes = this.container.querySelectorAll(`.chk-${field}-item`);
    itemCheckboxes.forEach(chk => {
      chk.checked = checked;
    });
    this.applyFiltersAndRefresh();
  }

  handleOptionCheckboxChange(field) {
    this.applyFiltersAndRefresh();
  }

  handleYAxisCheckboxChange(event) {
    const checkedBoxes = this.els['options-y-axis'].querySelectorAll('.chk-y-axis-item:checked');
    if (checkedBoxes.length === 0) {
      if (event && event.target) {
        event.target.checked = true;
      }
      return;
    }
    this.state.selectedYAxes = Array.from(checkedBoxes).map(chk => chk.value);
    this.updateMultiselectTriggerText('y-axis');
    this.updateChart();
  }

  toggleSecondaryAxis(field) {
    const idx = this.state.secondaryYAxes.indexOf(field);
    const btn = this.els[`btnSec${field.charAt(0).toUpperCase() + field.slice(1)}`];
    if (idx > -1) {
      this.state.secondaryYAxes.splice(idx, 1);
      if (btn) btn.classList.remove('active');
    } else {
      this.state.secondaryYAxes.push(field);
      if (btn) btn.classList.add('active');
    }
    this.updateChart();
  }

  toggleShowAsLine(field) {
    const idx = this.state.lineYAxes.indexOf(field);
    const btn = this.els[`btnLine${field.charAt(0).toUpperCase() + field.slice(1)}`];
    if (idx > -1) {
      this.state.lineYAxes.splice(idx, 1);
      if (btn) btn.classList.remove('active');
    } else {
      this.state.lineYAxes.push(field);
      if (btn) btn.classList.add('active');
    }
    this.updateChart();
  }

  toggleChartLabels(checked) {
    this.state.showChartLabels = checked;
    this.updateChart();
  }

  updateMultiselectTriggerText(field) {
    if (field === 'y-axis') {
      const checkedItems = Array.from(this.els['options-y-axis'].querySelectorAll('.chk-y-axis-item:checked'));
      const triggerTextSpan = this.els['multiselect-text-y-axis'];
      if (!triggerTextSpan) return;
      if (checkedItems.length === 0) {
        triggerTextSpan.innerText = 'Select Y Axis';
      } else {
        const names = checkedItems.map(chk => {
          if (chk.value === 'turnover') return 'Turnover';
          if (chk.value === 'volume') return 'Volume';
          return 'Price';
        });
        triggerTextSpan.innerText = names.join(', ');
      }
      return;
    }

    const allCheckbox = this.container.querySelector('#' + this.id('chk-' + field + '-all'));
    const itemCheckboxes = this.container.querySelectorAll(`.chk-${field}-item`);
    const triggerTextSpan = this.container.querySelector('#' + this.id('multiselect-text-' + field));
    if (!triggerTextSpan) return;

    const total = itemCheckboxes.length;
    if (total === 0) {
      triggerTextSpan.innerText = `All ${field}s`;
      return;
    }

    const checkedItems = Array.from(itemCheckboxes).filter(chk => chk.checked);
    const checkedCount = checkedItems.length;

    let fieldLabel = field;
    this.state.parsedData.control.forEach(ctrl => {
      if (ctrl.Menu_List === field) fieldLabel = ctrl.Labels;
    });

    if (checkedCount === total) {
      triggerTextSpan.innerText = `All ${fieldLabel}s`;
      if (allCheckbox) allCheckbox.checked = true;
    } else if (checkedCount === 0) {
      triggerTextSpan.innerText = `None Selected`;
      if (allCheckbox) allCheckbox.checked = false;
    } else if (checkedCount === 1) {
      triggerTextSpan.innerText = checkedItems[0].dataset.value;
      if (allCheckbox) allCheckbox.checked = false;
    } else if (checkedCount <= 2) {
      triggerTextSpan.innerText = checkedItems.map(chk => chk.dataset.value).join(', ');
      if (allCheckbox) allCheckbox.checked = false;
    } else {
      triggerTextSpan.innerText = `${checkedCount} Selected`;
      if (allCheckbox) allCheckbox.checked = false;
    }
  }

  setMode(mode) {
    this.state.currentMode = mode;
    
    // Toggle active classes on Mode buttons
    const modeGroup = this.els['mode-btn-group'];
    Array.from(modeGroup.children).forEach(btn => {
      btn.classList.toggle('active', btn.dataset.mode === mode);
    });

    this.setupTimeGroupingButtons();
    this.setupDateRangeSlider();

    this.state.expandedRows.clear();
    this.state.expandedSubRows.clear();

    this.applyFiltersAndRefresh();
  }

  setAggDimension(dimension) {
    this.state.currentAggDimension = dimension;

    // Toggle aggregation buttons
    const aggGroup = this.els['agg-btn-group'];
    Array.from(aggGroup.children).forEach(btn => {
      let isMatch = false;
      if (dimension === 'default' && btn.id === this.id('btn-agg-default')) isMatch = true;
      else if (btn.id === this.id(`btn-agg-${dimension}`)) isMatch = true;
      btn.classList.toggle('active', isMatch);
    });

    this.state.expandedRows.clear();
    this.state.expandedSubRows.clear();

    this.applyFiltersAndRefresh();
  }

  setTimeGrouping(group) {
    this.state.currentTimeGrouping = group;

    const timeGroup = this.els['time-group-btn-group'];
    Array.from(timeGroup.children).forEach(btn => {
      btn.classList.toggle('active', btn.dataset.group === group);
    });

    this.applyFiltersAndRefresh();
  }

  setNumericSystem(system) {
    this.state.numericSystem = system;

    const scaleGroup = this.els['scale-btn-group'];
    Array.from(scaleGroup.children).forEach(btn => {
      btn.classList.toggle('active', btn.dataset.scale === system);
    });

    this.applyFiltersAndRefresh();
  }

  setupTimeGroupingButtons() {
    const container = this.els['time-group-btn-group'];
    container.innerHTML = '';

    let options = [];
    if (this.state.currentMode === 'daily') {
      options = [
        { value: 'default', label: 'Daily' },
        { value: 'weekly', label: 'Weekly' },
        { value: 'semimonthly', label: 'Semi-Monthly' },
        { value: 'monthly', label: 'Monthly' },
        { value: 'quarterly', label: 'Quarterly' }
      ];
    } else {
      options = [
        { value: 'default', label: 'Monthly' },
        { value: 'quarterly', label: 'Quarterly' },
        { value: 'halfyearly', label: 'Half-Yearly' },
        { value: 'fy', label: 'Financial Year' },
        { value: 'cy', label: 'Calendar Year' }
      ];
    }
    this.state.currentTimeGrouping = 'default';

    options.forEach(opt => {
      const btn = document.createElement('button');
      btn.className = `btn-group-btn ${opt.value === this.state.currentTimeGrouping ? 'active' : ''}`;
      btn.innerText = opt.label;
      btn.dataset.group = opt.value;
      btn.addEventListener('click', () => this.setTimeGrouping(opt.value));
      container.appendChild(btn);
    });
  }

  setupDateRangeSlider() {
    const dataset = this.state.currentMode === 'daily' ? this.state.parsedData.daily : this.state.parsedData.monthly;
    const tsSet = new Set();
    dataset.forEach(row => {
      if (row.timestamp) tsSet.add(row.timestamp);
    });

    this.state.dateList = Array.from(tsSet).sort((a, b) => a - b);
    
    if (this.state.dateList.length === 0) return;

    const sliderMin = this.els['slider-min'];
    const sliderMax = this.els['slider-max'];

    sliderMin.min = 0;
    sliderMin.max = this.state.dateList.length - 1;
    sliderMax.min = 0;
    sliderMax.max = this.state.dateList.length - 1;

    sliderMin.value = 0;
    sliderMax.value = this.state.dateList.length - 1;
    
    this.state.activeRange.minIdx = 0;
    this.state.activeRange.maxIdx = this.state.dateList.length - 1;

    this.updateSliderVisuals();
  }

  updateSliderVisuals() {
    if (this.state.dateList.length === 0) return;

    const minIdx = parseInt(this.els['slider-min'].value);
    const maxIdx = parseInt(this.els['slider-max'].value);

    const minDate = new Date(this.state.dateList[minIdx]);
    const maxDate = new Date(this.state.dateList[maxIdx]);

    const fmt = (d) => {
      const dd = String(d.getDate()).padStart(2, '0');
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      return `${dd}-${mm}-${d.getFullYear()}`;
    };

    this.els['slider-range-text'].innerText = `${fmt(minDate)} to ${fmt(maxDate)}`;

    const track = this.els['slider-track'];
    const totalSteps = this.state.dateList.length - 1;
    const leftPercent = (minIdx / totalSteps) * 100;
    const rightPercent = (maxIdx / totalSteps) * 100;

    track.style.left = `${leftPercent}%`;
    track.style.width = `${rightPercent - leftPercent}%`;
  }

  slideMin() {
    const minInput = this.els['slider-min'];
    const maxInput = this.els['slider-max'];
    let val1 = parseInt(minInput.value);
    let val2 = parseInt(maxInput.value);

    if (val1 >= val2) {
      minInput.value = val2 - 1;
      val1 = val2 - 1;
    }

    this.state.activeRange.minIdx = val1;
    this.updateSliderVisuals();
    this.applyFiltersAndRefresh();
  }

  slideMax() {
    const minInput = this.els['slider-min'];
    const maxInput = this.els['slider-max'];
    let val1 = parseInt(minInput.value);
    let val2 = parseInt(maxInput.value);

    if (val2 <= val1) {
      maxInput.value = val1 + 1;
      val2 = val1 + 1;
    }

    this.state.activeRange.maxIdx = val2;
    this.updateSliderVisuals();
    this.applyFiltersAndRefresh();
  }

  applyFiltersAndRefresh() {
    // Read select choices dynamically
    Object.keys(this.state.dynamicFilters).forEach(field => {
      const itemCheckboxes = this.container.querySelectorAll(`.chk-${field}-item`);
      if (itemCheckboxes.length > 0) {
        const checkedItems = Array.from(itemCheckboxes).filter(chk => chk.checked);
        const total = itemCheckboxes.length;
        if (checkedItems.length === total) {
          this.state.dynamicFilters[field] = ['All'];
        } else {
          this.state.dynamicFilters[field] = checkedItems.map(chk => chk.dataset.value);
        }
      } else {
        this.state.dynamicFilters[field] = ['All'];
      }
      this.updateMultiselectTriggerText(field);
    });

    this.renderAggregationTable();
    this.updateChart();
  }

  getPeriodKey(dateObj) {
    if (!dateObj) return 'N/A';
    
    const year = dateObj.getFullYear();
    const month = dateObj.getMonth();
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

    const formatMonday = (d) => {
      const day = d.getDay();
      const diff = d.getDate() - day + (day === 0 ? -6 : 1);
      const mon = new Date(d);
      mon.setDate(diff);
      const dd = String(mon.getDate()).padStart(2, '0');
      const mm = String(mon.getMonth() + 1).padStart(2, '0');
      return `W/C ${dd}-${mm}-${mon.getFullYear()}`;
    };

    if (this.state.currentMode === 'daily') {
      switch(this.state.currentTimeGrouping) {
        case 'weekly': return formatMonday(dateObj);
        case 'semimonthly':
          return `${monthNames[month]} ${year} (${dateObj.getDate() <= 15 ? '1-15' : '16+'})`;
        case 'monthly': return `${monthNames[month]} ${year}`;
        case 'quarterly': return `${year} Q${Math.floor(month / 3) + 1}`;
        default:
          const dd = String(dateObj.getDate()).padStart(2, '0');
          const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
          return `${dd}-${mm}-${year}`;
      }
    } else {
      switch(this.state.currentTimeGrouping) {
        case 'quarterly': return `${year} Q${Math.floor(month / 3) + 1}`;
        case 'halfyearly': return `${year} ${month < 6 ? 'H1' : 'H2'}`;
        case 'fy': return month >= 3 ? `FY ${year}-${String(year + 1).slice(-2)}` : `FY ${year - 1}-${String(year).slice(-2)}`;
        case 'cy': return `CY ${year}`;
        default: return `${monthNames[month]} ${year}`;
      }
    }
  }

  formatTurnover(val) {
    if (this.state.numericSystem === 'indian') {
      return `₹${(val / 10000000).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Cr`;
    } else {
      if (val >= 1000000000) {
        return `₹${(val / 1000000000).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} B`;
      }
      return `₹${(val / 1000000).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} M`;
    }
  }

  formatVolume(val) {
    if (this.state.numericSystem === 'indian') {
      if (val >= 10000000) {
        return `${(val / 10000000).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Cr`;
      } else if (val >= 100000) {
        return `${(val / 100000).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} L`;
      }
      return val.toLocaleString('en-IN', { maximumFractionDigits: 0 });
    } else {
      if (val >= 1000000000) {
        return `${(val / 1000000000).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} B`;
      } else if (val >= 1000000) {
        return `${(val / 1000000).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} M`;
      } else if (val >= 1000) {
        return `${(val / 1000).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} K`;
      }
      return val.toLocaleString('en-US', { maximumFractionDigits: 0 });
    }
  }

  formatPrice(val) {
    return `₹${val.toLocaleString(this.state.numericSystem === 'indian' ? 'en-IN' : 'en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  getFilteredRows() {
    const dataset = this.state.currentMode === 'daily' ? this.state.parsedData.daily : this.state.parsedData.monthly;
    if (!dataset) return [];

    const minTS = this.state.dateList[this.state.activeRange.minIdx] || 0;
    const maxTS = this.state.dateList[this.state.activeRange.maxIdx] || 0;
    
    return dataset.filter(row => {
      if (!row.timestamp || row.timestamp < minTS || row.timestamp > maxTS) return false;

      // Generic filters loop
      let matched = true;
      Object.entries(this.state.dynamicFilters).forEach(([field, selectedValues]) => {
        if (!matched) return;
        if (!selectedValues.includes('All')) {
          const val = row[field] || 'Others';
          if (!selectedValues.includes(val)) {
            matched = false;
          }
        }
      });

      return matched;
    });
  }

  getVarHeaderHtml(label, varId) {
    // Tooltip inline handles
    return `
      <span class="var-header-container" data-var-id="${varId}">
        ${label}
        <button class="info-btn" type="button" aria-label="More info about ${label}">
          <svg class="info-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/>
          </svg>
        </button>
      </span>
    `;
  }

  attachHeaderListeners(container) {
    container.querySelectorAll('.var-header-container').forEach(el => {
      const varId = el.dataset.varId;
      const infoBtn = el.querySelector('.info-btn');
      
      el.addEventListener('mouseenter', (e) => this.showVarTooltip(e, varId));
      el.addEventListener('mouseleave', () => this.hideVarTooltip());
      
      if (infoBtn) {
        infoBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.showVarPopup(varId);
        });
      }
    });
  }

  showVarTooltip(event, varId) {
    const tooltip = this.els['variable-tooltip'];
    const varData = this.state.variableDefinitions && this.state.variableDefinitions[varId];
    if (!tooltip || !varData) return;

    tooltip.innerHTML = `
      <h4>${varData.name}</h4>
      <div class="desc">${varData.definition}</div>
      <div class="methodology">${varData.methodology}</div>
    `;

    tooltip.classList.remove('hidden');
    void tooltip.offsetWidth; 
    tooltip.classList.add('visible');

    const rect = event.currentTarget.getBoundingClientRect();
    const tooltipHeight = tooltip.offsetHeight;
    const tooltipWidth = tooltip.offsetWidth;
    
    let top = rect.top - tooltipHeight - 10;
    let left = rect.left + (rect.width - tooltipWidth) / 2;

    if (top < 10) top = rect.bottom + 10;
    if (left < 10) left = 10;
    else if (left + tooltipWidth > window.innerWidth - 10) {
      left = window.innerWidth - tooltipWidth - 10;
    }

    tooltip.style.top = `${top}px`;
    tooltip.style.left = `${left}px`;
  }

  hideVarTooltip() {
    const tooltip = this.els['variable-tooltip'];
    if (tooltip) {
      tooltip.classList.remove('visible');
      tooltip.classList.add('hidden');
    }
  }

  showVarPopup(varId) {
    this.hideVarTooltip();
    const overlay = this.els['variable-popup-overlay'];
    const body = this.els['popup-body'];
    const varData = this.state.variableDefinitions && this.state.variableDefinitions[varId];

    if (!overlay || !body || !varData) return;

    body.innerHTML = `
      <h3 class="popup-title">${varData.name}</h3>
      <p class="popup-desc">${varData.definition}</p>
      <div class="popup-methodology-container">
        ${varData.methodology}
      </div>
    `;

    overlay.classList.remove('hidden');
    void overlay.offsetWidth;
    overlay.classList.add('visible');
  }

  closeVarPopup() {
    const overlay = this.els['variable-popup-overlay'];
    if (!overlay) return;
    overlay.classList.remove('visible');
    setTimeout(() => overlay.classList.add('hidden'), 300);
  }

  showDimensionDetails(dataField, value, label, activeCompanySymbol) {
    const overlay = this.els['details-popup-overlay'];
    this.els['details-popup-title'].innerText = `Standings for ${label}: ${value}`;
    
    const minIdx = this.state.activeRange.minIdx;
    const maxIdx = this.state.activeRange.maxIdx;
    const fmt = (d) => {
      return `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;
    };
    const minDateText = this.state.dateList[minIdx] ? fmt(new Date(this.state.dateList[minIdx])) : 'Start';
    const maxDateText = this.state.dateList[maxIdx] ? fmt(new Date(this.state.dateList[maxIdx])) : 'End';
    this.els['details-popup-subtitle'].innerText = `Active Selection: ${minDateText} to ${maxDateText}`;
    
    const filtered = this.getFilteredRows();
    
    // Peer standings
    const peerGroups = {};
    filtered.forEach(row => {
      const peerValue = row[dataField] || 'Others';
      if (!peerGroups[peerValue]) {
        peerGroups[peerValue] = { name: peerValue, turnover: 0, symbols: new Set() };
      }
      peerGroups[peerValue].turnover += row.turnover;
      peerGroups[peerValue].symbols.add(row.SYMBOL);
    });
    
    const sortedPeers = Object.values(peerGroups).sort((a, b) => b.turnover - a.turnover);
    this.els['details-popup-peer-th'].innerText = `${label} Group`;
    this.els['details-popup-peer-title'].innerText = `Peer Group Standings (${label})`;
    
    const peerTbody = this.els['details-popup-peer-table-body'];
    peerTbody.innerHTML = '';
    sortedPeers.forEach((pg, index) => {
      const rank = index + 1;
      const isCurrent = (pg.name.toLowerCase() === value.toLowerCase());
      const tr = document.createElement('tr');
      if (isCurrent) {
        tr.style.cssText = 'background: rgba(99, 102, 241, 0.15); font-weight: 600; border-left: 3px solid var(--accent-primary);';
      }
      tr.innerHTML = `
        <td style="font-weight: 600;">#${rank}</td>
        <td>${pg.name} ${isCurrent ? ' <span class="badge badge-neutral" style="margin-left: 8px; font-size: 0.65rem; padding: 2px 6px;">Active</span>' : ''}</td>
        <td class="number-col font-medium text-main">${this.formatTurnover(pg.turnover)}</td>
        <td class="number-col">${pg.symbols.size} Companies</td>
      `;
      peerTbody.appendChild(tr);
    });

    // Companies inside this peer group
    const matchingRows = filtered.filter(row => (row[dataField] || 'Others').toLowerCase() === value.toLowerCase());
    const compGroups = {};
    matchingRows.forEach(row => {
      const symbol = row.SYMBOL;
      if (!compGroups[symbol]) {
        compGroups[symbol] = {
          symbol: symbol,
          name: row.companyName,
          isin: row.ISIN,
          turnover: 0,
          volume: 0,
          weightedPriceSum: 0,
          category: row.Category || 'Others',
          rawRows: []
        };
      }
      compGroups[symbol].turnover += row.turnover;
      compGroups[symbol].volume += row.volume;
      compGroups[symbol].weightedPriceSum += (row.closePrice * row.volume);
      compGroups[symbol].rawRows.push(row);
    });
    
    const sortedComps = Object.values(compGroups).sort((a, b) => b.turnover - a.turnover);
    this.els['details-popup-company-title'].innerText = `Company Standings inside "${value}"`;
    
    const tbody = this.els['details-popup-table-body'];
    tbody.innerHTML = '';
    
    if (sortedComps.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" class="text-center" style="padding: 20px; color: var(--text-muted);">No records in active scope.</td></tr>`;
    } else {
      sortedComps.forEach((comp, index) => {
        const rank = index + 1;
        const isCurrentCompany = (comp.symbol.toUpperCase() === (activeCompanySymbol || '').toUpperCase());
        
        let capBadge = '';
        if (comp.category.toLowerCase().includes('large')) capBadge = `<span class="badge badge-largecap">Large Cap</span>`;
        else if (comp.category.toLowerCase().includes('mid')) capBadge = `<span class="badge badge-midcap">Mid Cap</span>`;
        else if (comp.category.toLowerCase().includes('small')) capBadge = `<span class="badge badge-smallcap">Small Cap</span>`;
        else capBadge = `<span class="badge badge-neutral">${comp.category}</span>`;

        const avgPrice = comp.volume > 0 ? (comp.weightedPriceSum / comp.volume) : comp.closePrice;
        
        const tr = document.createElement('tr');
        if (isCurrentCompany) {
          tr.style.cssText = 'background: rgba(6, 182, 212, 0.15); font-weight: 600; border-left: 3px solid var(--accent-secondary);';
        }
        
        tr.innerHTML = `
          <td style="font-weight: 600;">#${rank}</td>
          <td>
            <div style="font-weight:600; color: var(--text-main);">${comp.name} ${isCurrentCompany ? ' <span class="badge badge-neutral" style="margin-left: 8px; font-size: 0.65rem; padding: 2px 6px;">Selected</span>' : ''}</div>
            <div style="font-size:0.75rem; color:var(--text-muted);">${comp.symbol} | ISIN: ${comp.isin}</div>
          </td>
          <td class="number-col font-medium text-main">${this.formatTurnover(comp.turnover)}</td>
          <td class="number-col">${this.formatVolume(comp.volume)}</td>
          <td class="number-col">${this.formatPrice(avgPrice)}</td>
          <td class="number-col">${capBadge}</td>
        `;
        tbody.appendChild(tr);
      });
    }
    
    overlay.classList.remove('hidden');
    void overlay.offsetWidth;
    overlay.classList.add('visible');
  }

  closeDetailsPopup() {
    const overlay = this.els['details-popup-overlay'];
    if (!overlay) return;
    overlay.classList.remove('visible');
    setTimeout(() => overlay.classList.add('hidden'), 300);
  }

  showCorporateFilings(symbol, name) {
    const overlay = this.els['filings-popup-overlay'];
    this.els['filings-popup-company'].innerText = `${name} (${symbol})`;
    this.els['filings-popup-list'].innerHTML = '<div style="padding: 20px; color: var(--text-muted); text-align: center;">Loading filings...</div>';
    
    overlay.classList.remove('hidden');
    void overlay.offsetWidth;
    overlay.classList.add('visible');
    
    const renderFilings = (filings) => {
      const container = this.els['filings-popup-list'];
      container.innerHTML = '';
      if (!filings || filings.length === 0) {
        container.innerHTML = '<div style="padding: 20px; color: var(--text-muted); text-align: center;">No filings found for this company.</div>';
        return;
      }
      
      filings.forEach(f => {
        const item = document.createElement('div');
        item.className = 'filing-item';
        item.style.cssText = 'display: flex; justify-content: space-between; align-items: center; padding: 16px 0; border-bottom: 1px solid var(--border-line-subtle); gap: 16px;';
        item.innerHTML = `
          <div class="filing-details" style="flex: 1;">
            <div class="filing-title" style="font-weight: 600; font-size: 0.95rem; color: var(--text-main); margin-bottom: 4px;">${f.title}</div>
            <div class="filing-summary" style="font-size: 0.8rem; color: var(--text-muted); line-height: 1.4;">${f.summary}</div>
          </div>
          <div class="filing-links" style="display: flex; gap: 10px; align-items: center; flex-shrink: 0;">
            <a href="${f.pdf_url}" target="_blank" class="filing-link-btn" title="Download PDF">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" style="width: 14px; height: 14px; color: #ef4444; stroke-width: 2.5;">
                <path stroke-linecap="round" stroke-linejoin="round" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
              </svg>
              Acrobat PDF
            </a>
            <a href="${f.xbrl_url}" target="_blank" class="filing-link-btn" title="Download XBRL">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" style="width: 14px; height: 14px; color: #10b981; stroke-width: 2.5;">
                <path stroke-linecap="round" stroke-linejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              XBRL
            </a>
          </div>
        `;
        container.appendChild(item);
      });
    };
    
    if (this.state.corporateFilings) {
      const filings = this.state.corporateFilings[symbol] || this.state.corporateFilings["DEFAULT"];
      renderFilings(filings);
    } else {
      fetch(this.options.filingsFile)
        .then(res => {
          if (!res.ok) throw new Error('Status ' + res.status);
          return res.json();
        })
        .then(data => {
          this.state.corporateFilings = data;
          const filings = data[symbol] || data["DEFAULT"];
          renderFilings(filings);
        })
        .catch(err => {
          console.warn('Failed to load filings JSON. Using fallback.', err);
          this.state.corporateFilings = {
            "DEFAULT": [
              {
                "title": "Audited Financial Results for the Quarter and Year Ended March 31, 2026",
                "summary": "Standalone and consolidated financial statement audit report, audited segment reports, and notes under Regulation 33 of SEBI LODR.",
                "pdf_url": "https://www.bseindia.com/xml-data/corpfiling/AttachLive/financial_results_q4_2026.pdf",
                "xbrl_url": "https://www.bseindia.com/xml-data/corpfiling/AttachLive/financial_results_q4_2026.xml"
              },
              {
                "title": "Shareholding Pattern for the Period Ended March 31, 2026",
                "summary": "Statement showing holding of specified securities, promoter shareholding, public holding, and compliance under Regulation 31 of SEBI LODR.",
                "pdf_url": "https://www.bseindia.com/xml-data/corpfiling/AttachLive/shareholding_pattern_march_2026.pdf",
                "xbrl_url": "https://www.bseindia.com/xml-data/corpfiling/AttachLive/shareholding_pattern_march_2026.xml"
              }
            ]
          };
          const filings = this.state.corporateFilings[symbol] || this.state.corporateFilings["DEFAULT"];
          renderFilings(filings);
        });
    }
  }

  closeFilingsPopup() {
    const overlay = this.els['filings-popup-overlay'];
    if (!overlay) return;
    overlay.classList.remove('visible');
    setTimeout(() => overlay.classList.add('hidden'), 300);
  }

  renderAggregationTable() {
    const filtered = this.getFilteredRows();
    const tbody = this.els['table-body'];
    const headers = this.els['table-headers'];
    
    tbody.innerHTML = '';
    
    const isDefault = this.state.currentAggDimension === 'default';

    if (isDefault) {
      headers.innerHTML = `
        <th style="width: 50px;"></th>
        <th>Time Period</th>
        <th class="number-col">${this.getVarHeaderHtml('Total Turnover', 'turnover')}</th>
        <th class="number-col">${this.getVarHeaderHtml('Traded Volume', 'volume')}</th>
        <th class="number-col">${this.getVarHeaderHtml('Avg Close Price', 'closePrice')}</th>
        <th class="number-col" style="width: 170px;">${this.getVarHeaderHtml('Company Count', 'companyCount')}</th>
      `;
      this.attachHeaderListeners(headers);

      const groups = {};
      filtered.forEach(row => {
        const key = this.getPeriodKey(row.parsedDateObj);
        if (!groups[key]) {
          groups[key] = { key: key, turnover: 0, volume: 0, weightedPriceSum: 0, symbols: new Set(), rawRows: [] };
        }
        groups[key].turnover += row.turnover;
        groups[key].volume += row.volume;
        groups[key].weightedPriceSum += (row.closePrice * row.volume);
        groups[key].symbols.add(row.SYMBOL);
        groups[key].rawRows.push(row);
      });

      const groupedArray = Object.values(groups).sort((a, b) => {
        return (b.rawRows[0]?.timestamp || 0) - (a.rawRows[0]?.timestamp || 0);
      });

      this.els['table-row-count'].innerText = `Showing ${groupedArray.length} time periods`;

      if (groupedArray.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="text-center" style="padding: 40px; color: var(--text-muted);">No records match the active filters.</td></tr>`;
        return;
      }

      groupedArray.forEach(group => {
        const rowId = `row-time-${group.key.replace(/\s+/g, '-')}`;
        const isExpanded = this.state.expandedRows.has(rowId);
        const avgPrice = group.volume > 0 ? (group.weightedPriceSum / group.volume) : 0;

        const tr = document.createElement('tr');
        tr.className = `clickable-row ${isExpanded ? 'expanded' : ''}`;
        tr.addEventListener('click', () => this.toggleRow(rowId));

        tr.innerHTML = `
          <td><span class="expand-icon">▸</span></td>
          <td style="font-weight: 600;">${group.key}</td>
          <td class="number-col font-semibold positive">${this.formatTurnover(group.turnover)}</td>
          <td class="number-col">${this.formatVolume(group.volume)}</td>
          <td class="number-col">${this.formatPrice(avgPrice)}</td>
          <td class="number-col"><span class="badge badge-neutral">${group.symbols.size} Companies</span></td>
        `;

        tbody.appendChild(tr);

        if (isExpanded) {
          this.renderCompanySubTable(group, tr, rowId);
        }
      });

    } else {
      let dimLabel = this.state.currentAggDimension;
      this.state.parsedData.control.forEach(ctrl => {
        if (ctrl.Menu_List === this.state.currentAggDimension) dimLabel = ctrl.Labels;
      });

      headers.innerHTML = `
        <th style="width: 50px;"></th>
        <th>Aggregated Dimension: ${dimLabel}</th>
        <th class="number-col">${this.getVarHeaderHtml('Total Turnover', 'turnover')}</th>
        <th class="number-col">${this.getVarHeaderHtml('Traded Volume', 'volume')}</th>
        <th class="number-col">${this.getVarHeaderHtml('Avg Close Price', 'closePrice')}</th>
        <th class="number-col" style="width: 170px;">${this.getVarHeaderHtml('Companies Traded', 'companyCount')}</th>
      `;
      this.attachHeaderListeners(headers);

      const groups = {};
      filtered.forEach(row => {
        const key = row[this.state.currentAggDimension] || 'Others';
        if (!groups[key]) {
          groups[key] = { key: key, turnover: 0, volume: 0, weightedPriceSum: 0, symbols: new Set(), rawRows: [] };
        }
        groups[key].turnover += row.turnover;
        groups[key].volume += row.volume;
        groups[key].weightedPriceSum += (row.closePrice * row.volume);
        groups[key].symbols.add(row.SYMBOL);
        groups[key].rawRows.push(row);
      });

      const groupedArray = Object.values(groups).sort((a, b) => b.turnover - a.turnover);

      this.els['table-row-count'].innerText = `Showing ${groupedArray.length} dimension classifications`;

      if (groupedArray.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="text-center" style="padding: 40px; color: var(--text-muted);">No records match the active filters.</td></tr>`;
        return;
      }

      groupedArray.forEach(group => {
        const rowId = `row-dim-${group.key.replace(/\s+/g, '-')}`;
        const isExpanded = this.state.expandedRows.has(rowId);
        const avgPrice = group.volume > 0 ? (group.weightedPriceSum / group.volume) : 0;

        const tr = document.createElement('tr');
        tr.className = `clickable-row ${isExpanded ? 'expanded' : ''}`;
        tr.addEventListener('click', () => this.toggleRow(rowId));

        tr.innerHTML = `
          <td><span class="expand-icon">▸</span></td>
          <td style="font-weight: 600;">${group.key}</td>
          <td class="number-col font-semibold positive">${this.formatTurnover(group.turnover)}</td>
          <td class="number-col">${this.formatVolume(group.volume)}</td>
          <td class="number-col">${this.formatPrice(avgPrice)}</td>
          <td class="number-col"><span class="badge badge-neutral">${group.symbols.size} Companies</span></td>
        `;

        tbody.appendChild(tr);

        if (isExpanded) {
          this.renderCompanySubTable(group, tr, rowId);
        }
      });
    }
  }

  toggleRow(rowId) {
    if (this.state.expandedRows.has(rowId)) {
      this.state.expandedRows.delete(rowId);
    } else {
      this.state.expandedRows.add(rowId);
    }
    this.renderAggregationTable();
  }

  renderCompanySubTable(parentGroup, parentTr, rowId) {
    const compGroups = {};
    parentGroup.rawRows.forEach(row => {
      const symbol = row.SYMBOL;
      if (!compGroups[symbol]) {
        compGroups[symbol] = {
          symbol: symbol,
          name: row.companyName,
          isin: row.ISIN,
          turnover: 0,
          volume: 0,
          weightedPriceSum: 0,
          count: 0,
          category: row.Category || 'Others',
          rawRows: []
        };
      }
      compGroups[symbol].turnover += row.turnover;
      compGroups[symbol].volume += row.volume;
      compGroups[symbol].weightedPriceSum += (row.closePrice * row.volume);
      compGroups[symbol].count++;
      compGroups[symbol].rawRows.push(row);
    });

    const sortedComps = Object.values(compGroups).sort((a, b) => b.turnover - a.turnover);

    const subRow = document.createElement('tr');
    subRow.className = 'sub-table-row';
    
    // Build nested company rows
    const wrapperTableId = `nested-table-${rowId}`;
    subRow.innerHTML = `
      <td colspan="6" class="nested-cell">
        <div class="nested-table-wrap">
          <table style="width:100%;">
            <thead>
              <tr>
                <th style="width: 40px;"></th>
                <th>Company Info</th>
                <th class="number-col">${this.getVarHeaderHtml('Turnover', 'turnover')}</th>
                <th class="number-col">${this.getVarHeaderHtml('Volume', 'volume')}</th>
                <th class="number-col">${this.getVarHeaderHtml('Avg Price', 'closePrice')}</th>
                <th class="number-col" style="width: 140px;">Market Cap</th>
              </tr>
            </thead>
            <tbody id="${wrapperTableId}">
            </tbody>
          </table>
        </div>
      </td>
    `;

    // Insert subrow wrapper
    parentTr.parentNode.insertBefore(subRow, parentTr.nextSibling);
    this.attachHeaderListeners(subRow);

    const subTbody = subRow.querySelector('#' + wrapperTableId);
    
    sortedComps.forEach(comp => {
      const subRowId = `${rowId}-comp-${comp.symbol}`;
      const isSubExpanded = this.state.expandedSubRows.has(subRowId);
      
      let capBadge = '';
      if (comp.category.toLowerCase().includes('large')) capBadge = `<span class="badge badge-largecap">Large Cap</span>`;
      else if (comp.category.toLowerCase().includes('mid')) capBadge = `<span class="badge badge-midcap">Mid Cap</span>`;
      else if (comp.category.toLowerCase().includes('small')) capBadge = `<span class="badge badge-smallcap">Small Cap</span>`;
      else capBadge = `<span class="badge badge-neutral">${comp.category}</span>`;

      const avgPrice = comp.volume > 0 ? (comp.weightedPriceSum / comp.volume) : comp.closePrice;

      const tr = document.createElement('tr');
      tr.className = `clickable-row ${isSubExpanded ? 'expanded' : ''}`;
      tr.innerHTML = `
        <td style="padding-left:24px; width:40px;"><span class="expand-icon">▸</span></td>
        <td>
          <div style="font-weight:600; color:var(--text-main);">${comp.name}</div>
          <div style="font-size:0.75rem; color:var(--text-muted);">${comp.symbol} | ISIN: ${comp.isin}</div>
        </td>
        <td class="number-col font-medium text-main">${this.formatTurnover(comp.turnover)}</td>
        <td class="number-col">${this.formatVolume(comp.volume)}</td>
        <td class="number-col">${this.formatPrice(avgPrice)}</td>
        <td class="number-col">${capBadge}</td>
      `;

      tr.addEventListener('click', (e) => this.toggleSubRow(e, subRowId));
      subTbody.appendChild(tr);

      if (isSubExpanded) {
        const level3Row = document.createElement('tr');
        level3Row.className = 'sub-table-row';
        level3Row.innerHTML = `
          <td colspan="6" class="nested-cell">
            <div class="tag-table-wrap">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; flex-wrap: wrap; gap: 8px;">
                <h4 style="font-size:0.8rem; text-transform:uppercase; color:var(--accent-secondary); margin:0; font-weight:600;">
                  Peer Group Aggregations (tag_menu.csv)
                </h4>
                <button class="jump-btn" style="display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px; font-size: 0.72rem;">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" style="width: 12px; height: 12px; stroke-width: 2.5;">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  Corporate Filings
                </button>
              </div>
              <div class="tag-compare-grid">
                ${this.renderTagComparisons(comp, parentGroup.rawRows)}
              </div>
            </div>
          </td>
        `;
        
        // filings listener
        const fBtn = level3Row.querySelector('.jump-btn');
        fBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.showCorporateFilings(comp.symbol, comp.name);
        });

        // compare jump buttons listener
        level3Row.querySelectorAll('.jump-btn[onclick]').forEach(btn => {
          // Replace inline onclicks
        });
        
        // Since we render templates dynamically, we bind jump buttons here
        level3Row.querySelectorAll('.tag-compare-card').forEach(card => {
          const btn = card.querySelector('.jump-btn:not([onclick])');
          if (btn) {
            const dataField = btn.dataset.field;
            const value = btn.dataset.value;
            const label = btn.dataset.label;
            btn.addEventListener('click', (e) => {
              e.stopPropagation();
              this.showDimensionDetails(dataField, value, label, comp.symbol);
            });
          }
        });

        subTbody.appendChild(level3Row);
      }
    });
  }

  toggleSubRow(event, subRowId) {
    event.stopPropagation();
    if (this.state.expandedSubRows.has(subRowId)) {
      this.state.expandedSubRows.delete(subRowId);
    } else {
      this.state.expandedSubRows.add(subRowId);
    }
    this.renderAggregationTable();
  }

  renderTagComparisons(companyInfo, scopeRows) {
    if (this.state.parsedData.tag.length === 0) {
      return `<div style="font-size:0.85rem; color:var(--text-muted); padding:4px;">No attributes loaded in tag_menu.csv for this prefix.</div>`;
    }

    return this.state.parsedData.tag.map(tagConf => {
      const fieldName = tagConf.Menu_List;
      const label = tagConf.Labels;
      const companyTagValue = companyInfo.rawRows[0]?.[fieldName] || 'Others';

      let sumTurnoverInScope = 0;
      scopeRows.forEach(row => {
        if (row[fieldName] === companyTagValue) {
          sumTurnoverInScope += row.turnover;
        }
      });

      const isControl = this.state.parsedData.control.some(ctrl => ctrl.Menu_List === fieldName);

      // Store parameters inside HTML dataset variables so we can bind them programmatically
      return `
        <div class="tag-compare-card" style="position: relative;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; gap: 8px;">
            <div class="tag-compare-title" style="margin-bottom: 0;">${label}</div>
            ${isControl ? `
              <button class="jump-btn" 
                      data-field="${fieldName}" 
                      data-value="${companyTagValue.replace(/"/g, '&quot;')}" 
                      data-label="${label}" 
                      title="Show ${label} Details">
                Show
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" style="width: 10px; height: 10px; stroke-width: 3;">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path stroke-linecap="round" stroke-linejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
              </button>
            ` : ''}
          </div>
          <div class="tag-compare-value" title="${companyTagValue}">${companyTagValue}</div>
          <div class="tag-compare-stats">Total: ${this.formatTurnover(sumTurnoverInScope)}</div>
        </div>
      `;
    }).join('');
  }

  getYLabelName(yField, turnoverUnit) {
    if (yField === 'turnover') {
      return this.state.numericSystem === 'indian' ? 'Turnover (Cr ₹)' : `Turnover (${turnoverUnit} ₹)`;
    } else if (yField === 'volume') {
      return 'Traded Volume';
    } else {
      return 'Avg Close Price (₹)';
    }
  }

  getDatasetStyle(yField, isLine) {
    const styles = {
      turnover: { color: '#6366f1', lineBg: 'rgba(99, 102, 241, 0.12)', barBg: 'rgba(99, 102, 241, 0.7)' },
      volume: { color: '#06b6d4', lineBg: 'rgba(6, 182, 212, 0.12)', barBg: 'rgba(6, 182, 212, 0.7)' },
      price: { color: '#a855f7', lineBg: 'rgba(168, 85, 247, 0.12)', barBg: 'rgba(168, 85, 247, 0.7)' }
    };
    const style = styles[yField] || styles.turnover;
    return {
      borderColor: style.color,
      backgroundColor: isLine ? style.lineBg : style.barBg,
      borderWidth: 2.5,
      fill: isLine && (this.state.selectedYAxes.length === 1),
      tension: 0.25,
      pointRadius: isLine ? 3.5 : 0,
      pointHoverRadius: 6,
      pointBackgroundColor: style.color
    };
  }

  getAxisFormatter(fields, numericSystem, turnoverUnit, turnoverDivider) {
    if (fields.length === 0) return (val) => val;
    if (fields.length === 1 || fields.every(f => f === fields[0])) {
      const field = fields[0];
      return (val) => {
        if (field === 'turnover') {
          return numericSystem === 'indian' ? val.toLocaleString('en-IN') + ' Cr' : val.toLocaleString('en-US') + ' ' + turnoverUnit;
        } else if (field === 'volume') {
          return this.formatVolume(val);
        } else {
          return this.formatPrice(val);
        }
      };
    }
    return (val) => {
      if (Math.abs(val) >= 10000000) return (val / 10000000).toLocaleString(undefined, { maximumFractionDigits: 1 }) + 'Cr';
      if (Math.abs(val) >= 100000) return (val / 100000).toLocaleString(undefined, { maximumFractionDigits: 1 }) + 'L';
      if (Math.abs(val) >= 1000) return (val / 1000).toLocaleString(undefined, { maximumFractionDigits: 1 }) + 'K';
      return val.toLocaleString();
    };
  }

  updateChart() {
    const filtered = this.getFilteredRows();
    const xAxisVar = this.els['chart-x-axis'].value;
    const groups = {};

    filtered.forEach(row => {
      let key = xAxisVar === 'time' ? this.getPeriodKey(row.parsedDateObj) : (row[xAxisVar] || 'Others');
      if (!groups[key]) {
        groups[key] = { key: key, turnover: 0, volume: 0, weightedPriceSum: 0, priceWeight: 0, timestamp: row.timestamp || 0 };
      }
      groups[key].turnover += row.turnover;
      groups[key].volume += row.volume;
      groups[key].weightedPriceSum += (row.closePrice * row.volume);
      groups[key].priceWeight += row.volume;
    });

    let sortedData = Object.values(groups);
    if (xAxisVar === 'time') {
      sortedData.sort((a, b) => a.timestamp - b.timestamp);
    } else {
      const sortVar = this.state.selectedYAxes[0] || 'turnover';
      if (sortVar === 'turnover') sortedData.sort((a, b) => b.turnover - a.turnover);
      else if (sortVar === 'volume') sortedData.sort((a, b) => b.volume - a.volume);
      else {
        sortedData.sort((a, b) => {
          const priceA = a.priceWeight > 0 ? (a.weightedPriceSum / a.priceWeight) : 0;
          const priceB = b.priceWeight > 0 ? (b.weightedPriceSum / b.priceWeight) : 0;
          return priceB - priceA;
        });
      }
    }

    const labels = sortedData.map(d => d.key);
    let chartTurnoverUnit = 'M';
    let chartTurnoverDivider = 1000000;
    if (this.state.numericSystem === 'western') {
      const maxTurnover = sortedData.length > 0 ? Math.max(...sortedData.map(d => d.turnover)) : 0;
      if (maxTurnover >= 1000000000) {
        chartTurnoverUnit = 'B';
        chartTurnoverDivider = 1000000000;
      }
    }

    const datasets = this.state.selectedYAxes.map(yField => {
      const isSecondary = this.state.secondaryYAxes.includes(yField);
      const isLine = (xAxisVar === 'time') || this.state.lineYAxes.includes(yField);
      const datasetType = isLine ? 'line' : 'bar';

      const dataPoints = sortedData.map(d => {
        if (yField === 'turnover') {
          return this.state.numericSystem === 'indian' ? d.turnover / 10000000 : d.turnover / chartTurnoverDivider;
        } else if (yField === 'volume') {
          return d.volume;
        } else {
          return d.priceWeight > 0 ? (d.weightedPriceSum / d.priceWeight) : 0;
        }
      });

      const style = this.getDatasetStyle(yField, isLine);

      return {
        type: datasetType,
        label: this.getYLabelName(yField, chartTurnoverUnit),
        data: dataPoints,
        borderColor: style.borderColor,
        backgroundColor: style.backgroundColor,
        borderWidth: style.borderWidth,
        fill: style.fill,
        tension: 0.25,
        pointRadius: style.pointRadius,
        pointHoverRadius: 6,
        pointBackgroundColor: style.borderColor,
        yAxisID: isSecondary ? 'y2' : 'y',
        yField: yField
      };
    });

    const leftFields = this.state.selectedYAxes.filter(f => !this.state.secondaryYAxes.includes(f));
    const rightFields = this.state.selectedYAxes.filter(f => this.state.secondaryYAxes.includes(f));
    const leftAxisTitle = leftFields.map(f => this.getYLabelName(f, chartTurnoverUnit)).join(' / ');
    const rightAxisTitle = rightFields.map(f => this.getYLabelName(f, chartTurnoverUnit)).join(' / ');

    const ctx = this.els['analyticsChart'].getContext('2d');
    if (this.state.chartInstance) {
      this.state.chartInstance.destroy();
    }

    const isLight = document.body.classList.contains('light-theme');
    const gridColor = isLight ? 'rgba(15, 23, 42, 0.06)' : 'rgba(255, 255, 255, 0.04)';
    const tickColor = isLight ? '#64748b' : '#9ca3af';
    const tooltipBg = isLight ? 'rgba(255, 255, 255, 0.98)' : 'rgba(15, 23, 42, 0.95)';
    const tooltipBorder = isLight ? 'rgba(15, 23, 42, 0.1)' : 'rgba(255, 255, 255, 0.1)';
    const tooltipTitleColor = isLight ? '#0f172a' : '#ffffff';
    const tooltipBodyColor = isLight ? '#334155' : '#f3f4f6';

    const hasDataLabels = typeof ChartDataLabels !== 'undefined';
    const chartPlugins = hasDataLabels ? [ChartDataLabels] : [];

    this.state.chartInstance = new Chart(ctx, {
      type: xAxisVar === 'time' ? 'line' : 'bar',
      plugins: chartPlugins,
      data: { labels: labels, datasets: datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: true,
            position: 'top',
            labels: { color: tickColor, font: { family: 'Outfit', size: 12 } }
          },
          datalabels: {
            display: (this.state.showChartLabels && hasDataLabels) ? 'auto' : false,
            anchor: 'end',
            align: 'top',
            color: isLight ? '#0f172a' : '#f3f4f6',
            backgroundColor: isLight ? 'rgba(255, 255, 255, 0.85)' : 'rgba(15, 23, 42, 0.85)',
            borderColor: isLight ? 'rgba(15, 23, 42, 0.15)' : 'rgba(255, 255, 255, 0.15)',
            borderWidth: 1,
            borderRadius: 4,
            padding: 4,
            font: { family: 'Outfit', size: 9, weight: '600' },
            offset: 4,
            formatter: (value, context) => {
              const yField = context.dataset.yField;
              if (yField === 'turnover') {
                return this.state.numericSystem === 'indian' ? `₹${value.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} Cr` : `₹${value.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} ${chartTurnoverUnit}`;
              } else if (yField === 'volume') {
                return this.formatVolume(value);
              } else {
                return this.formatPrice(value);
              }
            }
          },
          tooltip: {
            backgroundColor: tooltipBg,
            titleColor: tooltipTitleColor,
            bodyColor: tooltipBodyColor,
            titleFont: { family: 'Outfit', size: 13, weight: '600' },
            bodyFont: { family: 'Outfit', size: 13 },
            borderColor: tooltipBorder,
            borderWidth: 1,
            padding: 12,
            callbacks: {
              label: (context) => {
                const yField = context.dataset.yField;
                const val = context.parsed.y;
                if (yField === 'turnover') {
                  return `Turnover: ₹${val.toFixed(2)} ${this.state.numericSystem === 'indian' ? 'Cr' : chartTurnoverUnit}`;
                }
                if (yField === 'volume') return `Volume: ${this.formatVolume(val)}`;
                return `Price: ${this.formatPrice(val)}`;
              }
            }
          }
        },
        scales: {
          x: {
            grid: { color: gridColor },
            ticks: { color: tickColor, font: { family: 'Outfit', size: 11 } }
          },
          y: {
            position: 'left',
            grid: { color: gridColor },
            ticks: {
              color: tickColor,
              font: { family: 'Outfit', size: 11 },
              callback: this.getAxisFormatter(leftFields, this.state.numericSystem, chartTurnoverUnit, chartTurnoverDivider)
            },
            title: {
              display: leftFields.length > 0,
              text: leftAxisTitle,
              color: tickColor,
              font: { family: 'Outfit', size: 12, weight: '500' }
            }
          },
          y2: {
            position: 'right',
            display: rightFields.length > 0,
            grid: { drawOnChartArea: false, color: gridColor },
            ticks: {
              color: tickColor,
              font: { family: 'Outfit', size: 11 },
              callback: this.getAxisFormatter(rightFields, this.state.numericSystem, chartTurnoverUnit, chartTurnoverDivider)
            },
            title: {
              display: rightFields.length > 0,
              text: rightAxisTitle,
              color: tickColor,
              font: { family: 'Outfit', size: 12, weight: '500' }
            }
          }
        }
      }
    });
  }

  downloadCSV() {
    const filtered = this.getFilteredRows();
    if (!filtered || filtered.length === 0) {
      alert('No data available to download.');
      return;
    }

    const dataToExport = filtered.map(row => {
      const formatted = {
        'Trade Date': row.TradDt || '',
        'Symbol': row.SYMBOL || '',
        'ISIN': row.ISIN || '',
        'Company Name': row.companyName || '',
        'Open Price': row.OpnPric || '',
        'High Price': row.HghPric || '',
        'Low Price': row.LwPric || '',
        'Close Price': row.ClsPric || '',
        'Last Price': row.LastPric || '',
        'Previous Close Price': row.PrvsClsgPric || '',
        'Traded Volume': row.TtlTradgVol || '',
        'Turnover': row.TtlTrfVal || ''
      };
      
      // Dynamic copying of control menu fields to CSV export headers
      this.state.parsedData.control.forEach(ctrl => {
        formatted[ctrl.Labels] = row[ctrl.Menu_List] || '';
      });

      return formatted;
    });

    const csv = Papa.unparse(dataToExport);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    if (link.download !== undefined) {
      const url = URL.createObjectURL(blob);
      const minIdx = this.state.activeRange.minIdx;
      const maxIdx = this.state.activeRange.maxIdx;
      const fmt = (d) => {
        return `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;
      };
      const minDateText = this.state.dateList[minIdx] ? fmt(new Date(this.state.dateList[minIdx])) : 'start';
      const maxDateText = this.state.dateList[maxIdx] ? fmt(new Date(this.state.dateList[maxIdx])) : 'end';
      
      link.setAttribute("href", url);
      link.setAttribute("download", `bhavcopy_${this.state.currentMode}_${minDateText}_to_${maxDateText}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  }

  toggleTheme() {
    const isLight = this.container.classList.toggle('light-theme');
    document.body.classList.toggle('light-theme', isLight);
    localStorage.setItem('theme', isLight ? 'light' : 'dark');
    this.syncThemeIcons(isLight);
    this.updateChart();
  }

  syncThemeIcons(isLight) {
    const sunIcon = this.els['theme-toggle-btn']?.querySelector('.sun-icon');
    const moonIcon = this.els['theme-toggle-btn']?.querySelector('.moon-icon');
    if (sunIcon && moonIcon) {
      if (isLight) {
        sunIcon.classList.remove('hidden');
        moonIcon.classList.add('hidden');
      } else {
        sunIcon.classList.add('hidden');
        moonIcon.classList.remove('hidden');
      }
    }
  }
}

// Auto initializer scan
document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll(".khoj-dashboard").forEach(el => {
    if (!el.dataset.initialized) {
      new KhojDashboard(el);
    }
  });
});
