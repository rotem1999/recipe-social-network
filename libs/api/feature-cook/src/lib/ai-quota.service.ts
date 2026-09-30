import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AiDailyUsageEntity } from '@rsn/api/data-access-db';
import type { QuotaDto } from '@rsn/shared/util-contracts';
import type { QuotaExceededResponseDto } from './dto/cook-response.dto';

/** COOK-8: the default when `OPENROUTER_SHARED_DAILY_QUOTA_PER_USER` is unset. */
const DEFAULT_DAILY_LIMIT = 100;

/** COOK-10: the 429 body carries the remaining count. */
const QUOTA_EXHAUSTED_MESSAGE = 'Daily AI quota reached';

/**
 * COOK-8: the shared per-user daily budget for cook mode and recommendations together.
 * The count is raised before the OpenRouter call is made, so a crash after the call can
 * only over-count, never under-count.
 */
@Injectable()
export class AiQuotaService {
  constructor(
    @InjectRepository(AiDailyUsageEntity)
    private readonly usage: Repository<AiDailyUsageEntity>,
    private readonly config: ConfigService,
  ) {}

  /** `GET /cook/quota` (COOK-10): today's usage, UTC. */
  async current(userId: string): Promise<QuotaDto> {
    const limit = this.limit();
    const rows = await this.usage.query<{ count: number }[]>(
      'SELECT "count" FROM "ai_daily_usage" WHERE "user_id" = $1 AND "day" = $2',
      [userId, utcDay()],
    );
    return quotaOf(rows[0]?.count ?? 0, limit);
  }

  /**
   * COOK-8: raise today's count by one, or refuse with 429. The increment is a single
   * atomic statement so two concurrent questions can never both pass the last slot: the
   * `ON CONFLICT` update only fires while the stored count is still below the limit, and
   * an update that does not fire returns no row.
   */
  async consume(userId: string): Promise<QuotaDto> {
    const limit = this.limit();
    if (limit < 1) {
      throw exhausted(quotaOf(0, limit));
    }

    const day = utcDay();
    const rows = await this.usage.query<{ count: number }[]>(
      `INSERT INTO "ai_daily_usage" ("user_id", "day", "count")
       VALUES ($1, $2, 1)
       ON CONFLICT ("user_id", "day") DO UPDATE
         SET "count" = "ai_daily_usage"."count" + 1, "updated_at" = now()
         WHERE "ai_daily_usage"."count" < $3
       RETURNING "count"`,
      [userId, day, limit],
    );

    const used = rows[0]?.count;
    if (used === undefined) {
      // The row exists and is already at the limit: nothing was written.
      throw exhausted(await this.current(userId));
    }
    return quotaOf(used, limit);
  }

  /** COOK-8: the limit is an environment value, not a constant. */
  private limit(): number {
    const raw = this.config.get<string | number>(
      'OPENROUTER_SHARED_DAILY_QUOTA_PER_USER',
    );
    const parsed = typeof raw === 'number' ? raw : Number(raw);
    return Number.isInteger(parsed) && parsed >= 0
      ? parsed
      : DEFAULT_DAILY_LIMIT;
  }
}

/** Today's date in UTC as `YYYY-MM-DD`, the shape of `ai_daily_usage.day` (§12.1). */
function utcDay(): string {
  return new Date().toISOString().slice(0, 10);
}

function quotaOf(used: number, limit: number): QuotaDto {
  return { used, limit, remaining: Math.max(0, limit - used) };
}

/** COOK-10: 429 with the remaining count; the body is the documented one (DOC-5). */
function exhausted(quota: QuotaDto): HttpException {
  const body: QuotaExceededResponseDto = {
    statusCode: HttpStatus.TOO_MANY_REQUESTS,
    message: QUOTA_EXHAUSTED_MESSAGE,
    quota,
  };
  return new HttpException(body, HttpStatus.TOO_MANY_REQUESTS);
}
