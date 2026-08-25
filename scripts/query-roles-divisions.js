const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL
    }
  }
});

async function main() {
  try {
    const roles = await prisma.role.findMany();
    console.log("ROLES:", JSON.stringify(roles, null, 2));

    const divisions = await prisma.division.findMany();
    console.log("DIVISIONS:", JSON.stringify(divisions, null, 2));
  } catch (error) {
    console.error("Error:", error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
