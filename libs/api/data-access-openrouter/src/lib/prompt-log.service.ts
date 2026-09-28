import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { mkdir, appendFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { PromptLogEntry } from './openrouter.types';

/**
 * LOG-1..LOG-5: every AI prompt is appended to `<project root>/log/YYYY-MM-DD.json`
 * (UTC date), one JSON object per line, with a single `appendFile` call per entry
 * so concurrent requests never interleave. The folder is created on first write.
 */
@Injectable()
export class PromptLogService {
  private readonly logger = new Logger(PromptLogService.name);
  /** LOG-3: the API runs from the repository root, so `log/` sits next to SPEC.md. */
  private readonly directory: string;

  constructor(private readonly config: ConfigService) {
    this.directory =
      this.config.get<string>('PROMPT_LOG_DIR') ?? join(process.cwd(), 'log');
  }

  /** LOG-5: append one entry; a successful call carries `response`, a failed one `error`. */
  async append(entry: PromptLogEntry): Promise<void> {
    const file = join(
      this.directory,
      `${PromptLogService.utcDate(entry.timestamp)}.json`,
    );

    try {
      await mkdir(this.directory, { recursive: true });
      await appendFile(file, `${JSON.stringify(entry)}\n`, 'utf8');
    } catch (cause) {
      // A disk problem must not lose the user's answer; record it and carry on.
      this.logger.error(
        `Could not append the prompt log entry to ${file}: ${
          cause instanceof Error ? cause.message : String(cause)
        }`,
      );
    }
  }

  /** LOG-5: file name is the UTC date of the entry. */
  private static utcDate(timestamp: string): string {
    const parsed = new Date(timestamp);
    const date = Number.isNaN(parsed.getTime()) ? new Date() : parsed;
    return date.toISOString().slice(0, 10);
  }
}
