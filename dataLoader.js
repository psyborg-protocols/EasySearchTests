// Store the currently selected file and sheet
let currentFile = null;
let currentSheet = null;

// Load OneDrive Excel files
async function loadOneDriveFiles() {
    try {
        // Show loading spinner
        document.getElementById('fileListSpinner').style.display = 'inline-block';
        
        // Get access token for MS Graph API
        const accessToken = await getAccessToken();
        
        // Call MS Graph API to get Excel files
        const response = await fetch('https://graph.microsoft.com/v1.0/me/drive/root/search(q=\'.xlsx\')?$top=50', {
            headers: {
                'Authorization': `Bearer ${accessToken}`
            }
        });
        
        if (!response.ok) {
            throw new Error(`Failed to fetch files: ${response.status} ${response.statusText}`);
        }
        
        const data = await response.json();
        
        // Process and display the file list
        const fileListContainer = document.getElementById('fileListContainer');
        fileListContainer.innerHTML = '';
        
        if (data.value && data.value.length > 0) {
            data.value.forEach(file => {
                // Only include Excel files
                if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
                    const fileItem = document.createElement('a');
                    fileItem.className = 'list-group-item list-group-item-action file-list-item';
                    fileItem.dataset.fileId = file.id;
                    fileItem.dataset.fileName = file.name;
                    fileItem.dataset.downloadUrl = file['@microsoft.graph.downloadUrl'];
                    
                    // Format with Excel icon
                    fileItem.innerHTML = `
                        <div class="d-flex align-items-center">
                            <i class="fas fa-file-excel text-success me-2"></i>
                            <div class="text-truncate">${file.name}</div>
                        </div>
                    `;
                    
                    // Add click event listener
                    fileItem.addEventListener('click', () => loadExcelFile(fileItem.dataset.downloadUrl, fileItem.dataset.fileName));
                    
                    fileListContainer.appendChild(fileItem);
                }
            });
        } else {
            // No files found
            fileListContainer.innerHTML = `
                <div class="text-center text-muted p-3">
                    <i class="fas fa-info-circle mb-2"></i>
                    <p>No Excel files found in your OneDrive.</p>
                </div>
            `;
        }
    } catch (error) {
        console.error("Error loading OneDrive files:", error);
        document.getElementById('fileListContainer').innerHTML = `
            <div class="alert alert-danger">
                <i class="fas fa-exclamation-triangle me-2"></i>
                Error loading files. Please try again.
            </div>
        `;
    } finally {
        // Hide loading spinner
        document.getElementById('fileListSpinner').style.display = 'none';
    }
}

// Load and parse Excel file
async function loadExcelFile(downloadUrl, fileName) {
    try {
        // Show loading spinner
        document.getElementById('tableSpinner').style.display = 'inline-block';
        
        // Update UI
        document.getElementById('welcomeMessage').style.display = 'none';
        document.getElementById('tableContainer').style.display = 'block';
        document.getElementById('currentFileName').textContent = fileName;
        
        // Fetch the Excel file
        const response = await fetch(downloadUrl);
        if (!response.ok) {
            throw new Error(`Failed to download file: ${response.status} ${response.statusText}`);
        }
        
        // Get array buffer from response
        const arrayBuffer = await response.arrayBuffer();
        
        // Parse Excel file with SheetJS
        const workbook = XLSX.read(arrayBuffer, {
            type: 'array',
            cellStyles: true,
            cellDates: true
        });
        
        // Store the current file
        currentFile = {
            workbook,
            fileName
        };
        
        // Create sheet tabs
        createSheetTabs(workbook);
        
        // Display the first sheet by default
        const firstSheetName = workbook.SheetNames[0];
        displaySheet(firstSheetName);
        
    } catch (error) {
        console.error("Error loading Excel file:", error);
        document.getElementById('excelTable').innerHTML = `
            <div class="alert alert-danger">
                <i class="fas fa-exclamation-triangle me-2"></i>
                Error loading Excel file: ${error.message}
            </div>
        `;
    } finally {
        // Hide loading spinner
        document.getElementById('tableSpinner').style.display = 'none';
    }
}

// Create sheet tabs from workbook
function createSheetTabs(workbook) {
    const tabsContainer = document.getElementById('sheetTabs');
    tabsContainer.innerHTML = '';
    
    workbook.SheetNames.forEach((sheetName, index) => {
        const tabItem = document.createElement('li');
        tabItem.className = 'nav-item';
        
        const tabLink = document.createElement('a');
        tabLink.className = 'nav-link' + (index === 0 ? ' active' : '');
        tabLink.href = '#';
        tabLink.textContent = sheetName;
        tabLink.addEventListener('click', (e) => {
            e.preventDefault();
            
            // Update active tab
            document.querySelectorAll('#sheetTabs .nav-link').forEach(tab => {
                tab.classList.remove('active');
            });
            tabLink.classList.add('active');
            
            // Display selected sheet
            displaySheet(sheetName);
        });
        
        tabItem.appendChild(tabLink);
        tabsContainer.appendChild(tabItem);
    });
}

// Display a specific sheet
function displaySheet(sheetName) {
    if (!currentFile || !currentFile.workbook) {
        return;
    }
    
    currentSheet = sheetName;
    const worksheet = currentFile.workbook.Sheets[sheetName];
    
    // Convert sheet data to HTML table
    const tableHTML = XLSX.utils.sheet_to_html(worksheet, { 
        id: 'excelTable',
        editable: false
    });
    
    const tableContainer = document.querySelector('.table-responsive');
    tableContainer.innerHTML = tableHTML;
    
    // Apply Bootstrap table classes
    const table = document.getElementById('excelTable');
    table.className = 'table table-striped table-bordered table-hover';
    
    // Add thead and tbody if not present
    if (!table.querySelector('thead')) {
        const thead = document.createElement('thead');
        if (table.rows.length > 0) {
            thead.appendChild(table.rows[0].cloneNode(true));
            table.insertBefore(thead, table.firstChild);
            table.deleteRow(1);
        }
    }
    
    if (!table.querySelector('tbody') && table.rows.length > 0) {
        const tbody = document.createElement('tbody');
        for (let i = 0; i < table.rows.length; i++) {
            tbody.appendChild(table.rows[i].cloneNode(true));
        }
        table.innerHTML = '';
        if (table.querySelector('thead')) {
            table.appendChild(table.querySelector('thead').cloneNode(true));
        }
        table.appendChild(tbody);
    }
}

// Export functions for testing or external use
window.ExcelViewer = {
    loadOneDriveFiles,
    loadExcelFile,
    displaySheet
};
