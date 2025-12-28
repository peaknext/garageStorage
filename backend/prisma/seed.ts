import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

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
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
