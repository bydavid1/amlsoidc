/**
 * Seed de catálogos: países, ciudades y corredor habilitado US → SV.
 * Abrir un corredor nuevo (ES→SV, MX→GT, ...) = agregar datos aquí o vía Admin,
 * NUNCA cambiar código (docs/design/03-base-de-datos.md §8).
 */
import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const us = await prisma.country.upsert({
    where: { iso2: 'US' },
    update: {},
    create: { iso2: 'US', name: 'Estados Unidos' },
  });

  const sv = await prisma.country.upsert({
    where: { iso2: 'SV' },
    update: {},
    create: { iso2: 'SV', name: 'El Salvador' },
  });

  const svCities = ['San Salvador', 'Santa Ana', 'San Miguel', 'La Libertad'];
  for (const name of svCities) {
    await prisma.city.upsert({
      where: { countryId_name: { countryId: sv.id, name } },
      update: {},
      create: { countryId: sv.id, name },
    });
  }

  const usCities = ['Los Angeles', 'Houston', 'Washington DC', 'New York'];
  for (const name of usCities) {
    await prisma.city.upsert({
      where: { countryId_name: { countryId: us.id, name } },
      update: {},
      create: { countryId: us.id, name },
    });
  }

  await prisma.enabledCorridor.upsert({
    where: {
      originCountryId_destinationCountryId: {
        originCountryId: us.id,
        destinationCountryId: sv.id,
      },
    },
    update: { isActive: true },
    create: {
      originCountryId: us.id,
      destinationCountryId: sv.id,
      isActive: true,
    },
  });

  // Admin inicial (solo dev; en producción crear vía proceso seguro)
  const adminEmail = 'admin@bringo.local';
  const existingAdmin = await prisma.user.findFirst({
    where: { email: adminEmail, deletedAt: null },
  });
  if (!existingAdmin) {
    await prisma.user.create({
      data: {
        email: adminEmail,
        passwordHash: await argon2.hash(process.env.SEED_ADMIN_PASSWORD ?? 'Admin-dev-123!', {
          type: argon2.argon2id,
        }),
        roles: ['ADMIN'],
      },
    });
  }

  // Productos recomendados iniciales (curaduría de Bringo)
  const existingProducts = await prisma.recommendedProduct.count();
  if (existingProducts === 0) {
    await prisma.recommendedProduct.createMany({
      data: [
        {
          name: 'iPhone 15 Pro 256GB',
          productUrl: 'https://www.apple.com/shop/buy-iphone/iphone-15-pro',
          estimatedPriceAmount: 1099.0,
          sizeCategory: 'MEDIUM',
          originCountryId: us.id,
          sortOrder: 1,
        },
        {
          name: 'AirPods Pro (2.ª gen)',
          productUrl: 'https://www.apple.com/shop/product/airpods-pro',
          estimatedPriceAmount: 249.0,
          sizeCategory: 'SMALL',
          originCountryId: us.id,
          sortOrder: 2,
        },
        {
          name: 'PlayStation 5 Slim',
          productUrl: 'https://direct.playstation.com/en-us/buy-consoles/ps5',
          estimatedPriceAmount: 499.99,
          sizeCategory: 'LARGE',
          originCountryId: us.id,
          sortOrder: 3,
        },
        {
          name: 'Nintendo Switch OLED',
          productUrl: 'https://www.nintendo.com/us/switch/oled-model/',
          estimatedPriceAmount: 349.99,
          sizeCategory: 'MEDIUM',
          originCountryId: us.id,
          sortOrder: 4,
        },
        {
          name: 'Kindle Paperwhite',
          productUrl: 'https://www.amazon.com/dp/B08KTZ8249',
          estimatedPriceAmount: 149.99,
          sizeCategory: 'SMALL',
          originCountryId: us.id,
          sortOrder: 5,
        },
        {
          name: 'MacBook Air M3 13"',
          productUrl: 'https://www.apple.com/shop/buy-mac/macbook-air',
          estimatedPriceAmount: 1099.0,
          sizeCategory: 'LARGE',
          originCountryId: us.id,
          sortOrder: 6,
        },
      ],
    });
  }

  console.log('Seed OK: US, SV, ciudades, corredor US->SV, admin y productos recomendados');
}

main()
  .catch((e) => {
     
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
