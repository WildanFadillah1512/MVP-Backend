const xlsx = require('xlsx');
const path = require('path');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const filePath = path.join('c:', 'Projek', 'data', 'Database_Bahan_Baku_dan_Packaging_Kiko_Bakes.xlsx');
const workbook = xlsx.readFile(filePath);

const sheetsToProcess = ["Database Bahan", "Bahan Segar", "Packaging"];

async function main() {
  let inserted = 0;
  let updated = 0;
  let errors = 0;

  for (const sheetName of sheetsToProcess) {
    const sheet = workbook.Sheets[sheetName];
    const rows = xlsx.utils.sheet_to_json(sheet, { header: 1 });
    
    let headerRowIndex = 3; // Based on previous analysis
    const dataRows = rows.slice(headerRowIndex + 1).filter(r => r.length > 0 && r[1]); 
    
    for (const row of dataRows) {
      const code = row[1]?.toString().trim();
      if (!code) continue;

      const categoryRaw = row[2]?.toString().trim() || sheetName;
      const subCategory = row[3]?.toString().trim() || '';
      const jenisBahan = row[4]?.toString().trim() || '';
      const merk = row[5]?.toString().trim() || '';
      const unit = row[7]?.toString().trim() || 'pcs';
      const hargaStr = row[9]?.toString().replace(/[^0-9]/g, '');
      const purchasePrice = hargaStr ? parseFloat(hargaStr) : 0;
      const status = row[10]?.toString().trim() === 'Aktif';

      let name = jenisBahan;
      if (merk && merk !== '-') {
        name += ` - ${merk}`;
      }

      const data = {
        name: name,
        category: categoryRaw,
        unit: unit,
        purchasePrice: purchasePrice,
        isActive: status,
      };

      try {
        const existing = await prisma.warehouseItem.findUnique({ where: { code } });
        if (existing) {
          await prisma.warehouseItem.update({
            where: { code },
            data
          });
          updated++;
        } else {
          await prisma.warehouseItem.create({
            data: {
              code,
              ...data,
              minStock: 10,
              currentStock: 0,
              purchaseGram: 0,
              pricePerGram: 0
            }
          });
          inserted++;
        }
      } catch (e) {
        console.error(`Error processing ${code}:`, e.message);
        errors++;
      }
    }
  }

  console.log(`\nImport Completed!`);
  console.log(`Inserted: ${inserted}`);
  console.log(`Updated: ${updated}`);
  console.log(`Errors: ${errors}`);
}

main()
  .catch(e => console.error(e))
  .finally(async () => {
    await prisma.$disconnect();
  });
