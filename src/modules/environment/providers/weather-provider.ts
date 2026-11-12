export interface WeatherObservation {
  time: Date;
  isForecast: boolean;
  airTempC: number | null;
  relativeHumidity: number | null;
  /** Global horizontal irradiance (shortwave), W/m². */
  solarRadiationWm2: number | null;
  /** Direct (beam) part of the solar radiation, W/m². */
  directRadiationWm2: number | null;
  /** Diffuse part of the solar radiation, W/m². */
  diffuseRadiationWm2: number | null;
  /** Wind speed measured at 10 m, m/s. */
  windSpeedMs: number | null;
  surfacePressureHpa: number | null;
  precipitationMm: number | null;
  /** WMO weather code (95, 96, 99 = thunderstorm). */
  weatherCode: number | null;
  /** Dust and PM10 from the air-quality feed, µg/m³ (null if unavailable). */
  dustUgM3: number | null;
  pm10UgM3: number | null;
}

/** Abstract class (not interface) so it can be used as a Nest injection token. */
export abstract class WeatherProvider {
  abstract readonly name: string;
  abstract fetch(
    latitude: number,
    longitude: number,
    forecastHours: number,
  ): Promise<WeatherObservation[]>;
}
