const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('Finding PIC users...');
  const picKebersihan = await prisma.user.findUnique({ where: { email: 'pic.kebersihan@company.com' } });
  const picProduk = await prisma.user.findUnique({ where: { email: 'pic.produk@company.com' } });

  if (!picKebersihan || !picProduk) {
    console.error('PIC users not found in the database. Please make sure they exist.');
    return;
  }

  console.log('Finding target chat groups...');
  const umumGroup = await prisma.chatGroup.findFirst({ where: { name: 'Umum - All Divisions' } });
  const produksiGroup = await prisma.chatGroup.findFirst({ where: { name: 'Divisi Produksi' } });

  if (umumGroup) {
    console.log('Adding to Umum group...');
    await prisma.chatGroupMember.createMany({
      data: [
        { groupId: umumGroup.id, userId: picKebersihan.id },
        { groupId: umumGroup.id, userId: picProduk.id },
      ],
      skipDuplicates: true
    });
  }

  if (produksiGroup) {
    console.log('Adding to Produksi group...');
    await prisma.chatGroupMember.createMany({
      data: [
        { groupId: produksiGroup.id, userId: picKebersihan.id },
        { groupId: produksiGroup.id, userId: picProduk.id },
      ],
      skipDuplicates: true
    });
  }

  console.log('PIC users successfully added to chat groups!');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
