import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log("=== SHIFTS ===");
  const shifts = await prisma.shift.findMany();
  console.log(shifts);

  console.log("\n=== ROLES ===");
  const roles = await prisma.role.findMany();
  console.log(roles);

  console.log("\n=== SYSTEM SETTINGS ===");
  const settings = await prisma.systemSetting.findMany();
  console.log(settings);
}

main()
  .catch(e => {
    console.error(e);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
