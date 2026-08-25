const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  try {
    await prisma.$executeRawUnsafe('ALTER TABLE "Attendance" ADD COLUMN IF NOT EXISTS "breakStart" TIMESTAMP(3)');
    await prisma.$executeRawUnsafe('ALTER TABLE "Attendance" ADD COLUMN IF NOT EXISTS "breakEnd" TIMESTAMP(3)');
    console.log('Successfully added columns');
  } catch (e) {
    console.error('Error adding columns:', e);
  } finally {
    await prisma.$disconnect();
  }
}

main();
