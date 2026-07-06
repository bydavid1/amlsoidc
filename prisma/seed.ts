/**
 * Seed de catálogos: países, ciudades y corredor habilitado US → SV.
 * Abrir un corredor nuevo (ES→SV, MX→GT, ...) = agregar datos aquí o vía Admin,
 * NUNCA cambiar código (docs/design/03-base-de-datos.md §8).
 */
import { PrismaClient } from '@prisma/client';

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

   
  console.log('Seed OK: US, SV, ciudades y corredor US->SV habilitado');
}

main()
  .catch((e) => {
     
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
