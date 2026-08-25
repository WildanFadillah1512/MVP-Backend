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
    const users = await prisma.user.findMany({
      include: { division: true, role: true }
    });
    console.log("USERS:");
    users.forEach(u => {
      console.log(`- ${u.name} | ${u.email} | Div: ${u.division.name} | Role: ${u.role.name}`);
    });
  } catch (error) {
    console.error("Error:", error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
