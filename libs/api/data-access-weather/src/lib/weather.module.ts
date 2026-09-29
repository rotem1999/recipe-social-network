import { Module } from '@nestjs/common';

import { WeatherService } from './weather.service';

/** SPEC §8 (WX-7..WX-10): the Open-Meteo client, injected by feature-recommend. */
@Module({
  providers: [WeatherService],
  exports: [WeatherService],
})
export class WeatherModule {}
