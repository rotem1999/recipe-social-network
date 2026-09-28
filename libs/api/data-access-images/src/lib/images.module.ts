import { Module } from '@nestjs/common';
import { ImageStorageService } from './image-storage.service';

/** IMG-2: the only Nest module that reaches Cloud Storage for Firebase. */
@Module({
  providers: [ImageStorageService],
  exports: [ImageStorageService],
})
export class ImagesModule {}
