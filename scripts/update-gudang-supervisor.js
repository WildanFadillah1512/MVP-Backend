const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  try {
    console.log("Mencari divisi PURCHASING dan GUDANG...");
    const purchasing = await prisma.division.findFirst({ where: { name: 'PURCHASING' } });
    const gudang = await prisma.division.findFirst({ where: { name: 'GUDANG' } });

    if (!purchasing || !gudang) {
      console.log("Divisi PURCHASING atau GUDANG tidak ditemukan.");
      return;
    }

    console.log("Mencari Leader/Manager di divisi PURCHASING...");
    // Find a Leader in Purchasing
    const purchasingLeader = await prisma.user.findFirst({
      where: {
        divisionId: purchasing.id,
        role: {
          name: { in: ['LEADER', 'MANAGER'] }
        },
        isActive: true,
        deletedAt: null
      },
      include: { role: true }
    });

    if (!purchasingLeader) {
      console.log("Tidak ada user dengan role LEADER/MANAGER aktif di divisi PURCHASING.");
      return;
    }

    console.log(`Ditemukan Leader Purchasing: ${purchasingLeader.name} (${purchasingLeader.role.name})`);

    // Get Gudang users
    const gudangUsers = await prisma.user.findMany({
      where: {
        divisionId: gudang.id,
        isActive: true,
        deletedAt: null
      }
    });

    console.log(`Menemukan ${gudangUsers.length} user di divisi GUDANG yang akan diupdate supervisornya.`);

    // Update their supervisorId safely
    const updateResult = await prisma.user.updateMany({
      where: {
        divisionId: gudang.id,
        isActive: true,
        deletedAt: null
      },
      data: {
        supervisorId: purchasingLeader.id
      }
    });

    console.log(`Berhasil mengupdate ${updateResult.count} user di divisi GUDANG dengan supervisorId baru (-> ${purchasingLeader.name}). Data aman dan tidak ada yang dihapus.`);
    
  } catch (error) {
    console.error("Terjadi kesalahan:", error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
