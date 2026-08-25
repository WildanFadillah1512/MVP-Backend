import { PrismaClient } from '@prisma/client';

async function checkSchema() {
  const prisma = new PrismaClient({
    datasourceUrl: process.env.DATABASE_URL
  });

  try {
    // Get all tables
    const tablesRes = await prisma.$queryRawUnsafe<any[]>(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_type = 'BASE TABLE';
    `);
    const tables = tablesRes.map((row: any) => row.table_name);
    
    console.log('--- Tables ---');
    console.log(tables);

    console.log('\n--- Columns for relevant tables ---');
    for (const table of tables) {
      if (['users', 'Attendance', 'Setting', 'Holiday', 'WorkingHour', 'WorkHour', 'WorkHours', 'CompanySetting', 'CompanySettings', 'Holidays'].includes(table) || table.toLowerCase().includes('holiday') || table.toLowerCase().includes('setting') || table.toLowerCase().includes('hour') || table.toLowerCase().includes('attendance')) {
        const columnsRes = await prisma.$queryRawUnsafe<any[]>(`
          SELECT column_name, data_type, is_nullable
          FROM information_schema.columns
          WHERE table_schema = 'public'
          AND table_name = $1;
        `, table);
        console.log(`\nTable: ${table}`);
        console.log(columnsRes.map((col: any) => `${col.column_name} (${col.data_type}) [Nullable: ${col.is_nullable}]`));
      }
    }
  } catch (error) {
    console.error('Error checking schema:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkSchema();
