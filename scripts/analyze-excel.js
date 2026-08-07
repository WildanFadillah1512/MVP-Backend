const xlsx = require('xlsx');
const path = require('path');

const filePath = path.join('c:', 'Projek', 'data', 'Database_Bahan_Baku_dan_Packaging_Kiko_Bakes.xlsx');
const workbook = xlsx.readFile(filePath);

const analysis = {};

workbook.SheetNames.forEach(sheetName => {
  const sheet = workbook.Sheets[sheetName];
  const data = xlsx.utils.sheet_to_json(sheet, { header: 1 });
  analysis[sheetName] = {
    rowCount: data.length,
    headers: data[0] || [],
    sampleRow: data[1] || []
  };
});

console.log(JSON.stringify(analysis, null, 2));
