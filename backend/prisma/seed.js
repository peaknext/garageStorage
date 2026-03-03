// Production seed script (plain JS - no ts-node needed)
// Uses @prisma/adapter-pg for Prisma 7.x client engine compatibility
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { Pool } = require('pg');
const bcrypt = require('bcrypt');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  const email = 'admin@example.com';
  const password = 'admin123';
  const name = 'Administrator';

  const existingAdmin = await prisma.adminUser.findUnique({
    where: { email },
  });

  if (existingAdmin) {
    console.log('Admin user already exists:', email);
    return;
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const admin = await prisma.adminUser.create({
    data: {
      email,
      passwordHash,
      name,
      role: 'ADMIN',
    },
  });

  console.log('Admin user created successfully!');
  console.log('Email:', email);
  console.log('Role:', admin.role);

  const existingPurgePolicy = await prisma.storagePolicy.findFirst({
    where: { policyType: 'PURGE_DELETED' },
  });

  if (!existingPurgePolicy) {
    await prisma.storagePolicy.create({
      data: {
        name: 'Auto-purge deleted files',
        description:
          'Automatically permanently delete files that have been in the recycle bin for more than 30 days',
        scope: 'GLOBAL',
        policyType: 'PURGE_DELETED',
        deleteAfterDays: 30,
        schedule: '0 0 * * *',
        isActive: true,
      },
    });
    console.log(
      'Default purge policy created: Auto-purge deleted files (30 days)',
    );
  } else {
    console.log('Purge policy already exists');
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
