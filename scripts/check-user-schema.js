const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkSchema() {
  try {
    const res = await prisma.$queryRawUnsafe(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'User';
    `);
    
    console.log("Columns in 'User' table:");
    console.table(res);

    const tables = await prisma.$queryRawUnsafe(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND (table_name ILIKE '%terminat%' OR table_name ILIKE '%resign%');
    `);
    
    console.log("\nTables related to termination/resignation:");
    console.table(tables);

  } catch (err) {
    console.error('Error querying:', err);
  } finally {
    await prisma.$disconnect();
  }
}

checkSchema();
