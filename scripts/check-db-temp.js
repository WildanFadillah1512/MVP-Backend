const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const divisions = await prisma.division.findMany();
  console.log('Divisions in DB:', divisions.map(d => d.name));

  const roles = await prisma.role.findMany();
  console.log('Roles in DB:', roles.map(r => r.name));

  const enumQuery = await prisma.$queryRaw`
    SELECT enumlabel FROM pg_enum
    JOIN pg_type ON pg_enum.enumtypid = pg_type.oid
    WHERE pg_type.typname = 'RoleName';
  `;
  console.log('RoleName ENUM values in DB:', enumQuery.map(e => e.enumlabel));
}

main().catch(console.error).finally(() => prisma.$disconnect());
