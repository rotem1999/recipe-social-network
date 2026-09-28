// API bootstrap (SPEC.md §11.3 apps/api: bootstrap and module wiring only; §11.6).
// Port, prefix and CORS origins come from the §14 keys.
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app/app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const globalPrefix = process.env['API_GLOBAL_PREFIX'] ?? 'api/v1';
  app.setGlobalPrefix(globalPrefix);
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  const origins = (process.env['CORS_ORIGINS'] ?? 'http://localhost:4200')
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
  // Electron loads the production renderer from file://, which sends Origin "null".
  app.enableCors({ origin: [...origins, 'null'], credentials: false });
  const port = Number(process.env['API_PORT'] ?? 3000);
  await app.listen(port);
  Logger.log(`CookBook API listening on http://localhost:${port}/${globalPrefix}`);
}

void bootstrap();
