const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL
    }
  }
});
async function main() {
  const tables = await prisma.$queryRaw`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`;
  console.log("--- TABLES ---");
  for (const t of tables) {
      console.log(`\nTable: ${t.table_name}`);
      const cols = await prisma.$queryRawUnsafe(`SELECT column_name, data_type FROM information_schema.columns WHERE table_name = '${t.table_name}'`);
      console.log(cols.map(c => `  - ${c.column_name} (${c.data_type})`).join('\n'));
  }
}
main().catch(console.error).finally(() => prisma.$disconnect());
