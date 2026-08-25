const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL
    }
  }
});

async function main() {
  try {
    const password = await bcrypt.hash('password123', 10);

    // Dapatkan role STAFF
    const staffRole = await prisma.role.findUnique({
      where: { name: 'STAFF' }
    });

    if (!staffRole) {
      console.log("Role STAFF tidak ditemukan.");
      return;
    }

    // Cari supervisor (Leader Produksi atau Manager Produksi)
    const supervisor = await prisma.user.findFirst({
      where: {
        OR: [
          { email: 'leader.produksi@company.com' },
          { email: 'manager.produksi@company.com' }
        ]
      }
    });

    // 1. Tambahkan Divisi
    const divKebersihan = await prisma.division.upsert({
      where: { name: 'PIC KEBERSIHAN DAN PERALATAN' },
      update: {},
      create: { name: 'PIC KEBERSIHAN DAN PERALATAN' },
    });
    console.log("Divisi PIC KEBERSIHAN DAN PERALATAN berhasil ditambahkan/dicek.");

    const divProduk = await prisma.division.upsert({
      where: { name: 'PIC PRODUK DAN PERALATAN' },
      update: {},
      create: { name: 'PIC PRODUK DAN PERALATAN' },
    });
    console.log("Divisi PIC PRODUK DAN PERALATAN berhasil ditambahkan/dicek.");

    // 2. Tambahkan User
    const picKebersihan = await prisma.user.upsert({
      where: { email: 'pic.kebersihan@company.com' },
      update: {},
      create: {
        email: 'pic.kebersihan@company.com',
        password,
        name: 'PIC Kebersihan dan Peralatan',
        roleId: staffRole.id,
        divisionId: divKebersihan.id,
        supervisorId: supervisor ? supervisor.id : null,
        leaveBalances: { create: { totalQuota: 12, usedQuota: 0 } }
      },
    });
    console.log(`User PIC Kebersihan berhasil ditambahkan: ${picKebersihan.email}`);

    const picProduk = await prisma.user.upsert({
      where: { email: 'pic.produk@company.com' },
      update: {},
      create: {
        email: 'pic.produk@company.com',
        password,
        name: 'PIC Produk dan Peralatan',
        roleId: staffRole.id,
        divisionId: divProduk.id,
        supervisorId: supervisor ? supervisor.id : null,
        leaveBalances: { create: { totalQuota: 12, usedQuota: 0 } }
      },
    });
    console.log(`User PIC Produk berhasil ditambahkan: ${picProduk.email}`);

    console.log("Semua proses penambahan staff PIC selesai.");
  } catch (error) {
    console.error("Terjadi kesalahan:", error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
