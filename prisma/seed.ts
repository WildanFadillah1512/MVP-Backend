import { PrismaClient, RoleName } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  // Hash password
  const password = await bcrypt.hash('password123', 10);

  // 1. Create Roles
  const roles = [
    RoleName.OWNER,
    RoleName.CEO,
    RoleName.GM,
    RoleName.ADMIN,
    RoleName.MANAGER,
    RoleName.LEADER,
    RoleName.STAFF
  ];

  const roleRecords: Record<RoleName, { id: string }> = {} as Record<RoleName, { id: string }>;
  for (const roleName of roles) {
    roleRecords[roleName] = await prisma.role.upsert({
      where: { name: roleName },
      update: {},
      create: { name: roleName },
    });
  }

  // 2. Create Divisions
  const divisions = ['PRODUKSI', 'PURCHASING', 'KASIR', 'GUDANG', 'NONE'];

  const divisionRecords: Record<string, { id: string }> = {};
  for (const divisionName of divisions) {
    divisionRecords[divisionName] = await prisma.division.upsert({
      where: { name: divisionName },
      update: {},
      create: { name: divisionName },
    });
  }

  // 3. Keep Existing Users (Don't overwrite unless they don't exist)

  // Owner
  const owner = await prisma.user.upsert({
    where: { email: 'owner@company.com' },
    update: {},
    create: {
      email: 'owner@company.com',
      password,
      name: 'Owner',
      roleId: roleRecords[RoleName.OWNER].id,
      divisionId: divisionRecords.NONE.id,
      leaveBalances: { create: { totalQuota: 12, usedQuota: 0 } }
    },
  });

  // CEO
  const ceo = await prisma.user.upsert({
    where: { email: 'ceo@company.com' },
    update: {},
    create: {
      email: 'ceo@company.com',
      password,
      name: 'CEO',
      roleId: roleRecords[RoleName.CEO].id,
      divisionId: divisionRecords.NONE.id,
      supervisorId: owner.id,
      leaveBalances: { create: { totalQuota: 12, usedQuota: 0 } }
    },
  });

  // GM
  const gm = await prisma.user.upsert({
    where: { email: 'gm@company.com' },
    update: {},
    create: {
      email: 'gm@company.com',
      password,
      name: 'General Manager',
      roleId: roleRecords[RoleName.GM].id,
      divisionId: divisionRecords.NONE.id,
      supervisorId: ceo.id,
      leaveBalances: { create: { totalQuota: 12, usedQuota: 0 } }
    },
  });

  // Admin
  const admin = await prisma.user.upsert({
    where: { email: 'admin@company.com' },
    update: {},
    create: {
      email: 'admin@company.com',
      password,
      name: 'Admin System',
      roleId: roleRecords[RoleName.ADMIN].id,
      divisionId: divisionRecords.NONE.id,
      leaveBalances: { create: { totalQuota: 12, usedQuota: 0 } }
    },
  });

  // Produksi Team
  const managerProduksi = await prisma.user.upsert({
    where: { email: 'manager.produksi@company.com' },
    update: {},
    create: {
      email: 'manager.produksi@company.com',
      password,
      name: 'Manager Produksi',
      roleId: roleRecords[RoleName.MANAGER].id,
      divisionId: divisionRecords.PRODUKSI.id,
      supervisorId: gm.id,
      leaveBalances: { create: { totalQuota: 12, usedQuota: 0 } }
    },
  });

  const leaderProduksi = await prisma.user.upsert({
    where: { email: 'leader.produksi@company.com' },
    update: {},
    create: {
      email: 'leader.produksi@company.com',
      password,
      name: 'Leader Produksi',
      roleId: roleRecords[RoleName.LEADER].id,
      divisionId: divisionRecords.PRODUKSI.id,
      supervisorId: managerProduksi.id,
      leaveBalances: { create: { totalQuota: 12, usedQuota: 0 } }
    },
  });

  const staffProduksi = await prisma.user.upsert({
    where: { email: 'staff.produksi@company.com' },
    update: {},
    create: {
      email: 'staff.produksi@company.com',
      password,
      name: 'Staff Produksi',
      roleId: roleRecords[RoleName.STAFF].id,
      divisionId: divisionRecords.PRODUKSI.id,
      supervisorId: leaderProduksi.id,
      leaveBalances: { create: { totalQuota: 12, usedQuota: 0 } }
    },
  });

  // Create Staff Purchasing
  const staffPurchasing = await prisma.user.upsert({
    where: { email: 'staff.purchasing@company.com' },
    update: {},
    create: {
      email: 'staff.purchasing@company.com',
      password,
      name: 'Staff Purchasing',
      roleId: roleRecords[RoleName.STAFF].id,
      divisionId: divisionRecords.PURCHASING.id,
      supervisorId: gm.id,
      leaveBalances: { create: { totalQuota: 12, usedQuota: 0 } }
    }
  });

  // Create Staff Gudang
  const staffGudang = await prisma.user.upsert({
    where: { email: 'staff.gudang@company.com' },
    update: {},
    create: {
      email: 'staff.gudang@company.com',
      password,
      name: 'Staff Gudang',
      roleId: roleRecords[RoleName.STAFF].id,
      divisionId: divisionRecords.GUDANG.id,
      supervisorId: gm.id,
      leaveBalances: { create: { totalQuota: 12, usedQuota: 0 } }
    }
  });

  // Create Staff Kasir
  const staffKasir = await prisma.user.upsert({
    where: { email: 'staff.kasir@company.com' },
    update: {},
    create: {
      email: 'staff.kasir@company.com',
      password,
      name: 'Staff Kasir',
      roleId: roleRecords[RoleName.STAFF].id,
      divisionId: divisionRecords.KASIR.id,
      supervisorId: gm.id,
      leaveBalances: { create: { totalQuota: 12, usedQuota: 0 } }
    }
  });

  // ----------------------------------------------------
  // REAL DATA UNTUK PRODUCTION SYSTEM
  // ----------------------------------------------------

  // 4. Seed Real Products (Produksi)
  console.log('Seeding real products...');
  const products = [
    { code: 'PRD001', name: 'Kue Lapis Legit', category: 'Kue Basah', basePrice: 85000 },
    { code: 'PRD002', name: 'Roti Tawar Premium', category: 'Roti', basePrice: 25000 },
    { code: 'PRD003', name: 'Brownies Coklat', category: 'Kue Basah', basePrice: 45000 },
    { code: 'PRD004', name: 'Kue Sus Vla', category: 'Kue Basah', basePrice: 35000 },
    { code: 'PRD005', name: 'Cookies Butter', category: 'Kue Kering', basePrice: 55000 },
  ];

  for (const prod of products) {
    await prisma.product.upsert({
      where: { code: prod.code },
      update: {},
      create: prod,
    });
  }

  // 5. Seed Real Branches (Kasir)
  console.log('Seeding real branches...');
  const branches = [
    { code: 'CAB001', name: 'Cabang Jakarta Pusat', address: 'Jl. Sudirman No. 123, Jakarta Pusat' },
    { code: 'CAB002', name: 'Cabang Jakarta Selatan', address: 'Jl. Fatmawati No. 45, Jakarta Selatan' },
    { code: 'CAB003', name: 'Cabang Tangerang', address: 'Jl. BSD Raya No. 78, Tangerang' },
  ];

  for (const branch of branches) {
    await prisma.branch.upsert({
      where: { code: branch.code },
      update: {},
      create: branch,
    });
  }

  // 6. Seed Real Warehouse Items (Gudang)
  console.log('Seeding real warehouse items...');
  const warehouseItems = [
    { code: 'WH001', name: 'Tepung Terigu Premium', category: 'Bahan Baku', minStock: 50, currentStock: 120, unit: 'kg' },
    { code: 'WH002', name: 'Gula Pasir', category: 'Bahan Baku', minStock: 30, currentStock: 75, unit: 'kg' },
    { code: 'WH003', name: 'Butter Anchor', category: 'Bahan Baku', minStock: 20, currentStock: 45, unit: 'kg' },
    { code: 'WH004', name: 'Telur Ayam', category: 'Bahan Baku', minStock: 100, currentStock: 250, unit: 'butir' },
    { code: 'WH005', name: 'Coklat Bubuk', category: 'Bahan Baku', minStock: 15, currentStock: 35, unit: 'kg' },
    { code: 'WH006', name: 'Susu Cair', category: 'Bahan Baku', minStock: 25, currentStock: 60, unit: 'liter' },
    { code: 'WH007', name: 'Kardus Kemasan Kecil', category: 'Kemasan', minStock: 100, currentStock: 250, unit: 'pcs' },
    { code: 'WH008', name: 'Kardus Kemasan Besar', category: 'Kemasan', minStock: 50, currentStock: 120, unit: 'pcs' },
    { code: 'WH009', name: 'Plastik Wrapping', category: 'Kemasan', minStock: 30, currentStock: 80, unit: 'roll' },
  ];

  for (const item of warehouseItems) {
    await prisma.warehouseItem.upsert({
      where: { code: item.code },
      update: {},
      create: item,
    });
  }

  // 7. Seed Chat Groups - ONLY CREATE EMPTY GROUPS, NO MESSAGES
  // 7. Seed Chat Groups - ONLY CREATE EMPTY GROUPS, NO MESSAGES
  console.log('Seeding chat groups...');
  const chatGroups = [
    { name: 'Umum - All Divisions', description: 'Grup umum untuk semua divisi', members: [owner.id, ceo.id, gm.id, admin.id, managerProduksi.id, leaderProduksi.id, staffProduksi.id, staffPurchasing.id, staffGudang.id, staffKasir.id] },
    { name: 'Divisi Produksi', description: 'Diskusi khusus operasional produksi', members: [gm.id, managerProduksi.id, leaderProduksi.id, staffProduksi.id] },
    { name: 'Divisi Purchasing', description: 'Diskusi kebutuhan belanja dan supplier', members: [gm.id, managerProduksi.id, staffPurchasing.id] },
    { name: 'Divisi Gudang', description: 'Diskusi manajemen stok dan inventory', members: [gm.id, managerProduksi.id, staffGudang.id] },
    { name: 'Divisi Kasir', description: 'Diskusi laporan pendapatan dan cabang', members: [gm.id, staffKasir.id] },
    { name: 'Management Team', description: 'CEO dan para manager', members: [owner.id, ceo.id, gm.id, admin.id, managerProduksi.id] },
  ];

  for (const group of chatGroups) {
    const existingGroup = await prisma.chatGroup.findFirst({
      where: { name: group.name }
    });

    if (!existingGroup) {
      const newGroup = await prisma.chatGroup.create({
        data: { name: group.name, description: group.description }
      });

      await prisma.chatGroupMember.createMany({
        data: group.members.map(uid => ({ groupId: newGroup.id, userId: uid })),
        skipDuplicates: true
      });
    }
  }



  // 8. Seed ERP Config for Phase 2 modules (all locked by default)
  const erpModules = ['CRM', 'FINANCE', 'HPP', 'MASTER_DATA', 'BUSINESS_INTEL', 'FORECAST'];
  for (const moduleName of erpModules) {
    await prisma.erpConfig.upsert({
      where: { moduleName },
      update: {},
      create: { moduleName, isLocked: true }
    });
  }

  // 9. Seed System Settings (NEW)
  const systemSettings = [
    { key: 'WORK_START_TIME', value: '09:00', description: 'Jam mulai kerja (untuk menentukan status TELAT)' },
    { key: 'WORK_END_TIME', value: '17:00', description: 'Jam selesai kerja' },
    { key: 'REPORT_DEADLINE_HOURS', value: '24', description: 'Deadline pengisian laporan harian (dalam jam)' },
    { key: 'LOW_STOCK_THRESHOLD', value: '20', description: 'Threshold stok rendah (percentage)' },
    { key: 'TARGET_WARNING_THRESHOLD', value: '80', description: 'Threshold warning target produksi (percentage)' },
    { key: 'CRON_AUTOLOCK_TIME', value: '00:00', description: 'Waktu eksekusi cron auto-lock laporan' },
    { key: 'CRON_TARGET_CHECK_TIME', value: '20:00', description: 'Waktu eksekusi cron pengecekan target produksi' },
  ];

  for (const setting of systemSettings) {
    await prisma.systemSetting.upsert({
      where: { key: setting.key },
      update: { value: setting.value, description: setting.description },
      create: setting
    });
  }

  // 10. Seed Sample Holidays (NEW)
  const holidays = [
    { date: new Date('2026-01-01'), name: 'Tahun Baru 2026', description: 'Libur Nasional' },
    { date: new Date('2026-03-31'), name: 'Hari Raya Idul Fitri 1447 H', description: 'Libur Nasional' },
    { date: new Date('2026-04-01'), name: 'Hari Raya Idul Fitri 1447 H', description: 'Libur Nasional' },
    { date: new Date('2026-06-01'), name: 'Hari Lahir Pancasila', description: 'Libur Nasional' },
    { date: new Date('2026-08-17'), name: 'Hari Kemerdekaan RI', description: 'Libur Nasional' },
    { date: new Date('2026-12-25'), name: 'Hari Raya Natal', description: 'Libur Nasional' },
  ];

  for (const holiday of holidays) {
    await prisma.holiday.upsert({
      where: { date: holiday.date },
      update: { name: holiday.name, description: holiday.description },
      create: holiday
    });
  }

  console.log('Seed completed successfully!');
  console.log('- Roles & Divisions created');
  console.log('- Users created');
  console.log('- Chat groups created');
  console.log('- ERP config created');
  console.log('- System settings created');
  console.log('- Holidays created');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
