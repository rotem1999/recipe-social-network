// API bootstrap (SPEC.md §11.3 apps/api: bootstrap and module wiring only).
// Port and prefix come from the §14 keys API_PORT and API_GLOBAL_PREFIX (.env.example).
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app/app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const globalPrefix = process.env['API_GLOBAL_PREFIX'] ?? 'api/v1';
  app.setGlobalPrefix(globalPrefix);
  const port = Number(process.env['API_PORT'] ?? 3000);
  await app.listen(port);
  Logger.log(
    `CookBook API listening on http://localhost:${port}/${globalPrefix}`,
  );
}

void bootstrap();
