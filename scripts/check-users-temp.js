const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.findMany({ include: { division: true, role: true }});
  console.table(users.map(u => ({ email: u.email, name: u.name, division: u.division.name, role: u.role.name })));
}

main().catch(console.error).finally(() => prisma.$disconnect());
