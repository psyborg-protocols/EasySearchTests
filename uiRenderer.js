/**
 * Displays parsed Excel data as Bootstrap tables.
 * @param {Array} results - Array of objects containing dataframe data.
 */
function displayExcelData(results) {
    const tableContainer = document.getElementById('tableContainer');
    tableContainer.innerHTML = ''; // Clear previous content
  
    results.forEach(result => {
      const fileContainer = document.createElement('div');
      fileContainer.className = 'mb-4';
  
      const heading = document.createElement('h4');
      heading.textContent = `${result.filenamePrefix} from ${result.directory}`;
      fileContainer.appendChild(heading);
  
      const scrollableDiv = document.createElement('div');
      scrollableDiv.className = 'table-responsive';
      scrollableDiv.style.maxHeight = '400px';
      scrollableDiv.style.overflowY = 'auto';
  
      const table = document.createElement('table');
      table.className = 'table table-striped table-bordered';
  
      if (result.dataframe && result.dataframe.length > 0) {
        const [header, ...rows] = result.dataframe;
        const thead = document.createElement('thead');
        const headerRow = document.createElement('tr');
  
        header.forEach(cell => {
          const th = document.createElement('th');
          th.textContent = cell;
          headerRow.appendChild(th);
        });
  
        thead.appendChild(headerRow);
        table.appendChild(thead);
  
        const tbody = document.createElement('tbody');
        rows.forEach(rowData => {
          const row = document.createElement('tr');
          rowData.forEach(cell => {
            const td = document.createElement('td');
            td.textContent = cell;
            row.appendChild(td);
          });
          tbody.appendChild(row);
        });
  
        table.appendChild(tbody);
      }
  
      scrollableDiv.appendChild(table);
      fileContainer.appendChild(scrollableDiv);
      tableContainer.appendChild(fileContainer);
    });
  
    tableContainer.style.display = 'block';
  }
  
  // Expose function globally
  window.ExcelUI = {
    displayExcelData
  };