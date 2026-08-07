const xlsx = require('xlsx');
const path = require('path');

const filePath = path.join('c:', 'Projek', 'data', 'Database_Bahan_Baku_dan_Packaging_Kiko_Bakes.xlsx');
const workbook = xlsx.readFile(filePath);

const sheetsToProcess = ["Database Bahan", "Bahan Segar", "Packaging"];
const analysis = {};

sheetsToProcess.forEach(sheetName => {
  const sheet = workbook.Sheets[sheetName];
  // header: 1 returns an array of arrays
  const rows = xlsx.utils.sheet_to_json(sheet, { header: 1 });
  
  // Find the row that contains 'No' or 'Nama'
  let headerRowIndex = -1;
  for (let i = 0; i < 10; i++) {
    if (rows[i] && rows[i].some(c => typeof c === 'string' && (c.trim().toLowerCase() === 'no' || c.trim().toLowerCase() === 'no.' || c.trim().toLowerCase() === 'nama bahan' || c.trim().toLowerCase() === 'nama item'))) {
      headerRowIndex = i;
      break;
    }
  }

  if (headerRowIndex !== -1) {
    const headers = rows[headerRowIndex];
    const dataRows = rows.slice(headerRowIndex + 1).filter(r => r.length > 0 && r[1]); // Assuming column 1 is the name
    
    analysis[sheetName] = {
      headerRowIndex,
      headers: headers.map(h => h || 'UNKNOWN'),
      totalItems: dataRows.length,
      sampleItem: dataRows[0]
    };
  } else {
    analysis[sheetName] = "Could not find headers";
  }
});

console.log(JSON.stringify(analysis, null, 2));
