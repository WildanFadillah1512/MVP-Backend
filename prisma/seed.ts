import { PrismaClient, RoleName, DivisionName, TargetPeriod } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  // Hash password
  const password = await bcrypt.hash('password123', 10);

  // 1. Create Roles
  const roles = [
    RoleName.CEO,
    RoleName.ADMIN,
    RoleName.MANAGER,
    RoleName.LEADER,
    RoleName.STAFF
  ];

  const roleRecords = {};
  for (const roleName of roles) {
    roleRecords[roleName] = await prisma.role.upsert({
      where: { name: roleName },
      update: {},
      create: { name: roleName },
    });
  }

  // 2. Create Divisions
  const divisions = [
    DivisionName.PRODUKSI,
    DivisionName.PURCHASING,
    DivisionName.KASIR,
    DivisionName.GUDANG,
    DivisionName.NONE
  ];

  const divisionRecords = {};
  for (const divisionName of divisions) {
    divisionRecords[divisionName] = await prisma.division.upsert({
      where: { name: divisionName },
      update: {},
      create: { name: divisionName },
    });
  }

  // 3. Keep Existing Users (Don't overwrite unless they don't exist)

  // CEO
  const ceo = await prisma.user.upsert({
    where: { email: 'ceo@company.com' },
    update: {},
    create: {
      email: 'ceo@company.com',
      password,
      name: 'CEO',
      roleId: roleRecords[RoleName.CEO].id,
      divisionId: divisionRecords[DivisionName.NONE].id,
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
      divisionId: divisionRecords[DivisionName.NONE].id,
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
      divisionId: divisionRecords[DivisionName.PRODUKSI].id,
      supervisorId: ceo.id,
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
      divisionId: divisionRecords[DivisionName.PRODUKSI].id,
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
      divisionId: divisionRecords[DivisionName.PRODUKSI].id,
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
      divisionId: divisionRecords[DivisionName.PURCHASING].id,
      supervisorId: ceo.id,
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
      divisionId: divisionRecords[DivisionName.GUDANG].id,
      supervisorId: ceo.id,
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
      divisionId: divisionRecords[DivisionName.KASIR].id,
      supervisorId: ceo.id,
      leaveBalances: { create: { totalQuota: 12, usedQuota: 0 } }
    }
  });

  // ----------------------------------------------------
  // DUMMY DATA UNTUK MODUL SPESIFIK LAINNYA
  // (Pastikan tidak duplicate)
  // ----------------------------------------------------

  // 4. Master Products (Produksi) - REMOVED FOR CLEAN TESTING
  // 5. Branch (Kasir) - REMOVED FOR CLEAN TESTING
  // 6. Master Warehouse Item (Gudang) - REMOVED FOR CLEAN TESTING
  // 7. Seed Chat Groups - ONLY CREATE EMPTY GROUPS, NO MESSAGES
  const chatGroups = [
    { name: 'Umum - All Divisions', description: 'Grup umum untuk semua divisi', members: [ceo.id, admin.id, managerProduksi.id, leaderProduksi.id, staffProduksi.id, staffPurchasing.id, staffGudang.id, staffKasir.id] },
    { name: 'Divisi Produksi', description: 'Diskusi khusus operasional produksi', members: [ceo.id, managerProduksi.id, leaderProduksi.id, staffProduksi.id] },
    { name: 'Divisi Purchasing', description: 'Diskusi kebutuhan belanja dan supplier', members: [ceo.id, staffPurchasing.id] },
    { name: 'Divisi Gudang', description: 'Diskusi manajemen stok dan inventory', members: [ceo.id, staffGudang.id] },
    { name: 'Divisi Kasir', description: 'Diskusi laporan pendapatan dan cabang', members: [ceo.id, staffKasir.id] },
  ];

  for (const group of chatGroups) {
    // Check if group already exists
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
      // No dummy messages seeded
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

  console.log('Dummy data for specific modules seeded successfully!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });