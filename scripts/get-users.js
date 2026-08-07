const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  try {
    const users = await prisma.user.findMany({
      include: { role: true },
      where: { isActive: true }
    });
    console.log("=== LIST AKUN LOGIN ===");
    users.forEach(u => {
      console.log(`Nama  : ${u.name}`);
      console.log(`Email : ${u.email}`);
      console.log(`Role  : ${u.role?.name}`);
      console.log(`Divisi: ${u.divisionId}`);
      console.log("------------------------");
    });
  } catch (err) {
    console.error(err);
  } finally {
    await prisma.$disconnect();
  }
}

main();
