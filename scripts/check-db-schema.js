const { Client } = require('pg');

async function checkSchema() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL
  });

  try {
    await client.connect();
    
    // Get all tables
    const tablesQuery = `
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_type = 'BASE TABLE';
    `;
    const tablesRes = await client.query(tablesQuery);
    const tables = tablesRes.rows.map(row => row.table_name);
    
    console.log('--- Tables ---');
    console.log(tables);

    console.log('\n--- Columns for relevant tables ---');
    for (const table of tables) {
      if (['users', 'Attendance', 'Setting', 'Holiday', 'WorkingHour', 'WorkHour', 'WorkHours', 'CompanySetting', 'CompanySettings', 'Holidays'].includes(table) || table.toLowerCase().includes('holiday') || table.toLowerCase().includes('setting') || table.toLowerCase().includes('hour')) {
        const columnsQuery = `
          SELECT column_name, data_type, is_nullable
          FROM information_schema.columns
          WHERE table_schema = 'public'
          AND table_name = $1;
        `;
        const columnsRes = await client.query(columnsQuery, [table]);
        console.log(`\nTable: ${table}`);
        console.log(columnsRes.rows.map(col => `${col.column_name} (${col.data_type}) [Nullable: ${col.is_nullable}]`));
      }
    }
  } catch (error) {
    console.error('Error checking schema:', error);
  } finally {
    await client.end();
  }
}

checkSchema();
