import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import * as bcrypt from 'bcrypt';
import 'dotenv/config';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  const email = 'admin@example.com';
  const password = 'admin123';
  const name = 'Administrator';

  // Check if admin already exists
  const existingAdmin = await prisma.adminUser.findUnique({
    where: { email },
  });

  if (existingAdmin) {
    console.log('Admin user already exists:', email);
    return;
  }

  // Create admin user
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
  console.log('Password:', password);
  console.log('Role:', admin.role);

  // Create default purge policy for recycle bin
  const existingPurgePolicy = await prisma.storagePolicy.findFirst({
    where: { policyType: 'PURGE_DELETED' },
  });

  if (!existingPurgePolicy) {
    await prisma.storagePolicy.create({
      data: {
        name: 'Auto-purge deleted files',
        description: 'Automatically permanently delete files that have been in the recycle bin for more than 30 days',
        scope: 'GLOBAL',
        policyType: 'PURGE_DELETED',
        deleteAfterDays: 30,
        schedule: '0 0 * * *', // Daily at midnight
        isActive: true,
      },
    });
    console.log('Default purge policy created: Auto-purge deleted files (30 days)');
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
  });
