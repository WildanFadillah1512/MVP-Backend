import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  try {
    console.log("Checking PerformanceMetric structure in DB...");
    // Let's just try to query 1 record or count to see if the table exists
    const count = await prisma.performanceMetric.count();
    console.log(`Table 'PerformanceMetric' exists. Total records: ${count}`);
    
    if (count > 0) {
      const sample = await prisma.performanceMetric.findFirst();
      console.log("Sample record:", sample);
    } else {
      console.log("No records found, but the table exists.");
    }

    // Also check Users table
    const userCount = await prisma.user.count();
    console.log(`Table 'User' exists. Total records: ${userCount}`);
    
  } catch (error) {
    console.error("Error accessing database:", error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
