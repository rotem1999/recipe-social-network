// API bootstrap (SPEC.md §11.3 apps/api: bootstrap and module wiring only; §11.6).
// Port, prefix and CORS origins come from the §14 keys.
import {
  BadRequestException,
  Logger,
  ValidationError,
  ValidationPipe,
} from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { setupApiDocs } from '@rsn/api/util-openapi';
import { AppModule } from './app/app.module';

/**
 * UI-43: the DTO messages are written for people, so they are sent as they are,
 * nested ones included, without the property path Nest puts in front of them
 * ("ingredients.0.Name this ingredient" becomes "Name this ingredient").
 */
function validationMessages(errors: ValidationError[]): string[] {
  return errors.flatMap((error) => [
    ...Object.values(error.constraints ?? {}),
    ...validationMessages(error.children ?? []),
  ]);
}

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const globalPrefix = process.env['API_GLOBAL_PREFIX'] ?? 'api/v1';
  app.setGlobalPrefix(globalPrefix);
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      exceptionFactory: (errors) =>
        new BadRequestException(validationMessages(errors)),
    }),
  );
  const origins = (process.env['CORS_ORIGINS'] ?? 'http://localhost:4200')
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
  // Electron loads the production renderer from file://, which sends Origin "null".
  app.enableCors({ origin: [...origins, 'null'], credentials: false });
  // DOC-1: Swagger UI and the OpenAPI document, after the prefix and before listen.
  setupApiDocs(app, { globalPrefix, env: process.env });
  const port = Number(process.env['API_PORT'] ?? 3000);
  await app.listen(port);
  Logger.log(`CookBook API listening on http://localhost:${port}/${globalPrefix}`);
}

void bootstrap();
